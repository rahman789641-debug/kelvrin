from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.core.auth import get_current_user
from backend.app.core.rbac import require_permission
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.models.workflow import Workflow, WorkflowRun
from backend.app.schemas.workflow import WorkflowCreate, WorkflowOut, WorkflowRunOut

router = APIRouter(prefix="/workflows", tags=["DAG Workflows"])

def wf_to_out(wf: Workflow) -> WorkflowOut:
    return WorkflowOut(
        id=wf.id,
        name=wf.name,
        description=wf.description,
        dag_definition=wf.dag_definition,
        is_active=wf.is_active,
        created_at=wf.created_at.isoformat() if hasattr(wf.created_at, "isoformat") else str(wf.created_at)
    )

@router.get("", response_model=List[WorkflowOut])
async def list_workflows(
    current_user: User = Depends(require_permission("workflow.execute")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Workflow).order_by(Workflow.created_at.desc())
    wfs = (await db.execute(stmt)).scalars().all()
    return [wf_to_out(w) for w in wfs]

@router.post("", response_model=WorkflowOut, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    payload: WorkflowCreate,
    current_user: User = Depends(require_permission("workflow.create")),
    db: AsyncSession = Depends(get_db)
):
    wf = Workflow(
        name=payload.name,
        description=payload.description,
        dag_definition=payload.dag_definition,
        created_by=current_user.id
    )
    db.add(wf)
    await db.commit()
    await db.refresh(wf)
    return wf_to_out(wf)

@router.post("/{wf_id}/run", response_model=WorkflowRunOut)
async def trigger_workflow_run(
    wf_id: str,
    current_user: User = Depends(require_permission("workflow.execute")),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Workflow).where(Workflow.id == wf_id)
    wf = (await db.execute(stmt)).scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    run = WorkflowRun(
        workflow_id=wf.id,
        triggered_by=current_user.id,
        status="RUNNING",
        execution_log={"current_node": "Ingest", "progress_pct": 20}
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    return WorkflowRunOut(
        id=run.id,
        workflow_id=run.workflow_id,
        status=run.status,
        started_at=run.started_at.isoformat() if hasattr(run.started_at, "isoformat") else str(run.started_at),
        completed_at=None,
        execution_log=run.execution_log
    )
