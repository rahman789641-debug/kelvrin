import re
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Set
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.models.user import User, normalize_role_name
from backend.app.models.document import Document, DocumentPermission
from backend.app.models.document_chunk import DocumentChunk
from backend.app.services.rag.embedding_provider import LocalEmbeddingProvider, EmbeddingProviderFactory
from backend.app.services.rag.vector_store import vector_store

@dataclass
class RetrievedChunk:
    chunk_id: str
    document_id: str
    document_title: str
    filename: str
    page_number: int
    chunk_index: int
    content: str
    similarity_score: float
    token_count: int
    classification: str

class GroundedRetriever:
    """
    Sovereign Grounded Retriever combining dense semantic search, lexical matching,
    and strict RBAC document permission gating.
    """
    def __init__(self, embedding_provider: Optional[LocalEmbeddingProvider] = None):
        self.embedding_provider = embedding_provider or EmbeddingProviderFactory.get_provider()

    async def retrieve(
        self,
        query: str,
        current_user: User,
        db: AsyncSession,
        top_k: int = 5,
        similarity_threshold: float = 0.5,
        hybrid_search: bool = True,
        document_ids: Optional[List[str]] = None,
        classification_filter: Optional[str] = None
    ) -> List[RetrievedChunk]:
        if not query or not query.strip():
            return []

        # 1. Resolve permitted document IDs for this operator (RBAC enforcement)
        permitted_doc_ids = await self._resolve_permitted_documents(current_user, classification_filter, db)
        if not permitted_doc_ids:
            return []

        # If caller specified target document_ids, intersect with permitted
        target_ids = permitted_doc_ids
        if document_ids:
            target_ids = target_ids.intersection(set(document_ids))
            if not target_ids:
                return []

        # 2. Compute query dense embedding locally
        query_vec = await self.embedding_provider.embed_query(query)

        # 3. Dense vector search
        # If hybrid search enabled, search with slightly lower threshold to allow lexical re-ranking
        search_thresh = max(0.0, similarity_threshold - 0.15) if hybrid_search else similarity_threshold
        raw_candidates = await vector_store.similarity_search(
            query_vector=query_vec,
            db=db,
            top_k=top_k * 3,
            similarity_threshold=search_thresh,
            permitted_doc_ids=target_ids
        )

        if not raw_candidates:
            return []

        # 4. Fetch parent document metadata (title, filename, classification)
        doc_ids_needed = {c.document_id for c, _ in raw_candidates}
        d_stmt = select(Document).where(Document.id.in_(doc_ids_needed))
        docs = (await db.execute(d_stmt)).scalars().all()
        doc_map = {d.id: d for d in docs}

        # 5. Hybrid re-ranking (Vector Semantic + Lexical Match)
        query_terms = set(re.findall(r"\w+", query.lower()))
        scored_results: List[RetrievedChunk] = []

        for chunk, sem_score in raw_candidates:
            parent_doc = doc_map.get(chunk.document_id)
            if not parent_doc:
                continue

            # Only ready documents participate in retrieval
            if parent_doc.status != "READY":
                continue

            final_score = sem_score
            if hybrid_search and query_terms:
                chunk_terms = set(re.findall(r"\w+", chunk.content.lower()))
                term_overlap = len(query_terms.intersection(chunk_terms))
                keyword_score = min(1.0, term_overlap / max(1, len(query_terms)))
                # 70% semantic, 30% lexical keyword overlap
                final_score = round(0.7 * sem_score + 0.3 * keyword_score, 4)

            if final_score >= similarity_threshold:
                scored_results.append(RetrievedChunk(
                    chunk_id=chunk.id,
                    document_id=chunk.document_id,
                    document_title=parent_doc.title,
                    filename=parent_doc.filename,
                    page_number=chunk.page_number,
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    similarity_score=final_score,
                    token_count=chunk.token_count,
                    classification=parent_doc.classification
                ))

        # Sort descending by final combined score
        scored_results.sort(key=lambda x: x.similarity_score, reverse=True)
        return scored_results[:top_k]

    async def _resolve_permitted_documents(
        self,
        user: User,
        classification_filter: Optional[str],
        db: AsyncSession
    ) -> Set[str]:
        """Verify user RBAC clearances and return set of permitted document IDs."""
        user_role = normalize_role_name(user.role)
        perms = set(user.permissions or [])

        # Super Admin has access to all documents
        is_super_admin = (user_role == "SUPER_ADMIN" or "*" in perms)

        stmt = select(Document.id, Document.uploaded_by, Document.classification)
        if classification_filter and classification_filter.upper() != "ALL":
            stmt = stmt.where(Document.classification == classification_filter.upper())

        rows = (await db.execute(stmt)).all()

        permitted = set()
        for doc_id, uploader_id, classification in rows:
            if is_super_admin or uploader_id == user.id:
                permitted.add(doc_id)
            elif "documents.read" in perms or "documents:read" in perms:
                # Regular user with documents.read: check if classification clearance applies
                # Restricted/Secret classifications require admin or ownership
                if classification in ["RESTRICTED", "TOP_SECRET", "SECRET"] and user_role not in ["AI_ADMIN", "APPROVER"]:
                    continue
                permitted.add(doc_id)

        return permitted

grounded_retriever = GroundedRetriever()
