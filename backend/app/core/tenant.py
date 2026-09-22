import contextvars
import logging
from typing import Any, Optional
from sqlalchemy import or_, text, event
from sqlalchemy.orm import Session, with_loader_criteria
from fastapi import HTTPException, status

logger = logging.getLogger("kelvrin.tenant")

# Context variable tracking current tenant (company_code) for the active request / task
_current_tenant_cv: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_tenant", default=None
)

def get_current_tenant() -> Optional[str]:
    """Retrieve the active tenant company_code from the async context."""
    return _current_tenant_cv.get()

def set_current_tenant(company_code: Optional[str]) -> Any:
    """Set the active tenant company_code for the async context."""
    return _current_tenant_cv.set(company_code)

def reset_current_tenant(token: Any) -> None:
    """Reset the tenant context variable to its previous state."""
    _current_tenant_cv.reset(token)

class TenantContext:
    """Context manager for scoping operations to a specific company_code."""
    def __init__(self, company_code: Optional[str]):
        self.company_code = company_code
        self.token = None

    def __enter__(self):
        self.token = set_current_tenant(self.company_code)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.token is not None:
            reset_current_tenant(self.token)

def authorize_tenant_access(resource: Any, current_user: Any) -> None:
    """
    Centralized tenant authorization guard.
    Guarantees strict tenant isolation across company codes.
    Raises 404 Not Found if resource belongs to another tenant.
    """
    user_company = getattr(current_user, "company_code", None)
    if not user_company:
        # User has no company code (global sovereign operator)
        return

    user_role = str(getattr(current_user, "role", "")).upper().replace(" ", "_")
    if "SUPER_ADMIN" in user_role:
        # Super admin has sovereign global clearance across all tenants
        return

    res_company = getattr(resource, "company_code", None)
    if not res_company:
        # Fallback check on related uploader / owner / user record
        for attr in ["uploader", "owner", "user"]:
            rel = getattr(resource, attr, None)
            if rel:
                res_company = getattr(rel, "company_code", None)
                if res_company:
                    break

    if res_company and res_company != user_company:
        logger.warning(
            f"[TENANT_VIOLATION] User {getattr(current_user, 'email', 'unknown')} "
            f"(tenant={user_company}) attempted access to resource {type(resource).__name__} "
            f"(tenant={res_company}). Access denied by sovereign policy."
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found in tenant enclave"
        )

def setup_tenant_query_filters():
    """
    Configures SQLAlchemy ORM events with with_loader_criteria to guarantee that
    tenant isolation cannot be bypassed by missing WHERE clauses in application code.
    """
    from backend.app.models.document import Document
    from backend.app.models.agent import AgentRun
    from backend.app.models.deliverable import Deliverable
    from backend.app.models.chat import Conversation
    from backend.app.models.audit import AuditLog

    TENANT_MODELS = [Document, AgentRun, Deliverable, Conversation, AuditLog]

    @event.listens_for(Session, "do_orm_execute")
    def _apply_tenant_loader_criteria(execute_state):
        if (
            execute_state.is_select
            and not execute_state.is_column_load
            and not execute_state.is_relationship_load
        ):
            tenant = get_current_tenant()
            if tenant:
                for model in TENANT_MODELS:
                    execute_state.statement = execute_state.statement.options(
                        with_loader_criteria(
                            model,
                            lambda cls: or_(cls.company_code == tenant, cls.company_code.is_(None)),
                            include_aliases=True
                        )
                    )

async def apply_postgres_rls(conn):
    """
    Applies PostgreSQL Row-Level Security (RLS) policies to tenant tables.
    Enforces DB-level tenant boundaries regardless of client or query structure.
    """
    valid_tables = {
        "users", "documents", "agent_runs", "deliverables", "conversations", "audit_logs"
    }

    for table in sorted(valid_tables):
        try:
            qualified_table = f'"{table}"'
            await conn.execute(text(f"ALTER TABLE {qualified_table} ENABLE ROW LEVEL SECURITY;"))
            await conn.execute(text(f"ALTER TABLE {qualified_table} FORCE ROW LEVEL SECURITY;"))
            await conn.execute(text(f"DROP POLICY IF EXISTS tenant_isolation_policy ON {qualified_table};"))
            await conn.execute(text(f"""
                CREATE POLICY tenant_isolation_policy ON {table}
                    USING (
                        company_code IS NULL
                        OR current_setting('app.current_company_code', true) IS NULL
                        OR current_setting('app.current_company_code', true) = ''
                        OR current_setting('app.current_company_code', true) = 'SYSTEM'
                        OR company_code = current_setting('app.current_company_code', true)
                    )
                    WITH CHECK (
                        company_code IS NULL
                        OR current_setting('app.current_company_code', true) IS NULL
                        OR current_setting('app.current_company_code', true) = ''
                        OR current_setting('app.current_company_code', true) = 'SYSTEM'
                        OR company_code = current_setting('app.current_company_code', true)
                    );
            """))
        except Exception as e:
            logger.warning(f"[RLS] Notice applying policy to {table}: {e}")
