import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from backend.app.main import app
from backend.app.db.session import AsyncSessionLocal, check_database_connection
from backend.app.db.init_db import init_db
from backend.app.core.config import settings
from backend.app.models.user import User
from backend.app.models.audit import AuditLog

@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    import asyncio
    asyncio.run(init_db())

@pytest.mark.asyncio
async def test_health_and_ready_probes():
    """1. Test health and ready probe endpoints."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Health
        h_resp = await client.get("/api/v1/health")
        assert h_resp.status_code == 200
        h_data = h_resp.json()
        assert h_data["status"] == "healthy"
        assert h_data["version"] == "1.0.0"

        # Ready
        r_resp = await client.get("/api/v1/ready")
        assert r_resp.status_code == 200
        r_data = r_resp.json()
        assert r_data["status"] in ["ready", "degraded"]
        assert "database" in r_data["dependencies"]

@pytest.mark.asyncio
async def test_database_connection_probe():
    """2. Test direct database session connectivity."""
    db_status = await check_database_connection()
    assert db_status["status"] == "connected"
    assert db_status["ping"] is True

@pytest.mark.asyncio
async def test_auth_dependency_and_protection():
    """3. Test authentication dependency (blocks unauthenticated, permits valid)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Unauthenticated request blocked with 401
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401
        assert "Authentication token required" in resp.json()["detail"]

        # Login with valid test user (Elena Rostova)
        login_resp = await client.post(
            "/api/v1/auth/local-login",
            json={
                "username": "e.rostova@sovereign.defense.internal",
                "password": settings.INITIAL_ADMIN_PASSWORD or "SovereignEnclave2026!"
            }
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["token"]

        # Authenticated request succeeds
        me_resp = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == "e.rostova@sovereign.defense.internal"

@pytest.mark.asyncio
async def test_rbac_permission_enforcement():
    """4. Test granular RBAC: Super Admin has users:manage, Analyst lacks it."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Analyst Login
        analyst_login = await client.post(
            "/api/v1/auth/local-login",
            json={
                "username": "e.rostova@sovereign.defense.internal",
                "password": settings.INITIAL_ADMIN_PASSWORD or "SovereignEnclave2026!"
            }
        )
        analyst_token = analyst_login.json()["token"]

        # Analyst tries to create a user (Requires users:manage) -> 403 Forbidden
        create_resp = await client.post(
            "/api/v1/users",
            headers={"Authorization": f"Bearer {analyst_token}"},
            json={
                "email": "intruder@enterprise.internal",
                "full_name": "Intruder",
                "role": "Analyst"
            }
        )
        assert create_resp.status_code == 403
        assert "clearance" in create_resp.json()["detail"].lower()

        # Super Admin Login (Col. Sterling Alexander)
        admin_login = await client.post(
            "/api/v1/auth/local-login",
            json={
                "username": "s.alexander@sovereign.defense.internal",
                "password": settings.INITIAL_ADMIN_PASSWORD or "SovereignEnclave2026!"
            }
        )
        admin_token = admin_login.json()["token"]

        import uuid
        unique_email = f"scientist_{uuid.uuid4().hex[:6]}@sovereign.defense.internal"
        admin_create = await client.post(
            "/api/v1/users",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "email": unique_email,
                "full_name": "Dr. Sarah Connor",
                "role": "Analyst"
            }
        )
        assert admin_create.status_code == 201
        assert admin_create.json()["email"] == unique_email

@pytest.mark.asyncio
async def test_user_crud_operations():
    """5. Test user listing, fetching by id, updating status, and role assignment."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Admin Login
        admin_login = await client.post(
            "/api/v1/auth/local-login",
            json={
                "username": "s.alexander@sovereign.defense.internal",
                "password": settings.INITIAL_ADMIN_PASSWORD or "SovereignEnclave2026!"
            }
        )
        token = admin_login.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # List Users
        list_resp = await client.get("/api/v1/users?page=1&page_size=10", headers=headers)
        assert list_resp.status_code == 200
        data = list_resp.json()
        assert data["total_records"] >= 4
        assert len(data["items"]) >= 4

        target_user = data["items"][0]
        user_id = target_user["id"]

        # Get single user
        get_resp = await client.get(f"/api/v1/users/{user_id}", headers=headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == user_id

        # Update status
        patch_resp = await client.patch(
            f"/api/v1/users/{user_id}/status",
            headers=headers,
            json={"status": "SUSPENDED"}
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["status"] == "SUSPENDED"

        # Re-activate status
        reactivate = await client.patch(
            f"/api/v1/users/{user_id}/status",
            headers=headers,
            json={"status": "ACTIVE"}
        )
        assert reactivate.status_code == 200
        assert reactivate.json()["status"] == "ACTIVE"

        # Assign Role
        role_resp = await client.patch(
            f"/api/v1/users/{user_id}/role",
            headers=headers,
            json={"role_name": "AI Admin"}
        )
        assert role_resp.status_code == 200
        assert role_resp.json()["role"] == "AI Admin"

@pytest.mark.asyncio
async def test_audit_logging_and_query():
    """6. Test immutable audit logging records events and can be queried."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Admin Login
        admin_login = await client.post(
            "/api/v1/auth/local-login",
            json={
                "username": "s.alexander@sovereign.defense.internal",
                "password": settings.INITIAL_ADMIN_PASSWORD or "SovereignEnclave2026!"
            }
        )
        token = admin_login.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Query audit logs
        audit_resp = await client.get("/api/v1/audit?page=1&page_size=20", headers=headers)
        assert audit_resp.status_code == 200
        data = audit_resp.json()
        assert data["total_records"] >= 1
        items = data["items"]
        assert len(items) >= 1
        # Check an item contains expected audit fields
        first = items[0]
        assert "event_id" in first
        assert "action" in first
        assert "status" in first
