import math
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from backend.app.core.auth import get_current_user
from backend.app.core.config import settings
from backend.app.core.rbac import require_permission, record_audit_log
from backend.app.core.security import hash_password
from backend.app.core.rate_limit import check_auth_rate_limit
from backend.app.db.session import get_db
from backend.app.models.user import User, Role, UserRole, Permission, ROLE_PERMISSIONS
from backend.app.schemas.common import PaginatedResponse
from backend.app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserOut,
    UserRoleUpdate,
    UserStatusUpdate,
    RoleOut,
    PermissionOut
)

router = APIRouter(prefix="/users", tags=["User Management & Admin Console"])

def user_to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        department=user.department or "Engineering",
        avatar_url=user.avatar_url,
        role=user.role,
        status=user.status,
        permissions=user.permissions,
        last_login_at=user.last_login_at.isoformat() if user.last_login_at else None,
        created_at=user.created_at.isoformat() if hasattr(user.created_at, "isoformat") else str(user.created_at)
    )

from backend.app.core.tenant import authorize_tenant_access

def assert_user_company_access(target_user: User, current_user: User):
    """Guarantees strict tenant isolation across company codes via centralized authorization."""
    authorize_tenant_access(target_user, current_user)

@router.get("", response_model=PaginatedResponse[UserOut])
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: Optional[str] = None,
    role: Optional[str] = None,
    status_filter: Optional[str] = None,
    current_user: User = Depends(require_permission("users.read")),
    db: AsyncSession = Depends(get_db)
):
    """
    List operators and users with pagination, search, and role/status filtering, isolated by company code.
    """
    query = select(User)
    if getattr(current_user, "company_code", None):
        query = query.where(User.company_code == current_user.company_code)

    if q:
        search_pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                User.full_name.ilike(search_pattern),
                User.email.ilike(search_pattern),
                User.department.ilike(search_pattern)
            )
        )
    if status_filter:
        query = query.where(User.status == status_filter.upper())
    if role and role != "ALL":
        query = query.where(User.role == role)

    count_stmt = select(func.count()).select_from(query.subquery())
    total_records = (await db.execute(count_stmt)).scalar() or 0
    total_pages = math.ceil(total_records / page_size) if total_records > 0 else 1

    stmt = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    users = result.scalars().all()

    return PaginatedResponse[UserOut](
        items=[user_to_out(u) for u in users],
        page=page,
        page_size=page_size,
        total_records=total_records,
        total_pages=total_pages
    )

@router.get("/meta/roles", response_model=List[RoleOut])
async def list_roles(
    current_user: User = Depends(require_permission("users.read")),
    db: AsyncSession = Depends(get_db)
):
    """List sovereign RBAC roles with pre-configured permission matrices."""
    stmt = select(Role).order_by(Role.name)
    roles = (await db.execute(stmt)).scalars().all()
    out = []
    for r in roles:
        perms = ROLE_PERMISSIONS.get(r.name, [])
        out.append(RoleOut(
            id=r.id,
            name=r.name,
            description=r.description,
            is_system_role=r.is_system_role,
            permissions=perms
        ))
    return out

@router.get("/meta/permissions", response_model=List[PermissionOut])
async def list_permissions(
    current_user: User = Depends(require_permission("users.read")),
    db: AsyncSession = Depends(get_db)
):
    """List granular sovereign permission definitions."""
    stmt = select(Permission).order_by(Permission.module, Permission.code)
    perms = (await db.execute(stmt)).scalars().all()
    return [
        PermissionOut(
            id=p.id,
            code=p.code,
            module=p.module,
            description=p.description
        ) for p in perms
    ]

@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    request: Request,
    current_user: User = Depends(require_permission("users.create")),
    db: AsyncSession = Depends(get_db)
):
    """
    Manually provision a new user (Requires users.create permission).
    Enforces rate limiting to prevent automated account provisioning attacks.
    """
    await check_auth_rate_limit(request, identifier="create_user")
    stmt = select(User).where(User.email == payload.email)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email address already exists"
        )

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        department=payload.department or "Engineering",
        avatar_url=payload.avatar_url,
        role=payload.role,
        status=payload.status.upper(),
        password_hash=hash_password(payload.password or settings.INITIAL_ADMIN_PASSWORD or "")
    )
    db.add(user)
    await db.flush()

    # Assign role if exists
    stmt_role = select(Role).where(Role.name == payload.role)
    role_obj = (await db.execute(stmt_role)).scalar_one_or_none()
    if role_obj:
        db.add(UserRole(user_id=user.id, role_id=role_obj.id, assigned_by=current_user.id))

    await db.commit()
    await db.refresh(user)

    await record_audit_log(
        db,
        action="USER_CREATE",
        resource_type="user",
        actor=current_user,
        resource_id=user.id,
        details={"email": user.email, "role": payload.role, "department": user.department}
    )
    await db.commit()

    return user_to_out(user)

@router.get("/{user_id}", response_model=UserOut)
async def get_user_by_id(
    user_id: str,
    current_user: User = Depends(require_permission("users.read")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(User).where(User.id == user_id)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    assert_user_company_access(user, current_user)
    return user_to_out(user)

@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    current_user: User = Depends(require_permission("users.update")),
    db: AsyncSession = Depends(get_db)
):
    """Update user identity parameters (name, department, role)."""
    stmt = select(User).where(User.id == user_id)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    assert_user_company_access(user, current_user)

    old_role = user.role
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.department is not None:
        user.department = payload.department.strip()
    if payload.avatar_url is not None:
        user.avatar_url = payload.avatar_url.strip()

    if payload.role is not None and payload.role != old_role:
        user.role = payload.role
        # Update UserRole
        stmt_del = select(UserRole).where(UserRole.user_id == user.id)
        for ur in (await db.execute(stmt_del)).scalars().all():
            await db.delete(ur)
        stmt_role = select(Role).where(Role.name == payload.role)
        role_obj = (await db.execute(stmt_role)).scalar_one_or_none()
        if role_obj:
            db.add(UserRole(user_id=user.id, role_id=role_obj.id, assigned_by=current_user.id))

    await db.commit()
    await db.refresh(user)

    await record_audit_log(
        db,
        action="USER_UPDATE",
        resource_type="user",
        actor=current_user,
        resource_id=user.id,
        details={"email": user.email, "role": user.role, "department": user.department}
    )
    await db.commit()

    return user_to_out(user)

@router.patch("/{user_id}/status", response_model=UserOut)
async def update_user_status(
    user_id: str,
    payload: UserStatusUpdate,
    current_user: User = Depends(require_permission("users.disable")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(User).where(User.id == user_id)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    assert_user_company_access(user, current_user)

    old_status = user.status
    user.status = payload.status.upper()
    await db.commit()
    await db.refresh(user)

    await record_audit_log(
        db,
        action="USER_STATUS_CHANGE",
        resource_type="user",
        actor=current_user,
        resource_id=user.id,
        details={"old_status": old_status, "new_status": user.status}
    )
    await db.commit()

    return user_to_out(user)

@router.patch("/{user_id}/role", response_model=UserOut)
async def update_user_role(
    user_id: str,
    payload: UserRoleUpdate,
    current_user: User = Depends(require_permission("users.update")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(User).where(User.id == user_id)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    assert_user_company_access(user, current_user)

    stmt_del = select(UserRole).where(UserRole.user_id == user.id)
    for ur in (await db.execute(stmt_del)).scalars().all():
        await db.delete(ur)

    user.role = payload.role_name
    stmt_role = select(Role).where(Role.name == payload.role_name)
    role_obj = (await db.execute(stmt_role)).scalar_one_or_none()
    if role_obj:
        db.add(UserRole(user_id=user.id, role_id=role_obj.id, assigned_by=current_user.id))

    await db.commit()
    await db.refresh(user)

    await record_audit_log(
        db,
        action="USER_ROLE_ASSIGN",
        resource_type="user",
        actor=current_user,
        resource_id=user.id,
        details={"assigned_role": payload.role_name}
    )
    await db.commit()

    return user_to_out(user)
