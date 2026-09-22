from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from backend.app.api.v1 import agents, chat, companies, deliverables, users
from backend.app.schemas.agent import AgentCreate, AgentRunCreate, AgentUpdate
from backend.app.schemas.deliverable import DeliverableApprovalRequest, DeliverableGenerateRequest
from backend.app.schemas.user import UserCreate, UserRoleUpdate, UserStatusUpdate, UserUpdate
from backend.app.services.model_provider.ollama_provider import OllamaProvider
from backend.app.services.model_provider.base import ModelHealthStatus


def result(value=None, values=None):
    scalars = MagicMock()
    scalars.all.return_value = values or []
    scalars.first.return_value = value
    return SimpleNamespace(
        scalar_one_or_none=MagicMock(return_value=value),
        scalars=MagicMock(return_value=scalars),
        scalar=MagicMock(return_value=value),
    )


@pytest.mark.parametrize(
    "prompt, expected",
    [
        ("Please create a PDF report about zero trust security.", "Zero Trust Security"),
        ("presentation deck on artificial intelligence in pptx", "Artificial Intelligence"),
        ("?", "Sovereign Enterprise Analysis"),
        ("  solar energy!!! ", "Solar Energy"),
    ],
)
def test_chat_topic_normalization(prompt, expected):
    assert chat._extract_clean_topic(prompt) == expected


def test_chat_message_and_agent_serializers_cover_optional_fields():
    created = datetime.now(timezone.utc)
    message = SimpleNamespace(
        id="msg-1", conversation_id="conv-1", sender_type="assistant", content="answer",
        model_used="local", detected_intent="GENERAL", routing_reasoning="local route",
        required_capabilities=None, attachment_name=None, tokens_prompt=2,
        tokens_completion=3, latency_ms=12.4, created_at=created,
    )
    out = chat.msg_to_out(message)
    assert out.required_capabilities == []
    assert out.created_at == created.isoformat()

    agent = SimpleNamespace(
        id="agent-1", name="Audit", description="desc", category="Risk",
        system_prompt="prompt", model_id="local", tool_allowlist=None,
        max_steps=5, timeout_seconds=20, is_active=True, created_at=created, updated_at=None,
    )
    assert agents.agent_to_out(agent).tool_allowlist == []
    template = SimpleNamespace(
        id="tpl-1", name="Template", description="desc", category="Risk",
        system_prompt="prompt", default_tools=None, default_model_id="local", icon="Shield", max_steps=5,
    )
    assert agents.template_to_out(template).default_tools == []
    step = SimpleNamespace(
        id="step-1", step_number=1, title=None, action_name=None, action_input=None,
        observation="observation", safe_summary=None, status="DONE", requires_approval=False,
        approved_by=None, duration_ms=None, error_message=None,
    )
    assert agents.step_to_out(step).safe_summary == "observation"


@pytest.mark.asyncio
async def test_chat_missing_and_forbidden_conversations():
    user = SimpleNamespace(id="user-a", role="Employee", company_code="ACME", email="a@example.com")
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result(None))
    with pytest.raises(HTTPException) as missing:
        await chat.get_conversation("missing", user, db)
    assert missing.value.status_code == 404

    conv = SimpleNamespace(id="conv-1", user_id="user-b", company_code="ACME")
    db.execute = AsyncMock(return_value=result(conv))
    with patch("backend.app.core.tenant.authorize_tenant_access"):
        with pytest.raises(HTTPException) as forbidden:
            await chat.get_conversation("conv-1", user, db)
    assert forbidden.value.status_code == 403

    db.execute = AsyncMock(return_value=result(None))
    with patch("backend.app.core.tenant.authorize_tenant_access"):
        with pytest.raises(HTTPException) as missing_send:
            await chat.send_message("missing", SimpleNamespace(content="hello", model_id=None, attachment_name=None), user, db)
    assert missing_send.value.status_code == 404


@pytest.mark.asyncio
async def test_chat_document_query_rejects_missing_and_unready_documents():
    user = SimpleNamespace(id="user-a", role="Employee", company_code="ACME", email="a@example.com")
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result(None))
    with pytest.raises(HTTPException) as missing:
        await chat.query_document("missing", SimpleNamespace(query="secret", model_id=None), user, db)
    assert missing.value.status_code == 404

    doc = SimpleNamespace(id="doc-1", title="Secret", status="PROCESSING", company_code="ACME")
    db.execute = AsyncMock(return_value=result(doc))
    with patch("backend.app.core.tenant.authorize_tenant_access"):
        with pytest.raises(HTTPException) as unready:
            await chat.query_document("doc-1", SimpleNamespace(query="secret", model_id=None), user, db)
    assert unready.value.status_code == 422


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text="error"):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, get_response=None, post_responses=None, error=None):
        self.get_response = get_response
        self.post_responses = iter(post_responses or [])
        self.error = error

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def get(self, url):
        if self.error:
            raise self.error
        return self.get_response

    async def post(self, url, json):
        if self.error:
            raise self.error
        return next(self.post_responses)


@pytest.mark.asyncio
async def test_ollama_health_success_degraded_and_unavailable():
    provider = OllamaProvider()
    healthy_client = FakeClient(get_response=FakeResponse(payload={"models": [{"name": "llama3:8b"}]}))
    with patch("backend.app.services.model_provider.ollama_provider.httpx.AsyncClient", return_value=healthy_client):
        healthy = await provider.check_health("http://ollama/", "llama3")
    assert healthy.status == ModelHealthStatus.HEALTHY
    assert healthy.details["available_models"] == ["llama3:8b"]

    degraded_client = FakeClient(get_response=FakeResponse(payload={"models": [{"name": "other"}]}))
    with patch("backend.app.services.model_provider.ollama_provider.httpx.AsyncClient", return_value=degraded_client):
        degraded = await provider.check_health("http://ollama", "llama3")
    assert degraded.status == ModelHealthStatus.DEGRADED
    assert "not currently loaded" in degraded.error_message

    unavailable_client = FakeClient(error=RuntimeError("offline"))
    with patch("backend.app.services.model_provider.ollama_provider.httpx.AsyncClient", return_value=unavailable_client):
        unavailable = await provider.check_health("http://ollama", "llama3")
    assert unavailable.status == ModelHealthStatus.UNAVAILABLE


@pytest.mark.asyncio
async def test_ollama_generation_and_embedding_error_paths():
    provider = OllamaProvider()
    client = FakeClient(post_responses=[FakeResponse(payload={"response": "hello", "prompt_eval_count": 2, "eval_count": 1})])
    with patch("backend.app.services.model_provider.ollama_provider.httpx.AsyncClient", return_value=client):
        generated = await provider.generate("http://ollama/", "llama3", "prompt", system_prompt="system", stop=["END"], extra_params={"top_p": 0.8})
    assert generated.text == "hello"
    assert generated.prompt_tokens == 2

    failed = FakeClient(post_responses=[FakeResponse(status_code=500, text="daemon error")])
    with patch("backend.app.services.model_provider.ollama_provider.httpx.AsyncClient", return_value=failed):
        with pytest.raises(RuntimeError, match="generation failed"):
            await provider.generate("http://ollama", "llama3", "prompt")

    embeds = FakeClient(post_responses=[FakeResponse(payload={"embedding": [1.0, 2.0]}), FakeResponse(payload={"embedding": [3.0]})])
    with patch("backend.app.services.model_provider.ollama_provider.httpx.AsyncClient", return_value=embeds):
        response = await provider.embed("http://ollama/", "embed", ["a", "b"])
    assert response.embeddings == [[1.0, 2.0], [3.0]]

    embed_failed = FakeClient(post_responses=[FakeResponse(status_code=500, text="bad embedding")])
    with patch("backend.app.services.model_provider.ollama_provider.httpx.AsyncClient", return_value=embed_failed):
        with pytest.raises(RuntimeError, match="embedding failure"):
            await provider.embed("http://ollama", "embed", ["a"])


@pytest.mark.asyncio
async def test_agent_run_and_crud_error_paths():
    user = SimpleNamespace(id="user-a", role="Analyst", company_code="ACME", email="a@example.com")
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result(None))
    with pytest.raises(HTTPException, match="Agent run not found"):
        await agents.get_agent_run("missing", user, db)
    with pytest.raises(HTTPException, match="Agent not found"):
        await agents.get_agent("missing", user, db)

    valid_agent = SimpleNamespace(
        id="agent-1", name="Old", description="old", category="General", system_prompt="old",
        model_id="old", tool_allowlist=[], max_steps=10, timeout_seconds=120,
        is_active=True, created_at=datetime.now(timezone.utc), updated_at=None,
    )
    db.execute = AsyncMock(return_value=result(valid_agent))
    db.refresh = AsyncMock()
    with patch("backend.app.api.v1.agents.record_audit_log", new=AsyncMock()):
        updated = await agents.update_agent("agent-1", AgentUpdate(name="New", is_active=False), user, db)
    assert updated.name == "New"
    assert valid_agent.is_active is False

    db.execute = AsyncMock(return_value=result(None))
    with pytest.raises(HTTPException, match="Agent run not found"):
        await agents.cancel_agent_run("missing", user, db)


@pytest.mark.asyncio
async def test_agent_trigger_uses_selected_agent_and_engine_result():
    user = SimpleNamespace(id="user-a", role="Analyst", company_code="ACME", email="a@example.com")
    selected = SimpleNamespace(name="Selected", max_steps=4)
    run = SimpleNamespace(id="run-1", agent_id="agent-1", agent_name="Selected", goal="audit", plan=[], status="COMPLETED", current_step=1, max_steps=4, final_output="done", error_detail=None, started_at=datetime.now(timezone.utc), completed_at=None, steps=[])
    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(side_effect=[result(selected), result([])])
    async def refresh(obj):
        obj.id = "run-1"
        obj.started_at = datetime.now(timezone.utc)
        obj.current_step = 0
        obj.status = "PENDING"
    db.refresh = AsyncMock(side_effect=refresh)
    with patch("backend.app.api.v1.agents.record_audit_log", new=AsyncMock()), patch.object(agents.agent_engine, "execute_run", new=AsyncMock(return_value=run)):
        out = await agents.trigger_agent_run(AgentRunCreate(agent_id="agent-1", goal="audit"), user, db)
    assert out.agent_name == "Selected"
    assert out.status == "COMPLETED"


@pytest.mark.asyncio
async def test_user_listing_and_mutation_isolation_paths():
    user = SimpleNamespace(id="admin", role="Super Admin", company_code="ACME", email="admin@example.com")
    target = SimpleNamespace(id="target", email="target@example.com", full_name="Target", department=None, avatar_url=None, role="Analyst", status="ACTIVE", permissions=[], last_login_at=None, created_at=datetime.now(timezone.utc), company_code="ACME")
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[SimpleNamespace(scalar=lambda: 1), result(target, [target])])
    listing = await users.list_users(1, 20, None, None, None, user, db)
    assert listing.total_records == 1
    assert listing.items[0].department == "Engineering"

    db.execute = AsyncMock(return_value=result(None))
    with pytest.raises(HTTPException, match="User not found"):
        await users.get_user_by_id("missing", user, db)

    db.execute = AsyncMock(return_value=result(target))
    with patch("backend.app.api.v1.users.assert_user_company_access", side_effect=HTTPException(status_code=404, detail="tenant")):
        with pytest.raises(HTTPException) as denied:
            await users.update_user("target", UserUpdate(full_name="Changed"), user, db)
    assert denied.value.status_code == 404


@pytest.mark.asyncio
async def test_user_create_duplicate_and_status_role_updates():
    user = SimpleNamespace(id="admin", role="Super Admin", company_code="ACME", email="admin@example.com")
    target = SimpleNamespace(id="target", email="target@example.com", full_name="Target", department="Ops", avatar_url=None, role="Analyst", status="ACTIVE", permissions=[], last_login_at=None, created_at=datetime.now(timezone.utc), company_code="ACME")
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result(target))
    with pytest.raises(HTTPException) as duplicate:
        request = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
        await users.create_user(UserCreate(email=target.email, full_name="Target", role="Analyst", password="password123"), request, user, db)
    assert duplicate.value.status_code == 409

    db.execute = AsyncMock(return_value=result(target))
    db.refresh = AsyncMock()
    with patch("backend.app.api.v1.users.record_audit_log", new=AsyncMock()):
        changed = await users.update_user_status("target", UserStatusUpdate(status="SUSPENDED"), user, db)
    assert changed.status == "SUSPENDED"

    db.execute = AsyncMock(side_effect=[result(target), result([]), result(None)])
    with patch("backend.app.api.v1.users.record_audit_log", new=AsyncMock()):
        changed_role = await users.update_user_role("target", UserRoleUpdate(role_name="Auditor"), user, db)
    assert changed_role.role == "Auditor"


@pytest.mark.asyncio
async def test_deliverable_generation_formats_and_approval():
    user = SimpleNamespace(id="user-a", role="Super Admin", company_code="ACME", email="a@example.com")
    db = AsyncMock()
    fake = SimpleNamespace(id="d-1", filename="out.txt", file_type="TXT", file_size_bytes=3, sha256_hash="hash", title="Title", description=None, owner_id="user-a", run_id=None, status="PENDING", approved_by=None, approved_at=None, metadata_json={}, created_at=datetime.now(timezone.utc), updated_at=None)
    service = MagicMock()
    service.generate_txt = AsyncMock(return_value=fake)
    with patch.object(deliverables, "deliverable_service", service):
        out = await deliverables.generate_deliverable(DeliverableGenerateRequest(file_type="TXT", title="Title"), user, db)
    assert out.id == "d-1"
    service.generate_txt.assert_awaited_once()

    with pytest.raises(HTTPException, match="Unsupported format"):
        await deliverables.generate_deliverable(SimpleNamespace(file_type="BAD", title="Title"), user, db)

    db.execute = AsyncMock(return_value=result(fake))
    with patch("backend.app.api.v1.deliverables.record_audit_log", new=AsyncMock()):
        approved = await deliverables.handle_approval("d-1", DeliverableApprovalRequest(action="APPROVE"), user, db)
    assert approved.status == "APPROVED"
    assert approved.approved_by == user.id

    db.execute = AsyncMock(return_value=result(None))
    with pytest.raises(HTTPException, match="Deliverable not found"):
        await deliverables.delete_deliverable("missing", user, db)


@pytest.mark.asyncio
async def test_companies_store_registration_requests_admin_and_purge(tmp_path):
    companies.DATA_DIR = str(tmp_path)
    companies.STORE_FILE = str(tmp_path / "companies.json")
    companies._cache = None

    created = await companies.register_company(companies.CompanyCreate(name="Acme", code=" acme "))
    assert created["company"]["code"] == "ACME"
    assert (await companies.verify_company("acme"))["verified"] is True

    request = await companies.submit_access_request(companies.AccessRequestCreate(fullName="Alice", email=" Alice@EXAMPLE.COM ", role="Analyst", companyCode="acme"))
    assert request["email"] == "alice@example.com"
    await companies.update_access_request_status(request["id"], companies.AccessRequestStatusUpdate(status="approved"))
    duplicate = await companies.submit_access_request(companies.AccessRequestCreate(fullName="Alice 2", email="alice@example.com", role="Analyst", companyCode="ACME"))
    assert duplicate["id"] == request["id"]
    assert len(await companies.list_access_requests("acme")) == 1

    updated = await companies.update_access_request_status(request["id"], companies.AccessRequestStatusUpdate(status="approved"))
    assert updated["request"]["status"] == "approved"
    admin = await companies.register_admin(companies.AdminCreate(email="Admin@EXAMPLE.COM", companyCode="acme"))
    assert (await companies.get_admin("admin@example.com"))["email"] == "admin@example.com"
    with pytest.raises(HTTPException, match="Admin not found"):
        await companies.get_admin("missing")

    with pytest.raises(HTTPException, match="Access request not found"):
        await companies.update_access_request_status("missing", companies.AccessRequestStatusUpdate(status="rejected"))
    await companies.purge_company({"companyCode": "acme"})
    assert (await companies.verify_company("acme"))["verified"] is False
    await companies.purge_company({})
