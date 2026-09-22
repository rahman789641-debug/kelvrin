# ==============================================================================
# KELVRIN Sovereign Agentic AI Workbench - Enterprise Backend Gateway
# Sovereign On-Premises Architecture: Zero Data Leakage
# ==============================================================================

FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /workspace

# Install system dependencies for cryptography and PostgreSQL driver
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install dependencies
COPY backend/requirements.txt /workspace/backend/requirements.txt
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r /workspace/backend/requirements.txt

# Copy codebase
COPY backend/ /workspace/backend/
COPY alembic.ini /workspace/alembic.ini

# Security: Run as dedicated unprivileged sovereign user
RUN groupadd -r kelvrin && useradd -r -g kelvrin -s /sbin/nologin kelvrin && \
    chown -R kelvrin:kelvrin /workspace

USER kelvrin

EXPOSE 8000

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/api/v1/health || exit 1

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
