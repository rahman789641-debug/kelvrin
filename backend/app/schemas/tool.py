from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict

class ToolToggleRequest(BaseModel):
    is_enabled: Optional[bool] = None
    requires_approval: Optional[bool] = None
    timeout_seconds: Optional[int] = None

class ToolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    parameters_schema: Dict[str, Any]
    returns_schema: Optional[Dict[str, Any]] = {}
    permission_required: Optional[str] = "agents.execute"
    is_enabled: bool
    requires_approval: bool
    timeout_seconds: Optional[int] = 30
    is_external: bool
