from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

class CodeGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    language: Optional[str] = "python"
    model_id: Optional[str] = None

class CodeGenerateResponse(BaseModel):
    prompt: str
    language: str
    task_type: str
    model_used: str
    code: str

class CodeExecuteRequest(BaseModel):
    code: str = Field(..., min_length=1)
    timeout_seconds: Optional[int] = 5

class SecurityStatus(BaseModel):
    sandbox_isolated: bool = True
    network_disabled: bool = True
    cpu_limit_enforced: bool = True
    memory_limit_enforced: bool = True

class CodeExecuteResponse(BaseModel):
    success: bool
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int
    security_status: SecurityStatus

class CodeTestRequest(BaseModel):
    code: str = Field(..., min_length=1)
    test_code: Optional[str] = None
