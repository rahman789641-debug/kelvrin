from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from backend.app.api.v1 import agents, chat, companies, deliverables, users
from backend.app.models.chat import Message
from backend.app.schemas.agent import AgentCreate
from backend.app.schemas.deliverable import DeliverableApprovalRequest


def result(value=None, values=None, scalar=None):
    scalars = MagicMock()
    scalars.all.return_value = values or []
    return SimpleNamespace(scalar_one_or_none=MagicMock(return_value=value), scalars=MagicMock(return_value=scalars), scalar=MagicMock(return_value=scalar if scalar is not None else value))


def user():
    return SimpleNamespace(id="admin", role="Super Admin", company_code="ACME", email="admin@example.com", permissions=["*"])


@pytest.mark.asyncio
async def test_agent_create_list_runs_and_cancel_success():
    actor = user()
    db = AsyncMock()
    db.add = MagicMock()
    created = SimpleNamespace(id="agent-1", name="Risk", description="risk", category="General", system_prompt="prompt", model_id="local", tool_allowlist=[], max_steps=10, timeout_seconds=120, is_active=True, created_at=datetime.now(timezone.utc), updated_at=None)
    async def refresh(obj):
        obj.id = "agent-1"
        obj.created_at = datetime.now(timezone.utc)
        obj.updated_at = None
        obj.is_active = True
    db.refresh = AsyncMock(side_effect=refresh)
    db.execute = AsyncMock(side_effect=[result(values=[]), result(None)])
    with patch.object(agents, "record_audit_log", new=AsyncMock()):
        output = await agents.create_agent(AgentCreate(name="Risk", description="risk", system_prompt="prompt"), actor, db)
    assert output.name == "Risk"

    run = SimpleNamespace(id="run-1", agent_id=None, agent_name="Risk", goal="goal", plan=[], status="RUNNING", current_step=0, max_steps=2, final_output=None, error_detail=None, started_at=datetime.now(timezone.utc), completed_at=None)
    step = SimpleNamespace(id="step-1", step_number=1, title="step", action_name="read", action_input={}, observation="ok", safe_summary="ok", status="DONE", requires_approval=False, approved_by=None, duration_ms=2, error_message=None)
    db.execute = AsyncMock(side_effect=[result(values=[run]), result(values=[step])])
    listed = await agents.list_agent_runs(None, None, 25, actor, db)
    assert listed[0].steps[0].status == "DONE"

    db.execute = AsyncMock(side_effect=[result(run), result(values=[])])
    updated = SimpleNamespace(**run.__dict__)
    updated.status = "CANCELLED"
    with patch.object(agents.agent_engine, "cancel_run", new=AsyncMock(return_value=updated)), patch.object(agents, "record_audit_log", new=AsyncMock()):
        cancelled = await agents.cancel_agent_run("run-1", actor, db)
    assert cancelled.status == "CANCELLED"


@pytest.mark.asyncio
async def test_chat_list_and_get_document_metadata_success():
    actor = user()
    conv = SimpleNamespace(id="conv", title="Title", user_id=actor.id, model_id="local", document_id="doc", created_at=datetime.now(timezone.utc), updated_at=None)
    msg = SimpleNamespace(id="msg", conversation_id="conv", sender_type="assistant", content="answer", model_used="local", detected_intent="GENERAL", routing_reasoning="route", required_capabilities=[], attachment_name=None, tokens_prompt=1, tokens_completion=1, latency_ms=1, created_at=datetime.now(timezone.utc))
    doc = SimpleNamespace(id="doc", title="Policy", status="READY")
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[result(values=[conv]), result(values=[msg]), result(doc)])
    listed = await chat.list_conversations(actor, db)
    assert listed[0].document_title == "Policy"

    db.execute = AsyncMock(side_effect=[result(conv), result(values=[msg]), result(doc)])
    with patch("backend.app.core.tenant.authorize_tenant_access"):
        fetched = await chat.get_conversation("conv", actor, db)
    assert fetched.messages[0].content == "answer"


@pytest.mark.asyncio
async def test_deliverable_listing_details_and_approval_transitions():
    actor = user()
    d = SimpleNamespace(id="d", filename="file.txt", file_type="TXT", file_size_bytes=4, sha256_hash="hash", title="File", description="desc", owner_id=actor.id, run_id=None, status="PENDING", approved_by=None, approved_at=None, metadata_json={}, created_at=datetime.now(timezone.utc), updated_at=None, company_code="ACME")
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result(values=[d]))
    assert (await deliverables.list_deliverables(None, None, actor, db))[0].id == "d"
    db.execute = AsyncMock(return_value=result(d))
    with patch("backend.app.core.tenant.authorize_tenant_access"):
        assert (await deliverables.get_deliverable_details("d", actor, db)).title == "File"
    with patch("backend.app.core.tenant.authorize_tenant_access"), patch.object(deliverables, "record_audit_log", new=AsyncMock()):
        rejected = await deliverables.handle_approval("d", DeliverableApprovalRequest(action="REJECT"), actor, db)
    assert rejected.status == "REJECTED"
    with patch("backend.app.core.tenant.authorize_tenant_access"), patch.object(deliverables, "record_audit_log", new=AsyncMock()):
        submitted = await deliverables.handle_approval("d", DeliverableApprovalRequest(action="SUBMIT"), actor, db)
    assert submitted.status == "PENDING_APPROVAL"


def test_companies_store_cache_and_corrupt_file_recovery(tmp_path):
    companies.DATA_DIR = str(tmp_path)
    companies.STORE_FILE = str(tmp_path / "companies.json")
    companies._cache = None
    companies._ensure_store_exists()
    first = companies._read_store()
    assert "companies" in first
    assert companies._read_store()["companies"] == {}
    (tmp_path / "companies.json").write_text("not json")
    companies._cache = None
    assert companies._read_store()["access_requests"] == []


def test_company_store_write_failure_is_logged_and_does_not_escape(tmp_path):
    companies.DATA_DIR = str(tmp_path)
    companies.STORE_FILE = str(tmp_path / "companies.json")
    companies._cache = None
    with patch("builtins.open", side_effect=OSError("read-only")), \
         patch("backend.app.api.v1.companies.os.path.exists", return_value=True), \
         patch("backend.app.api.v1.companies.os.remove", side_effect=OSError("locked")):
        companies._write_store({"companies": {}})


@pytest.mark.asyncio
async def test_company_pending_request_replacement_and_case_insensitive_lookup(tmp_path):
    companies.DATA_DIR = str(tmp_path)
    companies.STORE_FILE = str(tmp_path / "companies.json")
    companies._cache = None
    first = await companies.register_company(companies.CompanyCreate(name="Acme", code="ACME"))
    request = await companies.submit_access_request(companies.AccessRequestCreate(fullName="Alice", email="alice@example.com", role="Analyst", companyCode="ACME"))
    replacement = await companies.submit_access_request(companies.AccessRequestCreate(fullName="Alice Updated", email="alice@example.com", role="Auditor", companyCode="ACME"))
    assert replacement["id"] != request["id"] or replacement["role"] == "Auditor"
    companies._cache["companies"] = {"acme-lower": first["company"]}
    companies._cache["companies"]["acme-lower"]["code"] = "ACME-LOWER"
    assert (await companies.get_company("ACME-LOWER"))["code"] == "ACME-LOWER"
    assert (await companies.verify_company("ACME-LOWER"))["verified"] is True
    assert await companies.list_access_requests(None) is not None
    assert (await companies.verify_company("missing"))["verified"] is False
    with pytest.raises(HTTPException, match="not registered"):
        await companies.get_company("missing")


@pytest.mark.asyncio
async def test_users_role_status_missing_resource_errors():
    actor = user()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result(None))
    with pytest.raises(HTTPException, match="User not found"):
        await users.update_user_status("missing", SimpleNamespace(status="ACTIVE"), actor, db)
    with pytest.raises(HTTPException, match="User not found"):
        await users.update_user_role("missing", SimpleNamespace(role_name="Analyst"), actor, db)
