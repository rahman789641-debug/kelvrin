import logging
import socket
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text
from backend.app.core.config import settings

logger = logging.getLogger("kelvrin.db")

def is_postgres_listening(host: str, port: int) -> bool:
    try:
        sock = socket.create_connection((host, port), timeout=0.5)
        sock.close()
        return True
    except (OSError, ConnectionRefusedError):
        return False

# Determine active database URL
if settings.DATABASE_URL:
    ACTIVE_DATABASE_URL = settings.async_database_url
elif is_postgres_listening(settings.POSTGRES_SERVER, settings.POSTGRES_PORT):
    ACTIVE_DATABASE_URL = settings.async_database_url
else:
    logger.info(f"[KELVRIN_DB] PostgreSQL not detected on {settings.POSTGRES_SERVER}:{settings.POSTGRES_PORT}. Utilizing local sovereign SQLite store.")
    ACTIVE_DATABASE_URL = settings.SQLITE_FALLBACK_URL

from sqlalchemy import text, event

is_sqlite = "sqlite" in ACTIVE_DATABASE_URL

engine_kwargs = {
    "echo": False,
    "future": True,
    "pool_pre_ping": True,
}

if is_sqlite:
    engine_kwargs["connect_args"] = {
        "check_same_thread": False,
        "timeout": 30
    }
else:
    engine_kwargs["pool_size"] = 50
    engine_kwargs["max_overflow"] = 100
    engine_kwargs["pool_timeout"] = 30
    engine_kwargs["pool_recycle"] = 1800

async_engine = create_async_engine(
    ACTIVE_DATABASE_URL,
    **engine_kwargs
)

if is_sqlite:
    @event.listens_for(async_engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA busy_timeout=30000;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("PRAGMA cache_size=-64000;")
            cursor.close()
        except Exception as err:
            logger.warning(f"[KELVRIN_DB] SQLite pragma initialization warning: {err}")

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields an active async database session.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def check_database_connection() -> dict:
    """
    Health check probe for database connectivity.
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(text("SELECT 1"))
            return {
                "status": "connected",
                "engine": "sqlite" if "sqlite" in ACTIVE_DATABASE_URL else "postgresql",
                "ping": result.scalar() == 1
            }
    except Exception as e:
        return {"status": "error", "error": str(e)}
