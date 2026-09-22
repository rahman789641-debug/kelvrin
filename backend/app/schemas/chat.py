"""Sovereign Chat schema models."""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

class ConversationCreate(BaseModel):
    title: Optional[str] = Field("New Sovereign Conversation", max_length=255)
    model_id: Optional[str] = Field("auto", description="auto for intelligent router, or specific model slug")
    document_id: Optional[str] = Field(None, description="Optional bound document identifier")

class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1)
    model_id: Optional[str] = Field("auto", description="auto for intelligent router, or specific model slug")
    attachment_name: Optional[str] = None

class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    sender_type: str
    content: str
    model_used: Optional[str] = None
    detected_intent: Optional[str] = None
    routing_reasoning: Optional[str] = None
    required_capabilities: Optional[List[str]] = []
    attachment_name: Optional[str] = None
    tokens_prompt: Optional[int] = None
    tokens_completion: Optional[int] = None
    latency_ms: Optional[float] = None
    created_at: str

class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    user_id: str
    model_id: str
    document_id: Optional[str] = None
    document_title: Optional[str] = None
    document_status: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None
    messages: List[MessageOut] = []

from backend.app.schemas.knowledge import CitationOut, RetrievedEvidenceOut

class DocumentChatQueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    model_id: Optional[str] = "auto"

class DocumentChatQueryResponse(BaseModel):
    answer: str
    document_id: str
    document_title: str
    model_used: str
    detected_intent: str
    routing_reasoning: str
    citation_snippet: Optional[str] = None
    citations: Optional[List[CitationOut]] = []
    evidence: Optional[List[RetrievedEvidenceOut]] = []
    latency_ms: float
