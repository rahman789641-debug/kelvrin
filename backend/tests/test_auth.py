from unittest.mock import patch
import pytest
from httpx import ASGITransport, AsyncClient
from backend.app.main import app
from backend.app.core.config import settings

@pytest.mark.asyncio
async def test_health_probe():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert data["version"] == "1.0.0"

@pytest.mark.asyncio
async def test_readiness_probe():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/ready")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ready"

@pytest.mark.asyncio
async def test_unauthenticated_route_blocked():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401
        assert "Authentication token required" in resp.json()["detail"]

@pytest.mark.asyncio
async def test_google_login_rejects_mock_and_unverified_token():
    """Verify backdoor mock_google_ tokens and unverified tokens are strictly rejected with 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {"id_token": "mock_google_analyst@sovereign.defense.internal|Elena Rostova"}
        resp = await client.post("/api/v1/auth/google-login", json=payload)
        assert resp.status_code == 401
        assert "verification failed" in resp.json()["detail"].lower() or "invalid" in resp.json()["detail"].lower()

@pytest.mark.asyncio
async def test_google_login_success_and_sovereign_token():
    """Verify legitimate cryptographically verified Google token logs in and retrieves DB role."""
    mock_profile = {
        "email": "analyst@sovereign.defense.internal",
        "name": "Elena Rostova",
        "sub": "google-sub-analyst-123",
        "picture": "https://secure.avatar/elena.jpg"
    }
    with patch("backend.app.api.v1.auth.verify_google_id_token", return_value=mock_profile):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/auth/google-login", json={"id_token": "valid.jwt.token"})
            assert resp.status_code == 200
            data = resp.json()
            assert "token" in data
            assert data["token_type"] == "bearer"
            assert data["user"]["email"] == "analyst@sovereign.defense.internal"
            assert data["user"]["role"] == "Analyst"
            assert "documents:read" in data["user"]["permissions"]

            token = data["token"]

            # Now test accessing /me with the sovereign token
            me_resp = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"}
            )
            assert me_resp.status_code == 200
            me_data = me_resp.json()
            assert me_data["email"] == "analyst@sovereign.defense.internal"

@pytest.mark.asyncio
async def test_google_login_new_user_gets_least_privilege_employee():
    """Verify newly auto-provisioned users receive Employee role, NEVER Super Admin even with 'admin' in email."""
    mock_profile = {
        "email": "admin.candidate@external.org",
        "name": "Candidate Admin",
        "sub": "google-sub-new-456",
        "picture": None
    }
    with patch("backend.app.api.v1.auth.verify_google_id_token", return_value=mock_profile):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/auth/google-login", json={"id_token": "valid.jwt.token"})
            assert resp.status_code == 200
            data = resp.json()
            assert data["user"]["email"] == "admin.candidate@external.org"
            # Must be least-privilege Employee, NOT Super Admin
            assert data["user"]["role"] == "Employee"

@pytest.mark.asyncio
async def test_suspended_user_rejection():
    """Verify suspended accounts cannot log in even with valid Google authentication."""
    mock_profile = {
        "email": "suspended.user@sovereign.defense.internal",
        "name": "Alex Mercer",
        "sub": "google-sub-suspended-789"
    }
    with patch("backend.app.api.v1.auth.verify_google_id_token", return_value=mock_profile):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/auth/google-login", json={"id_token": "valid.jwt.token"})
            assert resp.status_code == 403
            assert "suspended" in resp.json()["detail"].lower()

@pytest.mark.asyncio
async def test_airgap_local_login():
    """Verify local login validates DB-hashed credentials."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Valid admin credentials
        payload = {
            "username": "s.alexander@sovereign.defense.internal",
            "password": settings.INITIAL_ADMIN_PASSWORD or "SovereignEnclave2026!"
        }
        resp = await client.post("/api/v1/auth/local-login", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["role"] == "Super Admin"

        # Invalid password
        bad_payload = {
            "username": "s.alexander@sovereign.defense.internal",
            "password": "WrongPassword!"
        }
        bad_resp = await client.post("/api/v1/auth/local-login", json=bad_payload)
        assert bad_resp.status_code == 401

@pytest.mark.asyncio
async def test_local_login_rejects_unknown_user_no_backdoor_admin_creation():
    """Verify non-existent usernames return 401 and do NOT auto-create Super Admin accounts."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        bad_payload = {
            "username": "intruder_alexander@defense.internal",
            "password": "SomeRandomPassword123!"
        }
        bad_resp = await client.post("/api/v1/auth/local-login", json=bad_payload)
        assert bad_resp.status_code == 401

@pytest.mark.asyncio
async def test_token_refresh_and_logout():
    """Verify session token refresh and logout."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_payload = {
            "username": "m.chen@sovereign.defense.internal",
            "password": settings.INITIAL_ADMIN_PASSWORD or "SovereignEnclave2026!"
        }
        login_resp = await client.post("/api/v1/auth/local-login", json=login_payload)
        assert login_resp.status_code == 200
        token = login_resp.json()["token"]

        # Initial token is valid
        me_resp1 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_resp1.status_code == 200

        # Refresh rotates token and blacklists previous token
        ref_resp = await client.post(
            "/api/v1/auth/refresh",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert ref_resp.status_code == 200
        new_token = ref_resp.json()["token"]
        assert new_token is not None
        assert new_token != token

        # Verify previous token is immediately rejected with 401
        revoked_check = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert revoked_check.status_code == 401
        assert "revoked" in revoked_check.json()["detail"].lower()

        # Newly rotated token is valid
        me_resp2 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_token}"})
        assert me_resp2.status_code == 200

        # Logout revokes the active token
        logout_resp = await client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert logout_resp.status_code == 200
        assert logout_resp.json()["success"] is True

        # Verify logged-out token is immediately rejected by get_current_user
        logged_out_check = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_token}"})
        assert logged_out_check.status_code == 401
        assert "revoked" in logged_out_check.json()["detail"].lower()

        # Verify second logout attempt with revoked token is rejected
        second_logout = await client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert second_logout.status_code == 401

@pytest.mark.asyncio
async def test_negative_auth_unauthorized_access_fails():
    """
    Comprehensive negative auth testing:
    - Missing Authorization header on all protected routes fails with 401
    - Invalid bearer token formats fail with 401
    - Forged tokens and tokens signed with invalid secret fail with 401
    - Expired tokens fail with 401
    - Tokens with non-existent user IDs fail with 401
    - Invalid passwords and non-existent usernames fail with 401
    """
    import time
    from jose import jwt

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Protected routes without credentials fail with 401
        protected_routes = [
            ("GET", "/api/v1/auth/me"),
            ("GET", "/api/v1/users"),
            ("GET", "/api/v1/documents"),
            ("GET", "/api/v1/chat/conversations"),
            ("GET", "/api/v1/agents/runs"),
            ("GET", "/api/v1/deliverables"),
            ("POST", "/api/v1/auth/logout"),
            ("POST", "/api/v1/auth/refresh"),
        ]
        for method, route in protected_routes:
            if method == "GET":
                resp = await client.get(route)
            else:
                resp = await client.post(route)
            assert resp.status_code == 401, f"Route {method} {route} should fail unauthorized but got {resp.status_code}"
            assert "detail" in resp.json()

        # 2. Malformed Authorization headers fail with 401
        malformed_headers = [
            {"Authorization": "Bearer"},
            {"Authorization": "Bearer "},
            {"Authorization": "Basic dXNlcjpwYXNz"},
            {"Authorization": "Token invalid-token-value"},
            {"Authorization": "Bearer invalid.token.payload"},
            {"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.truncated"},
            {"Authorization": "Bearer null"},
            {"Authorization": "Bearer undefined"},
        ]
        for header in malformed_headers:
            resp = await client.get("/api/v1/auth/me", headers=header)
            assert resp.status_code == 401, f"Header {header} should be rejected with 401 but got {resp.status_code}"

        # 3. Forged token signed with wrong secret key fails with 401
        forged_token = jwt.encode(
            {"sub": "admin_usr_123", "email": "admin@sovereign.internal", "role": "Super Admin", "exp": int(time.time()) + 3600},
            "completely-wrong-forged-secret-key-1234567890",
            algorithm="HS256"
        )
        resp_forged = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged_token}"})
        assert resp_forged.status_code == 401

        # 4. Expired token fails with 401
        expired_token = jwt.encode(
            {"sub": "admin_usr_123", "email": "admin@sovereign.internal", "role": "Super Admin", "exp": int(time.time()) - 3600},
            settings.JWT_SECRET_KEY,
            algorithm="HS256"
        )
        resp_expired = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
        assert resp_expired.status_code == 401

        # 5. Token referencing non-existent user fails with 401
        nonexistent_token = jwt.encode(
            {"sub": "ghost-user-id-99999999", "email": "ghost@nonexistent.domain", "role": "Employee", "exp": int(time.time()) + 3600},
            settings.JWT_SECRET_KEY,
            algorithm="HS256"
        )
        resp_ghost = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {nonexistent_token}"})
        assert resp_ghost.status_code == 401

        # 6. Local login with incorrect credentials fails with 401
        resp_bad_pwd = await client.post(
            "/api/v1/auth/local-login",
            json={"username": "m.chen@sovereign.defense.internal", "password": "WrongPassword2026!"}
        )
        assert resp_bad_pwd.status_code == 401

        resp_bad_user = await client.post(
            "/api/v1/auth/local-login",
            json={"username": "nonexistent_operator@defense.internal", "password": "AnyPassword123!"}
        )
        assert resp_bad_user.status_code == 401
