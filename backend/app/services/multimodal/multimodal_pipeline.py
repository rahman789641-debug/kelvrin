import asyncio
import logging
import os
import zipfile
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.core.config import settings
from backend.app.models.document import Document
from backend.app.models.document_processing_log import DocumentProcessingLog
from backend.app.services.multimodal.base import (
    NormalizedDocument,
    PageRepresentation,
    VisualElement,
    OcrResult,
    VisionResult
)
from backend.app.services.multimodal.ocr_providers import OcrProviderFactory
from backend.app.services.multimodal.vision_providers import VisionProviderFactory
from backend.app.services.multimodal.pdf_renderer import PurePythonPdfRenderer, CorruptedPdfError
from backend.app.core.document_security import validate_file_format, validate_file_size

logger = logging.getLogger("kelvrin.multimodal_pipeline")

class SovereignMultimodalPipeline:
    """
    Sovereign Multimodal Document Processing Pipeline (Phase 8).
    Pipeline:
      Document -> file validation -> PDF/page extraction -> OCR when required -> text extraction
               -> vision analysis when required -> normalized document representation
    Zero cloud AI APIs. 100% on-premises sovereign execution with comprehensive error isolation.
    """
    def __init__(self):
        self.pdf_renderer = PurePythonPdfRenderer()

    async def log_step(
        self,
        db: AsyncSession,
        document_id: str,
        stage: str,
        message: str,
        level: str = "INFO",
        details: Optional[Dict[str, Any]] = None
    ) -> DocumentProcessingLog:
        """Persist a granular processing log entry in sovereign database."""
        log = DocumentProcessingLog(
            document_id=document_id,
            stage=stage,
            level=level,
            message=message,
            details=details or {}
        )
        db.add(log)
        await db.commit()
        logger.info(f"[{stage}] Doc {document_id}: {message}")
        return log

    async def process_document(
        self,
        document: Document,
        db: AsyncSession,
        ocr_preference: str = "auto",
        vision_preference: str = "auto",
        timeout_seconds: float = 60.0
    ) -> NormalizedDocument:
        """
        Execute end-to-end multimodal extraction without crashing the server.
        Transitions status: QUEUED -> PROCESSING -> OCR -> VISION -> INDEXING -> READY (or FAILED).
        """
        doc_id = document.id
        file_path = document.file_path

        # 1. Stage: QUEUED
        document.status = "QUEUED"
        await db.commit()
        await self.log_step(db, doc_id, "QUEUED", f"Document '{document.filename}' enqueued for multimodal processing.", details={"size_bytes": document.file_size_bytes})

        try:
            return await asyncio.wait_for(
                self._run_pipeline(document, db, ocr_preference, vision_preference),
                timeout=timeout_seconds
            )
        except asyncio.TimeoutError:
            err_msg = f"Multimodal processing timed out after {timeout_seconds} seconds."
            logger.error(f"[TIMEOUT] {doc_id}: {err_msg}")
            document.status = "FAILED"
            document.processing_error = err_msg
            await db.commit()
            await self.log_step(db, doc_id, "FAILED", err_msg, level="ERROR", details={"timeout_seconds": timeout_seconds})
            raise RuntimeError(err_msg)
        except Exception as e:
            err_msg = str(e)
            logger.error(f"[PROCESSING_ERROR] {doc_id}: {err_msg}")
            document.status = "FAILED"
            document.processing_error = err_msg
            await db.commit()
            await self.log_step(db, doc_id, "FAILED", f"Processing halted: {err_msg}", level="ERROR", details={"error_class": e.__class__.__name__})
            raise

    async def _run_pipeline(
        self,
        document: Document,
        db: AsyncSession,
        ocr_preference: str,
        vision_preference: str
    ) -> NormalizedDocument:
        doc_id = document.id
        file_path = document.file_path

        # 2. Stage: PROCESSING & File Validation
        document.status = "PROCESSING"
        await db.commit()
        await self.log_step(db, doc_id, "PROCESSING", "Commencing sovereign validation and structural inspection.")

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Source file not present in sovereign storage: {file_path}")

        file_size = os.path.getsize(file_path)
        if file_size == 0:
            raise ValueError("Document file is empty (0 bytes). Cannot process empty asset.")

        if file_size > settings.MAX_UPLOAD_SIZE_BYTES:
            raise ValueError(f"Oversized file ({file_size} bytes). Maximum allowed is {settings.MAX_UPLOAD_SIZE_BYTES} bytes.")

        # Inspect initial bytes for format validation
        with open(file_path, "rb") as f:
            header_chunk = f.read(4096)

        try:
            validate_file_format(document.filename, document.mime_type, header_chunk)
        except Exception as val_err:
            raise ValueError(f"Unsupported or corrupted file format: {str(val_err)}")

        _, ext = os.path.splitext(document.filename.lower())

        pages: List[PageRepresentation] = []
        visual_summaries: List[Dict[str, Any]] = []
        full_text = ""
        ocr_applied = False
        vision_applied = False
        asset_category = "DOCUMENT"

        # 3. Format-specific page and text extraction
        if ext == ".pdf":
            try:
                pages = await self.pdf_renderer.extract_pages_and_text(file_path)
            except CorruptedPdfError as c_err:
                raise ValueError(f"Corrupted PDF file detected: {str(c_err)}")
            except Exception as e:
                raise ValueError(f"PDF extraction failed: {str(e)}")

            total_pages = len(pages)
            scanned_pages = [p for p in pages if p.is_scanned]

            # Check if OCR required
            if scanned_pages:
                document.status = "OCR"
                await db.commit()
                await self.log_step(db, doc_id, "OCR", f"Scanned pages detected ({len(scanned_pages)} of {total_pages}). Engaging local OCR provider.")

                ocr_provider = OcrProviderFactory.get_provider(ocr_preference)
                for sp in scanned_pages:
                    try:
                        # Extract text via OCR
                        ocr_res = await ocr_provider.extract_text(file_path, mime_type="application/pdf")
                        sp.text = ocr_res.text
                        sp.ocr_applied = True
                        ocr_applied = True
                        await self.log_step(db, doc_id, "OCR", f"Page {sp.page_number} OCR completed ({ocr_res.words_detected} words).", details={"confidence": ocr_res.confidence, "latency_ms": ocr_res.execution_time_ms})
                    except Exception as ocr_err:
                        logger.warning(f"OCR degraded on page {sp.page_number}: {str(ocr_err)}")
                        await self.log_step(db, doc_id, "OCR", f"OCR degraded on Page {sp.page_number}: {str(ocr_err)}", level="WARNING")
                        sp.text = f"[Scanned page {sp.page_number} - OCR extraction degraded: {str(ocr_err)}]"

            # Check if Vision required (diagrams / technical drawings)
            pages_with_visuals = [p for p in pages if p.visual_elements or p.has_images]
            if pages_with_visuals:
                document.status = "VISION"
                await db.commit()
                await self.log_step(db, doc_id, "VISION", f"Visual components detected on {len(pages_with_visuals)} page(s). Running local vision analysis.")

                vision_provider = VisionProviderFactory.get_provider(vision_preference)
                try:
                    vis_res = await vision_provider.analyze_image(file_path, mime_type="application/pdf", prompt=f"Analyze PDF visual diagram in {document.title}")
                    vision_applied = True
                    asset_category = vis_res.category
                    visual_summaries.append({
                        "category": vis_res.category,
                        "description": vis_res.description,
                        "labels": vis_res.detected_labels,
                        "confidence": vis_res.confidence
                    })
                    await self.log_step(db, doc_id, "VISION", f"Vision analysis complete: Identified as {vis_res.category}.", details={"labels": vis_res.detected_labels})
                except Exception as vis_err:
                    await self.log_step(db, doc_id, "VISION", f"Vision analysis skipped or unavailable: {str(vis_err)}", level="WARNING")

            full_text = "\n\n".join(f"--- Page {p.page_number} ---\n{p.text}" for p in pages)

        elif ext in [".png", ".jpg", ".jpeg"]:
            # Image asset: Run OCR + Vision analysis
            document.status = "OCR"
            await db.commit()
            await self.log_step(db, doc_id, "OCR", f"Image asset detected ({ext}). Running local OCR extraction.")

            ocr_provider = OcrProviderFactory.get_provider(ocr_preference)
            try:
                ocr_res = await ocr_provider.extract_text(file_path, mime_type=document.mime_type)
                img_text = ocr_res.text
                ocr_applied = True
                await self.log_step(db, doc_id, "OCR", f"Optical text recognition succeeded ({ocr_res.words_detected} words).", details={"confidence": ocr_res.confidence})
            except Exception as ocr_err:
                await self.log_step(db, doc_id, "OCR", f"Local OCR failed: {str(ocr_err)}", level="WARNING")
                img_text = f"[Image Asset OCR unavailable: {str(ocr_err)}]"

            # Vision analysis for diagrams, engineering drawings, photographed docs
            document.status = "VISION"
            await db.commit()
            await self.log_step(db, doc_id, "VISION", "Running local multimodal vision inspection (diagram / drawing analysis).")

            vision_provider = VisionProviderFactory.get_provider(vision_preference)
            try:
                vis_res = await vision_provider.analyze_image(file_path, mime_type=document.mime_type, prompt=f"Classify and describe this technical asset: {document.title}")
                vision_applied = True
                asset_category = vis_res.category
                visual_summaries.append({
                    "category": vis_res.category,
                    "description": vis_res.description,
                    "labels": vis_res.detected_labels,
                    "bounding_boxes": vis_res.bounding_boxes,
                    "confidence": vis_res.confidence
                })
                await self.log_step(db, doc_id, "VISION", f"Multimodal analysis concluded: {vis_res.category}.", details={"labels": vis_res.detected_labels})
            except Exception as vis_err:
                await self.log_step(db, doc_id, "VISION", f"Vision inspection unavailable: {str(vis_err)}", level="WARNING")

            pages = [PageRepresentation(
                page_number=1,
                text=img_text,
                has_images=True,
                is_scanned=True,
                ocr_applied=ocr_applied,
                visual_elements=[VisualElement(element_type=asset_category.lower(), description=visual_summaries[0]["description"] if visual_summaries else "Visual artifact", page_number=1)]
            )]
            full_text = f"[VISUAL SUMMARY: {asset_category}]\n{visual_summaries[0]['description'] if visual_summaries else ''}\n\n[EXTRACTED TEXT]:\n{img_text}"

        elif ext in [".docx", ".xlsx", ".pptx"]:
            await self.log_step(db, doc_id, "PROCESSING", f"Unpacking OpenXML archive ({ext}).")
            if not zipfile.is_zipfile(file_path):
                raise ValueError("Corrupted OpenXML archive: file is not a valid zip container.")

            with zipfile.ZipFile(file_path, "r") as z:
                import re
                if ext == ".docx":
                    xml_targets = ["word/document.xml"]
                elif ext == ".xlsx":
                    xml_targets = ["xl/sharedStrings.xml"] + [n for n in z.namelist() if n.startswith("xl/worksheets/sheet")]
                else:  # .pptx
                    xml_targets = sorted([n for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")])

                extracted_parts = []
                for xml_target in xml_targets:
                    if xml_target in z.namelist():
                        raw_xml = z.read(xml_target).decode("utf-8", errors="replace")
                        clean_text = re.sub(r"<[^>]+>", " ", raw_xml)
                        clean_text = re.sub(r"\s+", " ", clean_text).strip()
                        if clean_text:
                            extracted_parts.append(clean_text)

                if extracted_parts:
                    full_text = "\n\n".join(extracted_parts)
                else:
                    full_text = f"OpenXML archive verified without standard textual stream: {document.filename}"

            pages = [PageRepresentation(
                page_number=1,
                text=full_text,
                has_images=False,
                is_scanned=False,
                ocr_applied=False
            )]

        elif ext in [".txt", ".csv", ".json", ".md"]:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                full_text = f.read()

            pages = [PageRepresentation(
                page_number=1,
                text=full_text,
                has_images=False,
                is_scanned=False,
                ocr_applied=False
            )]

        elif ext in [".doc", ".xls", ".ppt"]:
            # Legacy binary Microsoft Office formats: extract printable strings
            with open(file_path, "rb") as f:
                raw_bytes = f.read()
            import re
            strings = re.findall(b"[\x20-\x7E]{4,}", raw_bytes)
            full_text = "\n".join(s.decode("latin-1", errors="replace") for s in strings[:1000])
            pages = [PageRepresentation(
                page_number=1,
                text=full_text or f"Binary document indexed: {document.filename}",
                has_images=False,
                is_scanned=False,
                ocr_applied=False
            )]
        else:
            raise ValueError(f"Unsupported file format '{ext}'. Permitted formats: PDF, DOCX, DOC, XLSX, XLS, PPTX, PPT, CSV, TXT, JSON, MD, PNG, JPG, JPEG.")

        # Update document record with normalized properties
        document.total_pages = len(pages)
        document.ocr_applied = ocr_applied
        document.vision_applied = vision_applied
        document.asset_category = asset_category
        document.content_preview = full_text[:2000].strip() if full_text else "No extractable text content."
        if visual_summaries:
            document.visual_summary = visual_summaries[0].get("description", "")
        document.processing_error = None
        await db.commit()

        # Build Normalized Document representation
        norm_doc = NormalizedDocument(
            document_id=doc_id,
            title=document.title,
            filename=document.filename,
            total_pages=len(pages),
            pages=pages,
            full_text=full_text,
            visual_summaries=visual_summaries,
            metadata={
                "classification": document.classification,
                "mime_type": document.mime_type,
                "file_size_bytes": document.file_size_bytes,
                "ocr_applied": ocr_applied,
                "vision_applied": vision_applied,
                "asset_category": asset_category
            }
        )

        return norm_doc

    async def retry_processing(
        self,
        document_id: str,
        db: AsyncSession,
        ocr_preference: str = "auto",
        vision_preference: str = "auto"
    ) -> NormalizedDocument:
        """
        Retry document processing after previous failure or stalled state.
        Clears previous processing error, adds retry audit logs, and restarts multimodal pipeline.
        """
        stmt = select(Document).where(Document.id == document_id)
        doc = (await db.execute(stmt)).scalar_one_or_none()
        if not doc:
            raise FileNotFoundError(f"Document {document_id} not found.")

        await self.log_step(db, document_id, "QUEUED", "Operator initiated pipeline retry.", level="INFO")
        doc.processing_error = None
        doc.status = "QUEUED"
        await db.commit()

        return await self.process_document(
            document=doc,
            db=db,
            ocr_preference=ocr_preference,
            vision_preference=vision_preference
        )

# Global singleton instance
multimodal_pipeline = SovereignMultimodalPipeline()
