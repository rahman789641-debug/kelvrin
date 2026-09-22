from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class AnalyticsSummaryOut(BaseModel):
    total_queries: int
    documents_processed: int
    average_response_time_ms: float
    successful_agent_runs: int
    failed_agent_runs: int
    total_agent_runs: int
    agent_success_rate_pct: float
    knowledge_searches: int
    code_executions: int
    generated_deliverables: int
    active_models: int
    zero_cloud_cost: str

class TimeSeriesPointOut(BaseModel):
    date: str
    queries: int
    tokens: int
    agent_tasks: int

class ModelUsageOut(BaseModel):
    model_id: str
    name: str
    provider_type: str
    vram_mb: int
    latency_ms: float
    context_window: int
    status: str
    is_default: bool

class CategoryDistributionOut(BaseModel):
    name: str
    value: int
    color: str
