from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.core.auth import get_current_user
from backend.app.core.rbac import require_permission, record_audit_log
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.models.connector import Connector, ConnectorConfig, ConnectorHealth
from backend.app.schemas.connector import (
    ConnectorOut,
    ConnectorToggleRequest,
    ConnectorExecuteRequest,
    MockErpInspectionResponse
)
from backend.app.services.connectors.rest_connector import (
    rest_connector_service,
    ConnectorSecurityException
)

router = APIRouter(prefix="/connectors", tags=["Sovereign Enterprise Connectors"])

# Local Mock Enterprise ERP API
@router.get("/mock-erp/inspections/{equipment_id}", response_model=MockErpInspectionResponse)
async def mock_erp_get_inspection(equipment_id: str):
    """
    Mock local on-premises ERP API returning equipment registry metadata.
    Used for safe end-to-end integration without external network egress.
    """
    clean_id = equipment_id.strip().upper()
    return MockErpInspectionResponse(
        equipment_id=clean_id,
        facility="Sovereign Industrial Enclave Alpha",
        asset_tag="Primary High-Pressure Degasser Vessel",
        last_certified_date="2025-11-12",
        inspection_tier="Class 1 Statutory",
        status="OPERATIONAL",
        sensor_calibration="VERIFIED (Expires 2026-11-01)"
    )

@router.get("", response_model=List[ConnectorOut])
async def list_connectors(
    user: User = Depends(require_permission("security.read")),
    db: AsyncSession = Depends(get_db)
):
    """Lists all registered enterprise connectors and their current security state."""
    stmt = select(Connector)
    connectors = (await db.execute(stmt)).scalars().all()
    return connectors

@router.get("/{connector_id}", response_model=ConnectorOut)
async def get_connector(
    connector_id: str,
    user: User = Depends(require_permission("security.read")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Connector).where(Connector.id == connector_id)
    c = (await db.execute(stmt)).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found.")
    return c

@router.put("/{connector_id}/toggle", response_model=ConnectorOut)
async def toggle_connector(
    connector_id: str,
    payload: ConnectorToggleRequest,
    user: User = Depends(require_permission("security:manage")),
    db: AsyncSession = Depends(get_db)
):
    """Enables or disables an enterprise connector."""
    stmt = select(Connector).where(Connector.id == connector_id)
    c = (await db.execute(stmt)).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found.")

    c.is_enabled = payload.is_enabled
    if c.health:
        c.health.status = "ONLINE" if c.is_enabled else "OFFLINE"
        c.health.last_checked_at = datetime.now(timezone.utc)

    await record_audit_log(
        db, action="CONNECTOR_TOGGLE", resource_type="SECURITY", actor=user,
        details={"connector_id": c.id, "name": c.name, "is_enabled": c.is_enabled}
    )
    await db.commit()
    await db.refresh(c)
    return c

@router.post("/{connector_id}/execute")
async def execute_connector(
    connector_id: str,
    payload: ConnectorExecuteRequest,
    user: User = Depends(require_permission("security:manage")),
    db: AsyncSession = Depends(get_db)
):
    """Dispatches a test call through the connector with strict allowlist and SSRF verification."""
    try:
        res = await rest_connector_service.execute_rest_call(
            connector_id=connector_id,
            method=payload.method,
            endpoint=payload.endpoint,
            payload=payload.payload,
            db=db
        )
        return res
    except ConnectorSecurityException as cse:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(cse))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
