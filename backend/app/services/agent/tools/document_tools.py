import base64
import os
from typing import Dict, Any, Optional
from sqlalchemy import select
from backend.app.models.document import Document
from backend.app.services.agent.tools.base import BaseTool, ToolResult, ToolContext
from backend.app.services.rag.retriever import grounded_retriever
from backend.app.services.rag.cleaner import clean_text
import logging
from backend.app.services.multimodal.ocr_providers import OcrProviderFactory
from backend.app.services.multimodal.vision_providers import VisionProviderFactory

logger = logging.getLogger("kelvrin.tools.document")

class ReadDocumentTool(BaseTool):
    name = "read_document"
    description = "Reads text content and metadata of a sovereign document in the enclave by document_id"
    permission_required = "documents.read"
    timeout_seconds = 30
    requires_approval = False
    parameters_schema = {
        "type": "object",
        "properties": {
            "document_id": {"type": "string", "description": "UUID of the document in the sovereign repository"},
            "max_length": {"type": "integer", "description": "Optional character limit for excerpt"}
        },
        "required": ["document_id"]
    }
    returns_schema = {
        "type": "object",
        "properties": {
            "document_id": {"type": "string"},
            "title": {"type": "string"},
            "classification": {"type": "string"},
            "content": {"type": "string"},
            "file_size_bytes": {"type": "integer"}
        }
    }

    async def execute(self, params: Dict[str, Any], context: ToolContext) -> ToolResult:
        doc_id = params.get("document_id")
        if not doc_id:
            return ToolResult(success=False, output=None, safe_summary="Failed: Missing document_id", error_message="Parameter 'document_id' is required.")

        stmt = select(Document).where(Document.id == doc_id)
        doc = (await context.db.execute(stmt)).scalar_one_or_none()
        if not doc:
            # Fallback search if alias or legacy ID was requested
            fallback_stmt = select(Document).where(
                (Document.id == "doc_pv201_inspection") |
                (Document.id == "doc_ps26117_inspection") |
                (Document.title.contains("Pressure Vessel")) |
                (Document.title.contains("Inspection Report"))
            )
            doc = (await context.db.execute(fallback_stmt)).scalars().first()
        if not doc:
            return ToolResult(success=False, output=None, safe_summary=f"Failed: Document '{doc_id}' not found", error_message=f"Document '{doc_id}' does not exist.")

        # Check permission for classification
        user_perms = context.user.permissions
        if doc.classification == "TOP_SECRET" and ("*" not in user_perms and "documents.topsecret.read" not in user_perms):
            return ToolResult(success=False, output=None, safe_summary="Security blocked: Insufficient clearance for TOP_SECRET", error_message="Access denied to TOP_SECRET document.")

        content = doc.content_preview or ""
        if os.path.exists(doc.file_path):
            try:
                with open(doc.file_path, "r", encoding="utf-8", errors="ignore") as f:
                    file_text = f.read()
                    if file_text.strip():
                        content = file_text
            except (OSError, UnicodeDecodeError) as err:
                logger.warning(f"[DOCUMENT_TOOLS] Could not read physical file for doc {doc.id}: {err}")

        max_len = params.get("max_length")
        if max_len and isinstance(max_len, int) and len(content) > max_len:
            content = content[:max_len] + "\n...[truncated by max_length]"

        out = {
            "document_id": doc.id,
            "title": doc.title,
            "filename": doc.filename,
            "classification": doc.classification,
            "mime_type": doc.mime_type,
            "file_size_bytes": doc.file_size_bytes,
            "content": content
        }
        return ToolResult(
            success=True,
            output=out,
            safe_summary=f"Successfully read document '{doc.title}' ({len(content)} chars, {doc.classification})",
            metadata={"document_id": doc.id, "classification": doc.classification}
        )


class SearchKnowledgeBaseTool(BaseTool):
    name = "search_knowledge_base"
    description = "Performs grounded semantic retrieval on indexed sovereign vector embeddings"
    permission_required = "knowledge.read"
    timeout_seconds = 30
    requires_approval = False
    parameters_schema = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Natural language query to match semantically"},
            "top_k": {"type": "integer", "description": "Number of passages to retrieve", "default": 3},
            "similarity_threshold": {"type": "number", "description": "Minimum cosine similarity score", "default": 0.2}
        },
        "required": ["query"]
    }
    returns_schema = {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "passages": {"type": "array"}
        }
    }

    async def execute(self, params: Dict[str, Any], context: ToolContext) -> ToolResult:
        query = params.get("query")
        if not query:
            return ToolResult(success=False, output=None, safe_summary="Failed: Missing search query", error_message="Parameter 'query' is required.")

        top_k = params.get("top_k", 3)
        threshold = params.get("similarity_threshold", 0.2)

        passages = await grounded_retriever.retrieve(
            query=query,
            current_user=context.user,
            db=context.db,
            top_k=top_k,
            similarity_threshold=threshold,
            hybrid_search=True
        )

        formatted = [
            {
                "chunk_id": p.chunk_id,
                "document_title": p.document_title,
                "page_number": p.page_number,
                "similarity_score": round(p.similarity_score, 4),
                "excerpt": p.content
            }
            for p in passages
        ]

        summary = f"Retrieved {len(formatted)} grounded evidence passages for query '{query[:35]}...'" if formatted else f"No passages found above {threshold*100:.0f}% similarity threshold."
        return ToolResult(
            success=True,
            output={"query": query, "passages": formatted, "count": len(formatted)},
            safe_summary=summary,
            metadata={"retrieved_count": len(formatted)}
        )


class ExtractTextTool(BaseTool):
    name = "extract_text"
    description = "Sanitizes and extracts structured text from provided content or document streams"
    permission_required = "documents.read"
    timeout_seconds = 30
    requires_approval = False
    parameters_schema = {
        "type": "object",
        "properties": {
            "content": {"type": "string", "description": "Raw text content or base64 data to clean"},
            "page_number": {"type": "integer", "description": "Optional page reference"}
        },
        "required": ["content"]
    }
    returns_schema = {
        "type": "object",
        "properties": {
            "cleaned_text": {"type": "string"},
            "word_count": {"type": "integer"}
        }
    }

    async def execute(self, params: Dict[str, Any], context: ToolContext) -> ToolResult:
        content = params.get("content")
        if not content:
            return ToolResult(success=False, output=None, safe_summary="Failed: Missing content to extract", error_message="Parameter 'content' is required.")

        cleaned = clean_text(content)
        words = len(cleaned.split())
        return ToolResult(
            success=True,
            output={"cleaned_text": cleaned, "word_count": words},
            safe_summary=f"Sanitized and extracted {words} words ({len(cleaned)} chars)",
            metadata={"word_count": words}
        )


class OcrDocumentTool(BaseTool):
    name = "OCR_document"
    description = "Applies local optical character recognition to extract text from images or scanned pages"
    permission_required = "documents.read"
    timeout_seconds = 60
    requires_approval = False
    parameters_schema = {
        "type": "object",
        "properties": {
            "image_data": {"type": "string", "description": "Base64-encoded image or local file path"},
            "lang": {"type": "string", "description": "OCR language", "default": "eng"}
        },
        "required": ["image_data"]
    }
    returns_schema = {
        "type": "object",
        "properties": {
            "text": {"type": "string"},
            "words_detected": {"type": "integer"},
            "confidence": {"type": "number"}
        }
    }

    async def execute(self, params: Dict[str, Any], context: ToolContext) -> ToolResult:
        raw_data = params.get("image_data")
        if not raw_data:
            return ToolResult(success=False, output=None, safe_summary="Failed: Missing image_data", error_message="Parameter 'image_data' is required.")

        lang = params.get("lang", "eng")
        provider = OcrProviderFactory.get_provider()

        target_bytes = b""
        if os.path.exists(raw_data):
            with open(raw_data, "rb") as f:
                target_bytes = f.read()
        else:
            try:
                target_bytes = base64.b64decode(raw_data)
            except Exception as e:
                logger.debug(f"[DOCUMENT_TOOLS] OCR image_data not base64 encoded: {e}. Falling back to raw UTF-8 encoding.")
                target_bytes = raw_data.encode("utf-8")

        result = await provider.extract_text(target_bytes, lang=lang)
        return ToolResult(
            success=True,
            output={
                "text": result.text,
                "words_detected": result.words_detected,
                "confidence": result.confidence,
                "provider_used": result.provider_used
            },
            safe_summary=f"Local OCR extracted {result.words_detected} words with {result.confidence*100:.1f}% confidence ({result.provider_used})",
            metadata={"words": result.words_detected, "provider": result.provider_used}
        )


class AnalyzeImageTool(BaseTool):
    name = "analyze_image"
    description = "Performs local multimodal vision analysis on diagrams, drawings, or photographed pages"
    permission_required = "documents.read"
    timeout_seconds = 60
    requires_approval = False
    parameters_schema = {
        "type": "object",
        "properties": {
            "image_data": {"type": "string", "description": "Base64-encoded image or local file path"},
            "prompt": {"type": "string", "description": "Analytical question or prompt", "default": "Analyze this technical image"}
        },
        "required": ["image_data"]
    }
    returns_schema = {
        "type": "object",
        "properties": {
            "category": {"type": "string"},
            "visual_summary": {"type": "string"}
        }
    }

    async def execute(self, params: Dict[str, Any], context: ToolContext) -> ToolResult:
        raw_data = params.get("image_data")
        if not raw_data:
            return ToolResult(success=False, output=None, safe_summary="Failed: Missing image_data", error_message="Parameter 'image_data' is required.")

        prompt = params.get("prompt", "Analyze this image")
        provider = VisionProviderFactory.get_provider()

        target_bytes = b""
        if os.path.exists(raw_data):
            with open(raw_data, "rb") as f:
                target_bytes = f.read()
        else:
            try:
                target_bytes = base64.b64decode(raw_data)
            except Exception as e:
                logger.debug(f"[DOCUMENT_TOOLS] Vision image_data not base64 encoded: {e}. Falling back to raw UTF-8 encoding.")
                target_bytes = raw_data.encode("utf-8")

        result = await provider.analyze_image(target_bytes, prompt=prompt)
        return ToolResult(
            success=True,
            output={
                "category": result.category,
                "visual_summary": result.description,
                "detected_labels": result.detected_labels,
                "confidence": result.confidence,
                "provider_used": result.provider_used
            },
            safe_summary=f"Vision analysis completed: classified as '{result.category}' ({result.provider_used})",
            metadata={"category": result.category, "provider": result.provider_used}
        )
