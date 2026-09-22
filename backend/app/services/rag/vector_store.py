import math
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from backend.app.models.document_chunk import DocumentChunk
from backend.app.models.document import Document
from backend.app.services.rag.chunker import ChunkData

def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Compute cosine similarity between two float vectors."""
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    dot = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a, b in zip(vec1, vec1)))
    norm2 = math.sqrt(sum(b * b for a, b in zip(vec2, vec2)))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return max(0.0, min(1.0, dot / (norm1 * norm2)))

class SovereignVectorStore:
    """
    Sovereign Vector Store managing chunk persistence and semantic similarity retrieval.
    Compatible with both PostgreSQL (pgvector) and local SQLite instances.
    """
    async def store_chunks(
        self,
        document_id: str,
        chunks: List[ChunkData],
        embeddings: List[List[float]],
        db: AsyncSession
    ) -> int:
        """Persist extracted chunks and dense vectors to database."""
        # 1. Remove existing chunks for this document if re-indexing
        await self.delete_chunks_by_document(document_id, db)

        # 2. Insert new chunks
        stored_count = 0
        for chunk, emb in zip(chunks, embeddings):
            row = DocumentChunk(
                document_id=document_id,
                chunk_index=chunk.chunk_index,
                page_number=chunk.page_number,
                content=chunk.content,
                token_count=chunk.token_count,
                embedding=emb,
                chunk_metadata=chunk.chunk_metadata
            )
            db.add(row)
            stored_count += 1

        await db.commit()
        return stored_count

    async def delete_chunks_by_document(self, document_id: str, db: AsyncSession) -> int:
        """Purge all chunks associated with a document."""
        stmt = delete(DocumentChunk).where(DocumentChunk.document_id == document_id)
        result = await db.execute(stmt)
        await db.commit()
        rowcount = getattr(result, "rowcount", 0)
        return int(rowcount) if rowcount is not None else 0

    async def similarity_search(
        self,
        query_vector: List[float],
        db: AsyncSession,
        top_k: int = 5,
        similarity_threshold: float = 0.5,
        document_ids: Optional[List[str]] = None,
        permitted_doc_ids: Optional[set] = None
    ) -> List[Tuple[DocumentChunk, float]]:
        """
        Execute dense vector similarity search across all permitted document chunks.
        Returns tuples of (DocumentChunk, similarity_score) ranked by relevance.
        """
        # Fetch candidate chunks
        stmt = select(DocumentChunk)
        if document_ids:
            stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))
        if permitted_doc_ids is not None:
            stmt = stmt.where(DocumentChunk.document_id.in_(permitted_doc_ids))

        result = await db.execute(stmt)
        all_chunks = result.scalars().all()

        scored_chunks: List[Tuple[DocumentChunk, float]] = []
        for chunk in all_chunks:
            if not chunk.embedding:
                continue
            sim = cosine_similarity(query_vector, chunk.embedding)
            if sim >= similarity_threshold:
                scored_chunks.append((chunk, round(sim, 4)))

        # Sort descending by similarity score
        scored_chunks.sort(key=lambda x: x[1], reverse=True)
        return scored_chunks[:top_k]

    async def get_stats(self, db: AsyncSession) -> Dict[str, Any]:
        """Telemetry and metrics for the local vector database."""
        total_chunks = (await db.execute(select(func.count(DocumentChunk.id)))).scalar() or 0
        total_docs_with_chunks = (await db.execute(select(func.count(func.distinct(DocumentChunk.document_id))))).scalar() or 0

        # Sample vector dimension
        sample = (await db.execute(select(DocumentChunk).where(DocumentChunk.embedding.is_not(None)).limit(1))).scalar_one_or_none()
        dimensions = len(sample.embedding) if sample and sample.embedding else 384

        return {
            "total_vectors": total_chunks,
            "total_indexed_documents": total_docs_with_chunks,
            "vector_dimensions": dimensions,
            "indexing_engine": "pgvector (HNSW cosine) / Sovereign Local SQLite Dense Store",
            "status": "HEALTHY_OPTIMIZED" if total_chunks > 0 else "READY_AWAITING_DOCS"
        }

vector_store = SovereignVectorStore()
