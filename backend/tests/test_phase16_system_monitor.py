import pytest
from sqlalchemy import select
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.user import User
from backend.app.models.system_event import SystemEvent
from backend.app.services.system.system_monitor import system_monitor_service

async def get_test_user(role: str = "Super Admin") -> User:
    async with AsyncSessionLocal() as db:
        stmt = select(User).where(User.role == role)
        user = (await db.execute(stmt)).scalars().first()
        if not user:
            user = User(
                email=f"{role.lower().replace(' ', '')}@kelvrin.internal",
                full_name=f"Test {role}",
                role=role,
                status="ACTIVE",
                password_hash="testpass"
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        return user

@pytest.mark.asyncio
async def test_system_metrics_probe_real_values():
    """Verify system metrics probes real CPU, memory, disk without fabricating false GPUs."""
    metrics = system_monitor_service.get_system_metrics()

    # CPU
    assert metrics.cpu.core_count >= 1
    assert metrics.cpu.utilization_pct >= 0.0

    # Memory
    assert metrics.memory.total_mb > 0
    assert metrics.memory.used_mb > 0
    assert metrics.memory.free_mb >= 0
    assert 0.0 <= metrics.memory.percent <= 100.0

    # Disk
    assert metrics.disk.total_gb > 0
    assert metrics.disk.free_gb > 0
    assert 0.0 <= metrics.disk.percent <= 100.0

    # GPU
    assert metrics.gpu is not None
    if not metrics.gpu.gpu_available:
        assert metrics.gpu.message == "GPU metrics unavailable"
        assert metrics.gpu.gpu_count == 0

    # Scratch Storage
    assert metrics.storage.scratch_dir is not None
    assert metrics.storage.total_size_bytes >= 0

@pytest.mark.asyncio
async def test_system_health_probes_subsystems():
    """Verify live probes across Database, AI Models, OCR, Vector DB, Sandbox, Storage."""
    async with AsyncSessionLocal() as db:
        health = await system_monitor_service.get_system_health(db)

        assert health.overall_status in ["HEALTHY", "DEGRADED"]
        subsystems = health.subsystems

        # Verify all 6 mandatory components probed
        assert "database" in subsystems
        assert subsystems["database"].status == "HEALTHY"
        assert subsystems["database"].latency_ms >= 0

        assert "ai_models" in subsystems
        assert subsystems["ai_models"].status in ["HEALTHY", "DEGRADED"]

        assert "ocr_engine" in subsystems
        assert subsystems["ocr_engine"].status == "HEALTHY"

        assert "vector_db" in subsystems
        assert subsystems["vector_db"].status == "HEALTHY"

        assert "sandbox" in subsystems
        assert subsystems["sandbox"].status == "ISOLATED"

        assert "storage" in subsystems
        assert subsystems["storage"].status in ["HEALTHY", "WARNING"]

@pytest.mark.asyncio
async def test_system_events_emission_and_listing():
    """Verify system events can be logged and queried."""
    async with AsyncSessionLocal() as db:
        evt = SystemEvent(
            event_type="HEALTH_PROBE_CHECK",
            severity="INFO",
            source_component="system_monitor",
            message="Sovereign node health probe verified",
            metadata_json={"probe_version": "1.0"}
        )
        db.add(evt)
        await db.commit()

        stmt = select(SystemEvent).where(SystemEvent.event_type == "HEALTH_PROBE_CHECK")
        found = (await db.execute(stmt)).scalars().first()
        assert found is not None
        assert found.message == "Sovereign node health probe verified"
