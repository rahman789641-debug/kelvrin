from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

class ModelCapability(str, Enum):
    TEXT = "TEXT"
    REASONING = "REASONING"
    CODING = "CODING"
    VISION = "VISION"
    EMBEDDING = "EMBEDDING"
    OCR = "OCR"

class ModelHealthStatus(str, Enum):
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    UNAVAILABLE = "UNAVAILABLE"
    UNKNOWN = "UNKNOWN"

@dataclass
class ModelHealth:
    status: ModelHealthStatus
    latency_ms: float = 0.0
    last_checked: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    error_message: Optional[str] = None
    vram_allocated_mb: int = 0
    details: Dict[str, Any] = field(default_factory=dict)

@dataclass
class GenerationResponse:
    text: str
    model_id: str
    provider: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: float = 0.0
    finish_reason: str = "stop"
    raw_response: Optional[Dict[str, Any]] = None

@dataclass
class EmbeddingResponse:
    embeddings: List[List[float]]
    model_id: str
    provider: str
    latency_ms: float = 0.0

class ModelProvider(ABC):
    """
    Abstract local model provider interface.
    Decouples application logic from specific local execution engines (Ollama, vLLM, mock).
    Guarantees sovereign on-premises execution without cloud API leaks.
    """
    @property
    @abstractmethod
    def provider_type(self) -> str:
        """Unique identifier for this provider adapter, e.g. 'ollama', 'vllm', 'mock'."""
        pass

    @abstractmethod
    async def check_health(self, endpoint_url: str, model_id: str) -> ModelHealth:
        """Probe local model server endpoint and return health & latency."""
        pass

    @abstractmethod
    async def generate(
        self,
        endpoint_url: str,
        model_id: str,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        stop: Optional[List[str]] = None,
        extra_params: Optional[Dict[str, Any]] = None
    ) -> GenerationResponse:
        """Execute local inference and return structured response."""
        pass

    @abstractmethod
    async def embed(
        self,
        endpoint_url: str,
        model_id: str,
        texts: List[str]
    ) -> EmbeddingResponse:
        """Generate dense vector embeddings locally."""
        pass
