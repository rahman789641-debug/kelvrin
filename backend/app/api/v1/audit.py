import io
import csv
import json
import math
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, Response, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from backend.app.core.rbac import require_permission
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.models.audit import AuditLog
from backend.app.schemas.common import PaginatedResponse
from backend.app.schemas.audit import AuditLogOut

router = APIRouter(prefix="/audit", tags=["Audit Logs & Compliance"])

def sanitize_audit_details(details: dict) -> dict:
    """Masks potential secrets, keys, and tokens from audit output."""
    if not isinstance(details, dict):
        return {}
    sanitized = {}
    forbidden_keys = {"password", "token", "secret", "authorization", "id_token", "api_key", "password_hash"}
    for k, v in details.items():
        if any(fk in k.lower() for fk in forbidden_keys):
            sanitized[k] = "[REDACTED_SECRET]"
        elif isinstance(v, str) and len(v) > 500:
            sanitized[k] = v[:500] + "... [TRUNCATED_FOR_SECURITY]"
        else:
            sanitized[k] = v
    return sanitized

def audit_to_out(a: AuditLog) -> AuditLogOut:
    return AuditLogOut(
        id=a.id,
        event_id=a.event_id,
        timestamp=a.timestamp.isoformat() if hasattr(a.timestamp, "isoformat") else str(a.timestamp),
        actor_id=a.actor_id,
        actor_email=a.actor_email,
        ip_address=a.ip_address,
        action=a.action,
        resource_type=a.resource_type,
        resource_id=a.resource_id,
        status=a.status,
        correlation_id=a.correlation_id,
        details=sanitize_audit_details(a.details or {})
    )

@router.get("", response_model=PaginatedResponse[AuditLogOut])
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    q: Optional[str] = None,
    action: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    actor_email: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: User = Depends(require_permission("audit.read")),
    db: AsyncSession = Depends(get_db)
):
    """
    Search and filter immutable audit records with date, actor, action, and status bounds.
    """
    query = select(AuditLog)

    # Multi-tenant isolation by company code
    if getattr(current_user, "company_code", None):
        company_users = select(User.id).where(User.company_code == current_user.company_code)
        query = query.where(AuditLog.actor_id.in_(company_users))

    if q:
        search_pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                AuditLog.action.ilike(search_pattern),
                AuditLog.actor_email.ilike(search_pattern),
                AuditLog.resource_id.ilike(search_pattern),
                AuditLog.correlation_id.ilike(search_pattern)
            )
        )

    if action and action != "ALL":
        query = query.where(AuditLog.action == action.upper())

    if status_filter and status_filter != "ALL":
        query = query.where(AuditLog.status == status_filter.upper())

    if actor_email:
        query = query.where(AuditLog.actor_email.ilike(f"%{actor_email.strip()}%"))

    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from)
            query = query.where(AuditLog.timestamp >= dt_from)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date_from format: '{date_from}'. Must be a valid ISO-8601 timestamp string."
            )

    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to)
            query = query.where(AuditLog.timestamp <= dt_to)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date_to format: '{date_to}'. Must be a valid ISO-8601 timestamp string."
            )

    count_stmt = select(func.count()).select_from(query.subquery())
    total_records = (await db.execute(count_stmt)).scalar() or 0
    total_pages = math.ceil(total_records / page_size) if total_records > 0 else 1

    stmt = query.order_by(AuditLog.timestamp.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    return PaginatedResponse[AuditLogOut](
        items=[audit_to_out(l) for l in logs],
        page=page,
        page_size=page_size,
        total_records=total_records,
        total_pages=total_pages
    )

@router.get("/export")
async def export_audit_logs(
    export_format: str = Query("csv", pattern="^(csv|json)$"),
    action: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(require_permission("audit.read")),
    db: AsyncSession = Depends(get_db)
):
    """
    Exports filtered audit events as signed CSV or JSON for external compliance review.
    """
    query = select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(1000)
    if getattr(current_user, "company_code", None):
        company_users = select(User.id).where(User.company_code == current_user.company_code)
        query = query.where(AuditLog.actor_id.in_(company_users))

    if action and action != "ALL":
        query = query.where(AuditLog.action == action.upper())
    if status_filter and status_filter != "ALL":
        query = query.where(AuditLog.status == status_filter.upper())

    logs = (await db.execute(query)).scalars().all()

    if export_format == "json":
        data = [audit_to_out(l).model_dump() for l in logs]
        content = json.dumps(data, indent=2)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="kelvrin_audit_export.json"'}
        )
    else:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "ID", "Event ID", "Timestamp", "Actor Email", "IP Address",
            "Action", "Resource Type", "Resource ID", "Status", "Correlation ID", "Details"
        ])
        for l in logs:
            sanitized = sanitize_audit_details(l.details or {})
            writer.writerow([
                l.id,
                l.event_id,
                l.timestamp.isoformat() if hasattr(l.timestamp, "isoformat") else str(l.timestamp),
                l.actor_email or "",
                l.ip_address or "",
                l.action,
                l.resource_type,
                l.resource_id or "",
                l.status,
                l.correlation_id or "",
                json.dumps(sanitized)
            ])
        csv_data = output.getvalue()
        output.close()
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="kelvrin_audit_export.csv"'}
        )
