import pytest
from backend.app.services.sandbox.code_sandbox import (
    code_sandbox_service,
    CodeSandboxSecurityError
)

def test_code_sandbox_execution_success():
    """Verify execution of valid Python code in micro-process sandbox."""
    code = """
def calc(a, b):
    return a * b + 10

print("Result:", calc(5, 6))
"""
    res = code_sandbox_service.execute_code(code, timeout_sec=5)
    assert res["success"] is True
    assert "Result: 40" in res["stdout"]
    assert res["exit_code"] == 0
    assert res["security_status"]["sandbox_isolated"] is True
    assert res["security_status"]["network_disabled"] is True

def test_code_sandbox_timeout():
    """Verify infinite loop is terminated by sandbox CPU timeout."""
    code = """
import time
while True:
    pass
"""
    res = code_sandbox_service.execute_code(code, timeout_sec=2)
    assert res["success"] is False
    assert "timed out" in res["stderr"].lower()

def test_code_sandbox_syntax_error():
    """Verify syntax error is caught with clean error message."""
    bad_code = "def broken_func(:\n    return 1"
    with pytest.raises(SyntaxError) as exc_info:
        code_sandbox_service.execute_code(bad_code, timeout_sec=3)
    assert "Syntax error" in str(exc_info.value)

def test_code_sandbox_runtime_error():
    """Verify runtime exception is caught without crashing the host."""
    code = """
x = 10 / 0
print(x)
"""
    res = code_sandbox_service.execute_code(code, timeout_sec=3)
    assert res["success"] is False
    assert "ZeroDivisionError" in res["stderr"]
    assert res["exit_code"] != 0

def test_code_sandbox_network_blocked():
    """Verify socket creation or import is strictly prohibited in sandbox."""
    code = """
import socket
s = socket.socket()
"""
    with pytest.raises(CodeSandboxSecurityError) as exc_info:
        code_sandbox_service.execute_code(code, timeout_sec=3)
    assert "socket" in str(exc_info.value).lower()

def test_code_sandbox_forbidden_imports():
    """Verify AST validator blocks prohibited system/network modules."""
    code_subprocess = "import subprocess\nsubprocess.run(['ls'])"
    with pytest.raises(CodeSandboxSecurityError) as exc_info:
        code_sandbox_service.execute_code(code_subprocess, timeout_sec=3)
    assert "strictly prohibited" in str(exc_info.value)

    code_urllib = "from urllib import request"
    with pytest.raises(CodeSandboxSecurityError) as exc_info:
        code_sandbox_service.execute_code(code_urllib, timeout_sec=3)
    assert "strictly prohibited" in str(exc_info.value)

def test_code_generation_and_testing():
    """Verify AI code generation for equipment efficiency and test execution."""
    gen = code_sandbox_service.generate_code_solution("Create a Python calculation for equipment efficiency.")
    assert "calculate_equipment_efficiency" in gen["code"]
    assert gen["task_type"] == "INDUSTRIAL_METRICS"

    # Execute generated code
    exec_res = code_sandbox_service.execute_code(gen["code"], timeout_sec=5)
    assert exec_res["success"] is True
    assert "SOVEREIGN EQUIPMENT EFFICIENCY AUDIT" in exec_res["stdout"]
    assert "Overall OEE Score" in exec_res["stdout"]

    # Test generated code with test runner
    test_res = code_sandbox_service.test_code_solution(gen["code"])
    assert test_res["success"] is True
