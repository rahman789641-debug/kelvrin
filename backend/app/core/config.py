import os
import sys
from typing import List, Optional, Any, Union
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "KELVRIN Sovereign Agentic AI Workbench"
    ENVIRONMENT: str = "development"
    API_V1_STR: str = "/api/v1"
    
    # Security & Tokens — NO DEFAULT VALUES (MUST BE SET IN .env)
    JWT_SECRET_KEY: Optional[str] = None
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours
    
    # Auth Mode: local (True Air-Gap Enclave) or firebase (Hybrid Sovereign with Google Identity)
    AUTH_MODE: str = "local"
    KELVRIN_AUTH_MODE: str = "AIR_GAP_LOCAL"
    
    # Firebase Identity Verification
    FIREBASE_PROJECT_ID: str = "kelvrin-sovereign-ai"
    
    # Database Settings — NO HARDCODED SECRETS (MUST BE SET IN .env)
    POSTGRES_SERVER: Optional[str] = None
    POSTGRES_USER: Optional[str] = None
    POSTGRES_PASSWORD: Optional[str] = None
    POSTGRES_DB: Optional[str] = None
    POSTGRES_PORT: int = 5432
    DATABASE_URL: Optional[str] = None

    # Initial Super Admin Password — NO HARDCODED SECRETS (MUST BE SET IN .env)
    INITIAL_ADMIN_PASSWORD: Optional[str] = None
    
    # Fallback to local SQLite when explicitly running in sqlite mode
    SQLITE_FALLBACK_URL: str = "sqlite+aiosqlite:///./kelvrin_sovereign.db"
    SYNC_SQLITE_FALLBACK_URL: str = "sqlite:///./kelvrin_sovereign.db"

    @model_validator(mode="after")
    def validate_secrets_and_credentials(self) -> "Settings":
        """
        Enforce that required secrets and database credentials exist in the environment (.env).
        The application FAILS TO START if secrets are missing or insecure.
        """
        is_testing = (self.ENVIRONMENT.lower() == "testing")

        if is_testing:
            if not self.JWT_SECRET_KEY:
                self.JWT_SECRET_KEY = "test-jwt-secret-key-that-is-at-least-32-chars-long"
            if not self.INITIAL_ADMIN_PASSWORD:
                self.INITIAL_ADMIN_PASSWORD = "TestAdminSecurePassword2026!"
            return self

        # 1. Enforce JWT_SECRET_KEY
        if not self.JWT_SECRET_KEY or len(self.JWT_SECRET_KEY.strip()) < 32:
            raise ValueError(
                "CRITICAL SECURITY VIOLATION: JWT_SECRET_KEY is missing or insecure! "
                "You must set a cryptographically secure JWT_SECRET_KEY of at least 32 characters in your .env file."
            )

        # 2. Enforce Database credentials
        has_database_url = bool(self.DATABASE_URL and self.DATABASE_URL.strip())
        has_postgres_creds = bool(
            self.POSTGRES_SERVER and self.POSTGRES_USER and self.POSTGRES_PASSWORD and self.POSTGRES_DB
        )
        if not has_database_url and not has_postgres_creds:
            raise ValueError(
                "CRITICAL SECURITY VIOLATION: Database credentials missing! "
                "You must provide either DATABASE_URL or (POSTGRES_SERVER, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB) in your .env file."
            )

        # 3. Enforce INITIAL_ADMIN_PASSWORD
        if not self.INITIAL_ADMIN_PASSWORD or len(self.INITIAL_ADMIN_PASSWORD.strip()) < 12:
            raise ValueError(
                "CRITICAL SECURITY VIOLATION: INITIAL_ADMIN_PASSWORD is missing or too short! "
                "You must set INITIAL_ADMIN_PASSWORD of at least 12 characters in your .env file."
            )

        # 4. Enforce strict CORS policy in production (Wildcard '*' is forbidden)
        if self.ENVIRONMENT.lower() in ["production", "staging"]:
            origins = self.CORS_ORIGINS if isinstance(self.CORS_ORIGINS, list) else [self.CORS_ORIGINS]
            if "*" in origins or any("*" in o for o in origins):
                raise ValueError(
                    "CRITICAL SECURITY VIOLATION: Wildcard '*' in CORS_ORIGINS is strictly prohibited in production! "
                    "You must declare explicit trusted origins (e.g., https://app.defense.internal) in your environment configuration."
                )
            if "sqlite" in self.async_database_url.lower():
                raise ValueError(
                    f"CRITICAL ARCHITECTURAL VIOLATION: SQLite is prohibited in {self.ENVIRONMENT} environment. "
                    "A production-grade PostgreSQL cluster must be configured via DATABASE_URL."
                )

        return self

    @property
    def async_database_url(self) -> str:
        if self.DATABASE_URL:
            url = self.DATABASE_URL
            # Normalize prefix for asyncpg (supports postgresql:// and postgres://)
            if url.startswith("postgres://"):
                return url.replace("postgres://", "postgresql+asyncpg://", 1)
            if url.startswith("postgresql://"):
                return url.replace("postgresql://", "postgresql+asyncpg://", 1)
            return url
        if self.POSTGRES_USER and self.POSTGRES_PASSWORD and self.POSTGRES_SERVER and self.POSTGRES_DB:
            return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        return self.SQLITE_FALLBACK_URL

    @property
    def sync_database_url(self) -> str:
        if self.DATABASE_URL:
            url = self.DATABASE_URL
            if url.startswith("postgresql+asyncpg://"):
                return url.replace("postgresql+asyncpg://", "postgresql://", 1)
            if url.startswith("postgres://"):
                return url.replace("postgres://", "postgresql://", 1)
            if url.startswith("sqlite+aiosqlite://"):
                return url.replace("sqlite+aiosqlite://", "sqlite://", 1)
            return url
        if self.POSTGRES_USER and self.POSTGRES_PASSWORD and self.POSTGRES_SERVER and self.POSTGRES_DB:
            return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        return self.SYNC_SQLITE_FALLBACK_URL
    
    # Sovereign Document Storage Settings
    KELVRIN_STORAGE_PATH: str = "./data/sovereign_vault"
    MAX_UPLOAD_SIZE_BYTES: int = 52428800  # 50 MB

    @property
    def absolute_storage_path(self) -> str:
        abs_path = os.path.abspath(self.KELVRIN_STORAGE_PATH)
        os.makedirs(abs_path, exist_ok=True)
        return abs_path

    # CORS Origins for Frontend
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            v_str = v.strip()
            if v_str.startswith("[") and v_str.endswith("]"):
                import json
                try:
                    return json.loads(v_str)
                except (json.JSONDecodeError, ValueError) as err:
                    import logging
                    logging.getLogger("kelvrin.config").warning(f"Could not parse CORS_ORIGINS as JSON list: {err}")
            return [i.strip() for i in v_str.split(",") if i.strip()]
        elif isinstance(v, (list, tuple, set)):
            return [str(i) for i in v]
        return ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"]
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

class DevelopmentConfig(Settings):
    """Configuration profile for local offline development."""
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

class StagingConfig(Settings):
    """Configuration profile for pre-production integration testing."""
    ENVIRONMENT: str = "staging"
    DEBUG: bool = False

class ProductionConfig(Settings):
    """Configuration profile for locked sovereign production air-gap deployment."""
    ENVIRONMENT: str = "production"
    DEBUG: bool = False

def get_settings() -> Settings:
    """Factory loading environment-appropriate settings profile."""
    env = os.environ.get("ENVIRONMENT", "development").lower()
    if env == "production":
        return ProductionConfig()
    elif env == "staging":
        return StagingConfig()
    return DevelopmentConfig()

settings = Settings()

