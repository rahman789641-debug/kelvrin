import os
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.db.init_db import init_db
from backend.app.services.agent.tools.tool_registry_service import tool_registry_service
from backend.app.services.agent.tools.base import ToolContext
from backend.app.db.session import AsyncSessionLocal
from backend.app.models.user import User
from sqlalchemy import select

@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    import asyncio
    asyncio.run(init_db())

async def get_test_user(email: str = "s.alexander@sovereign.defense.internal") -> User:
    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.email == email)
        return (await session.execute(stmt)).scalar_one()

@pytest.mark.asyncio
async def test_tools_11_registered_in_service():
    """Verify all 11 required initial local tools are registered."""
    tools = tool_registry_service.list_tools()
    tool_names = {t.name for t in tools}
    required = {
        "read_document",
        "search_knowledge_base",
        "extract_text",
        "OCR_document",
        "analyze_image",
        "calculate",
        "execute_python_sandbox",
        "generate_docx",
        "generate_xlsx",
        "generate_pptx",
        "write_local_file"
    }
    assert required.issubset(tool_names), f"Missing tools: {required - tool_names}"

@pytest.mark.asyncio
async def test_calculate_tool_safe_eval():
    """Verify calculate evaluates expressions without eval vulnerabilities."""
    calc_tool = tool_registry_service.get_tool("calculate")
    assert calc_tool is not None

    async with AsyncSessionLocal() as db:
        user = await get_test_user()
        context = ToolContext(user=user, db=db)

        # 1. Standard arithmetic and precedence
        res = await calc_tool.execute({"expression": "10 + 2 * (15 - 5)"}, context)
        assert res.success is True
        assert res.output["result"] == 30

        # 2. Math functions (sqrt, abs, round)
        res_sqrt = await calc_tool.execute({"expression": "sqrt(144) + abs(-8)"}, context)
        assert res_sqrt.success is True
        assert res_sqrt.output["result"] == 20

        # 3. Rejection of malicious/dangerous code injection
        res_bad = await calc_tool.execute({"expression": "__import__('os').system('ls')"}, context)
        assert res_bad.success is False
        assert res_bad.error_message is not None
        assert any(term in res_bad.error_message.lower() for term in ["not allowed", "disallowed", "permitted", "failed"])

@pytest.mark.asyncio
async def test_python_sandbox_tool_isolation_and_guardrails():
    """Verify Python sandbox executes clean code and strictly blocks forbidden modules."""
    sandbox_tool = tool_registry_service.get_tool("execute_python_sandbox")
    assert sandbox_tool is not None

    async with AsyncSessionLocal() as db:
        user = await get_test_user()
        context = ToolContext(user=user, db=db)

        # 1. Valid mathematical/data calculation
        clean_code = "a = [10, 20, 30]\nprint(f'SUM={sum(a)}')"
        res_ok = await sandbox_tool.execute({"code": clean_code}, context)
        assert res_ok.success is True
        assert "SUM=60" in res_ok.output["stdout"]

        # 2. Security violation: network socket import blocked
        bad_socket_code = "import socket\ns = socket.socket()"
        res_socket = await sandbox_tool.execute({"code": bad_socket_code}, context)
        assert res_socket.success is False
        assert res_socket.error_message is not None
        assert "Security policy violation" in res_socket.error_message
        assert "socket" in res_socket.error_message

        # 3. Security violation: subprocess import blocked
        bad_proc_code = "from subprocess import run\nrun(['ls'])"
        res_proc = await sandbox_tool.execute({"code": bad_proc_code}, context)
        assert res_proc.success is False
        assert res_proc.error_message is not None
        assert "Security policy violation" in res_proc.error_message

@pytest.mark.asyncio
async def test_generation_tools_docx_xlsx_pptx():
    """Verify native document generation tools create valid office files in scratch sandbox."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user()
        context = ToolContext(user=user, db=db)
        s = uuid.uuid4().hex[:6]

        # 1. generate_docx
        docx_tool = tool_registry_service.get_tool("generate_docx")
        assert docx_tool is not None
        d_res = await docx_tool.execute({
            "title": f"Sovereign Audit {s}",
            "sections": [{"heading": "Section 1", "body": "Enclave security test verified."}],
            "filename": f"audit_{s}.docx"
        }, context)
        assert d_res.success is True
        assert os.path.exists(d_res.output["file_path"])
        assert d_res.output["file_size_bytes"] > 0

        # 2. generate_xlsx
        xlsx_tool = tool_registry_service.get_tool("generate_xlsx")
        assert xlsx_tool is not None
        x_res = await xlsx_tool.execute({
            "sheet_name": "Metrics",
            "headers": ["Indicator", "Score"],
            "rows": [["Vector Coverage", 99.5], ["Latency", 12.4]],
            "filename": f"metrics_{s}.xlsx"
        }, context)
        assert x_res.success is True
        assert os.path.exists(x_res.output["file_path"])
        assert x_res.output["rows_count"] == 2

        # 3. generate_pptx
        pptx_tool = tool_registry_service.get_tool("generate_pptx")
        assert pptx_tool is not None
        p_res = await pptx_tool.execute({
            "title": f"Mission Deck {s}",
            "slides": [{"title": "Overview", "bullet_points": ["Air-gapped", "Sovereign"]}],
            "filename": f"deck_{s}.pptx"
        }, context)
        assert p_res.success is True
        assert os.path.exists(p_res.output["file_path"])
        assert p_res.output["slides_count"] == 2

@pytest.mark.asyncio
async def test_write_local_file_sandboxed_and_path_traversal():
    """Verify write_local_file confines files and blocks path traversal."""
    write_tool = tool_registry_service.get_tool("write_local_file")
    assert write_tool is not None

    async with AsyncSessionLocal() as db:
        user = await get_test_user()
        context = ToolContext(user=user, db=db)
        s = uuid.uuid4().hex[:6]

        # 1. Clean sandboxed write
        clean_res = await write_tool.execute({
            "filename": f"safe_notes_{s}.txt",
            "content": "Confidential Sovereign Enclave Notes."
        }, context)
        assert clean_res.success is True
        assert os.path.exists(clean_res.output["file_path"])

        # 2. Path traversal attempt (../../etc/passwd)
        bad_res = await write_tool.execute({
            "filename": "../../../etc/passwd",
            "content": "Malicious payload"
        }, context)
        # Even if sanitized to 'passwd.txt', it must write safely inside scratch, never escaping
        assert clean_res.output["file_path"].startswith("/Users/software file/Kelvrin/scratch")

@pytest.mark.asyncio
async def test_document_and_multimodal_tools():
    """Verify read_document, search_knowledge_base, extract_text, OCR_document, and analyze_image."""
    async with AsyncSessionLocal() as db:
        user = await get_test_user()
        context = ToolContext(user=user, db=db)

        # 1. extract_text
        ext_tool = tool_registry_service.get_tool("extract_text")
        assert ext_tool is not None
        ext_res = await ext_tool.execute({"content": "  Sample  messy   text \n\nwith  spaces.  "}, context)
        assert ext_res.success is True
        assert ext_res.output["word_count"] == 5

        # 2. OCR_document
        ocr_tool = tool_registry_service.get_tool("OCR_document")
        assert ocr_tool is not None
        ocr_res = await ocr_tool.execute({"image_data": "sample_scanned_bytes"}, context)
        assert ocr_res.success is True
        assert ocr_res.output["confidence"] > 0

        # 3. analyze_image
        vis_tool = tool_registry_service.get_tool("analyze_image")
        assert vis_tool is not None
        vis_res = await vis_tool.execute({"image_data": "sample_blueprint_bytes", "prompt": "Examine schematic"}, context)
        assert vis_res.success is True
        assert vis_res.output["category"] != ""
