"""
Sovereign Document Service Layer.
Encapsulates file ingestion, magic byte verification, hash computation,
pipeline triggering, and serialization for enclave documents.
"""
import base64
import hashlib
import logging
import os
import uuid
from typing import Optional, Tuple
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.core.config import settings
from backend.app.core.document_security import (
    sanitize_filename,
    validate_file_format,
    validate_file_size,
    assert_path_confined,
    FORMAT_CONFIG
)
from backend.app.core.tenant import authorize_tenant_access
from backend.app.core.rbac import record_audit_log
from backend.app.models.user import User
from backend.app.models.document import Document
from backend.app.schemas.document import DocumentCreate, DocumentOut
from backend.app.services.multimodal.multimodal_pipeline import multimodal_pipeline
from backend.app.services.rag.rag_pipeline import rag_pipeline

logger = logging.getLogger("kelvrin.services.document")

VALID_CLASSIFICATIONS = {"UNCLASSIFIED", "INTERNAL", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"}

def doc_to_out(doc: Document, uploader: Optional[User] = None) -> DocumentOut:
    """Serializes a Document model to the DocumentOut schema."""
    owner_name = uploader.full_name if uploader else None
    owner_email = uploader.email if uploader else None

    return DocumentOut(
        id=doc.id,
        title=doc.title,
        filename=doc.filename,
        file_size_bytes=doc.file_size_bytes,
        mime_type=doc.mime_type,
        sha256_hash=doc.sha256_hash,
        classification=doc.classification,
        status=doc.status,
        ocr_applied=getattr(doc, "ocr_applied", False),
        vision_applied=getattr(doc, "vision_applied", False),
        total_pages=doc.total_pages or 1,
        total_chunks=doc.total_chunks or 0,
        uploaded_by=doc.uploaded_by,
        owner_name=owner_name,
        owner_email=owner_email,
        content_preview=doc.content_preview,
        visual_summary=getattr(doc, "visual_summary", None),
        asset_category=getattr(doc, "asset_category", None),
        created_at=doc.created_at.isoformat() if hasattr(doc.created_at, "isoformat") else str(doc.created_at),
        updated_at=doc.updated_at.isoformat() if hasattr(doc.updated_at, "isoformat") and doc.updated_at else None
    )

async def assert_document_access(doc: Document, current_user: User, db: Optional[AsyncSession] = None):
    """Guarantees strict multi-tenant isolation across company codes via centralized authorization."""
    authorize_tenant_access(doc, current_user)

async def ingest_uploaded_file(
    file: UploadFile,
    title: Optional[str],
    classification: str,
    current_user: User,
    db: AsyncSession
) -> Document:
    """Handles streaming upload, file validation, disk confinement, deduplication, and DB record creation."""
    safe_filename = sanitize_filename(file.filename or "uploaded_file.bin")

    header_chunk = await file.read(4096)
    if not header_chunk:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty"
        )

    ext, canonical_mime, _ = validate_file_format(safe_filename, file.content_type, header_chunk)

    doc_id = str(uuid.uuid4())
    storage_name = f"{doc_id}{ext}"
    target_path = os.path.join(settings.absolute_storage_path, storage_name)
    assert_path_confined(target_path, settings.absolute_storage_path)

    hasher = hashlib.sha256()
    hasher.update(header_chunk)
    total_bytes = len(header_chunk)

    try:
        with open(target_path, "wb") as f:
            f.write(header_chunk)
            while True:
                chunk = await file.read(65536)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
                    status_code = getattr(status, "HTTP_413_CONTENT_TOO_LARGE", 413)
                    raise HTTPException(
                        status_code=status_code,
                        detail=f"File exceeds maximum permissible upload size of {settings.MAX_UPLOAD_SIZE_BYTES / (1024 * 1024):.1f} MB"
                    )
                hasher.update(chunk)
                f.write(chunk)
    except HTTPException:
        if os.path.exists(target_path):
            os.remove(target_path)
        raise
    except Exception as e:
        if os.path.exists(target_path):
            os.remove(target_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist document to sovereign disk: {str(e)}"
        )

    sha256_hash = hasher.hexdigest()

    stmt_dup = select(Document).where(Document.sha256_hash == sha256_hash)
    existing = (await db.execute(stmt_dup)).scalar_one_or_none()
    if existing:
        if os.path.exists(target_path):
            os.remove(target_path)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A document with identical SHA-256 hash already exists in sovereign storage"
        )

    resolved_title = (title or "").strip()
    if not resolved_title:
        base_title, _ = os.path.splitext(safe_filename)
        resolved_title = base_title.replace("_", " ").title()

    doc = Document(
        id=doc_id,
        title=resolved_title,
        filename=safe_filename,
        file_path=target_path,
        storage_name=storage_name,
        file_size_bytes=total_bytes,
        mime_type=canonical_mime,
        sha256_hash=sha256_hash,
        classification=classification.upper(),
        status="PROCESSING",
        uploaded_by=current_user.id,
        company_code=getattr(current_user, "company_code", None)
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    try:
        norm_doc = await multimodal_pipeline.process_document(doc, db)
        await rag_pipeline.index_document(doc, norm_doc, db)
    except Exception as e:
        logger.error(f"[DOCUMENTS] Background processing failed for uploaded doc {doc.id}: {e}", exc_info=True)

    await record_audit_log(
        db,
        action="DOC_UPLOAD",
        resource_type="document",
        actor=current_user,
        resource_id=doc.id,
        details={"title": doc.title, "filename": doc.filename, "size": total_bytes, "sha256": sha256_hash}
    )
    await db.commit()

    return doc

async def ingest_programmatic_document(
    payload: DocumentCreate,
    current_user: User,
    db: AsyncSession
) -> Document:
    """Strictly validates and ingests programmatic document payloads."""
    norm_classification = (payload.classification or "INTERNAL").upper()
    if norm_classification not in VALID_CLASSIFICATIONS:
        allowed_classes = ", ".join(sorted(VALID_CLASSIFICATIONS))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid classification '{payload.classification}'. Allowed classifications: {allowed_classes}"
        )

    validate_file_size(payload.file_size_bytes)
    safe_name = sanitize_filename(payload.filename)

    _, ext = os.path.splitext(safe_name.lower())
    if not ext or ext not in FORMAT_CONFIG:
        allowed = ", ".join(sorted(FORMAT_CONFIG.keys()))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed formats: {allowed}"
        )

    config = FORMAT_CONFIG[ext]
    canonical_mime = config["mime_types"][0]
    if payload.mime_type and payload.mime_type != "application/octet-stream":
        norm_mime = payload.mime_type.lower().split(";")[0].strip()
        if norm_mime not in config["mime_types"] and "octet-stream" not in norm_mime:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"MIME type mismatch: Declared '{norm_mime}' does not match expected for extension '{ext}'"
            )

    target_path = payload.file_path
    sha256_hash = payload.sha256_hash
    total_bytes = payload.file_size_bytes

    if payload.content_base64:
        try:
            content_bytes = base64.b64decode(payload.content_base64)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid base64 encoding for document content"
            )
        if not content_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty"
            )
        validate_file_size(len(content_bytes))
        header_chunk = content_bytes[:4096]
        ext, canonical_mime, _ = validate_file_format(safe_name, payload.mime_type, header_chunk)

        doc_id = str(uuid.uuid4())
        storage_name = f"{doc_id}{ext}"
        target_path = os.path.join(settings.absolute_storage_path, storage_name)
        assert_path_confined(target_path, settings.absolute_storage_path)
        with open(target_path, "wb") as f:
            f.write(content_bytes)

        computed_sha = hashlib.sha256(content_bytes).hexdigest()
        if sha256_hash and sha256_hash != computed_sha:
            if os.path.exists(target_path):
                os.remove(target_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"SHA-256 hash mismatch: Provided '{sha256_hash}' does not match computed '{computed_sha}'"
            )
        sha256_hash = computed_sha
        total_bytes = len(content_bytes)

    elif payload.file_path and os.path.exists(payload.file_path):
        assert_path_confined(payload.file_path, settings.absolute_storage_path)
        file_size = os.path.getsize(payload.file_path)
        if file_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty"
            )
        validate_file_size(file_size)
        with open(payload.file_path, "rb") as f:
            header_chunk = f.read(4096)
        if not header_chunk:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty"
            )
        ext, canonical_mime, _ = validate_file_format(safe_name, payload.mime_type, header_chunk)
        storage_name = os.path.basename(payload.file_path)
        if not sha256_hash:
            with open(payload.file_path, "rb") as f:
                sha256_hash = hashlib.sha256(f.read()).hexdigest()
        total_bytes = file_size
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document content (content_base64) or pre-staged file in sovereign vault required for format and magic byte validation."
        )

    stmt = select(Document).where(Document.sha256_hash == sha256_hash)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        if payload.content_base64 and os.path.exists(target_path):
            os.remove(target_path)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A document with identical SHA-256 hash already exists in sovereign storage"
        )

    doc_id = str(uuid.uuid4())
    doc = Document(
        id=doc_id,
        title=payload.title,
        filename=safe_name,
        file_path=target_path,
        storage_name=os.path.basename(target_path),
        file_size_bytes=total_bytes,
        mime_type=canonical_mime,
        sha256_hash=sha256_hash,
        classification=norm_classification,
        status="READY",
        uploaded_by=current_user.id,
        company_code=getattr(current_user, "company_code", None)
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    if os.path.exists(target_path):
        try:
            norm_doc = await multimodal_pipeline.process_document(doc, db)
            await rag_pipeline.index_document(doc, norm_doc, db)
        except Exception as e:
            logger.error(f"[DOCUMENTS] Processing error for document {doc.id}: {e}", exc_info=True)

    await record_audit_log(
        db,
        action="DOC_UPLOAD",
        resource_type="document",
        actor=current_user,
        resource_id=doc.id,
        details={"title": doc.title, "filename": doc.filename, "size": total_bytes, "sha256": doc.sha256_hash}
    )
    await db.commit()

    return doc
