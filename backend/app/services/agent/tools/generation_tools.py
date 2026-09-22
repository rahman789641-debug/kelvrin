import os
import re
import uuid
from typing import Dict, Any, List, Optional, cast
from backend.app.services.agent.tools.base import BaseTool, ToolResult, ToolContext
from backend.app.core.document_security import (
    sanitize_filename as core_sanitize_filename,
    assert_path_confined
)

SCRATCH_BASE = os.environ.get(
    "SCRATCH_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../scratch"))
)

def sanitize_filename(name: str, default_ext: str = ".txt") -> str:
    """Strip path traversal and hazardous characters using canonical core sanitization."""
    clean = core_sanitize_filename(name)
    if not os.path.splitext(clean)[1]:
        clean += default_ext
    return clean

def ensure_confined_path(target_path: str, base_dir: str) -> str:
    """Verifies that resolved path stays within base_dir using canonical core path confinement."""
    return assert_path_confined(target_path, base_dir)


class GenerateDocxTool(BaseTool):
    name = "generate_docx"
    description = "Generates a structured Word (.docx) document locally in the sovereign scratch workspace"
    permission_required = "documents.upload"
    timeout_seconds = 30
    requires_approval = False
    parameters_schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Document title"},
            "sections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "heading": {"type": "string"},
                        "body": {"type": "string"}
                    },
                    "required": ["heading", "body"]
                },
                "description": "List of sections with headings and paragraph text"
            },
            "filename": {"type": "string", "description": "Optional desired filename (e.g. report.docx)"}
        },
        "required": ["title", "sections"]
    }
    returns_schema = {
        "type": "object",
        "properties": {
            "file_path": {"type": "string"},
            "filename": {"type": "string"},
            "file_size_bytes": {"type": "integer"},
            "sections_count": {"type": "integer"}
        }
    }

    async def execute(self, params: Dict[str, Any], context: ToolContext) -> ToolResult:
        title = params.get("title", "Sovereign Executive Document")
        sections = params.get("sections", [])
        if not sections or not isinstance(sections, list):
            return ToolResult(success=False, output=None, safe_summary="Docx generation failed: No sections provided", error_message="Parameter 'sections' must be a non-empty list.")

        out_dir = os.path.join(SCRATCH_BASE, "generated_documents")
        os.makedirs(out_dir, exist_ok=True)
        raw_filename = params.get("filename") or f"{title.lower().replace(' ', '_')[:30]}.docx"
        filename = sanitize_filename(raw_filename, default_ext=".docx")
        file_path = os.path.join(out_dir, filename)
        ensure_confined_path(file_path, out_dir)

        try:
            import docx
            doc = docx.Document()
            doc.add_heading(title, 0)

            for sec in sections:
                if isinstance(sec, dict):
                    h = sec.get("heading", "")
                    b = sec.get("body", "")
                    if h:
                        doc.add_heading(h, level=1)
                    if b:
                        doc.add_paragraph(b)

            doc.save(file_path)
            size = os.path.getsize(file_path)

            return ToolResult(
                success=True,
                output={"file_path": file_path, "filename": filename, "file_size_bytes": size, "sections_count": len(sections)},
                safe_summary=f"Generated Word document '{filename}' ({size} bytes, {len(sections)} sections)",
                metadata={"file_path": file_path, "size": size}
            )
        except Exception as e:
            return ToolResult(
                success=False,
                output=None,
                safe_summary=f"Failed to generate docx: {str(e)}",
                error_message=str(e)
            )


class GenerateXlsxTool(BaseTool):
    name = "generate_xlsx"
    description = "Generates a structured Excel (.xlsx) spreadsheet with data sheets and formatted columns"
    permission_required = "documents.upload"
    timeout_seconds = 30
    requires_approval = False
    parameters_schema = {
        "type": "object",
        "properties": {
            "sheet_name": {"type": "string", "description": "Title of the primary worksheet", "default": "Data"},
            "headers": {"type": "array", "items": {"type": "string"}, "description": "Column header names"},
            "rows": {"type": "array", "items": {"type": "array"}, "description": "2D array of rows and values"},
            "filename": {"type": "string", "description": "Optional desired filename"}
        },
        "required": ["headers", "rows"]
    }
    returns_schema = {
        "type": "object",
        "properties": {
            "file_path": {"type": "string"},
            "filename": {"type": "string"},
            "rows_count": {"type": "integer"},
            "cols_count": {"type": "integer"},
            "file_size_bytes": {"type": "integer"}
        }
    }

    async def execute(self, params: Dict[str, Any], context: ToolContext) -> ToolResult:
        headers = params.get("headers", [])
        rows = params.get("rows", [])
        if not headers or not isinstance(headers, list):
            return ToolResult(success=False, output=None, safe_summary="Xlsx generation failed: Headers must be a non-empty list", error_message="Parameter 'headers' is required.")

        out_dir = os.path.join(SCRATCH_BASE, "generated_spreadsheets")
        os.makedirs(out_dir, exist_ok=True)
        raw_filename = params.get("filename") or f"sheet_{uuid.uuid4().hex[:8]}.xlsx"
        filename = sanitize_filename(raw_filename, default_ext=".xlsx")
        file_path = os.path.join(out_dir, filename)
        ensure_confined_path(file_path, out_dir)

        try:
            import openpyxl  # type: ignore
            wb = openpyxl.Workbook()
            ws = wb.active
            if ws is None:
                ws = wb.create_sheet(title=params.get("sheet_name", "Data"))
            else:
                ws.title = params.get("sheet_name", "Data")

            ws.append(headers)
            for row in rows:
                if isinstance(row, list):
                    ws.append(row)

            wb.save(file_path)
            size = os.path.getsize(file_path)

            return ToolResult(
                success=True,
                output={
                    "file_path": file_path,
                    "filename": filename,
                    "rows_count": len(rows),
                    "cols_count": len(headers),
                    "file_size_bytes": size
                },
                safe_summary=f"Generated Excel workbook '{filename}' ({len(rows)} data rows, {len(headers)} columns)",
                metadata={"file_path": file_path, "size": size}
            )
        except Exception as e:
            return ToolResult(
                success=False,
                output=None,
                safe_summary=f"Failed to generate xlsx: {str(e)}",
                error_message=str(e)
            )


class GeneratePptxTool(BaseTool):
    name = "generate_pptx"
    description = "Generates a PowerPoint (.pptx) presentation deck with title and content slides"
    permission_required = "documents.upload"
    timeout_seconds = 30
    requires_approval = False
    parameters_schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Presentation presentation deck title"},
            "slides": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "bullet_points": {"type": "array", "items": {"type": "string"}}
                    },
                    "required": ["title", "bullet_points"]
                },
                "description": "List of slide specifications"
            },
            "filename": {"type": "string", "description": "Optional desired filename"}
        },
        "required": ["title", "slides"]
    }
    returns_schema = {
        "type": "object",
        "properties": {
            "file_path": {"type": "string"},
            "filename": {"type": "string"},
            "slides_count": {"type": "integer"},
            "file_size_bytes": {"type": "integer"}
        }
    }

    async def execute(self, params: Dict[str, Any], context: ToolContext) -> ToolResult:
        title = params.get("title", "Sovereign Executive Briefing")
        slides = params.get("slides", [])
        if not slides or not isinstance(slides, list):
            return ToolResult(success=False, output=None, safe_summary="Pptx generation failed: No slides provided", error_message="Parameter 'slides' must be a non-empty list.")

        out_dir = os.path.join(SCRATCH_BASE, "generated_presentations")
        os.makedirs(out_dir, exist_ok=True)
        raw_filename = params.get("filename") or f"{title.lower().replace(' ', '_')[:30]}.pptx"
        filename = sanitize_filename(raw_filename, default_ext=".pptx")
        file_path = os.path.join(out_dir, filename)
        ensure_confined_path(file_path, out_dir)

        try:
            from pptx import Presentation
            from pptx.util import Inches

            prs = Presentation()
            # Title slide
            title_layout = prs.slide_layouts[0]
            slide0 = prs.slides.add_slide(title_layout)
            title_shape0 = cast(Any, slide0.shapes.title)
            if title_shape0 is not None:
                title_shape0.text = title
            if len(slide0.placeholders) > 1:
                ph0 = cast(Any, slide0.placeholders[1])
                if hasattr(ph0, "text_frame"):
                    ph0.text_frame.text = "KELVRIN Sovereign Enclave Briefing"
                else:
                    ph0.text = "KELVRIN Sovereign Enclave Briefing"

            # Content slides
            bullet_layout = prs.slide_layouts[1]
            for s_spec in slides:
                if isinstance(s_spec, dict):
                    s_title = s_spec.get("title", "Overview")
                    bullets = s_spec.get("bullet_points", [])
                    slide = prs.slides.add_slide(bullet_layout)
                    slide_title_shape = cast(Any, slide.shapes.title)
                    if slide_title_shape is not None:
                        slide_title_shape.text = s_title
                    ph1 = cast(Any, slide.shapes.placeholders[1])
                    tf = ph1.text_frame
                    tf.clear()
                    for idx, b_point in enumerate(bullets):
                        p = tf.add_paragraph() if idx > 0 else tf.paragraphs[0]
                        p.text = str(b_point)
                        p.level = 0

            prs.save(file_path)
            size = os.path.getsize(file_path)

            return ToolResult(
                success=True,
                output={
                    "file_path": file_path,
                    "filename": filename,
                    "slides_count": len(slides) + 1,
                    "file_size_bytes": size
                },
                safe_summary=f"Generated PowerPoint deck '{filename}' ({len(slides) + 1} slides including title)",
                metadata={"file_path": file_path, "size": size}
            )
        except Exception as e:
            return ToolResult(
                success=False,
                output=None,
                safe_summary=f"Failed to generate pptx: {str(e)}",
                error_message=str(e)
            )


class WriteLocalFileTool(BaseTool):
    name = "write_local_file"
    description = "Writes safe text/markdown/json files strictly within sovereign scratch directory"
    permission_required = "documents.upload"
    timeout_seconds = 20
    requires_approval = True  # Human approval checkpoint by default for writing persistent local files
    parameters_schema = {
        "type": "object",
        "properties": {
            "filename": {"type": "string", "description": "Target file name (e.g. 'audit_findings.md')"},
            "content": {"type": "string", "description": "String content to persist to file"}
        },
        "required": ["filename", "content"]
    }
    returns_schema = {
        "type": "object",
        "properties": {
            "file_path": {"type": "string"},
            "filename": {"type": "string"},
            "bytes_written": {"type": "integer"}
        }
    }

    async def execute(self, params: Dict[str, Any], context: ToolContext) -> ToolResult:
        raw_name = params.get("filename")
        content = params.get("content")
        if not raw_name or content is None:
            return ToolResult(success=False, output=None, safe_summary="File write failed: Missing filename or content", error_message="Both 'filename' and 'content' are required.")

        out_dir = os.path.join(SCRATCH_BASE, "user_files")
        os.makedirs(out_dir, exist_ok=True)
        filename = sanitize_filename(raw_name, default_ext=".txt")
        file_path = os.path.join(out_dir, filename)

        try:
            ensure_confined_path(file_path, out_dir)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            bytes_written = os.path.getsize(file_path)

            return ToolResult(
                success=True,
                output={"file_path": file_path, "filename": filename, "bytes_written": bytes_written},
                safe_summary=f"Successfully persisted sandboxed file '{filename}' ({bytes_written} bytes)",
                metadata={"file_path": file_path, "size": bytes_written}
            )
        except PermissionError as pe:
            return ToolResult(
                success=False,
                output=None,
                safe_summary=f"Security violation: {str(pe)}",
                error_message=str(pe)
            )
        except Exception as e:
            return ToolResult(
                success=False,
                output=None,
                safe_summary=f"Failed to write local file: {str(e)}",
                error_message=str(e)
            )
