import logging
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.db.base import Base
from backend.app.db.session import async_engine, AsyncSessionLocal
from backend.app.core.config import settings
from backend.app.db.seed_data import (
    seed_database,
    DEFAULT_ROLES,
    DEFAULT_PERMISSIONS,
    DEFAULT_ROLE_PERMS,
    DEFAULT_USERS,
    DEFAULT_MODELS,
    DEFAULT_TOOLS,
    DEFAULT_TEMPLATES
)

logger = logging.getLogger("kelvrin.init_db")

__all__ = [
    "init_db",
    "apply_alembic_migrations",
    "DEFAULT_ROLES",
    "DEFAULT_PERMISSIONS",
    "DEFAULT_ROLE_PERMS",
    "DEFAULT_USERS",
    "DEFAULT_MODELS",
    "DEFAULT_TOOLS",
    "DEFAULT_TEMPLATES"
]

def apply_alembic_migrations() -> None:
    """
    Executes Alembic migrations up to head programmatically.
    Guarantees database schema is strictly provisioned through Alembic versions,
    completely eliminating unversioned create_all() calls from production startup.
    """
    from pathlib import Path
    from alembic.config import Config
    from alembic import command

    base_dirs = [
        Path(__file__).resolve().parents[2],
        Path(__file__).resolve().parents[3],
    ]
    alembic_ini = None
    for d in base_dirs:
        candidate = d / "alembic.ini"
        if candidate.exists():
            alembic_ini = candidate
            break

    if alembic_ini:
        try:
            alembic_cfg = Config(str(alembic_ini))
            raw_url = str(async_engine.url)
            sync_url = raw_url.replace("+aiosqlite", "").replace("+asyncpg", "")
            alembic_cfg.set_main_option("sqlalchemy.url", sync_url)
            logger.info("[KELVRIN_MIGRATIONS] Applying Alembic migrations up to head...")
            command.upgrade(alembic_cfg, "head")
            logger.info("[KELVRIN_MIGRATIONS] Alembic migrations successfully applied to head.")
        except Exception as err:
            logger.error(f"[KELVRIN_MIGRATIONS] Alembic migration execution failed: {err}")
            raise
    else:
        logger.warning("[KELVRIN_MIGRATIONS] alembic.ini not found. Ensure migrations are managed via Alembic CLI.")

async def init_db() -> None:
    """
    Provisions database schema and seeds initial administrative and reference records.
    In production and staging, schema is provisioned strictly via Alembic migrations.
    create_all() is completely removed from production startup.
    Seed data is modularly delegated to backend.app.db.seed_data.
    """
    if settings.ENVIRONMENT.lower() in ["production", "staging"]:
        logger.info(
            f"[KELVRIN] {settings.ENVIRONMENT} mode: strictly using Alembic migrations. "
            "create_all() is completely removed from production startup."
        )
        apply_alembic_migrations()
        if "postgresql" in str(async_engine.url):
            from backend.app.core.tenant import apply_postgres_rls
            async with async_engine.begin() as conn:
                await apply_postgres_rls(conn)
    elif settings.ENVIRONMENT.lower() == "testing":
        logger.info(
            "[KELVRIN] testing mode: schema provisioned via test suite Alembic runner. "
            "create_all() is skipped."
        )
        if "postgresql" in str(async_engine.url):
            from backend.app.core.tenant import apply_postgres_rls
            async with async_engine.begin() as conn:
                await apply_postgres_rls(conn)
    else:
        # Development mode: apply Alembic migrations
        apply_alembic_migrations()
        async with async_engine.begin() as conn:
            if "sqlite" in str(async_engine.url):
                def _ensure_sqlite_cols(sync_conn):
                    res_u = sync_conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()
                    existing_u_cols = {r[1] for r in res_u}
                    if "company_code" not in existing_u_cols:
                        sync_conn.exec_driver_sql("ALTER TABLE users ADD COLUMN company_code VARCHAR(50)")

                res = sync_conn.exec_driver_sql("PRAGMA table_info(documents)").fetchall()
                existing_cols = {r[1] for r in res}
                for col_name in ["storage_name", "content_preview", "processing_error", "visual_summary", "asset_category"]:
                    if col_name not in existing_cols:
                        sync_conn.exec_driver_sql(f"ALTER TABLE documents ADD COLUMN {col_name} TEXT")
                if "vision_applied" not in existing_cols:
                    sync_conn.exec_driver_sql("ALTER TABLE documents ADD COLUMN vision_applied BOOLEAN DEFAULT 0")

                res_m = sync_conn.exec_driver_sql("PRAGMA table_info(model_registry)").fetchall()
                existing_m_cols = {r[1] for r in res_m}
                for c_name, c_type in [
                    ("capabilities", "TEXT DEFAULT '[]'"),
                    ("health_status", "TEXT DEFAULT 'HEALTHY'"),
                    ("last_health_check", "DATETIME"),
                    ("latency_ms", "REAL DEFAULT 25.0"),
                    ("error_message", "TEXT"),
                    ("is_default", "BOOLEAN DEFAULT 0")
                ]:
                    if c_name not in existing_m_cols:
                        sync_conn.exec_driver_sql(f"ALTER TABLE model_registry ADD COLUMN {c_name} {c_type}")

                res_conv = sync_conn.exec_driver_sql("PRAGMA table_info(conversations)").fetchall()
                existing_conv_cols = {r[1] for r in res_conv}
                if "document_id" not in existing_conv_cols:
                    sync_conn.exec_driver_sql("ALTER TABLE conversations ADD COLUMN document_id TEXT")

                res_msg = sync_conn.exec_driver_sql("PRAGMA table_info(messages)").fetchall()
                existing_msg_cols = {r[1] for r in res_msg}
                for c_name, c_type in [
                    ("detected_intent", "TEXT"),
                    ("routing_reasoning", "TEXT"),
                    ("required_capabilities", "TEXT DEFAULT '[]'"),
                    ("attachment_name", "TEXT")
                ]:
                    if c_name not in existing_msg_cols:
                        sync_conn.exec_driver_sql(f"ALTER TABLE messages ADD COLUMN {c_name} {c_type}")

                res_runs = sync_conn.exec_driver_sql("PRAGMA table_info(agent_runs)").fetchall()
                existing_run_cols = {r[1] for r in res_runs}
                for c_name, c_type in [
                    ("agent_id", "TEXT"),
                    ("plan", "TEXT DEFAULT '[]'"),
                    ("current_step", "INTEGER DEFAULT 0"),
                    ("max_steps", "INTEGER DEFAULT 10"),
                    ("error_detail", "TEXT")
                ]:
                    if c_name not in existing_run_cols:
                        sync_conn.exec_driver_sql(f"ALTER TABLE agent_runs ADD COLUMN {c_name} {c_type}")

                res_steps = sync_conn.exec_driver_sql("PRAGMA table_info(agent_steps)").fetchall()
                existing_step_cols = {r[1] for r in res_steps}
                for c_name, c_type in [
                    ("title", "TEXT"),
                    ("safe_summary", "TEXT"),
                    ("status", "TEXT DEFAULT 'PENDING'"),
                    ("error_message", "TEXT"),
                    ("created_at", "DATETIME")
                ]:
                    if c_name not in existing_step_cols:
                        sync_conn.exec_driver_sql(f"ALTER TABLE agent_steps ADD COLUMN {c_name} {c_type}")

                res_tools = sync_conn.exec_driver_sql("PRAGMA table_info(tool_registry)").fetchall()
                existing_tool_cols = {r[1] for r in res_tools}
                for c_name, c_type in [
                    ("returns_schema", "TEXT DEFAULT '{}'"),
                    ("permission_required", "TEXT DEFAULT 'agents.execute'"),
                    ("timeout_seconds", "INTEGER DEFAULT 30")
                ]:
                    if c_name not in existing_tool_cols:
                        sync_conn.exec_driver_sql(f"ALTER TABLE tool_registry ADD COLUMN {c_name} {c_type}")

                res_audit = sync_conn.exec_driver_sql("PRAGMA table_info(audit_logs)").fetchall()
                existing_audit_cols = {r[1] for r in res_audit}
                if "correlation_id" not in existing_audit_cols:
                    sync_conn.exec_driver_sql("ALTER TABLE audit_logs ADD COLUMN correlation_id VARCHAR(64)")
                if "company_code" not in existing_audit_cols:
                    sync_conn.exec_driver_sql("ALTER TABLE audit_logs ADD COLUMN company_code VARCHAR(50)")

                if "company_code" not in existing_cols:
                    sync_conn.exec_driver_sql("ALTER TABLE documents ADD COLUMN company_code VARCHAR(50)")

                if "company_code" not in existing_conv_cols:
                    sync_conn.exec_driver_sql("ALTER TABLE conversations ADD COLUMN company_code VARCHAR(50)")

                if "company_code" not in existing_run_cols:
                    sync_conn.exec_driver_sql("ALTER TABLE agent_runs ADD COLUMN company_code VARCHAR(50)")

                res_deliv = sync_conn.exec_driver_sql("PRAGMA table_info(deliverables)").fetchall()
                existing_deliv_cols = {r[1] for r in res_deliv}
                if "company_code" not in existing_deliv_cols:
                    sync_conn.exec_driver_sql("ALTER TABLE deliverables ADD COLUMN company_code VARCHAR(50)")

                res_users = sync_conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()
                existing_user_cols = {r[1] for r in res_users}
                if "department" not in existing_user_cols:
                    sync_conn.exec_driver_sql("ALTER TABLE users ADD COLUMN department VARCHAR(100) DEFAULT 'Engineering'")

                sync_conn.exec_driver_sql("""
                    CREATE TABLE IF NOT EXISTS revoked_tokens (
                        id VARCHAR(36) PRIMARY KEY,
                        token_hash VARCHAR(64) NOT NULL UNIQUE,
                        jti VARCHAR(64),
                        user_id VARCHAR(36),
                        revoked_at DATETIME NOT NULL,
                        expires_at DATETIME NOT NULL,
                        reason VARCHAR(100)
                    )
                """)
                sync_conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_revoked_tokens_token_hash ON revoked_tokens (token_hash)")
                sync_conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_revoked_tokens_expires_at ON revoked_tokens (expires_at)")

                await conn.run_sync(_ensure_sqlite_cols)
            else:
                from backend.app.core.tenant import apply_postgres_rls
                await apply_postgres_rls(conn)

    # Modularized Seed Execution
    async with AsyncSessionLocal() as session:
        await seed_database(session)
