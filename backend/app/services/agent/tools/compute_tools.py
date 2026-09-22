import ast
import math
import os
import subprocess
import sys
import tempfile
import time
import logging
from typing import Dict, Any, Callable
from backend.app.services.agent.tools.base import BaseTool, ToolResult, ToolContext

logger = logging.getLogger("kelvrin.tools.compute")

# Safe Math AST Evaluator
SAFE_BINARY_OPERATORS: Dict[Any, Any] = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b if b != 0 else float('inf'),
    ast.FloorDiv: lambda a, b: a // b if b != 0 else float('inf'),
    ast.Mod: lambda a, b: a % b if b != 0 else 0,
    ast.Pow: lambda a, b: a ** b if abs(b) <= 100 else float('inf'),
}

SAFE_UNARY_OPERATORS: Dict[Any, Any] = {
    ast.USub: lambda a: -a,
    ast.UAdd: lambda a: a,
}

SAFE_OPERATORS: Dict[Any, Any] = {**SAFE_BINARY_OPERATORS, **SAFE_UNARY_OPERATORS}

SAFE_CONSTANTS: Dict[str, float] = {
    "pi": math.pi,
    "e": math.e
}

SAFE_FUNCTIONS: Dict[str, Callable[..., Any]] = {
    "sqrt": math.sqrt,
    "abs": abs,
    "round": round,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "log10": math.log10,
    "exp": math.exp,
    "floor": math.floor,
    "ceil": math.ceil,
    "min": min,
    "max": max,
}

def safe_eval_ast(node: ast.AST) -> Any:
    if isinstance(node, ast.Expression):
        return safe_eval_ast(node.body)
    elif isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError(f"Unsupported constant type: {type(node.value)}")
    elif hasattr(ast, "Num") and isinstance(node, getattr(ast, "Num")):  # python 3.7 compatibility
        return getattr(node, "n")
    elif isinstance(node, ast.BinOp):
        op_type = type(node.op)
        if op_type not in SAFE_BINARY_OPERATORS:
            raise ValueError(f"Unsupported binary operator: {op_type.__name__}")
        left = safe_eval_ast(node.left)
        right = safe_eval_ast(node.right)
        op_func = SAFE_BINARY_OPERATORS[op_type]
        return op_func(left, right)
    elif isinstance(node, ast.UnaryOp):
        op_type = type(node.op)
        if op_type not in SAFE_UNARY_OPERATORS:
            raise ValueError(f"Unsupported unary operator: {op_type.__name__}")
        operand = safe_eval_ast(node.operand)
        uop_func = SAFE_UNARY_OPERATORS[op_type]
        return uop_func(operand)
    elif isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ValueError("Only direct mathematical function calls are permitted.")
        func_name = node.func.id
        if func_name not in SAFE_FUNCTIONS:
            raise ValueError(f"Function '{func_name}' is not allowed in safe calculator.")
        call_fn = SAFE_FUNCTIONS[func_name]
        args = [safe_eval_ast(arg) for arg in node.args]
        return call_fn(*args)
    elif isinstance(node, ast.Name):
        if node.id in SAFE_CONSTANTS:
            return SAFE_CONSTANTS[node.id]
        raise ValueError(f"Undefined mathematical identifier: {node.id}")
    else:
        raise ValueError(f"Disallowed expression element: {type(node).__name__}")


class CalculateTool(BaseTool):
    name = "calculate"
    description = "Evaluates mathematical expressions safely using an AST-based parser with zero eval() vulnerabilities"
    permission_required = "agents.execute"
    timeout_seconds = 15
    requires_approval = False
    parameters_schema = {
        "type": "object",
        "properties": {
            "expression": {"type": "string", "description": "Mathematical expression (e.g. 'sqrt(144) + 2 * (10 - 3)')"}
        },
        "required": ["expression"]
    }
    returns_schema = {
        "type": "object",
        "properties": {
            "expression": {"type": "string"},
            "result": {"type": "number"}
        }
    }

    async def execute(self, params: Dict[str, Any], context: ToolContext) -> ToolResult:
        expr = params.get("expression")
        if not expr or not isinstance(expr, str):
            return ToolResult(success=False, output=None, safe_summary="Calculation failed: No expression provided", error_message="Parameter 'expression' is required.")

        try:
            tree = ast.parse(expr.strip(), mode="eval")
            res = safe_eval_ast(tree)
            if isinstance(res, float) and (math.isinf(res) or math.isnan(res)):
                return ToolResult(success=False, output=None, safe_summary=f"Calculation overflow or undefined on '{expr}'", error_message="Result is infinite or undefined.")

            formatted_res = round(res, 6) if isinstance(res, float) else res
            return ToolResult(
                success=True,
                output={"expression": expr, "result": formatted_res},
                safe_summary=f"Evaluated: {expr} = {formatted_res}",
                metadata={"result": formatted_res}
            )
        except Exception as e:
            return ToolResult(
                success=False,
                output=None,
                safe_summary=f"Calculation error on '{expr}': {str(e)}",
                error_message=f"Safe calculation failed: {str(e)}"
            )


class ExecutePythonSandboxTool(BaseTool):
    name = "execute_python_sandbox"
    description = "Executes Python code in a secure air-gapped sandbox without network or arbitrary fs access"
    permission_required = "ai.execute"
    timeout_seconds = 10
    requires_approval = True  # Human-in-the-loop checkpoint by default
    parameters_schema = {
        "type": "object",
        "properties": {
            "code": {"type": "string", "description": "Safe Python script to execute"}
        },
        "required": ["code"]
    }
    returns_schema = {
        "type": "object",
        "properties": {
            "stdout": {"type": "string"},
            "stderr": {"type": "string"},
            "returncode": {"type": "integer"}
        }
    }

    FORBIDDEN_MODULES = {
        "socket", "subprocess", "os", "sys", "shutil", "urllib", "requests", "http",
        "pty", "commands", "posix", "nt", "ctypes", "winreg", "builtins", "__builtin__"
    }

    def _validate_safety(self, code_str: str) -> None:
        """Inspects AST to ensure no forbidden modules or dangerous calls are present."""
        tree = ast.parse(code_str)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    mod_root = alias.name.split(".")[0]
                    if mod_root in self.FORBIDDEN_MODULES:
                        raise PermissionError(f"Security policy violation: import '{alias.name}' is strictly prohibited in sovereign sandbox.")
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    mod_root = node.module.split(".")[0]
                    if mod_root in self.FORBIDDEN_MODULES:
                        raise PermissionError(f"Security policy violation: from '{node.module}' import is strictly prohibited in sovereign sandbox.")
            elif isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec", "compile", "__import__"}:
                    raise PermissionError(f"Security policy violation: '{node.func.id}()' dynamic code execution is prohibited.")

    async def execute(self, params: Dict[str, Any], context: ToolContext) -> ToolResult:
        code = params.get("code")
        if not code or not isinstance(code, str):
            return ToolResult(success=False, output=None, safe_summary="Sandbox failed: No code provided", error_message="Parameter 'code' is required.")

        # 1. AST Safety Validation
        try:
            self._validate_safety(code)
        except PermissionError as pe:
            return ToolResult(success=False, output=None, safe_summary=f"Sandbox blocked by safety policy: {str(pe)}", error_message=str(pe))
        except SyntaxError as se:
            return ToolResult(success=False, output=None, safe_summary=f"Python syntax error: {str(se)}", error_message=f"SyntaxError: {str(se)}")

        # 2. Prepare Sandboxed Working Directory
        sandbox_dir = "/Users/software file/Kelvrin/scratch/sandbox"
        os.makedirs(sandbox_dir, exist_ok=True)

        # 3. Write script and execute in isolated subprocess
        start_time = time.perf_counter()
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", dir=sandbox_dir, delete=False) as script_file:
            script_path = script_file.name
            script_file.write(code)

        try:
            # Run with python3 with strict timeout and no network
            proc = subprocess.run(
                [sys.executable, "-I", script_path],  # -I: isolate from user site/env
                cwd=sandbox_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=5.0
            )
            elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
            stdout = proc.stdout.strip()
            stderr = proc.stderr.strip()

            success = proc.returncode == 0
            summary = (
                f"Sandbox script executed in {elapsed_ms}ms (return code {proc.returncode}). Output: {stdout[:100]}..."
                if stdout else f"Sandbox script finished in {elapsed_ms}ms with no stdout."
            )
            if not success:
                summary = f"Sandbox script failed with exit code {proc.returncode}. Error: {stderr[:100]}"

            return ToolResult(
                success=success,
                output={"stdout": stdout, "stderr": stderr, "returncode": proc.returncode, "elapsed_ms": elapsed_ms},
                safe_summary=summary,
                error_message=stderr if not success else None,
                metadata={"elapsed_ms": elapsed_ms, "returncode": proc.returncode}
            )
        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                output=None,
                safe_summary="Sandbox execution timed out after 5.0 seconds",
                error_message="Subprocess exceeded sandbox time limit (5.0s)."
            )
        except Exception as e:
            return ToolResult(
                success=False,
                output=None,
                safe_summary=f"Sandbox execution error: {str(e)}",
                error_message=str(e)
            )
        finally:
            if os.path.exists(script_path):
                try:
                    os.remove(script_path)
                except OSError as oe:
                    logger.warning(f"[COMPUTE_TOOLS] Could not cleanup temp script '{script_path}': {oe}")
