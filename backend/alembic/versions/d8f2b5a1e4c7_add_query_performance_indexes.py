"""add_query_performance_indexes

Revision ID: d8f2b5a1e4c7
Revises: c7e1f4a9b2d3
Create Date: 2026-09-21 14:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8f2b5a1e4c7'
down_revision: Union[str, Sequence[str], None] = 'c7e1f4a9b2d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create composite and query performance indexes for tenant and user lookups."""
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1. Ensure company_code exists on tenant tables
    for table_name in ['documents', 'agent_runs', 'deliverables', 'conversations', 'audit_logs']:
        cols = {c['name'] for c in insp.get_columns(table_name)}
        if 'company_code' not in cols:
            with op.batch_alter_table(table_name, schema=None) as batch_op:
                batch_op.add_column(sa.Column('company_code', sa.String(length=50), nullable=True))

    # Helper for idempotent index creation
    def create_index_if_missing(table_name: str, index_name: str, columns: list):
        current_indexes = {ix['name'] for ix in insp.get_indexes(table_name)}
        if index_name not in current_indexes:
            with op.batch_alter_table(table_name, schema=None) as batch_op:
                batch_op.create_index(index_name, columns, unique=False)

    # 2. documents indexes
    create_index_if_missing('documents', 'ix_documents_uploaded_by_created_at', ['uploaded_by', 'created_at'])
    create_index_if_missing('documents', 'ix_documents_company_code_status', ['company_code', 'status'])

    # 3. agent_runs indexes
    create_index_if_missing('agent_runs', 'ix_agent_runs_company_code_status', ['company_code', 'status'])
    create_index_if_missing('agent_runs', 'ix_agent_runs_user_id_started_at', ['user_id', 'started_at'])

    # 4. deliverables indexes
    create_index_if_missing('deliverables', 'ix_deliverables_owner_id_company_code', ['owner_id', 'company_code'])

    # 5. conversations indexes
    create_index_if_missing('conversations', 'ix_conversations_user_id_company_code', ['user_id', 'company_code'])

    # 6. audit_logs indexes
    create_index_if_missing('audit_logs', 'ix_audit_logs_actor_id_timestamp', ['actor_id', 'timestamp'])
    create_index_if_missing('audit_logs', 'ix_audit_logs_company_code_timestamp', ['company_code', 'timestamp'])


def downgrade() -> None:
    """Drop query performance indexes."""
    bind = op.get_bind()
    insp = sa.inspect(bind)

    def drop_index_if_exists(table_name: str, index_name: str):
        current_indexes = {ix['name'] for ix in insp.get_indexes(table_name)}
        if index_name in current_indexes:
            with op.batch_alter_table(table_name, schema=None) as batch_op:
                batch_op.drop_index(index_name)

    drop_index_if_exists('audit_logs', 'ix_audit_logs_company_code_timestamp')
    drop_index_if_exists('audit_logs', 'ix_audit_logs_actor_id_timestamp')
    drop_index_if_exists('conversations', 'ix_conversations_user_id_company_code')
    drop_index_if_exists('deliverables', 'ix_deliverables_owner_id_company_code')
    drop_index_if_exists('agent_runs', 'ix_agent_runs_user_id_started_at')
    drop_index_if_exists('agent_runs', 'ix_agent_runs_company_code_status')
    drop_index_if_exists('documents', 'ix_documents_company_code_status')
    drop_index_if_exists('documents', 'ix_documents_uploaded_by_created_at')
