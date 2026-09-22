from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class DocumentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    filename: str
    file_path: Optional[str] = None
    file_size_bytes: int
    mime_type: str
    sha256_hash: Optional[str] = None
    classification: str = "INTERNAL"
    content_base64: Optional[str] = None


class DocumentProcessingLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    stage: str
    level: str
    message: str
    details: Optional[Dict[str, Any]] = None
    created_at: str

class DocumentChunkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    chunk_index: int
    page_number: int
    content: str
    token_count: int
    chunk_metadata: Optional[Dict[str, Any]] = None
    created_at: str

class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    filename: str
    file_size_bytes: int
    mime_type: str
    sha256_hash: str
    classification: str
    status: str
    ocr_applied: bool = False
    vision_applied: bool = False
    total_pages: int = 1
    total_chunks: int = 0
    uploaded_by: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    content_preview: Optional[str] = None
    visual_summary: Optional[str] = None
    asset_category: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None

class DocumentDetailOut(DocumentOut):
    processing_error: Optional[str] = None
    permissions: List[str] = ["READ", "DOWNLOAD"]
    activity: List[dict] = []
    recent_logs: List[DocumentProcessingLogOut] = []

class DocumentPreviewOut(BaseModel):
    id: str
    title: str
    filename: str
    mime_type: str
    file_size_bytes: int
    total_pages: int
    total_chunks: int
    content_preview: Optional[str] = None
    status: str

class DocumentRetryResponse(BaseModel):
    success: bool
    document_id: str
    status: str
    message: str
