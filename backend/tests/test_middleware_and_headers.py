import pytest
from httpx import ASGITransport, AsyncClient
from backend.app.main import app

@pytest.mark.asyncio
async def test_security_headers_present_on_all_responses():
    """Verify CSP, HSTS, X-Frame-Options, X-Content-Type-Options are present on responses."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200

        # Assert all critical enterprise security headers
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("X-Frame-Options") == "DENY"
        assert resp.headers.get("X-XSS-Protection") == "1; mode=block"
        assert "max-age=31536000" in resp.headers.get("Strict-Transport-Security", "")
        assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "default-src 'self'" in resp.headers.get("Content-Security-Policy", "")
        assert "accelerometer=()" in resp.headers.get("Permissions-Policy", "")

@pytest.mark.asyncio
async def test_correlation_id_injected_and_propagated():
    """Verify X-Correlation-ID is returned and propagated when provided."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Auto-generated correlation ID
        resp1 = await client.get("/health")
        assert "X-Correlation-ID" in resp1.headers
        corr_id = resp1.headers["X-Correlation-ID"]
        assert len(corr_id) > 10

        # Pass custom correlation ID
        custom_id = "test-corr-trace-99999"
        resp2 = await client.get("/health", headers={"X-Correlation-ID": custom_id})
        assert resp2.headers.get("X-Correlation-ID") == custom_id

@pytest.mark.asyncio
async def test_health_and_readiness_probes():
    """Verify root and /api/v1 health and readiness probes."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r_health = await client.get("/health")
        assert r_health.status_code == 200
        assert r_health.json()["status"] == "healthy"

        r_ready = await client.get("/ready")
        assert r_ready.status_code == 200
        data = r_ready.json()
        assert "dependencies" in data
        assert data["dependencies"]["database"]["status"] == "connected"
