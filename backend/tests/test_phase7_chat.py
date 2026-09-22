import base64
import hashlib
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.db.init_db import init_db
from backend.app.services.model_provider.factory import get_mock_provider

@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    import asyncio
    asyncio.run(init_db())

async def get_auth_token(client: AsyncClient, email: str, name: str = "Test Operator") -> str:
    from backend.app.core.config import settings
    resp = await client.post(
        "/api/v1/auth/local-login",
        json={"username": email, "password": settings.INITIAL_ADMIN_PASSWORD or "SovereignEnclave2026!"}
    )
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    return resp.json()["token"]

@pytest.mark.asyncio
async def test_conversation_creation_and_listing():
    """Verify creating and listing conversation threads."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        # Create new conversation
        create_resp = await client.post("/api/v1/chat/conversations", headers=headers, json={
            "title": "Tactical Threat Ingestion Session",
            "model_id": "auto"
        })
        assert create_resp.status_code == 201, create_resp.text
        conv = create_resp.json()
        assert conv["id"] is not None
        assert conv["title"] == "Tactical Threat Ingestion Session"
        assert conv["model_id"] == "auto"

        # List conversations
        list_resp = await client.get("/api/v1/chat/conversations", headers=headers)
        assert list_resp.status_code == 200
        items = list_resp.json()
        assert any(c["id"] == conv["id"] for c in items)

        # Retrieve specific conversation
        get_resp = await client.get(f"/api/v1/chat/conversations/{conv['id']}", headers=headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == conv["id"]

@pytest.mark.asyncio
async def test_ai_assistant_auto_routing_and_execution():
    """Verify user message -> auto task classification -> model routing -> local execution -> transparency metadata."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create conversation
        conv_resp = await client.post("/api/v1/chat/conversations", headers=headers, json={
            "title": "Auto Select Router Test",
            "model_id": "auto"
        })
        assert conv_resp.status_code == 201
        conv_id = conv_resp.json()["id"]

        # 2. Send coding prompt
        msg_resp = await client.post(f"/api/v1/chat/conversations/{conv_id}/messages", headers=headers, json={
            "content": "Write a Python script to compute hash collisions and verify sha256 checksums",
            "model_id": "auto"
        })
        assert msg_resp.status_code == 200, msg_resp.text
        assistant_msg = msg_resp.json()

        assert assistant_msg["sender_type"] == "assistant"
        assert assistant_msg["content"] != ""
        assert assistant_msg["detected_intent"] == "SOFTWARE_ENGINEERING_CODING"
        assert "CODING" in assistant_msg["required_capabilities"]
        assert assistant_msg["routing_reasoning"] is not None
        assert assistant_msg["latency_ms"] > 0

        # 3. Verify conversation history has both user and assistant messages
        conv_history = await client.get(f"/api/v1/chat/conversations/{conv_id}", headers=headers)
        assert conv_history.status_code == 200
        msgs = conv_history.json()["messages"]
        assert len(msgs) == 2
        assert msgs[0]["sender_type"] == "user"
        assert msgs[1]["sender_type"] == "assistant"

@pytest.mark.asyncio
async def test_ai_assistant_model_override():
    """Verify operator model override is respected."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        # Register mock model specifically
        mock_id = f"mock-direct-{uuid.uuid4().hex[:6]}"
        await client.post("/api/v1/models", headers=headers, json={
            "id": mock_id,
            "name": "Direct Override Engine",
            "provider_type": "mock",
            "endpoint_url": "http://127.0.0.1:8001/v1",
            "capabilities": ["TEXT", "REASONING"]
        })

        conv_resp = await client.post("/api/v1/chat/conversations", headers=headers, json={
            "title": "Override Model Test",
            "model_id": mock_id
        })
        conv_id = conv_resp.json()["id"]

        msg_resp = await client.post(f"/api/v1/chat/conversations/{conv_id}/messages", headers=headers, json={
            "content": "Summarize operational integrity rules",
            "model_id": mock_id
        })
        assert msg_resp.status_code == 200
        assert msg_resp.json()["model_used"] == mock_id

@pytest.mark.asyncio
async def test_document_chat_ready_document():
    """Verify Document Chat successfully answers queries grounded on a READY document."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Upload a sovereign document
        s = uuid.uuid4().hex[:8]
        doc_content = f"Operational Directives Enclave 2026 {s}.\nRule 1: Never route prompts to external commercial clouds.\nRule 2: All embeddings remain in pgvector."
        files = {"file": (f"directives_{s}.txt", doc_content.encode(), "text/plain")}
        data = {"title": f"Directives {s}", "classification": "INTERNAL"}

        up_resp = await client.post("/api/v1/documents/upload", headers=headers, files=files, data=data)
        assert up_resp.status_code == 201
        doc_id = up_resp.json()["id"]
        assert up_resp.json()["status"] == "READY"

        # 2. Query document via single-turn endpoint
        query_resp = await client.post(f"/api/v1/chat/document/{doc_id}/query", headers=headers, json={
            "query": "What does Rule 1 say regarding external commercial clouds?"
        })
        assert query_resp.status_code == 200, query_resp.text
        q_data = query_resp.json()
        assert q_data["document_id"] == doc_id
        assert q_data["answer"] != ""
        assert q_data["latency_ms"] > 0
        assert q_data["model_used"] != ""

        # 3. Test bound conversation thread
        conv_resp = await client.post("/api/v1/chat/conversations", headers=headers, json={
            "title": f"Chat with Directives {s}",
            "model_id": "auto",
            "document_id": doc_id
        })
        assert conv_resp.status_code == 201
        bound_conv_id = conv_resp.json()["id"]

        bound_msg_resp = await client.post(f"/api/v1/chat/conversations/{bound_conv_id}/messages", headers=headers, json={
            "content": "Confirm rule compliance on local storage."
        })
        assert bound_msg_resp.status_code == 200
        assert bound_msg_resp.json()["sender_type"] == "assistant"

@pytest.mark.asyncio
async def test_document_chat_unready_document_refusal():
    """
    Verify Document Chat hard refusal on documents not in READY state:
    - Never hallucinate content on unready or failed documents.
    - Return HTTP 422 Unprocessable Entity with explicit state.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create a dummy document in PROCESSING status
        s = uuid.uuid4().hex[:8]
        raw_pending_bytes = f"%PDF-1.5 Pending Parse Content {s}".encode()
        unready_resp = await client.post("/api/v1/documents", headers=headers, json={
            "title": f"Pending Parse Doc {s}",
            "filename": f"pending_{s}.pdf",
            "file_path": f"/vault/pending_{s}.pdf",
            "file_size_bytes": len(raw_pending_bytes),
            "mime_type": "application/pdf",
            "sha256_hash": hashlib.sha256(raw_pending_bytes).hexdigest(),
            "classification": "INTERNAL",
            "content_base64": base64.b64encode(raw_pending_bytes).decode()
        })
        assert unready_resp.status_code == 201
        unready_id = unready_resp.json()["id"]

        # Manually set status to PROCESSING in database via query or check
        from backend.app.db.session import AsyncSessionLocal
        from backend.app.models.document import Document
        from sqlalchemy import update
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(Document).where(Document.id == unready_id).values(status="PROCESSING")
            )
            await session.commit()

        # 2. Attempt Document Chat on unready document -> MUST REFUSE with 422
        query_resp = await client.post(f"/api/v1/chat/document/{unready_id}/query", headers=headers, json={
            "query": "What are the secret contents?"
        })
        assert query_resp.status_code == 422
        detail = query_resp.json()["detail"]
        assert "PROCESSING" in detail
        assert "locked until document processing is READY" in detail

@pytest.mark.asyncio
async def test_chat_rbac_enforcement():
    """
    Verify RBAC for chat:
    - Employee has 'ai.chat' & 'ai.execute' -> CAN converse.
    - Auditor does not have 'ai.chat' -> CANNOT converse (403 Forbidden).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        emp_token = await get_auth_token(client, "j.doe@sovereign.defense.internal", "Employee")
        auditor_token = await get_auth_token(client, "g.reid@sovereign.defense.internal", "Viewer / Auditor")

        # 1. Employee CAN create conversation and send message
        emp_conv = await client.post("/api/v1/chat/conversations", headers={"Authorization": f"Bearer {emp_token}"}, json={
            "title": "Employee Session",
            "model_id": "auto"
        })
        assert emp_conv.status_code == 201
        c_id = emp_conv.json()["id"]

        emp_msg = await client.post(f"/api/v1/chat/conversations/{c_id}/messages", headers={"Authorization": f"Bearer {emp_token}"}, json={
            "content": "Hello local sovereign system."
        })
        assert emp_msg.status_code == 200

        # 2. Auditor CANNOT create conversation (403)
        audit_conv = await client.post("/api/v1/chat/conversations", headers={"Authorization": f"Bearer {auditor_token}"}, json={
            "title": "Unauthorized Audit Chat",
            "model_id": "auto"
        })
        assert audit_conv.status_code == 403
        assert "ai.chat" in audit_conv.json()["detail"]
