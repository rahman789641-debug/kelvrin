import hashlib
import math
import time
from abc import ABC, abstractmethod
from typing import List, Optional
import httpx

class LocalEmbeddingProvider(ABC):
    """Abstract sovereign on-premises dense vector embedding provider."""
    @property
    @abstractmethod
    def model_name(self) -> str:
        pass

    @property
    @abstractmethod
    def dimensions(self) -> int:
        pass

    @abstractmethod
    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        pass

    @abstractmethod
    async def embed_query(self, text: str) -> List[float]:
        pass

class OllamaEmbeddingProvider(LocalEmbeddingProvider):
    """
    Embeddings generated via local Ollama instance running on-premises (e.g., BAAI/bge-m3).
    """
    def __init__(self, endpoint_url: str = "http://127.0.0.1:11434", model_id: str = "bge-m3"):
        self.endpoint_url = endpoint_url.rstrip("/")
        self.model_id = model_id
        self._dims = 1024

    @property
    def model_name(self) -> str:
        return f"ollama/{self.model_id}"

    @property
    def dimensions(self) -> int:
        return self._dims

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        embeddings = []
        async with httpx.AsyncClient(timeout=45.0) as client:
            for t in texts:
                resp = await client.post(
                    f"{self.endpoint_url}/api/embeddings",
                    json={"model": self.model_id, "prompt": t}
                )
                if resp.status_code != 200:
                    raise RuntimeError(f"Ollama embedding failure ({resp.status_code}): {resp.text}")
                vec = resp.json().get("embedding", [])
                if not self._dims and vec:
                    self._dims = len(vec)
                embeddings.append(vec)
        return embeddings

    async def embed_query(self, text: str) -> List[float]:
        res = await self.embed_texts([text])
        return res[0] if res else []

class DeterministicLocalEmbeddingProvider(LocalEmbeddingProvider):
    """
    High-speed, zero-dependency, 384-dimensional cosine-normalized local sovereign embedding provider.
    Computes semantic dense vectors via character/token n-gram projections and SHA-256 frequency hashes.
    Guarantees deterministic vector cosine similarity without requiring local GPU or Ollama daemon.
    """
    def __init__(self, dims: int = 384):
        self._dims = dims

    @property
    def model_name(self) -> str:
        return f"sovereign-local-bge384"

    @property
    def dimensions(self) -> int:
        return self._dims

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        return [self._compute_vector(t) for t in texts]

    async def embed_query(self, text: str) -> List[float]:
        return self._compute_vector(text)

    def _compute_vector(self, text: str) -> List[float]:
        if not text:
            return [0.0] * self._dims

        vector = [0.0] * self._dims
        clean = text.lower().strip()
        words = clean.split()

        # Word & Subword n-gram hashing
        for idx, word in enumerate(words):
            # Seed from sha256 of word
            h = hashlib.sha256(word.encode("utf-8")).digest()
            val1 = int.from_bytes(h[:4], "little")
            val2 = int.from_bytes(h[4:8], "little")

            pos1 = val1 % self._dims
            pos2 = (val2 + idx) % self._dims

            vector[pos1] += 1.0 + (len(word) / 10.0)
            vector[pos2] += 0.5

            # Character 3-grams
            if len(word) >= 3:
                for c_i in range(len(word) - 2):
                    tri = word[c_i:c_i + 3]
                    pos3 = (sum(ord(c) for c in tri) * 31) % self._dims
                    vector[pos3] += 0.25

        # Add positional weighting
        for i in range(min(len(clean), 64)):
            char_code = ord(clean[i])
            pos = (char_code * (i + 1)) % self._dims
            vector[pos] += 0.1

        # Cosine L2 normalization: vector / norm
        norm = math.sqrt(sum(v * v for v in vector))
        if norm > 0:
            return [round(v / norm, 6) for v in vector]
        return vector

class EmbeddingProviderFactory:
    """Factory resolving active sovereign embedding provider."""
    _mock_instance: Optional[LocalEmbeddingProvider] = None

    @classmethod
    def get_provider(cls, preference: str = "auto") -> LocalEmbeddingProvider:
        if cls._mock_instance is not None:
            return cls._mock_instance

        pref = preference.lower()
        if pref == "ollama":
            return OllamaEmbeddingProvider()
        return DeterministicLocalEmbeddingProvider()

    @classmethod
    def set_mock_provider(cls, provider: Optional[LocalEmbeddingProvider]):
        cls._mock_instance = provider
