import json
import pytest
from sqlalchemy import select
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.audit import AuditLog
from backend.app.api.v1.audit import sanitize_audit_details, audit_to_out

import uuid

@pytest.mark.asyncio
async def test_audit_log_creation_with_correlation_id():
    """Verify audit log persists with correlation_id and standard metadata."""
    corr_id = f"corr-audit-test-{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        log = AuditLog(
            action="DOCUMENT_UPLOADED",
            actor_email="analyst@kelvrin.internal",
            resource_type="document",
            resource_id="doc_test_123",
            status="SUCCESS",
            correlation_id=corr_id,
            details={"filename": "test.pdf", "file_size": 1024}
        )
        db.add(log)
        await db.commit()
        await db.refresh(log)

        assert log.id is not None
        assert log.event_id is not None
        assert log.correlation_id == corr_id

        # Verify query
        stmt = select(AuditLog).where(AuditLog.correlation_id == corr_id)
        fetched = (await db.execute(stmt)).scalar_one_or_none()
        assert fetched is not None
        assert fetched.action == "DOCUMENT_UPLOADED"

@pytest.mark.asyncio
async def test_sensitive_data_masking_in_audit_logs():
    """Verify passwords, tokens, and secrets are redacted from audit details."""
    raw_details = {
        "user_email": "admin@kelvrin.internal",
        "password": "SuperSecretPassword123!",
        "id_token": "eyJhbGciOi...",
        "api_key": "sk-local-key-999",
        "safe_param": "valid_value",
        "long_field": "x" * 600
    }
    sanitized = sanitize_audit_details(raw_details)

    assert sanitized["user_email"] == "admin@kelvrin.internal"
    assert sanitized["password"] == "[REDACTED_SECRET]"
    assert sanitized["id_token"] == "[REDACTED_SECRET]"
    assert sanitized["api_key"] == "[REDACTED_SECRET]"
    assert sanitized["safe_param"] == "valid_value"
    assert sanitized["long_field"].endswith("... [TRUNCATED_FOR_SECURITY]")

@pytest.mark.asyncio
async def test_audit_event_types_coverage():
    """Verify system supports all required audit action codes."""
    required_actions = [
        "USER_LOGIN",
        "DOCUMENT_UPLOADED",
        "DOCUMENT_VIEWED",
        "DOCUMENT_DOWNLOADED",
        "AI_REQUEST",
        "MODEL_SELECTED",
        "AGENT_STARTED",
        "TOOL_EXECUTED",
        "FILE_GENERATED",
        "FILE_DOWNLOADED",
        "PERMISSION_DENIED",
        "CONNECTOR_CALLED"
    ]

    async with AsyncSessionLocal() as db:
        for act in required_actions:
            entry = AuditLog(
                action=act,
                actor_email="tester@kelvrin.internal",
                resource_type="system",
                resource_id="res_01",
                status="SUCCESS" if "DENIED" not in act else "DENIED",
                correlation_id="corr-coverage-test",
                details={"action_tested": act}
            )
            db.add(entry)
        await db.commit()

        # Query all actions with this correlation id
        stmt = select(AuditLog).where(AuditLog.correlation_id == "corr-coverage-test")
        logs = (await db.execute(stmt)).scalars().all()
        logged_actions = {l.action for l in logs}

        for act in required_actions:
            assert act in logged_actions

@pytest.mark.asyncio
async def test_audit_query_invalid_date_returns_400():
    """Verify malformed date parameters return structured 400 error responses instead of silent swallowing."""
    from httpx import ASGITransport, AsyncClient
    from backend.app.main import app
    from backend.app.models.user import User
    from backend.app.core.security import create_access_token, hash_password

    u_id = f"usr_auditor_{uuid.uuid4().hex[:8]}"
    u_email = f"auditor_{uuid.uuid4().hex[:6]}@kelvrin.internal"
    async with AsyncSessionLocal() as db:
        auditor = User(
            id=u_id,
            email=u_email,
            full_name="Auditor Test",
            role="Auditor",
            status="ACTIVE",
            password_hash=hash_password("AuditPass2026!")
        )
        db.add(auditor)
        await db.commit()

    token = create_access_token(
        subject=u_id,
        email=u_email,
        role="Auditor",
        permissions=["audit:read"]
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(
            "/api/v1/audit?date_from=invalid-date-string",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 400
        data = resp.json()
        assert "Invalid date_from format" in data["detail"]
        assert "ISO-8601" in data["detail"]

