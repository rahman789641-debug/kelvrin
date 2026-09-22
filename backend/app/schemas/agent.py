"""Sovereign Agent schema models."""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., min_length=1)
    category: Optional[str] = "General"
    system_prompt: str = Field(..., min_length=1)
    model_id: Optional[str] = "deepseek-r1-14b"
    tool_allowlist: List[str] = Field(default_factory=list)
    max_steps: Optional[int] = Field(10, ge=1, le=25)
    timeout_seconds: Optional[int] = Field(120, ge=10, le=600)

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    system_prompt: Optional[str] = None
    model_id: Optional[str] = None
    tool_allowlist: Optional[List[str]] = None
    max_steps: Optional[int] = None
    timeout_seconds: Optional[int] = None
    is_active: Optional[bool] = None

class AgentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    category: str
    system_prompt: str
    model_id: str
    tool_allowlist: List[str]
    max_steps: int
    timeout_seconds: int
    is_active: bool
    created_at: str
    updated_at: Optional[str] = None

class AgentTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    category: str
    system_prompt: str
    default_tools: List[str]
    default_model_id: str
    icon: str
    max_steps: int

class AgentStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    step_number: int
    title: Optional[str] = None
    action_name: Optional[str] = None
    action_input: Optional[dict] = None
    observation: Optional[str] = None
    safe_summary: Optional[str] = None  # Concise safe summary, strictly no chain-of-thought
    status: str
    requires_approval: bool
    approved_by: Optional[str] = None
    duration_ms: Optional[int] = None
    error_message: Optional[str] = None

class AgentRunCreate(BaseModel):
    agent_id: Optional[str] = None
    agent_name: Optional[str] = "Autonomous Sovereign Agent"
    goal: str = Field(..., min_length=1)
    model_id: Optional[str] = None
    tool_allowlist: Optional[List[str]] = None
    max_steps: Optional[int] = None

class AgentRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    agent_id: Optional[str] = None
    agent_name: str
    goal: str
    plan: Optional[List[dict]] = []
    status: str
    current_step: int
    max_steps: int
    final_output: Optional[str] = None
    error_detail: Optional[str] = None
    started_at: str
    completed_at: Optional[str] = None
    steps: List[AgentStepOut] = []
