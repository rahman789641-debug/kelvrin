import pytest
from sqlalchemy import select
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.connector import Connector, ConnectorConfig, ConnectorHealth
from backend.app.services.connectors.rest_connector import (
    rest_connector_service,
    ConnectorSecurityException
)
from backend.app.db.init_db import init_db

@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    import asyncio
    asyncio.run(init_db())

@pytest.mark.asyncio
async def test_connector_disabled_by_default():
    """Verify connectors cannot be executed when disabled."""
    async with AsyncSessionLocal() as db:
        stmt = select(Connector).where(Connector.name == "Sovereign Mock ERP Connector")
        conn = (await db.execute(stmt)).scalar_one_or_none()
        assert conn is not None
        assert conn.is_enabled is False  # Must be disabled by default

        with pytest.raises(ConnectorSecurityException) as exc_info:
            await rest_connector_service.execute_rest_call(
                connector_id=conn.id,
                method="GET",
                endpoint="/inspections/PS-26117",
                db=db
            )
        assert "DISABLED" in str(exc_info.value)

@pytest.mark.asyncio
async def test_connector_allowlist_enforcement():
    """Verify endpoint allowlist blocks unapproved endpoints even when connector is enabled."""
    async with AsyncSessionLocal() as db:
        stmt = select(Connector).where(Connector.name == "Sovereign Mock ERP Connector")
        conn = (await db.execute(stmt)).scalar_one_or_none()
        assert conn is not None

        # Temporarily enable
        conn.is_enabled = True
        await db.commit()

        try:
            # 1. Block unlisted endpoint
            with pytest.raises(ConnectorSecurityException) as exc_info:
                await rest_connector_service.execute_rest_call(
                    connector_id=conn.id,
                    method="GET",
                    endpoint="/unauthorized/admin/dump",
                    db=db
                )
            assert "not in the connector allowlist" in str(exc_info.value)

            # 2. Match allowed pattern check
            patterns = conn.config.allowed_endpoints
            assert rest_connector_service.is_endpoint_allowed("/inspections/PS-26117", patterns) is True
            assert rest_connector_service.is_endpoint_allowed("/secret/keys", patterns) is False

        finally:
            # Revert to disabled for security
            conn.is_enabled = False
            await db.commit()

def test_connector_ssrf_blocking():
    """Verify private/internal IPs, cloud metadata endpoints, and non-http schemes are strictly blocked."""
    # 1. Private and loopback IPs are blocked
    assert rest_connector_service.is_url_safe("http://127.0.0.1:8000") is False
    assert rest_connector_service.is_url_safe("http://localhost:8000") is False
    assert rest_connector_service.is_url_safe("http://10.0.0.1/api") is False
    assert rest_connector_service.is_url_safe("http://192.168.1.50") is False
    assert rest_connector_service.is_url_safe("http://172.16.0.1") is False
    assert rest_connector_service.is_url_safe("http://172.31.255.254") is False
    assert rest_connector_service.is_url_safe("http://169.254.169.254/latest/meta-data") is False
    assert rest_connector_service.is_url_safe("http://metadata.google.internal") is False
    assert rest_connector_service.is_url_safe("http://[::1]/") is False

    # 2. Scheme enforcement (only http/https)
    assert rest_connector_service.is_url_safe("file:///etc/passwd") is False
    assert rest_connector_service.is_url_safe("ftp://ftp.example.com") is False
    assert rest_connector_service.is_url_safe("gopher://127.0.0.1") is False

    # 3. Approved external/public host is allowed
    assert rest_connector_service.is_url_safe("https://api.github.com/repos") is True
    assert rest_connector_service.is_url_safe("https://api.erp.sovereign-mesh.net/api/v1/connectors/mock-erp") is True

    # 4. Direct validate_url raises ConnectorSecurityException on violations
    with pytest.raises(ConnectorSecurityException):
        rest_connector_service.validate_url("http://127.0.0.1:8000")

    with pytest.raises(ConnectorSecurityException):
        rest_connector_service.validate_url("http://169.254.169.254/latest/meta-data")

    with pytest.raises(ConnectorSecurityException):
        rest_connector_service.validate_url("http://10.0.0.1")

    with pytest.raises(ConnectorSecurityException):
        rest_connector_service.validate_url("file:///etc/passwd")

