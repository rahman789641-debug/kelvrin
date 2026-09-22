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

class VLLMProvider(ModelProvider):
    """
    Adapter for local vLLM, llama.cpp, LocalAI, or TGI instances running on-premises.
    Interacts via standard local OpenAI-compatible REST API endpoints.
    """
    @property
    def provider_type(self) -> str:
        return "vllm"

    async def check_health(self, endpoint_url: str, model_id: str) -> ModelHealth:
        start = time.perf_counter()
        clean_base = endpoint_url.rstrip("/")
        models_url = f"{clean_base}/models" if clean_base.endswith("/v1") else f"{clean_base}/v1/models"

        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(models_url)
                latency = (time.perf_counter() - start) * 1000.0
                if resp.status_code == 200:
                    data = resp.json()
                    registered = [m.get("id") for m in data.get("data", [])]
                    is_present = any(model_id in (m or "") for m in registered) if registered else True
                    status = ModelHealthStatus.HEALTHY if is_present else ModelHealthStatus.DEGRADED
                    err = None if is_present else f"Model '{model_id}' not found in local vLLM registry"

                    return ModelHealth(
                        status=status,
                        latency_ms=round(latency, 2),
                        error_message=err,
                        details={"registered_models": registered}
                    )
                else:
                    return ModelHealth(
                        status=ModelHealthStatus.DEGRADED,
                        latency_ms=round(latency, 2),
                        error_message=f"Local server returned HTTP {resp.status_code}"
                    )
        except Exception as e:
            return ModelHealth(
                status=ModelHealthStatus.UNAVAILABLE,
                latency_ms=0.0,
                error_message=f"Cannot reach local vLLM instance: {str(e)}"
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
        chat_url = f"{clean_base}/chat/completions" if clean_base.endswith("/v1") else f"{clean_base}/v1/chat/completions"

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload: Dict[str, Any] = {
            "model": model_id,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False
        }
        if stop:
            payload["stop"] = stop
        if extra_params:
            payload.update(extra_params)

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(chat_url, json=payload)
                latency = (time.perf_counter() - start) * 1000.0

                if resp.status_code != 200:
                    raise RuntimeError(f"Local vLLM generation failed ({resp.status_code}): {resp.text}")

                res_json = resp.json()
                choices = res_json.get("choices", [])
                text = choices[0].get("message", {}).get("content", "") if choices else ""
                usage = res_json.get("usage", {})
                p_tokens = usage.get("prompt_tokens", len(prompt.split()))
                c_tokens = usage.get("completion_tokens", len(text.split()))

                return GenerationResponse(
                    text=text,
                    model_id=model_id,
                    provider="vllm",
                    prompt_tokens=p_tokens,
                    completion_tokens=c_tokens,
                    latency_ms=round(latency, 2),
                    finish_reason=choices[0].get("finish_reason", "stop") if choices else "stop",
                    raw_response=res_json
                )
        except httpx.RequestError as e:
            raise ConnectionError(f"Connection to local vLLM instance failed: {str(e)}")

    async def embed(
        self,
        endpoint_url: str,
        model_id: str,
        texts: List[str]
    ) -> EmbeddingResponse:
        start = time.perf_counter()
        clean_base = endpoint_url.rstrip("/")
        embed_url = f"{clean_base}/embeddings" if clean_base.endswith("/v1") else f"{clean_base}/v1/embeddings"

        payload = {
            "model": model_id,
            "input": texts
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(embed_url, json=payload)
                latency = (time.perf_counter() - start) * 1000.0

                if resp.status_code != 200:
                    raise RuntimeError(f"Local embedding failed ({resp.status_code}): {resp.text}")

                res_json = resp.json()
                data_items = res_json.get("data", [])
                embeddings = [item.get("embedding", []) for item in data_items]

                return EmbeddingResponse(
                    embeddings=embeddings,
                    model_id=model_id,
                    provider="vllm",
                    latency_ms=round(latency, 2)
                )
        except httpx.RequestError as e:
            raise ConnectionError(f"Connection to local embedding instance failed: {str(e)}")
