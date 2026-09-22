"""
Sovereign Structured Logging Subsystem.
Provides ISO 8601 timestamping, log level standardization, correlation ID propagation,
tenant context enrichment, and JSON formatting for production/staging environments.
"""
import contextvars
import json
import logging
import sys
from datetime import datetime, timezone
from typing import Optional

# Context variable for request-scoped correlation IDs
correlation_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("correlation_id", default="")

def get_correlation_id() -> str:
    """Retrieve the active request correlation ID."""
    return correlation_id_ctx.get()

def set_correlation_id(correlation_id: str) -> contextvars.Token:
    """Set the active request correlation ID."""
    return correlation_id_ctx.set(correlation_id)

def reset_correlation_id(token: contextvars.Token) -> None:
    """Reset the active request correlation ID."""
    correlation_id_ctx.reset(token)

class JSONLogFormatter(logging.Formatter):
    """
    Formats log records as structured single-line JSON objects
    suitable for SIEM ingestion, log aggregators, and enterprise security auditing.
    """
    def format(self, record: logging.LogRecord) -> str:
        log_payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "line": record.lineno,
            "process": record.process,
            "thread": record.threadName
        }

        # Inject correlation ID if present
        corr_id = correlation_id_ctx.get()
        if corr_id:
            log_payload["correlation_id"] = corr_id

        # Inject active tenant if available
        try:
            from backend.app.core.tenant import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                log_payload["company_code"] = tenant
        except Exception:
            logging.getLogger("kelvrin.logging").exception("Failed to attach tenant context to structured log entry")

        # Handle exception information
        if record.exc_info:
            log_payload["exception"] = self.formatException(record.exc_info)

        if hasattr(record, "extra") and isinstance(record.extra, dict):
            log_payload["extra"] = record.extra

        return json.dumps(log_payload)

class TextLogFormatter(logging.Formatter):
    """Human-readable formatter with correlation ID for development and testing."""
    def format(self, record: logging.LogRecord) -> str:
        corr_id = correlation_id_ctx.get()
        corr_str = f"[{corr_id[:8]}] " if corr_id else ""
        asctime = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        msg = record.getMessage()
        exc_str = ""
        if record.exc_info:
            exc_str = "\n" + self.formatException(record.exc_info)
        return f"{asctime} [{record.levelname}] {corr_str}{record.name}: {msg}{exc_str}"

def setup_logging(environment: str = "development", log_level: str = "INFO") -> None:
    """
    Initializes root and application logging.
    Enforces JSON formatted logs in production and staging environments.
    """
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Clear existing handlers to prevent duplicated output
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setLevel(numeric_level)

    if environment.lower() in ["production", "staging"]:
        stream_handler.setFormatter(JSONLogFormatter())
    else:
        stream_handler.setFormatter(TextLogFormatter())

    root_logger.addHandler(stream_handler)

    # Silence excessively verbose external loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("passlib").setLevel(logging.ERROR)
