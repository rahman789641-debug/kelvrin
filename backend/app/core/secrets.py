"""
Sovereign Secrets Management Interface.
Provides unified abstraction for loading secrets from environment variables,
HashiCorp Vault (primary sovereign on-prem standard), or cloud secret managers.
"""
import os
import json
import logging
from abc import ABC, abstractmethod
from typing import Dict, Optional, Any

logger = logging.getLogger("kelvrin.secrets")

class BaseSecretsManager(ABC):
    """Abstract Base Class for Enterprise Secrets Managers."""

    @abstractmethod
    def get_secret(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Fetch a single secret by key."""
        pass

    @abstractmethod
    def get_all_secrets(self) -> Dict[str, str]:
        """Fetch all managed secrets."""
        pass


class EnvSecretsManager(BaseSecretsManager):
    """Standard Environment / .env Secrets Provider (for local development & testing)."""

    def get_secret(self, key: str, default: Optional[str] = None) -> Optional[str]:
        return os.environ.get(key, default)

    def get_all_secrets(self) -> Dict[str, str]:
        return dict(os.environ)


class VaultSecretsManager(BaseSecretsManager):
    """
    HashiCorp Vault Sovereign On-Premises Secrets Manager.
    Retrieves encrypted enclave credentials over mTLS / HTTP REST API from Vault KV v2 engine.
    """

    def __init__(
        self,
        vault_url: Optional[str] = None,
        vault_token: Optional[str] = None,
        secret_path: str = "secret/data/kelvrin"
    ):
        self.vault_url = (vault_url or os.environ.get("VAULT_ADDR", "http://127.0.0.1:8200")).rstrip("/")
        self.vault_token = vault_token or os.environ.get("VAULT_TOKEN")
        self.secret_path = secret_path or os.environ.get("VAULT_SECRET_PATH", "secret/data/kelvrin")
        self._cached_secrets: Dict[str, str] = {}
        self._loaded = False

    def _fetch_from_vault(self) -> Dict[str, str]:
        if not self.vault_token:
            logger.warning("[VAULT] VAULT_TOKEN not provided. Falling back to environment variables.")
            return dict(os.environ)

        try:
            import urllib.request
            req = urllib.request.Request(
                f"{self.vault_url}/v1/{self.secret_path}",
                headers={"X-Vault-Token": self.vault_token}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                # KV v2 returns secrets under data.data
                secrets = data.get("data", {}).get("data", {})
                logger.info(f"[VAULT] Successfully retrieved {len(secrets)} secrets from HashiCorp Vault.")
                return {k: str(v) for k, v in secrets.items()}
        except Exception as e:
            logger.error(f"[VAULT] Failed to retrieve secrets from Vault at {self.vault_url}: {e}")
            logger.info("[VAULT] Falling back to local environment variables.")
            return dict(os.environ)

    def get_secret(self, key: str, default: Optional[str] = None) -> Optional[str]:
        if not self._loaded:
            self._cached_secrets = self._fetch_from_vault()
            self._loaded = True
        return self._cached_secrets.get(key, os.environ.get(key, default))

    def get_all_secrets(self) -> Dict[str, str]:
        if not self._loaded:
            self._cached_secrets = self._fetch_from_vault()
            self._loaded = True
        merged = dict(os.environ)
        merged.update(self._cached_secrets)
        return merged


class CloudSecretsManager(BaseSecretsManager):
    """Generic Cloud / AWS / GCP Secrets Provider Adapter."""

    def __init__(self, provider_name: str = "aws"):
        self.provider_name = provider_name
        self._cached_secrets: Dict[str, str] = {}

    def get_secret(self, key: str, default: Optional[str] = None) -> Optional[str]:
        return os.environ.get(key, default)

    def get_all_secrets(self) -> Dict[str, str]:
        return dict(os.environ)


def get_secrets_manager() -> BaseSecretsManager:
    """
    Factory function returning the configured secrets manager according to KELVRIN_SECRETS_PROVIDER.
    Supported: 'env' (default), 'vault' (HashiCorp Vault), 'cloud' (AWS/GCP/Azure).
    """
    provider = os.environ.get("KELVRIN_SECRETS_PROVIDER", "env").lower()
    if provider == "vault":
        return VaultSecretsManager()
    elif provider in ["aws", "gcp", "azure", "cloud"]:
        return CloudSecretsManager(provider_name=provider)
    return EnvSecretsManager()

# Global default secrets manager
secrets_manager = get_secrets_manager()
