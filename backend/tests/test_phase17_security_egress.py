import pytest
from sqlalchemy import select
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.user import User
from backend.app.models.audit import AuditLog
from backend.app.services.security.egress_monitor import egress_monitor_service
from backend.app.core.config import settings

@pytest.mark.asyncio
async def test_security_dashboard_egress_zero_enforcement():
    """Verify confidential document egress and external AI calls are strictly 0."""
    async with AsyncSessionLocal() as db:
        dash = await egress_monitor_service.get_security_dashboard(db)

        # Check egress metrics
        egress = dash["egress_metrics"]
        assert egress["confidential_data_egress_bytes"] == 0
        assert egress["external_ai_calls"] == 0
        assert egress["blocked_connections"] >= 0
        assert egress["local_ai_requests"] >= 0
        assert egress["auth_events"] >= 0

        # Check boundary status
        boundary = dash["boundary_status"]
        assert boundary["zero_cloud_leakage"] is True
        assert boundary["sandbox_network_isolated"] is True
        assert boundary["dns_leak_protection"] is True

@pytest.mark.asyncio
async def test_security_dashboard_auth_mode_dependency_notice():
    """Verify AUTH_MODE is properly distinguished between local air-gap and firebase."""
    async with AsyncSessionLocal() as db:
        # 1. Test local air-gap mode
        settings.AUTH_MODE = "local"
        dash_local = await egress_monitor_service.get_security_dashboard(db)
        auth_local = dash_local["auth_architecture"]

        assert auth_local["auth_mode"] == "local"
        assert auth_local["is_air_gapped"] is True
        assert "TRUE AIR-GAPPED ENCLAVE" in auth_local["dependency_notice"]
        assert "Zero external network identity communication" in auth_local["dependency_notice"]

        # 2. Test firebase mode
        settings.AUTH_MODE = "firebase"
        dash_fb = await egress_monitor_service.get_security_dashboard(db)
        auth_fb = dash_fb["auth_architecture"]

        assert auth_fb["auth_mode"] == "firebase"
        assert auth_fb["is_air_gapped"] is False
        assert "EXTERNAL IDENTITY DEPENDENCY" in auth_fb["dependency_notice"]

        # Restore default
        settings.AUTH_MODE = "local"

@pytest.mark.asyncio
async def test_airgap_integrity_audit_and_logging():
    """Verify on-demand air-gap audit runs and emits immutable audit event."""
    async with AsyncSessionLocal() as db:
        res = await egress_monitor_service.run_airgap_integrity_audit(
            db=db,
            actor_email="superadmin@kelvrin.internal"
        )

        assert res["status"] == "PASS"
        assert res["external_egress_bytes"] == 0
        assert res["air_gap_integrity"] == "100% ISOLATED"
        assert res["audit_id"] is not None

        # Verify in audit_logs table
        stmt = select(AuditLog).where(AuditLog.event_id == res["audit_id"])
        log_entry = (await db.execute(stmt)).scalar_one_or_none()
        assert log_entry is not None
        assert log_entry.action == "AIR_GAP_INTEGRITY_AUDIT"
        assert log_entry.status == "SUCCESS"
