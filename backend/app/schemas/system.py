from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class CpuMetrics(BaseModel):
    utilization_pct: float
    core_count: int
    load_average: Optional[List[float]] = None

class MemoryMetrics(BaseModel):
    total_mb: float
    used_mb: float
    free_mb: float
    percent: float

class DiskMetrics(BaseModel):
    total_gb: float
    used_gb: float
    free_gb: float
    percent: float
    mount_point: str = "/"

class GpuMetrics(BaseModel):
    gpu_available: bool
    message: str
    gpu_count: int = 0
    devices: List[Dict[str, Any]] = []

class ScratchStorageMetrics(BaseModel):
    scratch_dir: str
    total_files: int
    total_size_bytes: int
    deliverables_count: int

class SystemMetricsOut(BaseModel):
    timestamp: str
    cpu: CpuMetrics
    memory: MemoryMetrics
    disk: DiskMetrics
    gpu: GpuMetrics
    storage: ScratchStorageMetrics
    sovereign_mode: str

class SubsystemHealth(BaseModel):
    component: str
    status: str  # HEALTHY, DEGRADED, UNAVAILABLE, ISOLATED
    latency_ms: float
    message: Optional[str] = None
    details: Dict[str, Any] = {}

class SystemHealthOut(BaseModel):
    overall_status: str  # HEALTHY, DEGRADED, CRITICAL
    timestamp: str
    subsystems: Dict[str, SubsystemHealth]
