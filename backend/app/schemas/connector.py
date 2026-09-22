from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict

class ConnectorConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    base_url: Optional[str] = None
    allowed_endpoints: List[str] = []
    timeout_seconds: int = 15
    network_policy: str = "ISOLATED_LOCAL"
    headers_masked: Dict[str, Any] = {}

class ConnectorHealthOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status: str
    latency_ms: float
    last_checked_at: datetime
    last_error: Optional[str] = None

class ConnectorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    type: str
    description: str
    is_enabled: bool
    auth_type: str
    created_at: datetime
    config: Optional[ConnectorConfigOut] = None
    health: Optional[ConnectorHealthOut] = None

class ConnectorToggleRequest(BaseModel):
    is_enabled: bool

class ConnectorExecuteRequest(BaseModel):
    method: str = "GET"
    endpoint: str
    payload: Optional[Dict[str, Any]] = None

class MockErpInspectionResponse(BaseModel):
    equipment_id: str
    facility: str
    asset_tag: str
    last_certified_date: str
    inspection_tier: str
    status: str
    sensor_calibration: str
