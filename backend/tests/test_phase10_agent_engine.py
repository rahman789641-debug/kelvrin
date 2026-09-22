import pytest
import os
from sqlalchemy import select
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.user import User
from backend.app.models.agent import Agent, AgentTemplate, AgentRun, AgentStep
from backend.app.models.tool_registry import ExecutionLog
from backend.app.services.agent.engine import agent_engine
from backend.app.services.agent.tools.tool_registry_service import tool_registry_service

async def get_test_user() -> User:
    async with AsyncSessionLocal() as db:
        stmt = select(User).limit(1)
        user = (await db.execute(stmt)).scalars().first()
        if not user:
            user = User(
                email="admin@kelvrin.internal",
                hashed_password="hashed_pw_test",
                role="SUPERADMIN",
                is_active=True
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        return user

@pytest.mark.asyncio
async def test_agent_templates_listing_and_creation():
    """Verify seeded agent templates exist and custom agents can be created."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user()
        
        # 1. Check seeded templates
        t_stmt = select(AgentTemplate)
        templates = (await db.execute(t_stmt)).scalars().all()
        assert len(templates) >= 4
        names = [t.name for t in templates]
        assert "Compliance & Audit Inspector" in names
        assert "Document Intelligence Analyst" in names

        # 2. Create custom Agent
        custom_agent = Agent(
            name="Test Local Analyst",
            description="Autonomous on-premises analyst",
            category="ANALYSIS",
            system_prompt="You are a sovereign analyst constrained to local tools.",
            tool_allowlist=["calculate", "generate_docx", "write_local_file"],
            max_steps=5,
            timeout_seconds=300,
            created_by=user.id
        )
        db.add(custom_agent)
        await db.commit()
        await db.refresh(custom_agent)

        assert custom_agent.id is not None
        assert len(custom_agent.tool_allowlist) == 3

@pytest.mark.asyncio
async def test_agent_engine_multi_step_loop_execution():
    """Verify full execution loop: GOAL -> PLAN -> TOOL SELECTION -> EXECUTION -> OBSERVATION -> VALIDATION -> ITERATION -> FINAL RESULT."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user()

        agent = Agent(
            name="Autonomous Report Generator",
            description="Generates verified calculation and docx report",
            category="AUTOMATION",
            tool_allowlist=["calculate", "generate_docx", "write_local_file"],
            max_steps=5,
            created_by=user.id
        )
        db.add(agent)
        await db.commit()
        await db.refresh(agent)

        run = AgentRun(
            agent_id=agent.id,
            user_id=user.id,
            goal="Calculate financial metrics and compile report in docx format",
            max_steps=5,
            status="PENDING"
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)

        # Execute run
        completed_run = await agent_engine.execute_run(run.id, db)

        assert completed_run.status == "COMPLETED"
        assert completed_run.plan is not None
        assert len(completed_run.plan) >= 2

        # Verify steps were created and validated
        s_stmt = select(AgentStep).where(AgentStep.run_id == completed_run.id).order_by(AgentStep.step_number.asc())
        steps = (await db.execute(s_stmt)).scalars().all()
        assert len(steps) >= 2
        for s in steps:
            assert s.status == "COMPLETED"
            assert s.safe_summary is not None
            assert s.duration_ms is not None
            assert s.duration_ms >= 0

        # Verify final output synthesis
        assert "Autonomous Agent Execution Report" in completed_run.final_output
        assert "SUCCESSFULLY COMPLETED" in completed_run.final_output
        assert "Calculate financial metrics" in completed_run.final_output

        # Verify audit logs generated
        log_stmt = select(ExecutionLog).where(ExecutionLog.run_id == completed_run.id)
        logs = (await db.execute(log_stmt)).scalars().all()
        event_types = [l.event_type for l in logs]
        assert "PLAN_GENERATED" in event_types
        assert "TOOL_SELECTED" in event_types
        assert "VALIDATION_PASSED" in event_types
        assert "RUN_COMPLETED" in event_types

@pytest.mark.asyncio
async def test_agent_engine_hitl_approval_checkpoint():
    """Verify Human-In-The-Loop (HITL) pauses execution on sensitive actions until authorized."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user()

        agent = Agent(
            name="Python Sandbox Agent",
            description="Agent that utilizes python sandbox",
            category="COMPUTE",
            tool_allowlist=["execute_python_sandbox", "calculate"],
            max_steps=5,
            created_by=user.id
        )
        db.add(agent)
        await db.commit()
        await db.refresh(agent)

        run = AgentRun(
            agent_id=agent.id,
            user_id=user.id,
            goal="Execute python code algorithm to compute factorial",
            max_steps=5,
            status="PENDING"
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)

        # 1. Run triggers HITL pause
        paused_run = await agent_engine.execute_run(run.id, db)
        assert paused_run.status == "WAITING_APPROVAL"

        # Check step is WAITING_APPROVAL
        s_stmt = select(AgentStep).where(AgentStep.run_id == paused_run.id)
        steps = (await db.execute(s_stmt)).scalars().all()
        assert len(steps) == 1
        assert steps[0].status == "WAITING_APPROVAL"
        assert steps[0].requires_approval is True
        assert "Requires human authorization" in steps[0].safe_summary

        # 2. Operator authorizes the step
        resumed_run = await agent_engine.resume_run_after_approval(
            run_id=paused_run.id,
            step_id=steps[0].id,
            approver=user,
            db=db
        )

        assert resumed_run.status == "COMPLETED"
        await db.refresh(steps[0])
        assert steps[0].status == "COMPLETED"
        assert steps[0].approved_by == user.id

@pytest.mark.asyncio
async def test_agent_engine_tool_allowlist_enforcement():
    """Verify Agent strictly enforces tool allowlist and fails if an unallowed tool is attempted."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user()

        # Agent only allowed to calculate
        strict_agent = Agent(
            name="Strict Calculator",
            description="Only allowed to calculate",
            category="COMPUTE",
            tool_allowlist=["calculate"],
            max_steps=3,
            created_by=user.id
        )
        db.add(strict_agent)
        await db.commit()
        await db.refresh(strict_agent)

        run = AgentRun(
            agent_id=strict_agent.id,
            user_id=user.id,
            goal="Generate a docx report",  # Not in allowlist!
            max_steps=3,
            status="PENDING",
            plan=[{
                "title": "Attempt blocked docx generation",
                "tool": "generate_docx",
                "params": {"title": "Forbidden Doc"}
            }]
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)

        failed_run = await agent_engine.execute_run(run.id, db)
        assert failed_run.status == "FAILED"
        assert "not in the agent's configured allowlist" in failed_run.error_detail

@pytest.mark.asyncio
async def test_agent_engine_run_cancellation():
    """Verify operator can cancel an ongoing or pending run."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user()

        run = AgentRun(
            user_id=user.id,
            goal="Long running task to be cancelled",
            max_steps=5,
            status="PENDING"
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)

        cancelled_run = await agent_engine.cancel_run(run.id, user, db)
        assert cancelled_run.status == "CANCELLED"

@pytest.mark.asyncio
async def test_agent_engine_no_chain_of_thought_leak():
    """Verify that no internal chain-of-thought or raw thought reasoning is exposed."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user()

        agent = Agent(
            name="Safe Analyst",
            description="Agent with safe summary outputs",
            tool_allowlist=["calculate", "generate_docx"],
            max_steps=3,
            created_by=user.id
        )
        db.add(agent)
        await db.commit()
        await db.refresh(agent)

        run = AgentRun(
            agent_id=agent.id,
            user_id=user.id,
            goal="Calculate 50 * 20 and generate docx findings",
            max_steps=3,
            status="PENDING"
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)

        res = await agent_engine.execute_run(run.id, db)
        assert res.status == "COMPLETED"

        from backend.app.schemas.agent import AgentStepOut
        s_stmt = select(AgentStep).where(AgentStep.run_id == res.id)
        steps = (await db.execute(s_stmt)).scalars().all()
        for step in steps:
            serialized = AgentStepOut.model_validate(step).model_dump()
            # Verify no internal CoT or thought fields leaked in API/UI presentation
            assert "thought" not in serialized
            assert "chain_of_thought" not in serialized
            assert "thinking process" not in step.safe_summary.lower()
            assert "inner monologue" not in step.safe_summary.lower()
