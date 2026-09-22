import time
from typing import Any, Dict, List, Optional
import httpx
from backend.app.services.model_provider.base import (
    ModelProvider,
    ModelHealth,
    ModelHealthStatus,
    GenerationResponse,
    EmbeddingResponse
)

class OllamaProvider(ModelProvider):
    """
    Adapter for local Ollama daemon instances running on-premises.
    Interacts via native Ollama REST API.
    """
    @property
    def provider_type(self) -> str:
        return "ollama"

    async def check_health(self, endpoint_url: str, model_id: str) -> ModelHealth:
        start = time.perf_counter()
        clean_base = endpoint_url.rstrip("/")
        tags_url = f"{clean_base}/api/tags"

        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(tags_url)
                latency = (time.perf_counter() - start) * 1000.0
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m.get("name") for m in data.get("models", [])]
                    is_model_present = any(model_id in m for m in models) if models else True
                    status = ModelHealthStatus.HEALTHY if is_model_present else ModelHealthStatus.DEGRADED
                    err = None if is_model_present else f"Model '{model_id}' not currently loaded in Ollama instance"

                    return ModelHealth(
                        status=status,
                        latency_ms=round(latency, 2),
                        error_message=err,
                        details={"available_models": models}
                    )
                else:
                    return ModelHealth(
                        status=ModelHealthStatus.DEGRADED,
                        latency_ms=round(latency, 2),
                        error_message=f"Ollama returned HTTP {resp.status_code}"
                    )
        except Exception as e:
            return ModelHealth(
                status=ModelHealthStatus.UNAVAILABLE,
                latency_ms=0.0,
                error_message=f"Cannot reach local Ollama daemon: {str(e)}"
            )

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
        start = time.perf_counter()
        clean_base = endpoint_url.rstrip("/")
        gen_url = f"{clean_base}/api/generate"

        payload: Dict[str, Any] = {
            "model": model_id,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }
        if system_prompt:
            payload["system"] = system_prompt
        if stop:
            payload["options"]["stop"] = stop
        if extra_params:
            payload.update(extra_params)

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(gen_url, json=payload)
                latency = (time.perf_counter() - start) * 1000.0

                if resp.status_code != 200:
                    raise RuntimeError(f"Ollama generation failed ({resp.status_code}): {resp.text}")

                res_json = resp.json()
                text = res_json.get("response", "")
                p_tokens = res_json.get("prompt_eval_count", len(prompt.split()))
                c_tokens = res_json.get("eval_count", len(text.split()))

                return GenerationResponse(
                    text=text,
                    model_id=model_id,
                    provider="ollama",
                    prompt_tokens=p_tokens,
                    completion_tokens=c_tokens,
                    latency_ms=round(latency, 2),
                    raw_response=res_json
                )
        except httpx.RequestError as e:
            raise ConnectionError(f"Connection to local Ollama instance failed: {str(e)}")

    async def embed(
        self,
        endpoint_url: str,
        model_id: str,
        texts: List[str]
    ) -> EmbeddingResponse:
        start = time.perf_counter()
        clean_base = endpoint_url.rstrip("/")
        embed_url = f"{clean_base}/api/embeddings"

        embeddings = []
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                for t in texts:
                    resp = await client.post(embed_url, json={"model": model_id, "prompt": t})
                    if resp.status_code == 200:
                        embeddings.append(resp.json().get("embedding", []))
                    else:
                        raise RuntimeError(f"Ollama embedding failure ({resp.status_code}): {resp.text}")

            latency = (time.perf_counter() - start) * 1000.0
            return EmbeddingResponse(
                embeddings=embeddings,
                model_id=model_id,
                provider="ollama",
                latency_ms=round(latency, 2)
            )
        except httpx.RequestError as e:
            raise ConnectionError(f"Connection to local Ollama instance failed: {str(e)}")
