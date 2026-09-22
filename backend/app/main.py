import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.core.config import settings
from backend.app.core.logging_config import setup_logging
from backend.app.core.middleware import SecurityHeadersMiddleware, CorrelationIdMiddleware
from backend.app.core.rate_limit import GlobalRateLimitMiddleware
from backend.app.core.tenant import (
    setup_tenant_query_filters,
    set_current_tenant,
    reset_current_tenant,
)
from backend.app.db.init_db import init_db
from backend.app.db.session import check_database_connection

# Initialize sovereign logging (structured JSON in production/staging)
setup_logging(environment=settings.ENVIRONMENT)
logger = logging.getLogger("kelvrin.gateway")

# Configure ORM-level tenant filtering to prevent cross-tenant bypass
setup_tenant_query_filters()

from backend.app.api.v1 import (
    auth, users, documents, chat, agents,
    workflows, knowledge, models, tools,
    audit, system, security, code, deliverables,
    connectors, analytics, demo, companies
)


def _csrf_cookie_allowed(request: Request) -> bool:
    return request.method in {"POST", "PUT", "PATCH", "DELETE"} and not request.url.path.endswith("/auth/csrf")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables & seed records on startup
    logger.info("[KELVRIN] Initializing sovereign database layer...")
    try:
        await init_db()
        logger.info("[KELVRIN] Sovereign database initialization verified.")
    except Exception as e:
        logger.error(f"[KELVRIN] Error during database startup initialization: {e}")
    yield

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Sovereign Agentic AI Workbench - Enterprise On-Premises Backend Gateway",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Safe unhandled error response handler
@app.exception_handler(Exception)
async def safe_exception_handler(request: Request, exc: Exception):
    logger.error(f"[KELVRIN_SEC_ERR] Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error_code": "SEC_ERR_INTERNAL",
            "detail": "An internal sovereign enclave error occurred. This event has been logged for security audit."
        }
    )

# 1. Security Headers (CSP, HSTS, X-Frame-Options, etc.)
app.add_middleware(SecurityHeadersMiddleware)

# 2. Correlation ID Middleware (X-Correlation-ID tracing)
app.add_middleware(CorrelationIdMiddleware)

# 3. Global Rate Limiting Middleware (120 req/min anon, 1200 req/min auth)
app.add_middleware(
    GlobalRateLimitMiddleware,
    anonymous_limit=120,
    authenticated_limit=1200,
    window_seconds=60
)

# 4. CORS Configuration
cors_allow_all = "*" in settings.CORS_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[] if cors_allow_all else settings.CORS_ORIGINS,
    allow_origin_regex=".*" if (cors_allow_all and settings.ENVIRONMENT.lower() == "development") else None,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# 5. CSRF protection for unsafe state-changing requests in production/staging
@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    if settings.ENVIRONMENT.lower() in {"production", "staging"} and _csrf_cookie_allowed(request):
        csrf_cookie = request.cookies.get("csrf_token")
        csrf_header = request.headers.get("x-csrf-token")
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={
                    "success": False,
                    "error_code": "CSRF_TOKEN_INVALID",
                    "detail": "Missing or invalid CSRF token for state-changing request."
                }
            )
    return await call_next(request)

# 6. Enforce clean tenant context per HTTP request to avoid cross-request leakage
@app.middleware("http")
async def tenant_context_middleware(request: Request, call_next):
    token = set_current_tenant(None)
    try:
        return await call_next(request)
    finally:
        reset_current_tenant(token)


# Health & Readiness Probes (Root & /api/v1)
async def _execute_health_check():
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sovereign_mode": settings.KELVRIN_AUTH_MODE
    }

async def _execute_readiness_check():
    db_health = await check_database_connection()
    is_ready = db_health.get("status") == "connected"
    
    return {
        "status": "ready" if is_ready else "degraded",
        "dependencies": {
            "database": db_health,
            "local_model_gateway": "online",
            "auth_boundary": "sovereign_enforced",
            "sandbox_runtime": "isolated"
        },
        "sovereign_mode": settings.KELVRIN_AUTH_MODE,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/health", tags=["System Probes"])
@app.get(f"{settings.API_V1_STR}/health", tags=["System Probes"])
async def health_check():
    return await _execute_health_check()

@app.get("/ready", tags=["System Probes"])
@app.get(f"{settings.API_V1_STR}/ready", tags=["System Probes"])
async def readiness_check():
    return await _execute_readiness_check()

# Mount all 12 module routers under /api/v1
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(users.router, prefix=settings.API_V1_STR)
app.include_router(documents.router, prefix=settings.API_V1_STR)
app.include_router(chat.router, prefix=settings.API_V1_STR)
app.include_router(agents.router, prefix=settings.API_V1_STR)
app.include_router(workflows.router, prefix=settings.API_V1_STR)
app.include_router(knowledge.router, prefix=settings.API_V1_STR)
app.include_router(models.router, prefix=settings.API_V1_STR)
app.include_router(tools.router, prefix=settings.API_V1_STR)
app.include_router(audit.router, prefix=settings.API_V1_STR)
app.include_router(system.router, prefix=settings.API_V1_STR)
app.include_router(security.router, prefix=settings.API_V1_STR)
app.include_router(code.router, prefix=settings.API_V1_STR)
app.include_router(deliverables.router, prefix=settings.API_V1_STR)
app.include_router(connectors.router, prefix=settings.API_V1_STR)
app.include_router(analytics.router, prefix=settings.API_V1_STR)
if settings.ENVIRONMENT.lower() not in {"production", "staging"}:
    app.include_router(demo.router, prefix=settings.API_V1_STR)
app.include_router(companies.router, prefix=settings.API_V1_STR)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
