"""
Sovereign In-Memory / Distributed Rate Limiting Engine.
Enforces request rate limits on sensitive authentication endpoints to block brute force,
and globally across the API to mitigate denial-of-service attempts.
"""
import time
import asyncio
from typing import Dict, List, Optional, Tuple
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import logging

logger = logging.getLogger("kelvrin.rate_limit")

class SlidingWindowRateLimiter:
    """
    Sliding window log rate limiter.
    Maintains timestamp logs per client key and purges expired entries automatically.
    Thread-safe and async-compatible.
    """
    def __init__(self):
        self._records: Dict[str, List[float]] = {}
        self._lock = asyncio.Lock()

    async def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
        """
        Check if an action is permitted under the rate limit.
        Returns: (is_allowed, retry_after_seconds)
        """
        now = time.time()
        cutoff = now - window_seconds

        async with self._lock:
            timestamps = self._records.get(key, [])
            # Filter out timestamps older than current window
            valid_timestamps = [t for t in timestamps if t > cutoff]

            if len(valid_timestamps) >= max_requests:
                earliest = valid_timestamps[0]
                retry_after = max(1, int(earliest + window_seconds - now))
                self._records[key] = valid_timestamps
                return False, retry_after

            valid_timestamps.append(now)
            self._records[key] = valid_timestamps
            return True, 0

    async def reset(self, key: str) -> None:
        """Reset the rate limit log for a specific key (e.g. upon successful authentication)."""
        async with self._lock:
            self._records.pop(key, None)

    async def cleanup_expired(self, max_idle_seconds: int = 300) -> None:
        """Periodically purge idle keys from memory."""
        now = time.time()
        async with self._lock:
            keys_to_remove = []
            for key, timestamps in self._records.items():
                if not timestamps or (now - timestamps[-1] > max_idle_seconds):
                    keys_to_remove.append(key)
            for k in keys_to_remove:
                del self._records[k]

# Global shared instance
limiter = SlidingWindowRateLimiter()

def get_client_ip(request: Request) -> str:
    """Extract real client IP considering forward headers when behind sovereign reverse proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    """
    Global API Rate Limiting Middleware.
    - Limits anonymous requests to 120 req/min.
    - Limits authenticated requests to 1200 req/min.
    - Skips health/ready probes.
    """
    def __init__(self, app, anonymous_limit: int = 120, authenticated_limit: int = 1200, window_seconds: int = 60):
        super().__init__(app)
        self.anonymous_limit = anonymous_limit
        self.authenticated_limit = authenticated_limit
        self.window_seconds = window_seconds

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # Exclude internal health probes
        if path.endswith("/health") or path.endswith("/ready") or path.endswith("/docs") or path.endswith("/openapi.json"):
            return await call_next(request)

        # Determine key and limit
        auth_header = request.headers.get("Authorization", "")
        client_ip = get_client_ip(request)

        if auth_header.startswith("Bearer "):
            # Authenticated user bucket
            key = f"global_auth:{client_ip}:{auth_header[-16:]}"
            limit = self.authenticated_limit
        else:
            # Anonymous IP bucket
            key = f"global_anon:{client_ip}"
            limit = self.anonymous_limit

        allowed, retry_after = await limiter.is_allowed(key, limit, self.window_seconds)
        if not allowed:
            logger.warning(f"[RATE_LIMIT_EXCEEDED] Global rate limit triggered for {key} on {path}")
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "success": False,
                    "error_code": "RATE_LIMIT_EXCEEDED",
                    "detail": f"API rate limit exceeded. Please retry after {retry_after} seconds."
                },
                headers={"Retry-After": str(retry_after)}
            )

        response = await call_next(request)
        return response

async def check_auth_rate_limit(request: Request, identifier: str = "") -> None:
    """
    FastAPI dependency for strict brute-force protection on authentication endpoints.
    Allows 5 attempts per 60 seconds per IP + identifier combination.
    """
    ip = get_client_ip(request)
    key = f"auth_attempt:{ip}:{identifier.strip().lower()}" if identifier else f"auth_attempt:{ip}"
    allowed, retry_after = await limiter.is_allowed(key, max_requests=5, window_seconds=60)
    if not allowed:
        logger.warning(f"[AUTH_BRUTE_FORCE_BLOCKED] Brute force blocked for key {key}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many authentication attempts. Temporarily locked for {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)}
        )

async def reset_auth_rate_limit(request: Request, identifier: str = "") -> None:
    """Clear rate limit counter after successful authentication."""
    ip = get_client_ip(request)
    key = f"auth_attempt:{ip}:{identifier.strip().lower()}" if identifier else f"auth_attempt:{ip}"
    await limiter.reset(key)
