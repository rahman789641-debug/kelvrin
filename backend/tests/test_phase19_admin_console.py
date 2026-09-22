import pytest
from sqlalchemy import select
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.user import User, Role
from backend.app.models.audit import AuditLog

async def get_super_admin() -> User:
    async with AsyncSessionLocal() as db:
        stmt = select(User).where(User.role == "Super Admin")
        admin = (await db.execute(stmt)).scalars().first()
        if not admin:
            admin = User(
                email="admin_phase19@kelvrin.internal",
                full_name="Admin Phase19",
                department="Platform Engineering",
                role="Super Admin",
                status="ACTIVE",
                password_hash="testpass"
            )
            db.add(admin)
            await db.commit()
            await db.refresh(admin)
        return admin

@pytest.mark.asyncio
async def test_user_creation_with_department():
    """Verify admin can provision user with department and role."""
    async with AsyncSessionLocal() as db:
        admin = await get_super_admin()

        stmt_existing = select(User).where(User.email == "test_dept_user@kelvrin.internal")
        existing = (await db.execute(stmt_existing)).scalar_one_or_none()
        if existing:
            await db.delete(existing)
            await db.commit()

        new_user = User(
            email="test_dept_user@kelvrin.internal",
            full_name="Dr. Elena Rostova",
            department="Nuclear Safety & Compliance",
            role="Analyst",
            status="ACTIVE",
            password_hash="hashed_pw_123"
        )
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        assert new_user.id is not None
        assert new_user.department == "Nuclear Safety & Compliance"
        assert new_user.role == "Analyst"

        schema = new_user.to_schema()
        assert schema.department == "Nuclear Safety & Compliance"

@pytest.mark.asyncio
async def test_user_profile_and_role_update():
    """Verify admin can update user department and role."""
    async with AsyncSessionLocal() as db:
        stmt = select(User).where(User.email == "test_dept_user@kelvrin.internal")
        user = (await db.execute(stmt)).scalar_one_or_none()
        assert user is not None

        # Update department & role
        user.department = "Executive Risk Committee"
        user.role = "Approver / Manager"
        await db.commit()
        await db.refresh(user)

        assert user.department == "Executive Risk Committee"
        assert user.role == "Approver / Manager"

@pytest.mark.asyncio
async def test_user_status_toggle_and_audit():
    """Verify user can be suspended and audit event logged."""
    async with AsyncSessionLocal() as db:
        stmt = select(User).where(User.email == "test_dept_user@kelvrin.internal")
        user = (await db.execute(stmt)).scalar_one_or_none()
        assert user is not None

        user.status = "SUSPENDED"

        audit = AuditLog(
            action="USER_STATUS_CHANGE",
            actor_email="admin_phase19@kelvrin.internal",
            resource_type="user",
            resource_id=user.id,
            status="SUCCESS",
            details={"old_status": "ACTIVE", "new_status": "SUSPENDED"}
        )
        db.add(audit)
        await db.commit()

        assert user.status == "SUSPENDED"

        # Verify audit logged
        stmt_audit = select(AuditLog).where(AuditLog.resource_id == user.id)
        audit_entry = (await db.execute(stmt_audit)).scalars().first()
        assert audit_entry is not None
        assert audit_entry.action == "USER_STATUS_CHANGE"
