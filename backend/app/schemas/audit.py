"""Sovereign Audit schema models."""
from typing import Optional
from pydantic import BaseModel, ConfigDict

class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: str
    timestamp: str
    actor_id: Optional[str] = None
    actor_email: Optional[str] = None
    ip_address: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    status: str
    correlation_id: Optional[str] = None
    details: dict
