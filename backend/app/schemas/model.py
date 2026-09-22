from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

class ModelCreate(BaseModel):
    id: str = Field(..., description="Model slug e.g. deepseek-r1-14b")
    name: str = Field(..., min_length=1, max_length=255)
    provider_type: str = Field("mock", description="Local provider: mock, ollama, vllm, tgi")
    endpoint_url: str = Field("http://127.0.0.1:8001/v1", description="Local engine URL")
    modality: str = Field("text", description="Primary modality: text, vision, embedding")
    capabilities: List[str] = Field(default=["TEXT"], description="Declared capabilities e.g. TEXT, CODING, REASONING, VISION, EMBEDDING, OCR")
    context_window: int = Field(8192, ge=512)
    vram_allocated_mb: int = Field(0, ge=0)
    is_active: bool = True
    is_default: bool = False

class ModelRoutingRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    rule_name: str
    condition_json: dict
    target_model_id: str
    priority: int

class ModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    provider_type: str
    endpoint_url: str
    modality: str
    capabilities: List[str] = []
    context_window: int
    vram_allocated_mb: int
    is_active: bool
    health_status: str = "HEALTHY"
    last_health_check: Optional[str] = None
    latency_ms: Optional[float] = None
    error_message: Optional[str] = None
    is_default: bool = False
    routing_rules: List[ModelRoutingRuleOut] = []

class ModelHealthCheckResponse(BaseModel):
    model_id: str
    provider_type: str
    health_status: str
    latency_ms: float
    error_message: Optional[str] = None
    checked_at: str

class TaskClassificationRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    has_image: bool = False
    modality_hint: Optional[str] = None

class TaskClassificationResponse(BaseModel):
    prompt: str
    primary_capability: str
    required_capabilities: List[str]
    confidence: float
    detected_intent: str
    reasoning: str
    task_type: str = "GENERAL_QA"
    requires_document: bool = False
    requires_tool: bool = False
    target_file_type: Optional[str] = None

class RouteExecuteRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    system_prompt: Optional[str] = None
    override_model_id: Optional[str] = None
    has_image: bool = False
    temperature: float = 0.7
    max_tokens: int = 2048

class RouteExecuteResponse(BaseModel):
    text: str
    model_id: str
    model_name: str
    provider_type: str
    detected_intent: str
    required_capabilities: List[str]
    confidence: float
    routing_reasoning: str
    prompt_tokens: int
    completion_tokens: int
    execution_time_ms: float

class ModelRoutingLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_prompt: str
    detected_intent: str
    required_capabilities: List[str]
    selected_model_id: Optional[str] = None
    status: str
    execution_time_ms: float
    error_detail: Optional[str] = None
    created_at: str
