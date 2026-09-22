from datetime import datetime, timezone
import math
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_

from backend.app.core.auth import get_current_user
from backend.app.core.rbac import require_permission, record_audit_log
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.models.document import Document
from backend.app.models.document_chunk import DocumentChunk
from backend.app.schemas.common import PaginatedResponse
from backend.app.schemas.document import DocumentChunkOut
from backend.app.schemas.knowledge import (
    KnowledgeSummaryOut,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    RetrievedEvidenceOut,
    CitationOut,
    KnowledgeReindexRequest,
    KnowledgeReindexResponse
)
from backend.app.services.rag.vector_store import vector_store
from backend.app.services.rag.rag_pipeline import rag_pipeline
from backend.app.services.rag.embedding_provider import EmbeddingProviderFactory

router = APIRouter(prefix="/knowledge", tags=["Knowledge Base & RAG Index"])

@router.get("/summary", response_model=KnowledgeSummaryOut)
async def get_knowledge_summary(
    current_user: User = Depends(require_permission("knowledge.read")),
    db: AsyncSession = Depends(get_db)
):
    """
    Live telemetry and vector storage statistics for the Sovereign Knowledge Base.
    """
    total_docs = (await db.execute(select(func.count(Document.id)))).scalar() or 0
    stats = await vector_store.get_stats(db)

    # Get latest document update timestamp
    latest_doc = (await db.execute(select(Document).order_by(Document.updated_at.desc()).limit(1))).scalar_one_or_none()
    last_updated = latest_doc.updated_at.isoformat() if latest_doc and latest_doc.updated_at else datetime.now(timezone.utc).isoformat()

    provider = EmbeddingProviderFactory.get_provider()

    return KnowledgeSummaryOut(
        collection_name="Sovereign Enterprise Vault",
        embedding_model=provider.model_name,
        vector_dimensions=provider.dimensions,
        total_documents=total_docs,
        total_vectors=stats.get("total_vectors", 0),
        indexing_engine=stats.get("indexing_engine", "pgvector / Local Dense Vector Store"),
        last_reindexed_at=last_updated,
        status=stats.get("status", "HEALTHY_OPTIMIZED")
    )

@router.get("/chunks", response_model=PaginatedResponse[DocumentChunkOut])
async def list_knowledge_chunks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: Optional[str] = Query(None, description="Search term across chunk text"),
    document_id: Optional[str] = Query(None, description="Filter chunks by document ID"),
    current_user: User = Depends(require_permission("knowledge.read")),
    db: AsyncSession = Depends(get_db)
):
    """
    Inspect raw chunked passages and positional metadata stored in the vector database.
    """
    query = select(DocumentChunk)
    if document_id:
        query = query.where(DocumentChunk.document_id == document_id)
    if q and q.strip():
        query = query.where(DocumentChunk.content.ilike(f"%{q.strip()}%"))

    count_stmt = select(func.count()).select_from(query.subquery())
    total_records = (await db.execute(count_stmt)).scalar() or 0
    total_pages = math.ceil(total_records / page_size) if total_records > 0 else 1

    stmt = query.order_by(DocumentChunk.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    chunks = (await db.execute(stmt)).scalars().all()

    items = [
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

    return PaginatedResponse[DocumentChunkOut](
        items=items,
        page=page,
        page_size=page_size,
        total_records=total_records,
        total_pages=total_pages
    )

@router.post("/search", response_model=KnowledgeSearchResponse)
async def search_knowledge_base(
    payload: KnowledgeSearchRequest,
    current_user: User = Depends(require_permission("knowledge.read")),
    db: AsyncSession = Depends(get_db)
):
    """
    Execute grounded RAG search across the sovereign knowledge base:
    1. Retrieve relevant chunks with configurable top_k, similarity cutoff, and hybrid re-ranking.
    2. Enforce strict RBAC document clearance.
    3. Explicitly distinguish: Retrieved Evidence vs Model-Generated Answer vs Insufficient Evidence.
    4. Never fabricate citations.
    """
    override = payload.model_id if payload.model_id and payload.model_id != "auto" else None

    result = await rag_pipeline.search_and_answer(
        query=payload.query,
        current_user=current_user,
        db=db,
        top_k=payload.top_k or 5,
        similarity_threshold=payload.similarity_threshold or 0.5,
        hybrid_search=payload.hybrid_search if payload.hybrid_search is not None else True,
        document_ids=payload.document_ids,
        classification_filter=payload.classification,
        model_override=override
    )

    await record_audit_log(
        db,
        action="KNOWLEDGE_RAG_SEARCH",
        resource_type="knowledge_base",
        actor=current_user,
        resource_id="sovereign_vault",
        details={
            "query": payload.query[:100],
            "status": result.status,
            "evidence_count": len(result.evidence),
            "latency_ms": result.latency_ms
        }
    )
    await db.commit()

    evidence_out = [
        RetrievedEvidenceOut(
            chunk_id=e["chunk_id"],
            document_id=e["document_id"],
            document_title=e["document_title"],
            filename=e["filename"],
            page_number=e["page_number"],
            chunk_index=e["chunk_index"],
            similarity_score=e["similarity_score"],
            content=e["content"],
            classification=e["classification"]
        ) for e in result.evidence
    ]

    citations_out = [
        CitationOut(
            document_id=c.document_id,
            document_title=c.document_title,
            filename=c.filename,
            page_number=c.page_number,
            chunk_index=c.chunk_index,
            similarity_score=c.similarity_score,
            excerpt=c.excerpt
        ) for c in result.citations
    ]

    return KnowledgeSearchResponse(
        query=result.query,
        answer=result.answer,
        status=result.status,
        evidence=evidence_out,
        citations=citations_out,
        model_used=result.model_used,
        routing_reasoning=result.routing_reasoning,
        latency_ms=result.latency_ms,
        retrieval_params=result.retrieval_params
    )

@router.post("/reindex", response_model=KnowledgeReindexResponse)
async def trigger_reindex(
    payload: Optional[KnowledgeReindexRequest] = None,
    current_user: User = Depends(require_permission("knowledge.manage")),
    db: AsyncSession = Depends(get_db)
):
    """
    Trigger full or document-scoped re-indexing of documents in the sovereign knowledge base.
    """
    doc_ids = payload.document_ids if payload else None
    res = await rag_pipeline.reindex_all(db, document_ids=doc_ids)

    await record_audit_log(
        db,
        action="KNOWLEDGE_REINDEX",
        resource_type="knowledge_base",
        actor=current_user,
        resource_id="sovereign_vault",
        details={"reindexed": res["succeeded"], "failed": res["failed"]}
    )
    await db.commit()

    return KnowledgeReindexResponse(
        success=res["failed"] == 0,
        message=f"Re-indexing complete: {res['succeeded']} documents synchronized in vector store.",
        reindexed_documents=res["succeeded"],
        failed_documents=res["failed"]
    )

@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge_document_vectors(
    doc_id: str,
    current_user: User = Depends(require_permission("knowledge.manage")),
    db: AsyncSession = Depends(get_db)
):
    """
    Purge all vector embeddings and chunks for a document from the knowledge base.
    """
    deleted_count = await vector_store.delete_chunks_by_document(doc_id, db)
    # Update document chunk counter
    stmt = select(Document).where(Document.id == doc_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if doc:
        doc.total_chunks = 0
        await db.commit()

    await record_audit_log(
        db,
        action="KNOWLEDGE_CHUNK_PURGE",
        resource_type="knowledge_base",
        actor=current_user,
        resource_id=doc_id,
        details={"purged_vectors": deleted_count}
    )
    await db.commit()
