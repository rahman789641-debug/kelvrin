from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.auth import get_current_user
from backend.app.core.rbac import require_permission, record_audit_log
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.schemas.code import (
    CodeGenerateRequest,
    CodeGenerateResponse,
    CodeExecuteRequest,
    CodeExecuteResponse,
    CodeTestRequest,
    SecurityStatus
)
from backend.app.services.sandbox.code_sandbox import (
    code_sandbox_service,
    CodeSandboxSecurityError
)

router = APIRouter(prefix="/code", tags=["Secure Code Lab Sandbox"])

@router.post("/generate", response_model=CodeGenerateResponse)
async def generate_code(
    payload: CodeGenerateRequest,
    user: User = Depends(require_permission("ai.execute")),
    db: AsyncSession = Depends(get_db)
):
    """
    Generates verified Python algorithms according to user instructions.
    Classifies task and selects optimal sovereign coding model.
    """
    res = code_sandbox_service.generate_code_solution(payload.prompt, payload.language or "python")
    await record_audit_log(
        db, action="CODE_GENERATION", resource_type="CODE_LAB", actor=user,
        details={"prompt": payload.prompt[:80], "task_type": res["task_type"], "model": res["model_used"]}
    )
    return res

@router.post("/execute", response_model=CodeExecuteResponse)
async def execute_code(
    payload: CodeExecuteRequest,
    user: User = Depends(require_permission("ai.execute")),
    db: AsyncSession = Depends(get_db)
):
    """
    Executes Python code in an isolated micro-process with network disabled,
    AST static checks, and memory/CPU resource caps.
    """
    try:
        res = code_sandbox_service.execute_code(payload.code, timeout_sec=payload.timeout_seconds or 5)
    except SyntaxError as se:
        return CodeExecuteResponse(
            success=False,
            stdout="",
            stderr=str(se),
            exit_code=1,
            duration_ms=0,
            security_status=SecurityStatus()
        )
    except CodeSandboxSecurityError as sse:
        return CodeExecuteResponse(
            success=False,
            stdout="",
            stderr=f"Security Violation: {str(sse)}",
            exit_code=2,
            duration_ms=0,
            security_status=SecurityStatus()
        )

    await record_audit_log(
        db, action="CODE_EXECUTION", resource_type="CODE_LAB", actor=user,
        details={"success": res["success"], "duration_ms": res["duration_ms"], "exit_code": res["exit_code"]}
    )
    return res

@router.post("/test", response_model=CodeExecuteResponse)
async def test_code(
    payload: CodeTestRequest,
    user: User = Depends(require_permission("ai.execute")),
    db: AsyncSession = Depends(get_db)
):
    """
    Runs isolated unit tests against the generated algorithm in the sandbox.
    """
    try:
        res = code_sandbox_service.test_code_solution(payload.code, payload.test_code)
    except (SyntaxError, CodeSandboxSecurityError) as e:
        return CodeExecuteResponse(
            success=False,
            stdout="",
            stderr=str(e),
            exit_code=1,
            duration_ms=0,
            security_status=SecurityStatus()
        )

    await record_audit_log(
        db, action="CODE_TEST_RUN", resource_type="CODE_LAB", actor=user,
        details={"success": res["success"], "exit_code": res["exit_code"]}
    )
    return res
