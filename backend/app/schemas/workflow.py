from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

class WorkflowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    dag_definition: dict = Field(default_factory=dict)

class WorkflowRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workflow_id: str
    status: str
    started_at: str
    completed_at: Optional[str] = None
    execution_log: Optional[dict] = None

class WorkflowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str] = None
    dag_definition: dict
    is_active: bool
    created_at: str
