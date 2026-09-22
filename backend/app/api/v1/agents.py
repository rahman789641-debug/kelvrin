from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, or_
from backend.app.core.auth import get_current_user
from backend.app.core.rbac import require_permission, record_audit_log
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.models.agent import Agent, AgentTemplate, AgentRun, AgentStep
from backend.app.schemas.agent import (
    AgentCreate,
    AgentUpdate,
    AgentOut,
    AgentTemplateOut,
    AgentRunCreate,
    AgentRunOut,
    AgentStepOut
)
from backend.app.services.agent.engine import agent_engine

router = APIRouter(prefix="/agents", tags=["Autonomous Agents Engine"])

def agent_to_out(a: Agent) -> AgentOut:
    return AgentOut(
        id=a.id,
        name=a.name,
        description=a.description,
        category=a.category,
        system_prompt=a.system_prompt,
        model_id=a.model_id,
        tool_allowlist=a.tool_allowlist or [],
        max_steps=a.max_steps,
        timeout_seconds=a.timeout_seconds,
        is_active=a.is_active,
        created_at=a.created_at.isoformat() if hasattr(a.created_at, "isoformat") else str(a.created_at),
        updated_at=a.updated_at.isoformat() if hasattr(a.updated_at, "isoformat") and a.updated_at else None
    )

def template_to_out(t: AgentTemplate) -> AgentTemplateOut:
    return AgentTemplateOut(
        id=t.id,
        name=t.name,
        description=t.description,
        category=t.category,
        system_prompt=t.system_prompt,
        default_tools=t.default_tools or [],
        default_model_id=t.default_model_id,
        icon=t.icon,
        max_steps=t.max_steps
    )

def step_to_out(s: AgentStep) -> AgentStepOut:
    return AgentStepOut(
        id=s.id,
        step_number=s.step_number,
        title=s.title,
        action_name=s.action_name,
        action_input=s.action_input,
        observation=s.observation,
        safe_summary=s.safe_summary or s.observation,
        status=s.status,
        requires_approval=s.requires_approval,
        approved_by=s.approved_by,
        duration_ms=s.duration_ms,
        error_message=s.error_message
    )

def run_to_out(run: AgentRun, steps: Optional[List[AgentStep]] = None) -> AgentRunOut:
    if steps is not None:
        step_items = [step_to_out(s) for s in steps]
    elif "steps" in run.__dict__ and run.__dict__["steps"]:
        step_items = [step_to_out(s) for s in run.__dict__["steps"]]
    else:
        step_items = []
    return AgentRunOut(
        id=run.id,
        agent_id=run.agent_id,
        agent_name=run.agent_name,
        goal=run.goal,
        plan=run.plan or [],
        status=run.status,
        current_step=run.current_step,
        max_steps=run.max_steps,
        final_output=run.final_output,
        error_detail=run.error_detail,
        started_at=run.started_at.isoformat() if hasattr(run.started_at, "isoformat") else str(run.started_at),
        completed_at=run.completed_at.isoformat() if hasattr(run.completed_at, "isoformat") and run.completed_at else None,
        steps=step_items
    )

# --- 1. Templates ---
@router.get("/templates", response_model=List[AgentTemplateOut])
async def list_agent_templates(
    current_user: User = Depends(require_permission("agents.execute")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AgentTemplate).order_by(AgentTemplate.name.asc())
    templates = (await db.execute(stmt)).scalars().all()
    return [template_to_out(t) for t in templates]

# --- 2. Custom Agents CRUD ---
@router.get("", response_model=List[AgentOut])
async def list_agents(
    current_user: User = Depends(require_permission("agents.execute")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Agent).order_by(Agent.created_at.desc())
    agents = (await db.execute(stmt)).scalars().all()
    return [agent_to_out(a) for a in agents]

@router.post("", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
async def create_agent(
    payload: AgentCreate,
    current_user: User = Depends(require_permission("agents.create")),
    db: AsyncSession = Depends(get_db)
):
    agent = Agent(
        name=payload.name,
        description=payload.description,
        category=payload.category or "General",
        system_prompt=payload.system_prompt,
        model_id=payload.model_id or "deepseek-r1-14b",
        tool_allowlist=payload.tool_allowlist or [],
        max_steps=payload.max_steps or 10,
        timeout_seconds=payload.timeout_seconds or 120,
        created_by=current_user.id
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    await record_audit_log(
        db,
        action="AGENT_CREATED",
        resource_type="agent",
        actor=current_user,
        resource_id=agent.id,
        details={"name": agent.name, "category": agent.category}
    )
    await db.commit()
    return agent_to_out(agent)

from backend.app.core.tenant import authorize_tenant_access

# --- 3. Agent Runs & Autonomous Execution ---
async def assert_agent_run_access(run: AgentRun, current_user: User, db: Optional[AsyncSession] = None):
    """Guarantees strict tenant isolation for agent runs via centralized authorization."""
    authorize_tenant_access(run, current_user)

@router.get("/runs", response_model=List[AgentRunOut])
async def list_agent_runs(
    status_filter: Optional[str] = Query(None, alias="status"),
    agent_id: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(require_permission("agents.execute")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AgentRun).order_by(AgentRun.started_at.desc())
    if getattr(current_user, "company_code", None):
        company_users = select(User.id).where(User.company_code == current_user.company_code)
        stmt = stmt.where(
            or_(
                AgentRun.company_code == current_user.company_code,
                AgentRun.user_id.in_(company_users)
            )
        )

    if status_filter:
        stmt = stmt.where(AgentRun.status == status_filter)
    if agent_id:
        stmt = stmt.where(AgentRun.agent_id == agent_id)
    stmt = stmt.limit(limit)

    runs = (await db.execute(stmt)).scalars().all()
    out = []
    for r in runs:
        s_stmt = select(AgentStep).where(AgentStep.run_id == r.id).order_by(AgentStep.step_number.asc())
        steps = (await db.execute(s_stmt)).scalars().all()
        out.append(run_to_out(r, steps))
    return out

@router.post("/runs", response_model=AgentRunOut, status_code=status.HTTP_201_CREATED)
async def trigger_agent_run(
    payload: AgentRunCreate,
    current_user: User = Depends(require_permission("agents.execute")),
    db: AsyncSession = Depends(get_db)
):
    """
    Dispatches a real autonomous agent execution loop:
    GOAL -> PLAN -> TOOL SELECTION -> EXECUTION -> OBSERVATION -> VALIDATION -> ITERATION -> FINAL RESULT.
    """
    agent_name = payload.agent_name or "Autonomous Sovereign Agent"
    max_steps = payload.max_steps or 10

    if payload.agent_id:
        a_stmt = select(Agent).where(Agent.id == payload.agent_id)
        agent = (await db.execute(a_stmt)).scalar_one_or_none()
        if agent:
            agent_name = agent.name
            max_steps = agent.max_steps

    run = AgentRun(
        agent_id=payload.agent_id,
        agent_name=agent_name,
        goal=payload.goal,
        user_id=current_user.id,
        company_code=getattr(current_user, "company_code", None),
        status="PENDING",
        max_steps=max_steps
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    await record_audit_log(
        db,
        action="AGENT_RUN_DISPATCHED",
        resource_type="agent_run",
        actor=current_user,
        resource_id=run.id,
        details={"agent_name": agent_name, "goal": payload.goal[:100]}
    )
    await db.commit()

    # Execute autonomous loop
    updated_run = await agent_engine.execute_run(run.id, db)

    s_stmt = select(AgentStep).where(AgentStep.run_id == updated_run.id).order_by(AgentStep.step_number.asc())
    steps = (await db.execute(s_stmt)).scalars().all()
    return run_to_out(updated_run, steps)

@router.get("/runs/{run_id}", response_model=AgentRunOut)
async def get_agent_run(
    run_id: str,
    current_user: User = Depends(require_permission("agents.execute")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AgentRun).where(AgentRun.id == run_id)
    run = (await db.execute(stmt)).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent run not found")
    await assert_agent_run_access(run, current_user, db)

    s_stmt = select(AgentStep).where(AgentStep.run_id == run.id).order_by(AgentStep.step_number.asc())
    steps = (await db.execute(s_stmt)).scalars().all()
    return run_to_out(run, steps)

@router.post("/runs/{run_id}/approve-step/{step_id}", response_model=AgentRunOut)
async def approve_agent_step(
    run_id: str,
    step_id: str,
    current_user: User = Depends(require_permission("agents.manage")),
    db: AsyncSession = Depends(get_db)
):
    """
    Authorizes a paused step in WAITING_APPROVAL status and resumes execution.
    """
    stmt = select(AgentRun).where(AgentRun.id == run_id)
    run = (await db.execute(stmt)).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent run not found")
    await assert_agent_run_access(run, current_user, db)

    try:
        updated_run = await agent_engine.resume_run_after_approval(run_id, step_id, current_user, db)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))

    await record_audit_log(
        db,
        action="AGENT_STEP_APPROVED",
        resource_type="agent_run",
        actor=current_user,
        resource_id=run_id,
        details={"step_id": step_id, "approved_by": current_user.email}
    )
    await db.commit()

    s_stmt = select(AgentStep).where(AgentStep.run_id == updated_run.id).order_by(AgentStep.step_number.asc())
    steps = (await db.execute(s_stmt)).scalars().all()
    return run_to_out(updated_run, steps)

@router.post("/runs/{run_id}/cancel", response_model=AgentRunOut)
async def cancel_agent_run(
    run_id: str,
    current_user: User = Depends(require_permission("agents.manage")),
    db: AsyncSession = Depends(get_db)
):
    """
    Cancels an active or paused agent execution run.
    """
    stmt = select(AgentRun).where(AgentRun.id == run_id)
    run = (await db.execute(stmt)).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent run not found")
    await assert_agent_run_access(run, current_user, db)

    try:
        updated_run = await agent_engine.cancel_run(run_id, current_user, db)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))

    await record_audit_log(
        db,
        action="AGENT_RUN_CANCELLED",
        resource_type="agent_run",
        actor=current_user,
        resource_id=run_id,
        details={"cancelled_by": current_user.email}
    )
    await db.commit()

    s_stmt = select(AgentStep).where(AgentStep.run_id == updated_run.id).order_by(AgentStep.step_number.asc())
    steps = (await db.execute(s_stmt)).scalars().all()
    return run_to_out(updated_run, steps)


# --- 4. Custom Agents Detail CRUD ---
@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(
    agent_id: str,
    current_user: User = Depends(require_permission("agents.execute")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Agent).where(Agent.id == agent_id)
    agent = (await db.execute(stmt)).scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent_to_out(agent)

@router.patch("/{agent_id}", response_model=AgentOut)
async def update_agent(
    agent_id: str,
    payload: AgentUpdate,
    current_user: User = Depends(require_permission("agents.manage")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Agent).where(Agent.id == agent_id)
    agent = (await db.execute(stmt)).scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    if payload.name is not None:
        agent.name = payload.name
    if payload.description is not None:
        agent.description = payload.description
    if payload.category is not None:
        agent.category = payload.category
    if payload.system_prompt is not None:
        agent.system_prompt = payload.system_prompt
    if payload.model_id is not None:
        agent.model_id = payload.model_id
    if payload.tool_allowlist is not None:
        agent.tool_allowlist = payload.tool_allowlist
    if payload.max_steps is not None:
        agent.max_steps = payload.max_steps
    if payload.timeout_seconds is not None:
        agent.timeout_seconds = payload.timeout_seconds
    if payload.is_active is not None:
        agent.is_active = payload.is_active

    await db.commit()
    await db.refresh(agent)
    return agent_to_out(agent)

@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: str,
    current_user: User = Depends(require_permission("agents.manage")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Agent).where(Agent.id == agent_id)
    agent = (await db.execute(stmt)).scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    await db.delete(agent)
    await db.commit()
