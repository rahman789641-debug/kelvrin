from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class KnowledgeSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    collection_name: str = "Sovereign Enterprise Vault"
    embedding_model: str
    vector_dimensions: int
    total_documents: int
    total_vectors: int
    indexing_engine: str
    last_reindexed_at: str
    status: str

class KnowledgeSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Operator question for grounded RAG retrieval")
    top_k: Optional[int] = Field(5, ge=1, le=50, description="Maximum chunks to retrieve")
    similarity_threshold: Optional[float] = Field(0.5, ge=0.0, le=1.0, description="Minimum cosine similarity cutoff")
    hybrid_search: Optional[bool] = Field(True, description="Combine dense vector search with lexical keyword match")
    document_ids: Optional[List[str]] = Field(None, description="Filter search to specific documents")
    classification: Optional[str] = Field(None, description="Classification filter")
    model_id: Optional[str] = Field("auto", description="Model override for synthesis")

class RetrievedEvidenceOut(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    filename: str
    page_number: int
    chunk_index: int
    similarity_score: float
    content: str
    classification: str

class CitationOut(BaseModel):
    document_id: str
    document_title: str
    filename: str
    page_number: int
    chunk_index: int
    similarity_score: float
    excerpt: str

class KnowledgeSearchResponse(BaseModel):
    query: str
    answer: str
    status: str  # EVIDENCE_FOUND or INSUFFICIENT_EVIDENCE
    evidence: List[RetrievedEvidenceOut] = []
    citations: List[CitationOut] = []
    model_used: str
    routing_reasoning: str
    latency_ms: float
    retrieval_params: Dict[str, Any] = {}

class KnowledgeReindexRequest(BaseModel):
    document_ids: Optional[List[str]] = None

class KnowledgeReindexResponse(BaseModel):
    success: bool
    message: str
    reindexed_documents: int
    failed_documents: int
