import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from jose import jwt

from backend.app.core import auth as auth_module
from backend.app.core.config import settings
from backend.app.core.security import create_access_token
from backend.app.core.tenant import TenantContext, authorize_tenant_access, get_current_tenant


@pytest.mark.asyncio
async def test_google_token_rejects_missing_and_non_rs256_tokens():
    with pytest.raises(HTTPException, match="ID token required"):
        await auth_module.verify_google_id_token("")

    token = jwt.encode({"alg": "HS256"}, settings.JWT_SECRET_KEY, algorithm="HS256")
    with pytest.raises(HTTPException, match="Invalid token algorithm"):
        await auth_module.verify_google_id_token(token)


@pytest.mark.asyncio
async def test_google_jwks_fetches_and_caches_keys():
    response = MagicMock(status_code=200)
    response.json.return_value = {"keys": [{"kid": "key-1", "kty": "RSA"}]}
    client = MagicMock()
    client.get = AsyncMock(return_value=response)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)

    auth_module._GOOGLE_CERTS_CACHE = {"keys": {}, "cached_at": 0}
    with patch("backend.app.core.auth.httpx.AsyncClient", return_value=client):
        keys = await auth_module.get_google_jwks()
        cached = await auth_module.get_google_jwks()

    assert keys == {"key-1": {"kid": "key-1", "kty": "RSA"}}
    assert cached == keys
    client.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_google_jwks_failure_returns_existing_cache():
    auth_module._GOOGLE_CERTS_CACHE = {"keys": {"old": {"kid": "old"}}, "cached_at": 0}
    client = MagicMock()
    client.get = AsyncMock(side_effect=RuntimeError("network unavailable"))
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)

    with patch("backend.app.core.auth.httpx.AsyncClient", return_value=client):
        assert await auth_module.get_google_jwks() == {"old": {"kid": "old"}}


@pytest.mark.asyncio
async def test_current_user_rejects_missing_bad_subject_and_revoked_tokens():
    db = AsyncMock()
    with pytest.raises(HTTPException, match="Authentication token required"):
        await auth_module.get_current_user(None, db)

    with patch("backend.app.core.auth.decode_access_token", return_value=None):
        with pytest.raises(HTTPException, match="Invalid or expired"):
            await auth_module.get_current_user(SimpleNamespace(credentials="bad"), db)

    token = create_access_token("usr-test-subject", "subject@example.com", "Employee", [])
    with patch("backend.app.core.auth.decode_access_token", return_value={"email": "subject@example.com"}):
        with pytest.raises(HTTPException, match="subject payload missing"):
            await auth_module.get_current_user(SimpleNamespace(credentials=token), db)

    db.execute = AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: SimpleNamespace()))
    payload = {"sub": "usr-test", "email": "subject@example.com", "jti": "jti-1"}
    with patch("backend.app.core.auth.decode_access_token", return_value=payload):
        with pytest.raises(HTTPException, match="revoked"):
            await auth_module.get_current_user(SimpleNamespace(credentials=token), db)


@pytest.mark.asyncio
async def test_current_user_resolves_active_user_and_rejects_suspended_or_missing():
    token = create_access_token("usr-test", "active@example.com", "Employee", [])
    revoked_result = SimpleNamespace(scalar_one_or_none=lambda: None)

    active = SimpleNamespace(id="usr-test", email="active@example.com", status="ACTIVE", company_code="ACME")
    user_result = SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: active))
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[revoked_result, user_result])

    payload = {"sub": "usr-test", "email": "active@example.com", "jti": "jti-2"}
    with patch("backend.app.core.auth.decode_access_token", return_value=payload):
        resolved = await auth_module.get_current_user(SimpleNamespace(credentials=token), db)
    assert resolved is active
    assert get_current_tenant() == "ACME"

    suspended = SimpleNamespace(id="usr-suspended", email="suspended@example.com", status="SUSPENDED", company_code=None)
    db.execute = AsyncMock(side_effect=[revoked_result, SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: suspended))])
    payload["sub"] = suspended.id
    payload["email"] = suspended.email
    with patch("backend.app.core.auth.decode_access_token", return_value=payload):
        with pytest.raises(HTTPException) as exc_info:
            await auth_module.get_current_user(SimpleNamespace(credentials=token), db)
    assert exc_info.value.status_code == 403

    db.execute = AsyncMock(side_effect=[revoked_result, SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: None))])
    with patch("backend.app.core.auth.decode_access_token", return_value=payload):
        with pytest.raises(HTTPException, match="not found"):
            await auth_module.get_current_user(SimpleNamespace(credentials=token), db)


@pytest.mark.asyncio
async def test_current_user_database_failure_is_internal_error():
    token = create_access_token("usr-test", "active@example.com", "Employee", [])
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        SimpleNamespace(scalar_one_or_none=lambda: None),
        RuntimeError("database unavailable"),
    ])
    payload = {"sub": "usr-test", "email": "active@example.com", "jti": "jti-3"}
    with patch("backend.app.core.auth.decode_access_token", return_value=payload):
        with pytest.raises(HTTPException) as exc_info:
            await auth_module.get_current_user(SimpleNamespace(credentials=token), db)
    assert exc_info.value.status_code == 500


def test_tenant_authorization_global_and_related_owner_paths():
    resource = SimpleNamespace(company_code=None, owner=SimpleNamespace(company_code="ACME"))
    owner = SimpleNamespace(company_code="ACME", role="Analyst", email="owner@example.com")
    outsider = SimpleNamespace(company_code="OMEGA", role="Analyst", email="other@example.com")
    authorize_tenant_access(resource, owner)
    with pytest.raises(HTTPException) as exc_info:
        authorize_tenant_access(resource, outsider)
    assert exc_info.value.status_code == 404

    authorize_tenant_access(resource, SimpleNamespace(company_code=None, role="Employee"))
    authorize_tenant_access(resource, SimpleNamespace(company_code="OMEGA", role="Super Admin"))


def test_tenant_context_restores_previous_value():
    with TenantContext("OUTER"):
        assert get_current_tenant() == "OUTER"
        with TenantContext("INNER"):
            assert get_current_tenant() == "INNER"
        assert get_current_tenant() == "OUTER"
