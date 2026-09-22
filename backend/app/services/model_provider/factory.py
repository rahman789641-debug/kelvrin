from typing import Dict
from backend.app.services.model_provider.base import ModelProvider
from backend.app.services.model_provider.mock_provider import MockLocalProvider
from backend.app.services.model_provider.ollama_provider import OllamaProvider
from backend.app.services.model_provider.vllm_provider import VLLMProvider

# Singleton provider registry
_PROVIDERS: Dict[str, ModelProvider] = {
    "mock": MockLocalProvider(),
    "ollama": OllamaProvider(),
    "vllm": VLLMProvider(),
    "tgi": VLLMProvider(),
    "llamacpp": VLLMProvider(),
    "localai": VLLMProvider()
}

def get_provider(provider_type: str) -> ModelProvider:
    """
    Resolve local model execution engine by provider type.
    Defaults to MockLocalProvider if unconfigured or unrecognized.
    """
    key = (provider_type or "mock").lower()
    if key in _PROVIDERS:
        return _PROVIDERS[key]
    return _PROVIDERS["mock"]

def get_mock_provider() -> MockLocalProvider:
    """Helper to access singleton mock provider for testing controls."""
    return _PROVIDERS["mock"]  # type: ignore
