import os
import pytest
from sqlalchemy import select
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.user import User
from backend.app.models.agent import Agent, AgentRun, AgentStep
from backend.app.models.deliverable import Deliverable
from backend.app.services.agent.inspection_flow import inspection_approval_service
from backend.app.services.agent.engine import agent_engine

from backend.app.db.init_db import init_db

@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    import asyncio
    asyncio.run(init_db())

async def get_test_user(role: str = "Super Admin") -> User:
    async with AsyncSessionLocal() as db:
        stmt = select(User).where(User.role == role)
        user = (await db.execute(stmt)).scalars().first()
        if not user:
            user = User(
                email="admin.inspection@kelvrin.internal",
                hashed_password="hashed_pw_test",
                role=role,
                is_active=True
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        return user

@pytest.mark.asyncio
async def test_inspection_approval_agent_e2e_flow():
    """Verify PS 26117 inspection workflow: reading report, checking SOP-704, declaring missing data, generating Approval_Note.docx."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user("Super Admin")

        res = await inspection_approval_service.execute_inspection_workflow(
            user=user,
            db=db,
            equipment_id="PS-26117"
        )

        # 1. Verify key findings extracted without fabrication
        assert res["key_findings"]["equipment_id"] == "PS-26117"
        assert res["key_findings"]["measured_wall_thickness_mm"] == 14.2
        assert res["key_findings"]["radiographic_weld_quality"] == "Grade 1 (Full Penetration)"
        assert res["key_findings"]["prv_test_pressure_psi"] == 150.0

        # 2. Verify missing data is explicitly declared (never fabricated)
        assert len(res["key_findings"]["missing_parameters"]) > 0
        assert any("Secondary QA Supervisor" in p for p in res["key_findings"]["missing_parameters"])

        # 3. Verify SOP-704 sections retrieved
        standards = [s["standard"] for s in res["supporting_knowledge_sources"]]
        assert any("SOP-704" in s for s in standards)

        # 4. Verify Approval_Note.docx generated and registered
        gen_doc = res["generated_document"]
        assert gen_doc["filename"] == "Approval_Note.docx"
        assert os.path.exists(gen_doc["file_path"])
        assert gen_doc["file_size_bytes"] > 0

        # Verify in Deliverable database table
        stmt = select(Deliverable).where(Deliverable.id == gen_doc["deliverable_id"])
        deliv = (await db.execute(stmt)).scalar_one_or_none()
        assert deliv is not None
        assert deliv.file_type == "DOCX"
        assert deliv.status == "APPROVED"

        # 5. Verify validation and audit statuses
        assert res["validation_status"] == "VALIDATED_WITH_MANDATORY_CONDITIONS"
        assert res["audit_status"] == "AUDIT_LOGGED"
        assert "CONDITIONAL APPROVAL" in res["decision"]

@pytest.mark.asyncio
async def test_inspection_approval_agent_permission_check():
    """Verify unauthorized roles cannot execute recertification approvals."""
    async with AsyncSessionLocal() as db:
        unauthorized_user = User(
            email="unauth@kelvrin.internal",
            full_name="Unauthorized Viewer",
            password_hash="pw",
            role="Viewer / Auditor",
            status="ACTIVE"
        )
        with pytest.raises(PermissionError) as exc_info:
            await inspection_approval_service.execute_inspection_workflow(
                user=unauthorized_user,
                db=db,
                equipment_id="PS-26117"
            )
        assert "lacks authorization" in str(exc_info.value)

@pytest.mark.asyncio
async def test_inspection_agent_engine_integration():
    """Verify ReAct engine plans and executes the PS 26117 goal end-to-end."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user("Super Admin")

        run = AgentRun(
            user_id=user.id,
            agent_name="Inspection Approval Agent",
            goal="Read the inspection report for PS-26117, identify key findings, consult the relevant local SOP, and prepare an approval note.",
            max_steps=10,
            status="PENDING"
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)

        res = await agent_engine.execute_run(run.id, db)
        assert res.status == "COMPLETED"
        assert res.plan is not None
        assert len(res.plan) >= 3

        # Verify steps contain inspection report reading & SOP retrieval
        tools_planned = [p["tool"] for p in res.plan]
        assert "read_document" in tools_planned
        assert "search_knowledge_base" in tools_planned
        assert "generate_docx" in tools_planned

        # Verify final deliverable details in final_output
        assert "Approval_Note.docx" in res.final_output
        assert "Wall thickness" in res.final_output
        assert "Missing Information Notice" in res.final_output
