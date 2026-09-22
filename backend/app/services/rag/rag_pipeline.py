import time
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.models.user import User
from backend.app.models.document import Document
from backend.app.services.multimodal.base import NormalizedDocument
from backend.app.services.multimodal.multimodal_pipeline import multimodal_pipeline
from backend.app.services.rag.chunker import chunker, ChunkData
from backend.app.services.rag.embedding_provider import EmbeddingProviderFactory, LocalEmbeddingProvider
from backend.app.services.rag.vector_store import vector_store
from backend.app.services.rag.retriever import grounded_retriever, RetrievedChunk
from backend.app.services.model_router import model_router

logger = logging.getLogger("kelvrin.rag_pipeline")

@dataclass
class Citation:
    document_id: str
    document_title: str
    filename: str
    page_number: int
    chunk_index: int
    similarity_score: float
    excerpt: str

@dataclass
class GroundedQueryResult:
    query: str
    answer: str
    status: str  # EVIDENCE_FOUND or INSUFFICIENT_EVIDENCE
    evidence: List[Dict[str, Any]]
    citations: List[Citation]
    model_used: str
    routing_reasoning: str
    latency_ms: float
    retrieval_params: Dict[str, Any]

class SovereignRagPipeline:
    """
    Sovereign Knowledge Base and RAG Pipeline (Phase 9).
    Orchestrates:
      Document -> extraction -> cleaning -> chunking -> local embedding model -> vector database
               -> metadata -> retrieval -> local LLM
    Enforces truthfulness: distinguishes retrieved evidence, model-generated answer, and insufficient evidence.
    Zero hallucinated citations. 100% on-premises sovereign execution.
    """
    def __init__(self, embedding_provider: Optional[LocalEmbeddingProvider] = None):
        self.embedding_provider = embedding_provider or EmbeddingProviderFactory.get_provider()

    async def index_document(
        self,
        document: Document,
        norm_doc: NormalizedDocument,
        db: AsyncSession
    ) -> int:
        """
        Chunk and embed normalized document into the local vector database.
        Transitions status: INDEXING -> READY.
        """
        doc_id = document.id

        # 1. Update status to INDEXING
        document.status = "INDEXING"
        await db.commit()
        await multimodal_pipeline.log_step(db, doc_id, "INDEXING", f"Initiating semantic chunking and local vector embedding for '{document.title}'.")

        try:
            # 2. Structural Chunking
            chunks = chunker.chunk_document(norm_doc)
            chunk_texts = [c.content for c in chunks]

            await multimodal_pipeline.log_step(
                db, doc_id, "INDEXING",
                f"Generated {len(chunks)} structural text chunks across {norm_doc.total_pages} page(s).",
                details={"chunk_count": len(chunks), "total_pages": norm_doc.total_pages}
            )

            # 3. Local Dense Vector Embeddings (No external APIs)
            embeddings = await self.embedding_provider.embed_texts(chunk_texts)

            # 4. Store in Vector Database
            stored_count = await vector_store.store_chunks(
                document_id=doc_id,
                chunks=chunks,
                embeddings=embeddings,
                db=db
            )

            # 5. Finalize document record
            document.status = "READY"
            document.total_chunks = stored_count
            document.processing_error = None
            await db.commit()
            await db.refresh(document)

            await multimodal_pipeline.log_step(
                db, doc_id, "READY",
                f"Document successfully indexed into sovereign vector store ({stored_count} vectors). Ready for grounded RAG.",
                details={"vectors_stored": stored_count, "embedding_model": self.embedding_provider.model_name}
            )

            return stored_count

        except Exception as e:
            err_msg = f"Vector indexing failed: {str(e)}"
            logger.error(f"[INDEXING_ERROR] {doc_id}: {err_msg}")
            document.status = "FAILED"
            document.processing_error = err_msg
            await db.commit()
            await multimodal_pipeline.log_step(db, doc_id, "FAILED", err_msg, level="ERROR")
            raise

    async def reindex_document(self, document_id: str, db: AsyncSession) -> int:
        """Purge existing vectors and re-process/re-index a single document."""
        stmt = select(Document).where(Document.id == document_id)
        doc = (await db.execute(stmt)).scalar_one_or_none()
        if not doc:
            raise FileNotFoundError(f"Document {document_id} not found.")

        # Re-run multimodal pipeline to produce fresh NormalizedDocument
        norm_doc = await multimodal_pipeline.retry_processing(document_id, db)
        return await self.index_document(doc, norm_doc, db)

    async def reindex_all(
        self,
        db: AsyncSession,
        document_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Re-index all documents or specified subset."""
        stmt = select(Document)
        if document_ids:
            stmt = stmt.where(Document.id.in_(document_ids))
        docs = (await db.execute(stmt)).scalars().all()

        results = {"total": len(docs), "succeeded": 0, "failed": 0, "errors": []}
        for doc in docs:
            try:
                norm_doc = await multimodal_pipeline.process_document(doc, db)
                await self.index_document(doc, norm_doc, db)
                results["succeeded"] += 1
            except Exception as e:
                results["failed"] += 1
                results["errors"].append({"document_id": doc.id, "error": str(e)})

        return results

    async def search_and_answer(
        self,
        query: str,
        current_user: User,
        db: AsyncSession,
        top_k: int = 5,
        similarity_threshold: float = 0.5,
        hybrid_search: bool = True,
        document_ids: Optional[List[str]] = None,
        classification_filter: Optional[str] = None,
        model_override: Optional[str] = None
    ) -> GroundedQueryResult:
        """
        Execute Grounded Question Answering with strict evidence discrimination:
        1. Retrieve relevant chunks using dense vector + lexical hybrid retrieval.
        2. Evaluate evidence:
           - If 0 chunks found or all below threshold: return INSUFFICIENT_EVIDENCE notice.
           - If chunks found: synthesize response grounded strictly in retrieved chunks.
        3. Never fabricate citations. Citations are verified against exact chunk metadata.
        """
        start_time = time.perf_counter()
        retrieval_params = {
            "top_k": top_k,
            "similarity_threshold": similarity_threshold,
            "hybrid_search": hybrid_search,
            "document_ids": document_ids,
            "classification_filter": classification_filter
        }

        # 1. Retrieve relevant chunks
        chunks: List[RetrievedChunk] = await grounded_retriever.retrieve(
            query=query,
            current_user=current_user,
            db=db,
            top_k=top_k,
            similarity_threshold=similarity_threshold,
            hybrid_search=hybrid_search,
            document_ids=document_ids,
            classification_filter=classification_filter
        )

        # 2. Case: INSUFFICIENT EVIDENCE
        if not chunks:
            elapsed = (time.perf_counter() - start_time) * 1000.0
            return GroundedQueryResult(
                query=query,
                answer="The provided knowledge base documents do not contain sufficient evidence to answer this question.",
                status="INSUFFICIENT_EVIDENCE",
                evidence=[],
                citations=[],
                model_used="sovereign-grounding-gate",
                routing_reasoning="Zero chunks met the minimum similarity threshold or operator clearance. Hallucination prohibited.",
                latency_ms=round(elapsed, 2),
                retrieval_params=retrieval_params
            )

        # 3. Format Evidence Context
        evidence_list = []
        citations_list = []
        context_passages = []

        for idx, c in enumerate(chunks, 1):
            evidence_entry = {
                "chunk_id": c.chunk_id,
                "document_id": c.document_id,
                "document_title": c.document_title,
                "filename": c.filename,
                "page_number": c.page_number,
                "chunk_index": c.chunk_index,
                "similarity_score": c.similarity_score,
                "content": c.content,
                "classification": c.classification
            }
            evidence_list.append(evidence_entry)

            citations_list.append(Citation(
                document_id=c.document_id,
                document_title=c.document_title,
                filename=c.filename,
                page_number=c.page_number,
                chunk_index=c.chunk_index,
                similarity_score=c.similarity_score,
                excerpt=c.content[:200]
            ))

            context_passages.append(
                f"--- EVIDENCE [{idx}] ---\n"
                f"Document: {c.document_title} ({c.filename})\n"
                f"Page: {c.page_number} | Chunk #{c.chunk_index} | Relevance Score: {c.similarity_score}\n"
                f"Content:\n{c.content}\n"
            )

        grounded_context = (
            "You are KELVRIN Sovereign Grounded AI Assistant operating strictly on-premises.\n"
            "Answer the operator's query strictly and solely using the retrieved evidence passages below.\n"
            "Rules:\n"
            "1. Base your answer completely on the provided evidence passages.\n"
            "2. If the passages do not contain the answer, say: 'The provided documents do not contain sufficient evidence to answer this question.'\n"
            "3. Cite the source document title and page number for each key fact stated.\n"
            "4. NEVER fabricate citations or facts outside of the evidence.\n\n"
            + "\n".join(context_passages)
        )

        # 4. Synthesize answer via local LLM router
        router_res = await model_router.route_and_execute(
            prompt=query,
            system_prompt=grounded_context,
            override_model_id=model_override,
            db=db,
            current_user=current_user
        )

        elapsed = (time.perf_counter() - start_time) * 1000.0

        return GroundedQueryResult(
            query=query,
            answer=router_res["text"],
            status="EVIDENCE_FOUND",
            evidence=evidence_list,
            citations=citations_list,
            model_used=router_res["model_id"],
            routing_reasoning=router_res["routing_reasoning"],
            latency_ms=round(elapsed, 2),
            retrieval_params=retrieval_params
        )

# Global singleton instance
rag_pipeline = SovereignRagPipeline()
