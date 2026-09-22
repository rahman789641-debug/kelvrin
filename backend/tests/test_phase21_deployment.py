import os
import yaml
import pytest

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

def test_phase21_dockerfile_backend_structure():
    """Verify Dockerfile.backend adheres to sovereign security practices and container requirements."""
    df_path = os.path.join(WORKSPACE_ROOT, "Dockerfile.backend")
    assert os.path.exists(df_path), "Dockerfile.backend must exist"
    
    with open(df_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert "python:3.11" in content
    assert "useradd" in content or "adduser" in content, "Should create an unprivileged user"
    assert "USER kelvrin" in content, "Must run as non-root user kelvrin"
    assert "HEALTHCHECK" in content, "Must define a healthcheck"
    assert "8000" in content, "Must expose port 8000"
    # Ensure no secrets or API keys are hardcoded
    assert "sk-" not in content
    assert "SECRET_KEY=" not in content
    assert "POSTGRES_PASSWORD=" not in content

def test_phase21_dockerfile_frontend_structure():
    """Verify Dockerfile.frontend uses multi-stage build and nginx runner."""
    df_path = os.path.join(WORKSPACE_ROOT, "Dockerfile.frontend")
    assert os.path.exists(df_path), "Dockerfile.frontend must exist"
    
    with open(df_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert "FROM node:" in content, "Builder stage must use Node"
    assert "AS builder" in content, "Must define multi-stage builder"
    assert "FROM nginx:" in content, "Runner stage must use nginx"
    assert "COPY --from=builder" in content, "Must copy build assets from builder"
    assert "EXPOSE 80" in content or "EXPOSE 8080" in content, "Must expose web port"

def test_phase21_docker_compose_production():
    """Verify docker-compose.yml parses correctly and defines required production services."""
    dc_path = os.path.join(WORKSPACE_ROOT, "docker-compose.yml")
    assert os.path.exists(dc_path), "docker-compose.yml must exist"
    
    with open(dc_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
        
    services = data.get("services", {})
    assert "postgres" in services, "Must define postgres service"
    assert "backend" in services, "Must define backend service"
    assert "frontend" in services, "Must define frontend service"
    assert "local-model-service" in services, "Must define configurable local-model-service"
    
    # Check healthchecks and profiles
    assert "healthcheck" in services["postgres"]
    assert "healthcheck" in services["backend"]
    assert "profiles" in services["local-model-service"], "Local model service should have optional profile"

def test_phase21_docker_compose_development():
    """Verify docker-compose.dev.yml defines live reloading volumes and ports."""
    dc_dev_path = os.path.join(WORKSPACE_ROOT, "docker-compose.dev.yml")
    assert os.path.exists(dc_dev_path), "docker-compose.dev.yml must exist"
    
    with open(dc_dev_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
        
    services = data.get("services", {})
    assert "backend" in services
    assert "frontend" in services
    
    # Check volume mounts for hot reload
    backend_vols = services["backend"].get("volumes", [])
    assert any("./backend" in str(v) for v in backend_vols), "Backend should mount ./backend for reload"
    frontend_vols = services["frontend"].get("volumes", [])
    assert any("./frontend" in str(v) for v in frontend_vols), "Frontend should mount ./frontend for reload"

def test_phase21_env_example_and_documentation():
    """Verify .env.example contains configuration flags and DEPLOYMENT.md is complete."""
    env_path = os.path.join(WORKSPACE_ROOT, ".env.example")
    assert os.path.exists(env_path), ".env.example must exist"
    
    with open(env_path, "r", encoding="utf-8") as f:
        env_content = f.read()
        
    assert "AUTH_MODE=local" in env_content
    assert "DATABASE_URL=" in env_content
    assert "OLLAMA_BASE_URL=" in env_content
    assert "VLLM_BASE_URL=" in env_content
    assert "LOCAL_AI_ONLY=" in env_content
    
    deploy_doc = os.path.join(WORKSPACE_ROOT, "DEPLOYMENT.md")
    assert os.path.exists(deploy_doc), "DEPLOYMENT.md must exist"
    
    with open(deploy_doc, "r", encoding="utf-8") as f:
        doc_content = f.read()
        
    assert "Environment Variables" in doc_content
    assert "Database Migration" in doc_content
    assert "Model Service Configuration" in doc_content
    assert "Backup & Disaster Recovery" in doc_content
    assert "Troubleshooting" in doc_content


def test_phase21_environment_configuration_separation():
    """Verify strict dev/staging/prod configuration separation and production security bounds."""
    from backend.app.core.config import DevelopmentConfig, StagingConfig, ProductionConfig, Settings

    dev = DevelopmentConfig(
        ENVIRONMENT="development",
        JWT_SECRET_KEY="dev-secret-key-that-is-at-least-32-chars-long",
        INITIAL_ADMIN_PASSWORD="DevAdminPassword123!",
        DATABASE_URL="sqlite+aiosqlite:///./dev.db"
    )
    assert dev.ENVIRONMENT == "development"
    assert dev.DEBUG is True

    # 1. Production strictly rejects wildcard CORS
    with pytest.raises(ValueError, match=r"Wildcard '\*' in CORS_ORIGINS is strictly prohibited"):
        ProductionConfig(
            ENVIRONMENT="production",
            JWT_SECRET_KEY="production-secret-key-at-least-32-chars-long",
            INITIAL_ADMIN_PASSWORD="ProdAdminPassword123!",
            DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/db",
            CORS_ORIGINS=["*"]
        )

    # 2. Production strictly rejects SQLite
    with pytest.raises(ValueError, match="SQLite is prohibited in production environment"):
        ProductionConfig(
            ENVIRONMENT="production",
            JWT_SECRET_KEY="production-secret-key-at-least-32-chars-long",
            INITIAL_ADMIN_PASSWORD="ProdAdminPassword123!",
            DATABASE_URL="sqlite+aiosqlite:///./prod.db",
            CORS_ORIGINS=["https://app.defense.internal"]
        )

    # 3. Production strictly rejects missing secrets
    with pytest.raises(ValueError, match="JWT_SECRET_KEY is missing or insecure"):
        ProductionConfig(
            ENVIRONMENT="production",
            JWT_SECRET_KEY="short",
            INITIAL_ADMIN_PASSWORD="ProdAdminPassword123!",
            DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/db",
            CORS_ORIGINS=["https://app.defense.internal"]
        )

    # 4. Valid production configuration succeeds
    prod = ProductionConfig(
        ENVIRONMENT="production",
        JWT_SECRET_KEY="production-secret-key-at-least-32-chars-long",
        INITIAL_ADMIN_PASSWORD="ProdAdminPassword123!",
        DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/db",
        CORS_ORIGINS=["https://app.defense.internal"]
    )
    assert prod.ENVIRONMENT == "production"
    assert prod.DEBUG is False

