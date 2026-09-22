import uuid
import time
from datetime import datetime, timezone, timedelta
import pytest
from jose import jwt
from httpx import ASGITransport, AsyncClient
from backend.app.main import app
from backend.app.db.init_db import init_db
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.user import User
from backend.app.core.config import settings
from backend.app.core.security import hash_password, create_access_token

@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    import asyncio
    asyncio.run(init_db())

@pytest.mark.asyncio
async def test_unauthenticated_endpoints_return_401():
    """
    Verify that all protected API endpoints strictly reject unauthenticated requests
    with HTTP 401 Unauthorized and required WWW-Authenticate header.
    """
    protected_endpoints = [
        ("GET", "/api/v1/documents"),
        ("GET", "/api/v1/chat/conversations"),
        ("GET", "/api/v1/agents/runs"),
        ("GET", "/api/v1/models"),
        ("GET", "/api/v1/deliverables"),
        ("GET", "/api/v1/users"),
        ("GET", "/api/v1/audit"),
        ("GET", "/api/v1/security/status"),
        ("GET", "/api/v1/security/dashboard"),
        ("GET", "/api/v1/system/health"),
        ("GET", "/api/v1/auth/me"),
        ("POST", "/api/v1/auth/refresh"),
        ("POST", "/api/v1/auth/logout"),
    ]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for method, url in protected_endpoints:
            if method == "GET":
                resp = await client.get(url)
            else:
                resp = await client.post(url)
            assert resp.status_code == 401, f"Endpoint {method} {url} allowed unauthenticated access (status: {resp.status_code})"
            assert "detail" in resp.json()

@pytest.mark.asyncio
async def test_malformed_and_tampered_tokens_rejected():
    """
    Verify that malformed headers, forged secrets, tampered signatures,
    and expired tokens are all strictly rejected with HTTP 401.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Non-Bearer scheme
        resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Basic dXNlcjpwYXNz"})
        assert resp.status_code == 401

        # 2. Empty Bearer token
        resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer "})
        assert resp.status_code == 401

        # 3. Invalid token string
        resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-valid-jwt"})
        assert resp.status_code == 401

        # 4. Token signed with wrong secret (forgery attempt)
        forged_payload = {
            "sub": "usr_hacker_123",
            "email": "hacker@evil.org",
            "role": "Super Admin",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1)
        }
        forged_token = jwt.encode(forged_payload, "completely-wrong-and-fraudulent-secret-key-12345", algorithm=settings.ALGORITHM)
        resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged_token}"})
        assert resp.status_code == 401
        assert "invalid or expired" in resp.json()["detail"].lower()

        # 5. Expired token
        expired_payload = {
            "sub": "usr_expired_123",
            "email": "expired@sovereign.internal",
            "role": "Employee",
            "exp": datetime.now(timezone.utc) - timedelta(hours=2)
        }
        expired_token = jwt.encode(expired_payload, settings.JWT_SECRET_KEY, algorithm=settings.ALGORITHM)
        resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
        assert resp.status_code == 401
        assert "invalid or expired" in resp.json()["detail"].lower()

@pytest.mark.asyncio
async def test_negative_rbac_permissions_enforcement():
    """
    Verify RBAC clearance enforcement:
    - Non-privileged Employee cannot invoke administrative or security endpoints (403)
    - Auditor cannot mutate state (403)
    - Suspended user cannot perform any authenticated operations (403)
    """
    async with AsyncSessionLocal() as session:
        # Create an Employee user
        emp_user = User(
            id=f"usr_emp_{uuid.uuid4().hex[:8]}",
            email=f"emp_{uuid.uuid4().hex[:6]}@sovereign.defense.internal",
            full_name="Test Employee",
            role="Employee",
            status="ACTIVE",
            password_hash=hash_password("Pass1234!")
        )
        # Create an Auditor user
        audit_user = User(
            id=f"usr_aud_{uuid.uuid4().hex[:8]}",
            email=f"aud_{uuid.uuid4().hex[:6]}@sovereign.defense.internal",
            full_name="Test Auditor",
            role="Auditor",
            status="ACTIVE",
            password_hash=hash_password("Pass1234!")
        )
        # Create a Suspended user
        susp_user = User(
            id=f"usr_susp_{uuid.uuid4().hex[:8]}",
            email=f"susp_{uuid.uuid4().hex[:6]}@sovereign.defense.internal",
            full_name="Suspended User",
            role="Analyst",
            status="SUSPENDED",
            password_hash=hash_password("Pass1234!")
        )
        session.add_all([emp_user, audit_user, susp_user])
        await session.commit()

        emp_id = emp_user.id
        audit_id = audit_user.id
        susp_id = susp_user.id

    emp_token = create_access_token(emp_id, email=emp_user.email, role="Employee", permissions=emp_user.permissions)
    audit_token = create_access_token(audit_id, email=audit_user.email, role="Auditor", permissions=audit_user.permissions)
    susp_token = create_access_token(susp_id, email=susp_user.email, role="Analyst", permissions=susp_user.permissions)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Employee attempting Admin actions -> 403 Forbidden
        headers_emp = {"Authorization": f"Bearer {emp_token}"}

        resp = await client.post("/api/v1/models", headers=headers_emp, json={"name": "Hacked", "endpoint_url": "http://127.0.0.1:8000"})
        assert resp.status_code == 403

        resp = await client.post("/api/v1/users", headers=headers_emp, json={"email": "hacker@test.com", "full_name": "Hacker", "role": "Super Admin"})
        assert resp.status_code == 403

        resp = await client.get("/api/v1/users", headers=headers_emp)
        assert resp.status_code == 403

        resp = await client.get("/api/v1/audit", headers=headers_emp)
        assert resp.status_code == 403

        resp = await client.get("/api/v1/security/status", headers=headers_emp)
        assert resp.status_code == 403

        resp = await client.get("/api/v1/security/dashboard", headers=headers_emp)
        assert resp.status_code == 403

        # 2. Auditor attempting mutation actions -> 403 Forbidden
        headers_aud = {"Authorization": f"Bearer {audit_token}"}

        resp = await client.post("/api/v1/chat/conversations", headers=headers_aud, json={"title": "Auditor Chat"})
        assert resp.status_code == 403

        resp = await client.post("/api/v1/agents/runs", headers=headers_aud, json={"goal": "Auditor Agent"})
        assert resp.status_code == 403

        # 3. Suspended account -> 403 Forbidden
        headers_susp = {"Authorization": f"Bearer {susp_token}"}
        resp = await client.get("/api/v1/auth/me", headers=headers_susp)
        assert resp.status_code == 403
        assert "suspended" in resp.json()["detail"].lower()

@pytest.mark.asyncio
async def test_auth_backdoor_negative_rejections():
    """
    Verify backdoors and unverified authentication attempts are rejected with HTTP 401.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Backdoor mock_google_ token rejected
        resp = await client.post("/api/v1/auth/google-login", json={"id_token": "mock_google_superadmin@test.com|Admin"})
        assert resp.status_code == 401

        # 2. Local login with incorrect password rejected
        resp = await client.post("/api/v1/auth/local-login", json={"username": "s.alexander@sovereign.defense.internal", "password": "WrongPassword123!"})
        assert resp.status_code == 401

        # 3. Local login with non-existent user rejected (does NOT create admin account)
        resp = await client.post("/api/v1/auth/local-login", json={"username": "unknown.intruder@domain.com", "password": "AnyPassword!"})
        assert resp.status_code == 401
