from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.core.auth import get_current_user
from backend.app.core.rbac import require_permission, record_audit_log
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.models.tool_registry import ToolRegistry
from backend.app.schemas.tool import ToolOut, ToolToggleRequest

router = APIRouter(prefix="/tools", tags=["Tool & Connector Registry"])

def tool_to_out(t: ToolRegistry) -> ToolOut:
    return ToolOut(
        id=t.id,
        name=t.name,
        description=t.description,
        parameters_schema=t.parameters_schema or {},
        returns_schema=t.returns_schema or {},
        permission_required=t.permission_required or "agents.execute",
        is_enabled=t.is_enabled,
        requires_approval=t.requires_approval,
        timeout_seconds=t.timeout_seconds or 30,
        is_external=t.is_external
    )

@router.get("", response_model=List[ToolOut])
async def list_tools(
    current_user: User = Depends(require_permission("agents.execute")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ToolRegistry).order_by(ToolRegistry.id.asc())
    tools = (await db.execute(stmt)).scalars().all()
    return [tool_to_out(t) for t in tools]

@router.get("/{tool_id}", response_model=ToolOut)
async def get_tool(
    tool_id: str,
    current_user: User = Depends(require_permission("agents.execute")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ToolRegistry).where(ToolRegistry.id == tool_id)
    tool = (await db.execute(stmt)).scalar_one_or_none()
    if not tool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")
    return tool_to_out(tool)

@router.patch("/{tool_id}", response_model=ToolOut)
async def update_tool_status(
    tool_id: str,
    payload: ToolToggleRequest,
    current_user: User = Depends(require_permission("agents.manage")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ToolRegistry).where(ToolRegistry.id == tool_id)
    tool = (await db.execute(stmt)).scalar_one_or_none()
    if not tool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")

    if payload.is_enabled is not None:
        tool.is_enabled = payload.is_enabled
    if payload.requires_approval is not None:
        tool.requires_approval = payload.requires_approval
    if payload.timeout_seconds is not None:
        tool.timeout_seconds = payload.timeout_seconds

    await record_audit_log(
        db,
        action="TOOL_CONFIG_UPDATED",
        resource_type="tool",
        actor=current_user,
        resource_id=tool.id,
        details={
            "tool_id": tool.id,
            "is_enabled": tool.is_enabled,
            "requires_approval": tool.requires_approval
        }
    )
    await db.commit()
    await db.refresh(tool)
    return tool_to_out(tool)
