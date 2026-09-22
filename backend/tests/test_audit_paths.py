from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from backend.app.api.v1 import audit


def result(values=None, count=0):
    scalars = MagicMock()
    scalars.all.return_value = values or []
    return SimpleNamespace(scalar=MagicMock(return_value=count), scalars=MagicMock(return_value=scalars))


def log_record():
    return SimpleNamespace(
        id=1, event_id="event-1", timestamp=datetime.now(timezone.utc), actor_id="user-1",
        actor_email="admin@example.com", ip_address="127.0.0.1", action="LOGIN", resource_type="auth",
        resource_id="user-1", status="SUCCESS", correlation_id="corr-1",
        details={"token": "secret", "nested": "x" * 501},
    )


def user():
    return SimpleNamespace(id="admin", company_code=None, role="Super Admin", email="admin@example.com")


def test_audit_sanitization_and_serializer():
    sanitized = audit.sanitize_audit_details({"password": "secret", "api_key": "key", "safe": "ok", "long": "x" * 501})
    assert sanitized["password"] == "[REDACTED_SECRET]"
    assert sanitized["api_key"] == "[REDACTED_SECRET]"
    assert sanitized["long"].endswith("[TRUNCATED_FOR_SECURITY]")
    assert audit.sanitize_audit_details(None) == {}
    assert audit.audit_to_out(log_record()).details["token"] == "[REDACTED_SECRET]"


@pytest.mark.asyncio
async def test_audit_listing_filters_and_invalid_dates():
    actor = user()
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[result(count=1), result(values=[log_record()])])
    listed = await audit.list_audit_logs(1, 25, "login", "LOGIN", "SUCCESS", "admin", "2026-01-01T00:00:00", "2026-12-31T00:00:00", actor, db)
    assert listed.total_records == 1
    assert listed.items[0].details["token"] == "[REDACTED_SECRET]"

    with pytest.raises(HTTPException) as bad_from:
        await audit.list_audit_logs(1, 25, None, None, None, None, "bad-date", None, actor, db)
    assert bad_from.value.status_code == 400
    with pytest.raises(HTTPException) as bad_to:
        await audit.list_audit_logs(1, 25, None, None, None, None, None, "bad-date", actor, db)
    assert bad_to.value.status_code == 400


@pytest.mark.asyncio
async def test_audit_exports_json_and_csv_with_redaction():
    actor = user()
    record = log_record()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result(values=[record]))
    json_response = await audit.export_audit_logs("json", "LOGIN", "SUCCESS", actor, db)
    assert json_response.media_type == "application/json"
    assert "REDACTED_SECRET" in json_response.body.decode()

    csv_response = await audit.export_audit_logs("csv", None, None, actor, db)
    body = csv_response.body.decode()
    assert csv_response.media_type == "text/csv"
    assert "Event ID" in body
    assert "REDACTED_SECRET" in body
