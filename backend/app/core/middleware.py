"""
Sovereign Security and Diagnostic HTTP Middlewares.
Implements:
1. SecurityHeadersMiddleware: Sets enterprise CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.
2. CorrelationIdMiddleware: Propagates trace correlation IDs across request lifecycles.
"""
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from backend.app.core.logging_config import set_correlation_id, reset_correlation_id

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Enforces strict enterprise security headers on all HTTP responses,
    mitigating Cross-Site Scripting (XSS), Clickjacking, MIME-sniffing,
    and protocol downgrade attacks.
    """
    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)

        # Content-Security-Policy (CSP)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "object-src 'none'; "
            "base-uri 'self';"
        )

        # X-Content-Type-Options: Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # X-Frame-Options: Prevent Clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # X-XSS-Protection: Legacy browser XSS filter
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Strict-Transport-Security (HSTS): Enforce HTTPS
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        # Referrer-Policy: Protect URL leakage
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions-Policy: Restrict browser hardware APIs
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), camera=(), geolocation=(), "
            "gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
        )

        return response


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Ensures every incoming request possesses a unique correlation ID for end-to-end auditability.
    Accepts incoming 'X-Correlation-ID' or 'X-Request-ID' if present; generates UUID otherwise.
    Injects correlation ID into the response headers.
    """
    async def dispatch(self, request: Request, call_next) -> Response:
        header_corr_id = request.headers.get("X-Correlation-ID") or request.headers.get("X-Request-ID")
        correlation_id = header_corr_id.strip() if header_corr_id else str(uuid.uuid4())

        token = set_correlation_id(correlation_id)
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = correlation_id
            return response
        finally:
            reset_correlation_id(token)
