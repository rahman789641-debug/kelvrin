from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_user
from backend.app.core.rbac import require_permission
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.services.security.egress_monitor import egress_monitor_service

router = APIRouter(prefix="/security", tags=["Security & Egress Control"])

@router.get("/dashboard")
async def get_security_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("security.read"))
):
    """
    Returns live sovereign security telemetry: confidential data egress, external AI calls,
    blocked connections, auth mode architecture, and recent security events.
    """
    return await egress_monitor_service.get_security_dashboard(db)

@router.post("/airgap-test")
async def run_airgap_integrity_test(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("security.read"))
):
    """
    Runs on-demand air-gap integrity verification and writes an immutable audit record.
    """
    return await egress_monitor_service.run_airgap_integrity_audit(
        db=db,
        actor_email=current_user.email
    )

@router.get("/status")
async def get_legacy_security_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("security.read"))
):
    """Legacy compatibility endpoint."""
    dash = await egress_monitor_service.get_security_dashboard(db)
    return {
        "timestamp": dash["timestamp"],
        "sovereign_mode": dash["auth_architecture"]["auth_mode"],
        "egress_guard": {
            "status": "BLOCKED",
            "outbound_llm_calls_prevented": dash["egress_metrics"]["blocked_connections"],
            "airgap_integrity_verified": dash["boundary_status"]["air_gap_verified"]
        },
        "sandbox_runtime": {
            "engine": "isolated_micro_process",
            "network_isolation": "--network none",
            "root_filesystem": "READ_ONLY",
            "timeout_seconds": 5
        },
        "active_enclave_sessions": 1
    }
