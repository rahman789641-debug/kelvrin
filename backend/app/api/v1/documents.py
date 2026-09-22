"""
Sovereign Document Management API Endpoints.
Provides authenticated REST interfaces for listing, uploading, inspecting,
previewing, downloading, retrying, and purging enclave documents.
Business logic and storage operations are encapsulated in backend.app.services.document_service.
"""
import logging
import math
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from backend.app.core.config import settings
from backend.app.core.rbac import require_permission, record_audit_log
from backend.app.core.document_security import assert_path_confined
from backend.app.db.session import get_db
from backend.app.models.user import User, normalize_role_name
from backend.app.models.document import Document
from backend.app.models.document_chunk import DocumentChunk
from backend.app.models.document_processing_log import DocumentProcessingLog
from backend.app.models.audit import AuditLog
from backend.app.schemas.common import PaginatedResponse
from backend.app.schemas.document import (
    DocumentCreate,
    DocumentOut,
    DocumentDetailOut,
    DocumentPreviewOut,
    DocumentProcessingLogOut,
    DocumentChunkOut,
    DocumentRetryResponse
)
from backend.app.services.document_service import (
    doc_to_out,
    assert_document_access,
    ingest_uploaded_file,
    ingest_programmatic_document
)
from backend.app.services.multimodal.multimodal_pipeline import multimodal_pipeline
from backend.app.services.rag.rag_pipeline import rag_pipeline

logger = logging.getLogger("kelvrin.api.documents")

router = APIRouter(prefix="/documents", tags=["Document Management"])


@router.get("", response_model=PaginatedResponse[DocumentOut])
async def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: Optional[str] = Query(None, description="Search term across title and filename"),
    classification: Optional[str] = Query(None, description="Filter by classification"),
    status: Optional[str] = Query(None, description="Filter by status"),
    file_type: Optional[str] = Query(None, description="Filter by extension or mime"),
    current_user: User = Depends(require_permission("documents.read")),
    db: AsyncSession = Depends(get_db)
):
    """
    List sovereign documents with pagination, text search, classification, status, and format filtering.
    Strictly isolated by user company code.
    """
    query = select(Document)

    # Multi-tenant isolation by company code
    if getattr(current_user, "company_code", None):
        company_users = select(User.id).where(User.company_code == current_user.company_code)
        query = query.where(Document.uploaded_by.in_(company_users))

    # Text search
    if q and q.strip():
        search_pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                Document.title.ilike(search_pattern),
                Document.filename.ilike(search_pattern)
            )
        )

    # Classification filter
    if classification and classification.upper() != "ALL":
        query = query.where(Document.classification == classification.upper())

    # Status filter
    if status and status.upper() != "ALL":
        query = query.where(Document.status == status.upper())

    # File type / format filter
    if file_type and file_type.upper() != "ALL":
        ft = file_type.lower()
        if ft in ["pdf", ".pdf"]:
            query = query.where(Document.mime_type == "application/pdf")
        elif ft in ["docx", ".docx"]:
            query = query.where(Document.filename.ilike("%.docx"))
        elif ft in ["xlsx", ".xlsx"]:
            query = query.where(Document.filename.ilike("%.xlsx"))
        elif ft in ["txt", ".txt"]:
            query = query.where(Document.filename.ilike("%.txt"))
        elif ft in ["image", "images", "png", "jpg", "jpeg"]:
            query = query.where(Document.mime_type.ilike("image/%"))

    # Total count
    count_stmt = select(func.count()).select_from(query.subquery())
    total_records = (await db.execute(count_stmt)).scalar() or 0
    total_pages = math.ceil(total_records / page_size) if total_records > 0 else 1

    # Fetch page
    stmt = query.order_by(Document.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    docs = result.scalars().all()

    # Resolve owners for documents
    uploader_ids = {d.uploaded_by for d in docs if d.uploaded_by}
    user_map = {}
    if uploader_ids:
        u_stmt = select(User).where(User.id.in_(uploader_ids))
        users = (await db.execute(u_stmt)).scalars().all()
        user_map = {u.id: u for u in users}

    items = [doc_to_out(d, user_map.get(d.uploaded_by)) for d in docs]

    return PaginatedResponse[DocumentOut](
        items=items,
        page=page,
        page_size=page_size,
        total_records=total_records,
        total_pages=total_pages
    )


@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    classification: str = Form("INTERNAL"),
    current_user: User = Depends(require_permission("documents.upload")),
    db: AsyncSession = Depends(get_db)
):
    """
    Secure multipart document upload.
    Validates format, MIME type, magic byte signatures, and size.
    Saves file to on-premises sovereign vault with a UUID storage identifier.
    """
    doc = await ingest_uploaded_file(file, title, classification, current_user, db)
    return doc_to_out(doc, current_user)


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def create_document(
    payload: DocumentCreate,
    current_user: User = Depends(require_permission("documents.upload")),
    db: AsyncSession = Depends(get_db)
):
    """
    Programmatic document creation endpoint for automated workflows and integrations.
    Strictly validates classification, file size, safe filename, extension whitelist,
    magic byte signature, storage confinement, and multi-tenant company code isolation.
    """
    doc = await ingest_programmatic_document(payload, current_user, db)
    return doc_to_out(doc, current_user)


@router.get("/{doc_id}", response_model=DocumentDetailOut)
async def get_document(
    doc_id: str,
    current_user: User = Depends(require_permission("documents.read")),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve document details including owner info, structural metrics, preview snippet, and permissions.
    """
    stmt = select(Document).where(Document.id == doc_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await assert_document_access(doc, current_user, db)

    uploader = None
    if doc.uploaded_by:
        u_stmt = select(User).where(User.id == doc.uploaded_by)
        uploader = (await db.execute(u_stmt)).scalar_one_or_none()

    # Determine caller permissions on this specific document
    user_role = normalize_role_name(current_user.role)
    user_perms = set(current_user.permissions)
    is_owner = (doc.uploaded_by == current_user.id)
    can_delete = ("*" in user_perms or "documents.delete" in user_perms or "documents:write" in user_perms or user_role == "SUPER_ADMIN" or is_owner)

    perms_list = ["READ", "DOWNLOAD"]
    if can_delete:
        perms_list.append("DELETE")

    # Fetch recent audit activity for this document
    act_stmt = select(AuditLog).where(
        AuditLog.resource_id == doc.id
    ).order_by(AuditLog.timestamp.desc()).limit(10)
    audit_logs = (await db.execute(act_stmt)).scalars().all()

    activity = [
        {
            "action": a.action,
            "actor_email": a.actor_email,
            "timestamp": a.timestamp.isoformat() if hasattr(a.timestamp, "isoformat") else str(a.timestamp),
            "status": a.status
        } for a in audit_logs
    ]

    # Fetch recent processing logs
    logs_stmt = select(DocumentProcessingLog).where(
        DocumentProcessingLog.document_id == doc.id
    ).order_by(DocumentProcessingLog.created_at.desc()).limit(15)
    logs_result = (await db.execute(logs_stmt)).scalars().all()
    recent_logs = [
        DocumentProcessingLogOut(
            id=l.id,
            document_id=l.document_id,
            stage=l.stage,
            level=l.level,
            message=l.message,
            details=l.details or {},
            created_at=l.created_at.isoformat() if hasattr(l.created_at, "isoformat") else str(l.created_at)
        ) for l in logs_result
    ]

    base_out = doc_to_out(doc, uploader)
    return DocumentDetailOut(
        **base_out.model_dump(),
        processing_error=doc.processing_error,
        permissions=perms_list,
        activity=activity,
        recent_logs=recent_logs
    )


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: str,
    current_user: User = Depends(require_permission("documents.read")),
    db: AsyncSession = Depends(get_db)
):
    """
    Secure streaming document download with path confinement verification.
    """
    stmt = select(Document).where(Document.id == doc_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await assert_document_access(doc, current_user, db)

    # Verify physical file existence and path confinement
    if not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Physical document file missing from sovereign storage"
        )

    assert_path_confined(doc.file_path, settings.absolute_storage_path)

    # Record audit download event
    await record_audit_log(
        db,
        action="DOC_DOWNLOAD",
        resource_type="document",
        actor=current_user,
        resource_id=doc.id,
        details={"filename": doc.filename}
    )
    await db.commit()

    return FileResponse(
        path=doc.file_path,
        filename=doc.filename,
        media_type=doc.mime_type
    )


@router.get("/{doc_id}/preview", response_model=DocumentPreviewOut)
async def preview_document(
    doc_id: str,
    current_user: User = Depends(require_permission("documents.read")),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve document text preview snippet and structural metrics.
    """
    stmt = select(Document).where(Document.id == doc_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await assert_document_access(doc, current_user, db)

    return DocumentPreviewOut(
        id=doc.id,
        title=doc.title,
        filename=doc.filename,
        mime_type=doc.mime_type,
        file_size_bytes=doc.file_size_bytes,
        total_pages=doc.total_pages,
        total_chunks=doc.total_chunks,
        content_preview=doc.content_preview or "No preview content available.",
        status=doc.status
    )


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: str,
    current_user: User = Depends(require_permission("documents.delete")),
    db: AsyncSession = Depends(get_db)
):
    """
    Permanently purge document record from database and delete local physical file.
    """
    stmt = select(Document).where(Document.id == doc_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await assert_document_access(doc, current_user, db)

    # Remove physical file if present
    if doc.file_path and os.path.exists(doc.file_path):
        try:
            assert_path_confined(doc.file_path, settings.absolute_storage_path)
            os.remove(doc.file_path)
        except OSError as oe:
            logger.warning(f"[DOCUMENTS] Could not remove physical file '{doc.file_path}': {oe}")
        except HTTPException:
            raise

    await db.delete(doc)
    await record_audit_log(
        db,
        action="DOC_DELETE",
        resource_type="document",
        actor=current_user,
        resource_id=doc_id,
        details={"title": doc.title, "filename": doc.filename}
    )
    await db.commit()


@router.post("/{doc_id}/retry", response_model=DocumentRetryResponse)
async def retry_document_processing(
    doc_id: str,
    current_user: User = Depends(require_permission("documents.upload")),
    db: AsyncSession = Depends(get_db)
):
    """
    Retry multimodal extraction, OCR, and vector indexing after failure or stalled state.
    """
    stmt = select(Document).where(Document.id == doc_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await assert_document_access(doc, current_user, db)

    try:
        norm_doc = await multimodal_pipeline.retry_processing(doc_id, db)
        await rag_pipeline.index_document(doc, norm_doc, db)
        await record_audit_log(
            db,
            action="DOC_RETRY",
            resource_type="document",
            actor=current_user,
            resource_id=doc_id,
            details={"status": doc.status, "title": doc.title}
        )
        await db.commit()
        return DocumentRetryResponse(
            success=True,
            document_id=doc.id,
            status=doc.status,
            message=f"Document '{doc.title}' reprocessing and indexing completed successfully."
        )
    except Exception as e:
        await db.commit()
        return DocumentRetryResponse(
            success=False,
            document_id=doc.id,
            status=doc.status,
            message=f"Document reprocessing failed: {str(e)}"
        )


@router.get("/{doc_id}/logs", response_model=List[DocumentProcessingLogOut])
async def get_document_logs(
    doc_id: str,
    current_user: User = Depends(require_permission("documents.read")),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve chronological processing logs for a specific document.
    """
    stmt = select(Document).where(Document.id == doc_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await assert_document_access(doc, current_user, db)

    logs_stmt = select(DocumentProcessingLog).where(
        DocumentProcessingLog.document_id == doc_id
    ).order_by(DocumentProcessingLog.created_at.asc())
    logs = (await db.execute(logs_stmt)).scalars().all()
    return [
        DocumentProcessingLogOut(
            id=l.id,
            document_id=l.document_id,
            stage=l.stage,
            level=l.level,
            message=l.message,
            details=l.details or {},
            created_at=l.created_at.isoformat() if hasattr(l.created_at, "isoformat") else str(l.created_at)
        ) for l in logs
    ]


@router.get("/{doc_id}/chunks", response_model=List[DocumentChunkOut])
async def get_document_chunks(
    doc_id: str,
    current_user: User = Depends(require_permission("documents.read")),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve all vector chunks for a specific document.
    """
    stmt = select(Document).where(Document.id == doc_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await assert_document_access(doc, current_user, db)

    stmt_chunks = select(DocumentChunk).where(
        DocumentChunk.document_id == doc_id
    ).order_by(DocumentChunk.chunk_index.asc())
    chunks = (await db.execute(stmt_chunks)).scalars().all()
    return [
        DocumentChunkOut(
            id=c.id,
            document_id=c.document_id,
            chunk_index=c.chunk_index,
            page_number=c.page_number,
            content=c.content,
            token_count=c.token_count,
            chunk_metadata=c.chunk_metadata or {},
            created_at=c.created_at.isoformat() if hasattr(c.created_at, "isoformat") else str(c.created_at)
        ) for c in chunks
    ]
