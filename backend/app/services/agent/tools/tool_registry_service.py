import asyncio
import time
from typing import Dict, Optional, List, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.tool_registry import ToolRegistry, ToolExecution
from backend.app.models.user import User
from backend.app.services.agent.tools.base import BaseTool, ToolResult, ToolContext
from backend.app.services.agent.tools.document_tools import (
    ReadDocumentTool,
    SearchKnowledgeBaseTool,
    ExtractTextTool,
    OcrDocumentTool,
    AnalyzeImageTool
)
from backend.app.services.agent.tools.compute_tools import (
    CalculateTool,
    ExecutePythonSandboxTool
)
from backend.app.services.agent.tools.generation_tools import (
    GenerateDocxTool,
    GenerateXlsxTool,
    GeneratePptxTool,
    WriteLocalFileTool
)

class ToolRegistryService:
    """Central registry and execution manager for all sovereign local tools."""

    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}
        self._register_default_tools()

    def _register_default_tools(self):
        tools = [
            ReadDocumentTool(),
            SearchKnowledgeBaseTool(),
            ExtractTextTool(),
            OcrDocumentTool(),
            AnalyzeImageTool(),
            CalculateTool(),
            ExecutePythonSandboxTool(),
            GenerateDocxTool(),
            GenerateXlsxTool(),
            GeneratePptxTool(),
            WriteLocalFileTool(),
        ]
        for t in tools:
            self._tools[t.name] = t

    def get_tool(self, tool_name: str) -> Optional[BaseTool]:
        return self._tools.get(tool_name)

    def list_tools(self) -> List[BaseTool]:
        return list(self._tools.values())

    async def execute_tool(
        self,
        tool_name: str,
        params: Dict[str, Any],
        user: User,
        db: AsyncSession,
        run_id: Optional[str] = None,
        step_id: Optional[str] = None
    ) -> ToolResult:
        """
        Executes a registered tool with strict RBAC permission verification,
        enforced timeout, exception isolation, and immutable audit logging.
        """
        tool = self.get_tool(tool_name)
        if not tool:
            return ToolResult(
                success=False,
                output=None,
                safe_summary=f"Execution blocked: Unknown tool '{tool_name}'",
                error_message=f"Tool '{tool_name}' is not recognized in sovereign tool registry."
            )

        # 1. RBAC Permission Check
        user_perms = user.permissions
        if "*" not in user_perms and tool.permission_required not in user_perms:
            # Record blocked tool execution
            exec_rec = ToolExecution(
                run_id=run_id,
                step_id=step_id,
                tool_name=tool_name,
                input_data=params,
                output_data={"error": f"Permission '{tool.permission_required}' denied"},
                execution_time_ms=0.0,
                status="BLOCKED",
                error_detail=f"User {user.email} lacks permission '{tool.permission_required}'",
                executed_by=user.id
            )
            db.add(exec_rec)
            await db.commit()

            return ToolResult(
                success=False,
                output=None,
                safe_summary=f"Security Policy: Missing permission '{tool.permission_required}' to run tool '{tool_name}'",
                error_message=f"Access denied: Requires permission '{tool.permission_required}'."
            )

        # 2. Execute with Timeout Enforced
        context = ToolContext(user=user, db=db, run_id=run_id, step_id=step_id)
        start_time = time.perf_counter()

        try:
            result = await asyncio.wait_for(
                tool.execute(params, context),
                timeout=float(tool.timeout_seconds)
            )
            elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
            status = "SUCCESS" if result.success else "FAILED"

            # 3. Log Tool Execution
            exec_rec = ToolExecution(
                run_id=run_id,
                step_id=step_id,
                tool_name=tool_name,
                input_data=params,
                output_data=result.output if isinstance(result.output, dict) else {"result": str(result.output)},
                execution_time_ms=elapsed_ms,
                status=status,
                error_detail=result.error_message,
                executed_by=user.id
            )
            db.add(exec_rec)
            await db.commit()

            return result

        except asyncio.TimeoutError:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
            exec_rec = ToolExecution(
                run_id=run_id,
                step_id=step_id,
                tool_name=tool_name,
                input_data=params,
                output_data={"error": f"Execution timed out after {tool.timeout_seconds}s"},
                execution_time_ms=elapsed_ms,
                status="TIMEOUT",
                error_detail=f"Exceeded timeout limit of {tool.timeout_seconds}s",
                executed_by=user.id
            )
            db.add(exec_rec)
            await db.commit()

            return ToolResult(
                success=False,
                output=None,
                safe_summary=f"Tool '{tool_name}' timed out after {tool.timeout_seconds}s",
                error_message=f"Tool execution exceeded {tool.timeout_seconds}s limit."
            )
        except Exception as e:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
            exec_rec = ToolExecution(
                run_id=run_id,
                step_id=step_id,
                tool_name=tool_name,
                input_data=params,
                output_data={"error": str(e)},
                execution_time_ms=elapsed_ms,
                status="FAILED",
                error_detail=str(e),
                executed_by=user.id
            )
            db.add(exec_rec)
            await db.commit()

            return ToolResult(
                success=False,
                output=None,
                safe_summary=f"Tool '{tool_name}' failed: {str(e)}",
                error_message=str(e)
            )

# Global Singleton
tool_registry_service = ToolRegistryService()
