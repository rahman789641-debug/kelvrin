import os
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from backend.app.api.v1 import agents, chat, deliverables, users
from backend.app.models.chat import Conversation, Message
from backend.app.schemas.agent import AgentUpdate
from backend.app.schemas.user import UserCreate


def db_result(value=None, values=None):
    scalars = MagicMock()
    scalars.all.return_value = values or []
    return SimpleNamespace(scalar_one_or_none=MagicMock(return_value=value), scalars=MagicMock(return_value=scalars))


def actor():
    return SimpleNamespace(id="user-a", role="Super Admin", company_code="ACME", email="admin@example.com")


@pytest.mark.asyncio
async def test_chat_list_create_and_delete_conversations():
    user = actor()
    conv = SimpleNamespace(id="conv-1", title="Research", user_id="user-a", model_id="local", document_id=None, created_at=datetime.now(timezone.utc), updated_at=None)
    msg = SimpleNamespace(id="msg-1", conversation_id="conv-1", sender_type="user", content="hello", model_used=None, detected_intent=None, routing_reasoning=None, required_capabilities=None, attachment_name=None, tokens_prompt=None, tokens_completion=None, latency_ms=None, created_at=datetime.now(timezone.utc))
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[db_result(values=[conv]), db_result(values=[msg])])
    conversations = await chat.list_conversations(user, db)
    assert conversations[0].messages[0].content == "hello"

    db.add = MagicMock()
    async def refresh(obj):
        obj.id = "conv-created"
        obj.created_at = datetime.now(timezone.utc)
        obj.updated_at = None
    db.refresh = AsyncMock(side_effect=refresh)
    with patch.object(chat, "record_audit_log", new=AsyncMock()):
        created = await chat.create_conversation(SimpleNamespace(title=None, model_id=None, document_id=None), user, db)
    assert created.title == "New Sovereign Conversation"
    assert created.model_id == "auto"

    db.execute = AsyncMock(return_value=db_result(conv))
    db.delete = AsyncMock()
    with patch("backend.app.core.tenant.authorize_tenant_access"), patch.object(chat, "record_audit_log", new=AsyncMock()):
        assert await chat.delete_conversation("conv-1", user, db) is None
    db.delete.assert_awaited_once_with(conv)


@pytest.mark.asyncio
async def test_agent_crud_success_and_approval_error():
    user = actor()
    agent = SimpleNamespace(id="agent-1", name="Old", description="desc", category="Risk", system_prompt="prompt", model_id="local", tool_allowlist=[], max_steps=5, timeout_seconds=30, is_active=True, created_at=datetime.now(timezone.utc), updated_at=None)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=db_result(agent))
    assert (await agents.get_agent("agent-1", user, db)).id == "agent-1"
    db.refresh = AsyncMock()
    with patch.object(agents, "record_audit_log", new=AsyncMock()):
        updated = await agents.update_agent("agent-1", AgentUpdate(description="changed", category="Compliance", system_prompt="new", model_id="new", tool_allowlist=["read"], max_steps=8, timeout_seconds=60, is_active=False), user, db)
    assert updated.description == "changed"
    assert updated.tool_allowlist == ["read"]
    db.delete = AsyncMock()
    await agents.delete_agent("agent-1", user, db)
    db.delete.assert_awaited_once_with(agent)

    run = SimpleNamespace(id="run-1", company_code="ACME")
    db.execute = AsyncMock(return_value=db_result(run))
    with patch.object(agents.agent_engine, "resume_run_after_approval", new=AsyncMock(side_effect=ValueError("step missing"))):
        with pytest.raises(HTTPException, match="step missing"):
            await agents.approve_agent_step("run-1", "missing", user, db)


@pytest.mark.asyncio
async def test_user_create_success_and_role_listing_empty():
    user = actor()
    new_user = SimpleNamespace(id="new-user", email="new@example.com", full_name="New", department="Engineering", avatar_url=None, role="Analyst", status="ACTIVE", permissions=[], last_login_at=None, created_at=datetime.now(timezone.utc), company_code=None)
    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(side_effect=[db_result(None), db_result(None)])
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    async def refresh(obj):
        obj.id = new_user.id
        obj.created_at = new_user.created_at
    db.refresh.side_effect = refresh
    request = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))
    with patch.object(users, "record_audit_log", new=AsyncMock()), patch.object(users, "check_auth_rate_limit", new=AsyncMock()):
        created = await users.create_user(UserCreate(email="new@example.com", full_name="New", role="Analyst", password="password123"), request, user, db)
    assert created.email == "new@example.com"
    assert created.department == "Engineering"


@pytest.mark.asyncio
async def test_deliverable_download_preseed_and_dynamic_rebuild_paths(tmp_path):
    user = actor()
    auth = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")
    db = AsyncMock()
    db.execute = AsyncMock(return_value=db_result(None))
    generated = SimpleNamespace(id="generated", filename="audit.docx", file_type="DOCX", file_path=str(tmp_path / "audit.docx"), title="Audit", description="Audit body", company_code="ACME")
    (tmp_path / "audit.docx").write_text("audit")
    service = MagicMock()
    service.generate_docx = AsyncMock(return_value=generated)
    service.generate_xlsx = AsyncMock(return_value=generated)
    with patch.object(deliverables, "get_current_user", new=AsyncMock(return_value=user)), patch.object(deliverables, "deliverable_service", service), patch.object(deliverables, "record_audit_log", new=AsyncMock()):
        response = await deliverables.download_deliverable("deliv-101", credentials=auth, db=db)
    assert response.filename == "audit.docx"

    with patch.object(deliverables, "get_current_user", new=AsyncMock(return_value=user)):
        with pytest.raises(HTTPException, match="Deliverable not found"):
            await deliverables.download_deliverable("unknown", credentials=auth, db=db)

    for file_type, method in [("DOCX", "generate_docx"), ("XLSX", "generate_xlsx"), ("PPTX", "generate_pptx"), ("PDF", "generate_pdf"), ("TXT", "generate_txt")]:
        path = tmp_path / f"{file_type.lower()}.out"
        record = SimpleNamespace(id=f"{file_type}-1", filename=path.name, file_type=file_type, file_path=str(path), title="Title", description="Body", company_code="ACME")
        db.execute = AsyncMock(return_value=db_result(record))
        service = MagicMock()
        setattr(service, method, AsyncMock(return_value=record))
        with patch.object(deliverables, "get_current_user", new=AsyncMock(return_value=user)), patch.object(deliverables, "deliverable_service", service), patch.object(deliverables, "record_audit_log", new=AsyncMock()):
            result = await deliverables.download_deliverable(record.id, credentials=auth, db=db)
        assert result.filename == path.name
        getattr(service, method).assert_awaited_once()
