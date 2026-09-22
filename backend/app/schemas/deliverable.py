from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

class DeliverableOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    file_type: str
    file_size_bytes: int
    sha256_hash: str
    title: str
    description: Optional[str] = None
    owner_id: Optional[str] = None
    run_id: Optional[str] = None
    status: str
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    metadata_json: Dict[str, Any] = {}
    created_at: datetime
    updated_at: Optional[datetime] = None

class DeliverableGenerateRequest(BaseModel):
    file_type: str = Field(..., pattern="^(DOCX|XLSX|PPTX|TXT|PDF)$")
    title: str = Field(..., min_length=1)
    filename: Optional[str] = None
    sections: Optional[List[Dict[str, str]]] = None  # for DOCX
    headers: Optional[List[str]] = None  # for XLSX
    rows: Optional[List[List[Any]]] = None  # for XLSX
    sheet_name: Optional[str] = "Data"  # for XLSX
    slides: Optional[List[Dict[str, Any]]] = None  # for PPTX
    content: Optional[str] = None  # for TXT
    paragraphs: Optional[List[str]] = None  # for PDF

class DeliverableApprovalRequest(BaseModel):
    action: str = Field(..., pattern="^(APPROVE|REJECT|SUBMIT)$")
    notes: Optional[str] = None
