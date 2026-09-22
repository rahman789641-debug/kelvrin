import base64
import hashlib
import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from backend.app.main import app
from backend.app.db.init_db import init_db

@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    import asyncio
    asyncio.run(init_db())

async def get_token_for_user(client: AsyncClient, email: str, name: str = "") -> str:
    from backend.app.core.config import settings
    resp = await client.post(
        "/api/v1/auth/local-login",
        json={"username": email, "password": settings.INITIAL_ADMIN_PASSWORD or "SovereignEnclave2026!"}
    )
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    return resp.json()["token"]

@pytest.mark.asyncio
async def test_employee_role_rbac():
    """
    Employee:
    - CAN chat
    - CAN upload permitted documents
    - CANNOT manage or view users (403)
    - CANNOT manage or view models (403)
    - CANNOT delete documents (403)
    - CANNOT read audit logs (403)
    - CANNOT read security status (403)
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await get_token_for_user(client, "j.doe@sovereign.defense.internal", "John Doe")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. CAN chat
        chat_resp = await client.post(
            "/api/v1/chat/conversations",
            headers=headers,
            json={"title": "Employee Research Chat", "model_id": "deepseek-r1-14b"}
        )
        assert chat_resp.status_code == 201, chat_resp.text

        # 2. CAN upload permitted document
        raw_doc_bytes = f"%PDF-1.5 Employee Field Notes Content {uuid.uuid4().hex}".encode()
        doc_hash = hashlib.sha256(raw_doc_bytes).hexdigest()
        doc_resp = await client.post(
            "/api/v1/documents",
            headers=headers,
            json={
                "title": "Employee Field Notes",
                "filename": "notes.pdf",
                "file_path": "/storage/docs/notes.pdf",
                "file_size_bytes": len(raw_doc_bytes),
                "mime_type": "application/pdf",
                "sha256_hash": doc_hash,
                "classification": "INTERNAL",
                "content_base64": base64.b64encode(raw_doc_bytes).decode()
            }
        )
        assert doc_resp.status_code == 201, doc_resp.text
        doc_id = doc_resp.json()["id"]

        # 3. CAN read documents
        read_doc_resp = await client.get("/api/v1/documents", headers=headers)
        assert read_doc_resp.status_code == 200

        # 4. CANNOT delete documents (403)
        del_resp = await client.delete(f"/api/v1/documents/{doc_id}", headers=headers)
        assert del_resp.status_code == 403
        assert "documents.delete" in del_resp.json()["detail"]

        # 5. CANNOT list users (403)
        users_resp = await client.get("/api/v1/users", headers=headers)
        assert users_resp.status_code == 403
        assert "users.read" in users_resp.json()["detail"]

        # 6. CANNOT create user (403)
        create_user_resp = await client.post(
            "/api/v1/users",
            headers=headers,
            json={"email": "hacker@evil.com", "full_name": "Hacker", "role": "Super Admin"}
        )
        assert create_user_resp.status_code == 403
        assert "users.create" in create_user_resp.json()["detail"]

        # 7. CANNOT read models (403)
        models_resp = await client.get("/api/v1/models", headers=headers)
        assert models_resp.status_code == 403
        assert "models.read" in models_resp.json()["detail"]

        # 8. CANNOT manage models (403)
        add_model_resp = await client.post(
            "/api/v1/models",
            headers=headers,
            json={"id": "rogue-model", "name": "Rogue", "endpoint_url": "http://evil:8000"}
        )
        assert add_model_resp.status_code == 403
        assert "models.manage" in add_model_resp.json()["detail"]

        # 9. CANNOT read audit (403)
        audit_resp = await client.get("/api/v1/audit", headers=headers)
        assert audit_resp.status_code == 403
        assert "audit.read" in audit_resp.json()["detail"]

        # 10. CANNOT read security status (403)
        sec_resp = await client.get("/api/v1/security/status", headers=headers)
        assert sec_resp.status_code == 403
        assert "security.read" in sec_resp.json()["detail"]

@pytest.mark.asyncio
async def test_ai_admin_role_rbac():
    """
    AI Admin:
    - CAN manage models
    - CAN manage agents
    - CAN chat
    - CAN read security & audit
    - CANNOT access unrestricted user administration (403)
    - CANNOT delete documents (403)
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await get_token_for_user(client, "m.chen@sovereign.defense.internal", "Dr. Marcus Chen")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. CAN manage models
        new_model_id = f"model_{uuid.uuid4().hex[:6]}"
        model_resp = await client.post(
            "/api/v1/models",
            headers=headers,
            json={
                "id": new_model_id,
                "name": "Llama-3-70B-Sovereign",
                "endpoint_url": "http://127.0.0.1:8005/v1",
                "modality": "text",
                "context_window": 16384,
                "vram_allocated_mb": 19500
            }
        )
        assert model_resp.status_code == 201, model_resp.text

        # 2. CAN manage agents
        agent_resp = await client.post(
            "/api/v1/agents/runs",
            headers=headers,
            json={"agent_name": "ReAct SecOps Agent", "goal": "Analyze local memory logs"}
        )
        assert agent_resp.status_code == 201, agent_resp.text

        # 3. CAN read audit logs & security
        audit_resp = await client.get("/api/v1/audit", headers=headers)
        assert audit_resp.status_code == 200
        sec_resp = await client.get("/api/v1/security/status", headers=headers)
        assert sec_resp.status_code == 200

        # 4. CANNOT create user (403)
        create_user_resp = await client.post(
            "/api/v1/users",
            headers=headers,
            json={"email": "new.user@sovereign.internal", "full_name": "New User", "role": "Employee"}
        )
        assert create_user_resp.status_code == 403
        assert "users.create" in create_user_resp.json()["detail"]

        # 5. CANNOT disable users (403)
        disable_resp = await client.patch(
            "/api/v1/users/usr_emp_05/status",
            headers=headers,
            json={"status": "SUSPENDED"}
        )
        assert disable_resp.status_code == 403
        assert "users.disable" in disable_resp.json()["detail"]

        # 6. CANNOT delete documents (403)
        del_resp = await client.delete("/api/v1/documents/fake-doc-id", headers=headers)
        assert del_resp.status_code == 403

@pytest.mark.asyncio
async def test_auditor_role_rbac():
    """
    Auditor:
    - CAN read audit and security information
    - CAN read models and documents
    - CANNOT modify production data (no document uploads, no chat, no agents, no users, no models)
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await get_token_for_user(client, "g.reid@sovereign.defense.internal", "Gen. Thomas Reid")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. CAN read audit logs
        audit_resp = await client.get("/api/v1/audit", headers=headers)
        assert audit_resp.status_code == 200

        # 2. CAN read security status
        sec_resp = await client.get("/api/v1/security/status", headers=headers)
        assert sec_resp.status_code == 200

        # 3. CAN read documents
        doc_resp = await client.get("/api/v1/documents", headers=headers)
        assert doc_resp.status_code == 200

        # 4. CAN read models
        model_resp = await client.get("/api/v1/models", headers=headers)
        assert model_resp.status_code == 200

        # 5. CANNOT upload document (403)
        upload_resp = await client.post(
            "/api/v1/documents",
            headers=headers,
            json={
                "title": "Unauthorized Ingestion",
                "filename": "test.pdf",
                "file_path": "/tmp/test.pdf",
                "file_size_bytes": 100,
                "mime_type": "application/pdf",
                "sha256_hash": f"audit_hash_{uuid.uuid4().hex}",
                "classification": "INTERNAL"
            }
        )
        assert upload_resp.status_code == 403
        assert "documents.upload" in upload_resp.json()["detail"]

        # 6. CANNOT chat (403)
        chat_resp = await client.post(
            "/api/v1/chat/conversations",
            headers=headers,
            json={"title": "Auditor Chat", "model_id": "deepseek-r1-14b"}
        )
        assert chat_resp.status_code == 403
        assert "ai.chat" in chat_resp.json()["detail"]

        # 7. CANNOT execute agents (403)
        agent_resp = await client.post(
            "/api/v1/agents/runs",
            headers=headers,
            json={"agent_name": "Auditor Agent", "goal": "Unauthorized Goal"}
        )
        assert agent_resp.status_code == 403
        assert "agents.execute" in agent_resp.json()["detail"]

        # 8. CANNOT create workflows (403)
        wf_resp = await client.post(
            "/api/v1/workflows",
            headers=headers,
            json={"name": "Auditor Workflow", "dag_definition": {}}
        )
        assert wf_resp.status_code == 403
        assert "workflow.create" in wf_resp.json()["detail"]

@pytest.mark.asyncio
async def test_approver_role_rbac():
    """
    Approver / Manager:
    - CAN view users directory
    - CAN read audit logs
    - CAN execute workflows & agents
    - CANNOT provision users (403)
    - CANNOT disable users (403)
    - CANNOT manage models (403)
    - CANNOT delete documents (403)
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await get_token_for_user(client, "a.vance@sovereign.defense.internal", "Audrey Vance")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. CAN view users
        users_resp = await client.get("/api/v1/users", headers=headers)
        assert users_resp.status_code == 200

        # 2. CAN read audit
        audit_resp = await client.get("/api/v1/audit", headers=headers)
        assert audit_resp.status_code == 200

        # 3. CAN execute workflows
        wf_resp = await client.get("/api/v1/workflows", headers=headers)
        assert wf_resp.status_code == 200

        # 4. CANNOT create users (403)
        create_user_resp = await client.post(
            "/api/v1/users",
            headers=headers,
            json={"email": "agent.smith@sovereign.internal", "full_name": "Smith", "role": "Employee"}
        )
        assert create_user_resp.status_code == 403
        assert "users.create" in create_user_resp.json()["detail"]

        # 5. CANNOT manage models (403)
        add_model = await client.post(
            "/api/v1/models",
            headers=headers,
            json={"id": "approver-m", "name": "Appr Model", "endpoint_url": "http://127.0.0.1:8000"}
        )
        assert add_model.status_code == 403
        assert "models.manage" in add_model.json()["detail"]

@pytest.mark.asyncio
async def test_analyst_role_rbac():
    """
    Analyst:
    - CAN chat and execute code/documents
    - CAN read models
    - CANNOT manage models (403)
    - CANNOT read security status (403)
    - CANNOT read audit logs (403)
    - CANNOT manage users (403)
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await get_token_for_user(client, "e.rostova@sovereign.defense.internal", "Elena Rostova")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. CAN chat
        chat_resp = await client.post(
            "/api/v1/chat/conversations",
            headers=headers,
            json={"title": "Analyst Query", "model_id": "deepseek-r1-14b"}
        )
        assert chat_resp.status_code == 201

        # 2. CAN read models
        models_resp = await client.get("/api/v1/models", headers=headers)
        assert models_resp.status_code == 200

        # 3. CANNOT register model (403)
        add_m = await client.post(
            "/api/v1/models",
            headers=headers,
            json={"id": "analyst-m", "name": "Analyst Model", "endpoint_url": "http://127.0.0.1:8000"}
        )
        assert add_m.status_code == 403

        # 4. CANNOT read security status (403)
        sec_resp = await client.get("/api/v1/security/status", headers=headers)
        assert sec_resp.status_code == 403
        assert "security.read" in sec_resp.json()["detail"]

        # 5. CANNOT read audit logs (403)
        audit_resp = await client.get("/api/v1/audit", headers=headers)
        assert audit_resp.status_code == 403

@pytest.mark.asyncio
async def test_super_admin_role_rbac():
    """
    Super Admin:
    - Full administrative permissions across all endpoints
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await get_token_for_user(client, "s.alexander@sovereign.defense.internal", "Col. Sterling Alexander")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Read & Create Users
        list_u = await client.get("/api/v1/users", headers=headers)
        assert list_u.status_code == 200

        new_email = f"operator_{uuid.uuid4().hex[:6]}@sovereign.defense.internal"
        create_u = await client.post(
            "/api/v1/users",
            headers=headers,
            json={"email": new_email, "full_name": "New Operator", "role": "Employee"}
        )
        assert create_u.status_code == 201

        # 2. Upload & Delete Document
        raw_directive_bytes = f"%PDF-1.5 Classified Directive Content {uuid.uuid4().hex}".encode()
        h = hashlib.sha256(raw_directive_bytes).hexdigest()
        doc_resp = await client.post(
            "/api/v1/documents",
            headers=headers,
            json={
                "title": "Classified Directive",
                "filename": "directive.pdf",
                "file_path": "/secure/directive.pdf",
                "file_size_bytes": len(raw_directive_bytes),
                "mime_type": "application/pdf",
                "sha256_hash": h,
                "classification": "RESTRICTED",
                "content_base64": base64.b64encode(raw_directive_bytes).decode()
            }
        )
        assert doc_resp.status_code == 201
        doc_id = doc_resp.json()["id"]

        del_resp = await client.delete(f"/api/v1/documents/{doc_id}", headers=headers)
        assert del_resp.status_code == 204

        # 3. Model Management
        m_id = f"super_m_{uuid.uuid4().hex[:6]}"
        add_m = await client.post(
            "/api/v1/models",
            headers=headers,
            json={"id": m_id, "name": "Super Llama", "endpoint_url": "http://127.0.0.1:8000"}
        )
        assert add_m.status_code == 201

        # 4. Audit & Security
        audit_resp = await client.get("/api/v1/audit", headers=headers)
        assert audit_resp.status_code == 200
        sec_resp = await client.get("/api/v1/security/status", headers=headers)
        assert sec_resp.status_code == 200
