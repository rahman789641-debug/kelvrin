import logging
from typing import Any, Callable, List, Optional
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.auth import get_current_user
from backend.app.models.audit import AuditLog
from backend.app.db.session import get_db

logger = logging.getLogger("kelvrin.rbac")

from backend.app.models.user import normalize_role_name

def _build_permission_aliases(code: str) -> set:
    """Build all normalized and legacy equivalent forms for a permission code."""
    aliases = {code}
    dot_form = code.replace(":", ".")
    colon_form = code.replace(".", ":")
    aliases.add(dot_form)
    aliases.add(colon_form)

    # Module wildcard e.g. "users.*", "users:*"
    if "." in dot_form:
        module = dot_form.split(".")[0]
        aliases.add(f"{module}.*")
        aliases.add(f"{module}:*")

    # Specific semantic aliases
    if dot_form in ["ai.chat", "chat.use"]:
        aliases.update(["ai.chat", "chat:use", "ai.*", "chat.*"])
    elif dot_form in ["ai.execute", "code.execute"]:
        aliases.update(["ai.execute", "code:execute", "ai.*", "code.*"])
    elif dot_form in ["agents.execute", "agents.run"]:
        aliases.update(["agents.execute", "agents:run", "agents.manage", "agents:manage", "agents.*"])
    elif dot_form in ["agents.manage"]:
        aliases.update(["agents.manage", "agents:manage", "agents.*"])
    elif dot_form in ["users.read"]:
        aliases.update(["users.read", "users:read", "users.manage", "users:manage", "users.*"])
    elif dot_form in ["users.create", "users.update", "users.disable"]:
        aliases.update([dot_form, colon_form, "users.manage", "users:manage", "users.*"])
    elif dot_form in ["models.manage"]:
        aliases.update(["models.manage", "models:manage", "models.*"])
    elif dot_form in ["workflow.manage", "workflows.manage"]:
        aliases.update(["workflow.manage", "workflows.manage", "workflows:manage", "workflows:approve"])
    elif dot_form in ["workflow.execute", "workflows.execute"]:
        aliases.update(["workflow.execute", "workflows.execute", "workflows:approve", "workflows:manage", "agents:run"])
    elif dot_form in ["workflow.create", "workflows.create"]:
        aliases.update(["workflow.create", "workflows.create", "workflows:manage"])
    elif dot_form in ["documents.upload", "documents.delete", "documents.write"]:
        aliases.update(["documents.write", "documents:write", "documents.*", "documents:*"])

    return aliases

def require_permission(permission_code: str) -> Callable:
    """
    FastAPI dependency factory enforcing granular RBAC permission codes.
    Returns 403 Forbidden if user lacks required permission.
    """
    aliases = _build_permission_aliases(permission_code)

    async def permission_checker(
        current_user: Any = Depends(get_current_user)
    ) -> Any:
        # Super admin always has clearance
        user_role = getattr(current_user, "role", "")
        if normalize_role_name(user_role) == "SUPER_ADMIN":
            return current_user

        user_perms = set(getattr(current_user, "permissions", []))

        # Check for wildcard or explicit match
        if "*" in user_perms or any(alias in user_perms for alias in aliases):
            return current_user

        logger.warning(
            f"[RBAC_DENIED] User {getattr(current_user, 'email', 'unknown')} (Role: {user_role}) denied access for permission '{permission_code}'."
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Missing mandatory clearance for '{permission_code}'"
        )

    return permission_checker

def require_role(allowed_roles: List[str]) -> Callable:
    """
    FastAPI dependency factory enforcing role requirements.
    """
    normalized_allowed = {normalize_role_name(r) for r in allowed_roles}
    normalized_allowed.add("SUPER_ADMIN")

    async def role_checker(
        current_user: Any = Depends(get_current_user)
    ) -> Any:
        user_role = normalize_role_name(getattr(current_user, "role", ""))
        if user_role in normalized_allowed:
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Role '{getattr(current_user, 'role', '')}' not authorized"
        )

    return role_checker

async def record_audit_log(
    db: AsyncSession,
    action: str,
    resource_type: str,
    actor: Optional[Any] = None,
    resource_id: Optional[str] = None,
    status: str = "SUCCESS",
    details: Optional[dict] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """
    Utility to record an immutable audit entry in the database.
    """
    from backend.app.core.tenant import get_current_tenant
    company_code = getattr(actor, "company_code", None) or get_current_tenant()
    log_entry = AuditLog(
        actor_id=getattr(actor, "id", None),
        actor_email=getattr(actor, "email", "anonymous"),
        ip_address=ip_address,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        status=status,
        company_code=company_code,
        details=details or {}
    )
    db.add(log_entry)
    await db.flush()
    return log_entry
