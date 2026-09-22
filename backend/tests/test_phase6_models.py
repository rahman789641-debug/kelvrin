import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.db.init_db import init_db
from backend.app.services.model_provider.factory import get_mock_provider
from backend.app.services.model_provider.base import ModelHealthStatus

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
async def test_model_registration_with_capabilities():
    """Verify registering local models with explicit capabilities and provider adapters."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "m.chen@sovereign.defense.internal", "Dr. Marcus Chen")
        headers = {"Authorization": f"Bearer {token}"}

        model_id = f"starcoder2-local-{uuid.uuid4().hex[:6]}"
        payload = {
            "id": model_id,
            "name": "StarCoder2 15B Sovereign Code Specialist",
            "provider_type": "mock",
            "endpoint_url": "http://127.0.0.1:8005/v1",
            "modality": "text",
            "capabilities": ["TEXT", "CODING"],
            "context_window": 16384,
            "vram_allocated_mb": 9600,
            "is_active": True,
            "is_default": False
        }

        resp = await client.post("/api/v1/models", headers=headers, json=payload)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["id"] == model_id
        assert data["provider_type"] == "mock"
        assert "CODING" in data["capabilities"]
        assert data["health_status"] == "HEALTHY"

        # Verify duplicate registration rejection
        resp_dup = await client.post("/api/v1/models", headers=headers, json=payload)
        assert resp_dup.status_code == 409

@pytest.mark.asyncio
async def test_model_health_probe():
    """Verify on-demand health and latency probing across local models."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Probe healthy model
        resp = await client.get("/api/v1/models/deepseek-r1-14b/health", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["model_id"] == "deepseek-r1-14b"
        assert data["health_status"] in ["HEALTHY", "DEGRADED", "UNAVAILABLE"]
        assert data["latency_ms"] >= 0.0

        # 2. Register an unreachable/offline model and probe it
        offline_id = f"offline-model-{uuid.uuid4().hex[:6]}"
        create_resp = await client.post("/api/v1/models", headers=headers, json={
            "id": offline_id,
            "name": "Offline Engine",
            "provider_type": "mock",
            "endpoint_url": "http://offline-cluster:9999",
            "modality": "text",
            "capabilities": ["TEXT"]
        })
        assert create_resp.status_code == 201

        resp_offline = await client.get(f"/api/v1/models/{offline_id}/health", headers=headers)
        assert resp_offline.status_code == 200
        assert resp_offline.json()["health_status"] == "UNAVAILABLE"

@pytest.mark.asyncio
async def test_task_classification():
    """Verify task classification into required capabilities."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "e.rostova@sovereign.defense.internal", "Elena Rostova")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Coding task
        resp_code = await client.post("/api/v1/models/classify", headers=headers, json={
            "prompt": "Write a Python script to parse sovereign json logs and filter exceptions"
        })
        assert resp_code.status_code == 200
        assert resp_code.json()["primary_capability"] == "CODING"
        assert "CODING" in resp_code.json()["required_capabilities"]

        # 2. Vision task
        resp_vision = await client.post("/api/v1/models/classify", headers=headers, json={
            "prompt": "Inspect this scanned blueprint diagram and describe components",
            "has_image": True
        })
        assert resp_vision.status_code == 200
        assert resp_vision.json()["primary_capability"] in ["VISION", "OCR"]

        # 3. Complex Reasoning task
        resp_reason = await client.post("/api/v1/models/classify", headers=headers, json={
            "prompt": "Summarize the root cause analysis and explain why the gateway failed"
        })
        assert resp_reason.status_code == 200
        assert resp_reason.json()["primary_capability"] == "REASONING"

        # 4. Standard conversational query
        resp_text = await client.post("/api/v1/models/classify", headers=headers, json={
            "prompt": "Good morning. What is the status of the local sovereign station?"
        })
        assert resp_text.status_code == 200
        assert resp_text.json()["primary_capability"] == "TEXT"

@pytest.mark.asyncio
async def test_successful_model_routing_and_execution():
    """Verify task classification -> local model selection -> local execution -> decision log."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        # Ensure mock provider is clean
        mock_p = get_mock_provider()
        mock_p.set_inference_failure(False)

        prompt = "Write a python function to compute HMAC SHA-256 integrity tokens"
        resp = await client.post("/api/v1/models/route", headers=headers, json={
            "prompt": prompt,
            "temperature": 0.2
        })
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["text"] != ""
        assert "CODING" in data["required_capabilities"]
        assert data["execution_time_ms"] > 0
        assert data["prompt_tokens"] > 0

        # Verify routing decision was persisted in routing logs
        logs_resp = await client.get("/api/v1/models/routing-logs?limit=5", headers=headers)
        assert logs_resp.status_code == 200
        logs = logs_resp.json()
        assert len(logs) > 0
        assert logs[0]["status"] == "ROUTED"
        assert "CODING" in logs[0]["required_capabilities"]

@pytest.mark.asyncio
async def test_routing_no_compatible_model_actionable_error():
    """
    Verify that when no compatible model exists for a required capability:
    - Returns HTTP 422 Unprocessable Entity with clear actionable guidance.
    - Never falls back to external cloud APIs.
    - Records NO_COMPATIBLE_MODEL in routing log.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        # Deactivate all models with VISION / OCR capability
        list_resp = await client.get("/api/v1/models", headers=headers)
        all_models = list_resp.json()

        for m in all_models:
            if "OCR" in m["capabilities"] or "VISION" in m["capabilities"]:
                if m["is_active"]:
                    await client.post(f"/api/v1/models/{m['id']}/toggle-status", headers=headers)

        try:
            # Request OCR / Vision analysis
            vision_prompt = "Perform OCR extraction and decode this scanned blueprint diagram"
            route_resp = await client.post("/api/v1/models/route", headers=headers, json={
                "prompt": vision_prompt,
                "has_image": True
            })
            assert route_resp.status_code == 422
            error_detail = route_resp.json()["detail"]
            assert "No active local model capable of" in error_detail
            assert "sovereign enclave" in error_detail

            # Verify routing log recorded NO_COMPATIBLE_MODEL
            logs_resp = await client.get("/api/v1/models/routing-logs?limit=1", headers=headers)
            assert logs_resp.status_code == 200
            latest_log = logs_resp.json()[0]
            assert latest_log["status"] == "NO_COMPATIBLE_MODEL"
            assert "No active local model" in latest_log["error_detail"]

        finally:
            # Restore models to active state
            for m in all_models:
                if "OCR" in m["capabilities"] or "VISION" in m["capabilities"]:
                    await client.post(f"/api/v1/models/{m['id']}/toggle-status", headers=headers)

@pytest.mark.asyncio
async def test_local_inference_failure_handling():
    """Verify local inference error is safely caught, reported, and logged as FAILED."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        token = await get_auth_token(client, "s.alexander@sovereign.defense.internal", "Super Admin")
        headers = {"Authorization": f"Bearer {token}"}

        # Register dedicated mock model
        mock_id = f"mock-fail-{uuid.uuid4().hex[:6]}"
        await client.post("/api/v1/models", headers=headers, json={
            "id": mock_id,
            "name": "Mock Failure Node",
            "provider_type": "mock",
            "endpoint_url": "http://127.0.0.1:8001/v1",
            "capabilities": ["TEXT", "REASONING"]
        })

        mock_p = get_mock_provider()
        mock_p.set_inference_failure(True, "Simulated GPU Out Of Memory in Sovereign Node 03")

        try:
            resp = await client.post("/api/v1/models/route", headers=headers, json={
                "prompt": "Run complex calculation",
                "override_model_id": mock_id
            })
            assert resp.status_code == 500
            assert "Local engine execution failed" in resp.json()["detail"]

            # Verify routing log recorded FAILED
            logs_resp = await client.get("/api/v1/models/routing-logs?limit=1", headers=headers)
            assert logs_resp.status_code == 200
            latest_log = logs_resp.json()[0]
            assert latest_log["status"] == "FAILED"
            assert "Out Of Memory" in latest_log["error_detail"]

        finally:
            mock_p.set_inference_failure(False)

@pytest.mark.asyncio
async def test_model_rbac_boundaries():
    """
    Verify RBAC for model management:
    - AI Admin and Super Admin CAN register and toggle models.
    - Employee and Auditor CANNOT register or toggle models (403 Forbidden).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ai_admin_token = await get_auth_token(client, "m.chen@sovereign.defense.internal", "Dr. Marcus Chen")
        emp_token = await get_auth_token(client, "j.doe@sovereign.defense.internal", "John Doe")
        auditor_token = await get_auth_token(client, "g.reid@sovereign.defense.internal", "Gen. Thomas Reid")

        # 1. AI Admin CAN register model
        model_id = f"model-rbac-{uuid.uuid4().hex[:6]}"
        resp_admin = await client.post("/api/v1/models", headers={"Authorization": f"Bearer {ai_admin_token}"}, json={
            "id": model_id,
            "name": "RBAC Test Model",
            "provider_type": "mock",
            "endpoint_url": "http://127.0.0.1:8001/v1",
            "capabilities": ["TEXT"]
        })
        assert resp_admin.status_code == 201

        # 2. Employee CANNOT register model (403)
        resp_emp = await client.post("/api/v1/models", headers={"Authorization": f"Bearer {emp_token}"}, json={
            "id": f"emp-{uuid.uuid4().hex[:6]}",
            "name": "Unauthorized Model",
            "provider_type": "mock",
            "endpoint_url": "http://127.0.0.1:8001/v1",
            "capabilities": ["TEXT"]
        })
        assert resp_emp.status_code == 403

        # 3. Auditor CANNOT toggle model status (403)
        resp_audit = await client.post(
            f"/api/v1/models/{model_id}/toggle-status",
            headers={"Authorization": f"Bearer {auditor_token}"}
        )
        assert resp_audit.status_code == 403
