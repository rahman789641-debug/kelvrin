from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from backend.app.api.v1 import agents, chat, deliverables, users
from backend.app.models.chat import Message
from backend.app.schemas.agent import AgentRunCreate
from backend.app.schemas.deliverable import DeliverableGenerateRequest
from backend.app.schemas.user import UserCreate, UserUpdate


def db_result(value=None, values=None):
    scalars = MagicMock()
    scalars.all.return_value = values or []
    return SimpleNamespace(
        scalar_one_or_none=MagicMock(return_value=value),
        scalars=MagicMock(return_value=scalars),
        scalar=MagicMock(return_value=value),
    )


def chat_user():
    return SimpleNamespace(id="user-a", role="Super Admin", company_code="ACME", email="admin@example.com")


def chat_conversation(document_id=None):
    return SimpleNamespace(
        id="conv-1", user_id="user-a", company_code="ACME", title="New Sovereign Conversation",
        model_id="auto", document_id=document_id,
    )


def deliverable_record(file_type="TXT"):
    return SimpleNamespace(
        id="deliv-1", filename=f"result.{file_type.lower()}", file_type=file_type,
        file_size_bytes=100, sha256_hash="abc123", title="Result", description="desc",
        owner_id="user-a", run_id=None, status="PENDING", approved_by=None, approved_at=None,
        metadata_json={}, created_at=datetime.now(timezone.utc), updated_at=None,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "file_type, prompt",
    [
        ("DOCX", "Create a SQL report"),
        ("XLSX", "Create a budget spreadsheet"),
        ("PPTX", "Create an AI presentation"),
        ("PDF", "Create a security report"),
    ],
)
async def test_chat_file_generation_branches_return_auditable_messages(file_type, prompt):
    user = chat_user()
    conv = chat_conversation()
    generated = deliverable_record(file_type)
    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(return_value=db_result(conv))

    async def refresh(obj):
        if isinstance(obj, Message):
            obj.id = "msg-1"
            obj.created_at = datetime.now(timezone.utc)

    db.refresh = AsyncMock(side_effect=refresh)
    classifier = SimpleNamespace(
        task_type="FILE_GENERATION", target_file_type=file_type,
        detected_intent="FILE_GENERATION", reasoning="classified locally", required_capabilities=[],
    )
    service = MagicMock()
    service.generate_docx = AsyncMock(return_value=generated)
    service.generate_xlsx = AsyncMock(return_value=generated)
    service.generate_pptx = AsyncMock(return_value=generated)
    service.generate_pdf = AsyncMock(return_value=generated)

    with patch.object(chat.task_classifier, "classify", return_value=classifier), \
         patch.object(chat, "deliverable_service", service), \
         patch.object(chat, "record_audit_log", new=AsyncMock()):
        response = await chat.send_message(
            "conv-1",
            SimpleNamespace(content=prompt, model_id="auto", attachment_name=None),
            user,
            db,
        )

    assert response.sender_type == "assistant"
    assert "DELIVERABLE_DOWNLOAD" in response.content
    assert conv.title != "New Sovereign Conversation"
    getattr(service, f"generate_{file_type.lower()}").assert_awaited_once()


@pytest.mark.asyncio
async def test_chat_standard_route_persists_model_transparency():
    user = chat_user()
    conv = chat_conversation()
    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(return_value=db_result(conv))

    async def refresh(obj):
        if isinstance(obj, Message):
            obj.id = "msg-standard"
            obj.created_at = datetime.now(timezone.utc)

    db.refresh = AsyncMock(side_effect=refresh)
    routed = {
        "text": "grounded answer", "model_id": "local-model", "detected_intent": "GENERAL",
        "routing_reasoning": "selected local model", "required_capabilities": [],
        "prompt_tokens": 2, "completion_tokens": 2, "execution_time_ms": 4.0,
    }
    with patch.object(chat.model_router, "route_and_execute", new=AsyncMock(return_value=routed)), \
         patch.object(chat.task_classifier, "classify", return_value=SimpleNamespace(task_type="CHAT", target_file_type=None)), \
         patch.object(chat, "record_audit_log", new=AsyncMock()):
        response = await chat.send_message(
            "conv-1", SimpleNamespace(content="What is the status?", model_id="auto", attachment_name="photo.png"), user, db
        )
    assert response.content == "grounded answer"
    assert response.model_used == "local-model"


@pytest.mark.asyncio
async def test_chat_document_query_returns_citations_and_evidence():
    user = chat_user()
    doc = SimpleNamespace(id="doc-1", title="Policy", status="READY", company_code="ACME", content_preview="fallback")
    citation = SimpleNamespace(document_id="doc-1", document_title="Policy", filename="policy.pdf", page_number=2, chunk_index=1, similarity_score=0.9, excerpt="citation")
    rag = SimpleNamespace(
        answer="verified answer", model_used="local", routing_reasoning="retrieved", latency_ms=5,
        status="SUCCESS", citations=[citation], evidence=[{"chunk_id": "chunk-1", "document_id": "doc-1", "document_title": "Policy", "filename": "policy.pdf", "page_number": 2, "chunk_index": 1, "similarity_score": 0.9, "content": "evidence", "classification": "SECRET"}],
    )
    db = AsyncMock()
    db.execute = AsyncMock(return_value=db_result(doc))
    with patch("backend.app.core.tenant.authorize_tenant_access"), \
         patch.object(chat.rag_pipeline, "search_and_answer", new=AsyncMock(return_value=rag)), \
         patch.object(chat, "record_audit_log", new=AsyncMock()):
        response = await chat.query_document("doc-1", SimpleNamespace(query="policy", model_id="auto"), user, db)
    assert response.answer == "verified answer"
    assert response.citations[0].excerpt == "citation"
    assert response.evidence[0].classification == "SECRET"


@pytest.mark.asyncio
async def test_agent_list_templates_agents_and_approval_success():
    user = SimpleNamespace(id="user-a", role="Super Admin", company_code="ACME", email="admin@example.com")
    template = SimpleNamespace(id="tpl", name="Template", description="desc", category="Risk", system_prompt="prompt", default_tools=[], default_model_id="local", icon="Shield", max_steps=5)
    agent = SimpleNamespace(id="agent", name="Agent", description="desc", category="Risk", system_prompt="prompt", model_id="local", tool_allowlist=[], max_steps=5, timeout_seconds=30, is_active=True, created_at=datetime.now(timezone.utc), updated_at=None)
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[db_result(values=[template]), db_result(values=[agent])])
    assert (await agents.list_agent_templates(user, db))[0].name == "Template"
    assert (await agents.list_agents(user, db))[0].name == "Agent"

    run = SimpleNamespace(id="run", company_code="ACME")
    updated = SimpleNamespace(id="run", agent_id=None, agent_name="Agent", goal="goal", plan=[], status="COMPLETED", current_step=1, max_steps=1, final_output="done", error_detail=None, started_at=datetime.now(timezone.utc), completed_at=None, steps=[])
    db.execute = AsyncMock(side_effect=[db_result(run), db_result(values=[])])
    db.refresh = AsyncMock()
    with patch.object(agents.agent_engine, "resume_run_after_approval", new=AsyncMock(return_value=updated)), \
         patch.object(agents, "record_audit_log", new=AsyncMock()):
        approved = await agents.approve_agent_step("run", "step", user, db)
    assert approved.status == "COMPLETED"


@pytest.mark.asyncio
async def test_user_meta_and_update_success_paths():
    user = SimpleNamespace(id="admin", role="Super Admin", company_code="ACME", email="admin@example.com")
    role = SimpleNamespace(id="role-1", name="Analyst", description="analyst", is_system_role=True)
    permission = SimpleNamespace(id="perm-1", code="users.read", module="users", description="Read users")
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[db_result(values=[role]), db_result(values=[permission])])
    assert (await users.list_roles(user, db))[0].name == "Analyst"
    assert (await users.list_permissions(user, db))[0].code == "users.read"

    target = SimpleNamespace(id="target", email="target@example.com", full_name="Old", department="Ops", avatar_url=None, role="Analyst", status="ACTIVE", permissions=[], last_login_at=None, created_at=datetime.now(timezone.utc), company_code="ACME")
    db.execute = AsyncMock(side_effect=[db_result(target), db_result(values=[]), db_result(role)])
    db.add = MagicMock()
    db.refresh = AsyncMock()
    with patch("backend.app.api.v1.users.record_audit_log", new=AsyncMock()):
        updated = await users.update_user("target", UserUpdate(full_name=" New ", department=" Security ", role="Auditor"), user, db)
    assert updated.full_name == "New"
    assert updated.department == "Security"
    assert updated.role == "Auditor"


@pytest.mark.asyncio
@pytest.mark.parametrize("file_type, method_name", [("DOCX", "generate_docx"), ("XLSX", "generate_xlsx"), ("PPTX", "generate_pptx"), ("PDF", "generate_pdf")])
async def test_deliverable_generation_dispatches_each_supported_format(file_type, method_name):
    user = SimpleNamespace(id="user-a", role="Super Admin", company_code="ACME", email="admin@example.com")
    db = AsyncMock()
    service = MagicMock()
    service_method = AsyncMock(return_value=deliverable_record(file_type))
    setattr(service, method_name, service_method)
    with patch.object(deliverables, "deliverable_service", service):
        output = await deliverables.generate_deliverable(DeliverableGenerateRequest(file_type=file_type, title="Title"), user, db)
    assert output.file_type == file_type
    service_method.assert_awaited_once()
