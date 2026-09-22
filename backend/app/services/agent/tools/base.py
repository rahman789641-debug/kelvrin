from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.user import User

@dataclass
class ToolResult:
    success: bool
    output: Any
    safe_summary: str
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class ToolContext:
    user: User
    db: AsyncSession
    run_id: Optional[str] = None
    step_id: Optional[str] = None

class BaseTool(ABC):
    name: str
    description: str
    parameters_schema: Dict[str, Any]
    returns_schema: Dict[str, Any]
    permission_required: str
    requires_approval: bool = False
    timeout_seconds: int = 30

    @abstractmethod
    async def execute(self, params: Dict[str, Any], context: ToolContext) -> ToolResult:
        """Executes the tool with provided input parameters and context."""
        pass
