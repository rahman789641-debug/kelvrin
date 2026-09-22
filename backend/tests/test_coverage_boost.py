import os
import json
import pytest
from unittest.mock import patch, MagicMock
from backend.app.core.secrets import (
    EnvSecretsManager,
    VaultSecretsManager,
    CloudSecretsManager,
    get_secrets_manager
)
from backend.app.core.logging_config import (
    JSONLogFormatter,
    TextLogFormatter,
    setup_logging,
    get_correlation_id,
    set_correlation_id,
    reset_correlation_id
)

def test_env_secrets_manager():
    """Test EnvSecretsManager retrieval and fallback."""
    mgr = EnvSecretsManager()
    os.environ["TEST_SECRET_KEY_123"] = "secret_value_xyz"
    assert mgr.get_secret("TEST_SECRET_KEY_123") == "secret_value_xyz"
    assert mgr.get_secret("NON_EXISTENT_KEY", "fallback") == "fallback"
    all_s = mgr.get_all_secrets()
    assert "TEST_SECRET_KEY_123" in all_s
    del os.environ["TEST_SECRET_KEY_123"]

def test_vault_secrets_manager():
    """Test VaultSecretsManager fallback and simulated Vault HTTP responses."""
    # 1. No token fallback
    mgr = VaultSecretsManager(vault_url="http://vault:8200", vault_token=None)
    assert mgr.get_secret("PATH") is not None

    # 2. Simulated successful Vault HTTP KV v2 response
    mock_vault_resp = {
        "data": {
            "data": {
                "DATABASE_URL": "postgresql://vault_user:vault_pass@pg:5432/vault_db",
                "JWT_SECRET": "ultra-secure-vault-token-1234567890"
            }
        }
    }
    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_cm = MagicMock()
        mock_cm.read.return_value = json.dumps(mock_vault_resp).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_cm

        vault_mgr = VaultSecretsManager(
            vault_url="http://127.0.0.1:8200",
            vault_token="s.test_token_12345"
        )
        val = vault_mgr.get_secret("DATABASE_URL")
        assert val == "postgresql://vault_user:vault_pass@pg:5432/vault_db"
        all_v = vault_mgr.get_all_secrets()
        assert "JWT_SECRET" in all_v

def test_cloud_secrets_manager():
    """Test CloudSecretsManager interface."""
    mgr = CloudSecretsManager(provider_name="aws")
    os.environ["CLOUD_KEY"] = "cloud_val"
    assert mgr.get_secret("CLOUD_KEY") == "cloud_val"
    assert mgr.get_secret("ABSENT", default="def") == "def"
    assert "CLOUD_KEY" in mgr.get_all_secrets()
    del os.environ["CLOUD_KEY"]

def test_get_secrets_manager_factory():
    """Test secrets manager factory switching."""
    with patch.dict(os.environ, {"KELVRIN_SECRETS_PROVIDER": "env"}):
        assert isinstance(get_secrets_manager(), EnvSecretsManager)

    with patch.dict(os.environ, {"KELVRIN_SECRETS_PROVIDER": "vault"}):
        assert isinstance(get_secrets_manager(), VaultSecretsManager)

    with patch.dict(os.environ, {"KELVRIN_SECRETS_PROVIDER": "aws"}):
        assert isinstance(get_secrets_manager(), CloudSecretsManager)

def test_structured_json_logging():
    """Test structured JSON log formatter in production."""
    import logging
    formatter = JSONLogFormatter()
    logger = logging.getLogger("test.json.logger")
    record = logger.makeRecord(
        name="test.json.logger",
        level=logging.INFO,
        fn="test_file.py",
        lno=42,
        msg="Structured log audit test",
        args=(),
        exc_info=None
    )
    token = set_correlation_id("corr-trace-8888")
    try:
        formatted = formatter.format(record)
        data = json.loads(formatted)
        assert data["level"] == "INFO"
        assert data["logger"] == "test.json.logger"
        assert data["message"] == "Structured log audit test"
        assert data["correlation_id"] == "corr-trace-8888"
        assert "timestamp" in data
    finally:
        reset_correlation_id(token)

def test_text_log_formatter():
    """Test TextLogFormatter for development."""
    import logging
    formatter = TextLogFormatter()
    logger = logging.getLogger("test.text.logger")
    record = logger.makeRecord(
        name="test.text.logger",
        level=logging.WARNING,
        fn="test_file.py",
        lno=10,
        msg="Dev warning message",
        args=(),
        exc_info=None
    )
    formatted = formatter.format(record)
    assert "[WARNING]" in formatted
    assert "Dev warning message" in formatted

def test_setup_logging_modes():
    """Test setup_logging under development and production."""
    setup_logging(environment="development")
    setup_logging(environment="production")
    setup_logging(environment="testing")

from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.core.security import create_access_token
from backend.app.db.init_db import init_db

@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    import asyncio
    asyncio.run(init_db())

def get_admin_token() -> str:
    return create_access_token(
        subject="usr_admin_01",
        email="s.alexander@sovereign.defense.internal",
        role="Super Admin",
        permissions=["*"]
    )

@pytest.mark.asyncio
async def test_tools_api_router():
    token = get_admin_token()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/tools", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        tools = resp.json()
        assert len(tools) >= 5

        resp_tool = await client.get("/api/v1/tools/calculate", headers={"Authorization": f"Bearer {token}"})
        assert resp_tool.status_code == 200

@pytest.mark.asyncio
async def test_code_lab_api_router():
    token = get_admin_token()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {"code": "x = 42\nprint(f'result={x}')"}
        resp = await client.post("/api/v1/code/execute", headers={"Authorization": f"Bearer {token}"}, json=payload)
        assert resp.status_code == 200
        assert "result=42" in resp.json()["stdout"]

@pytest.mark.asyncio
async def test_connectors_api_router():
    token = get_admin_token()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/connectors", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

@pytest.mark.asyncio
async def test_deliverables_api_router():
    token = get_admin_token()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/deliverables", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

@pytest.mark.asyncio
async def test_companies_api_router():
    token = get_admin_token()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/companies", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, (list, dict))

@pytest.mark.asyncio
async def test_ollama_and_vllm_model_providers():
    from backend.app.services.model_provider.ollama_provider import OllamaProvider
    from backend.app.services.model_provider.vllm_provider import VLLMProvider

    ollama = OllamaProvider()
    assert ollama.provider_type == "ollama"

    vllm = VLLMProvider()
    assert vllm.provider_type == "vllm"

