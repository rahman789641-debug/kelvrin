import os
import asyncio
import pytest

import logging
logger = logging.getLogger("kelvrin.tests")

# Ensure pytest uses an isolated test database, preserving the operational database
TEST_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "kelvrin_test.db"))
if os.path.exists(TEST_DB_PATH):
    try:
        os.remove(TEST_DB_PATH)
    except OSError as e:
        logger.warning(f"Could not remove stale test database file '{TEST_DB_PATH}': {e}")

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB_PATH}"
os.environ["ENVIRONMENT"] = "testing"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-that-is-at-least-32-chars-long"
os.environ["INITIAL_ADMIN_PASSWORD"] = "SovereignEnclave2026!"

from pathlib import Path
from alembic.config import Config
from alembic import command
from backend.app.db.session import async_engine, AsyncSessionLocal
from backend.app.db.init_db import init_db

def _run_migrations():
    """Execute Alembic migrations to construct the test schema strictly via migrations."""
    root_dir = Path(__file__).resolve().parents[2]
    alembic_ini_path = root_dir / "alembic.ini"
    alembic_cfg = Config(str(alembic_ini_path))
    alembic_cfg.set_main_option("sqlalchemy.url", f"sqlite:///{TEST_DB_PATH}")
    command.upgrade(alembic_cfg, "head")

@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Initializes the isolated test database schema via Alembic migrations and seeds reference records."""
    _run_migrations()
    asyncio.run(init_db())
    yield

