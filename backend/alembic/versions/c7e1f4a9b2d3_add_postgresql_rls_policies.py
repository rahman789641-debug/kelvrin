"""add_postgresql_rls_policies

Revision ID: c7e1f4a9b2d3
Revises: acb214682119
Create Date: 2026-09-21 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7e1f4a9b2d3'
down_revision: Union[str, Sequence[str], None] = 'acb214682119'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TENANT_TABLES = [
    "users",
    "documents",
    "agent_runs",
    "deliverables",
    "conversations",
    "audit_logs",
]


def upgrade() -> None:
    """Enable PostgreSQL Row-Level Security (RLS) and create tenant isolation policies."""
    bind = op.get_bind()
    dialect_name = bind.dialect.name

    # RLS policies are PostgreSQL-native DDL statements
    if dialect_name == "postgresql":
        for table in TENANT_TABLES:
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
            op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")
            op.execute(f"DROP POLICY IF EXISTS tenant_isolation_policy ON {table};")
            op.execute(f"""
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
            """)


def downgrade() -> None:
    """Drop tenant isolation policies and disable Row-Level Security."""
    bind = op.get_bind()
    dialect_name = bind.dialect.name

    if dialect_name == "postgresql":
        for table in reversed(TENANT_TABLES):
            op.execute(f"DROP POLICY IF EXISTS tenant_isolation_policy ON {table};")
            op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY;")
            op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")
