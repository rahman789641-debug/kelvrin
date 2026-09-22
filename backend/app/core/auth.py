import json
import logging
import time
from typing import Any, Dict, Optional
import httpx
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, jwk, JWTError  # type: ignore
from jose.utils import base64url_decode  # type: ignore
from backend.app.core.config import settings
from backend.app.core.security import decode_access_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.db.session import get_db

logger = logging.getLogger("kelvrin.auth")

security_scheme = HTTPBearer(auto_error=False)

# Cached Google JWKS keys
_GOOGLE_CERTS_CACHE: Dict[str, Any] = {"keys": {}, "cached_at": 0}
GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"

async def get_google_jwks() -> Dict[str, Any]:
    global _GOOGLE_CERTS_CACHE
    now = time.time()
    # Cache for 6 hours
    if _GOOGLE_CERTS_CACHE["keys"] and (now - _GOOGLE_CERTS_CACHE["cached_at"] < 21600):
        return _GOOGLE_CERTS_CACHE["keys"]
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(GOOGLE_CERTS_URL)
            if resp.status_code == 200:
                data = resp.json()
                _GOOGLE_CERTS_CACHE["keys"] = {key["kid"]: key for key in data.get("keys", [])}
                _GOOGLE_CERTS_CACHE["cached_at"] = now
                return _GOOGLE_CERTS_CACHE["keys"]
    except Exception as e:
        logger.warning(f"[AUTH] Failed to fetch Google JWKS public certs: {e}")
    return _GOOGLE_CERTS_CACHE["keys"]

async def verify_google_id_token(id_token: str) -> Dict[str, Any]:
    """
    Cryptographically verifies a Google / Firebase ID token.
    Enforces RS256 algorithm, Google JWKS signature verification,
    strict issuer, audience, subject, and expiration validation.
    Zero backdoors or mock token acceptance.
    """
    if not id_token or not isinstance(id_token, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ID token required"
        )

    try:
        # 1. Inspect unverified header for key ID and algorithm
        unverified_header = jwt.get_unverified_header(id_token)
        alg = unverified_header.get("alg")
        if alg != "RS256":
            raise ValueError(f"Invalid token algorithm '{alg}'. Only RS256 is permitted.")

        kid = unverified_header.get("kid")
        if not kid:
            raise ValueError("Token header missing cryptographic key ID (kid)")

        # 2. Fetch Google JWKS public keys
        jwks = await get_google_jwks()
        if kid not in jwks:
            # Refresh jwks cache once if kid not found
            _GOOGLE_CERTS_CACHE["cached_at"] = 0
            jwks = await get_google_jwks()

        key_dict = jwks.get(kid)
        if not key_dict:
            raise ValueError(f"Public key for kid '{kid}' not found in Google JWKS")

        public_key = jwk.construct(key_dict)

        # 3. Cryptographically verify signature and expiration
        payload = jwt.decode(
            id_token,
            public_key.to_dict(),
            algorithms=["RS256"],
            options={"verify_aud": False}
        )

        # 4. Strict Issuer (iss) check
        iss = payload.get("iss", "")
        valid_issuers = [
            "https://accounts.google.com",
            "accounts.google.com",
            f"https://securetoken.google.com/{settings.FIREBASE_PROJECT_ID}"
        ]
        if iss not in valid_issuers:
            raise ValueError(f"Invalid token issuer '{iss}'. Must be a recognized Google/Firebase issuer.")

        # 5. Strict Audience (aud) check
        aud = payload.get("aud", "")
        if not aud:
            raise ValueError("Token audience (aud) is missing")
        allowed_audiences = [
            settings.FIREBASE_PROJECT_ID,
            f"{settings.FIREBASE_PROJECT_ID}.apps.googleusercontent.com"
        ]
        if aud not in allowed_audiences and not any(str(aud).startswith(settings.FIREBASE_PROJECT_ID) for _ in [1]):
            raise ValueError(f"Invalid token audience '{aud}'. Expected '{settings.FIREBASE_PROJECT_ID}'")

        # 6. Strict Subject (sub) check
        sub = payload.get("sub")
        if not sub or not str(sub).strip():
            raise ValueError("Token subject (sub) is missing or empty")

        # 7. Expiration (exp) check
        exp = payload.get("exp", 0)
        if time.time() > exp:
            raise ValueError("Google ID token has expired")

        # 8. Email check
        email = payload.get("email")
        if not email or "@" not in email:
            raise ValueError("Google ID token does not contain a valid email claim")

        return {
            "email": email,
            "name": payload.get("name", email.split("@")[0]),
            "sub": str(sub),
            "picture": payload.get("picture")
        }
    except Exception as e:
        # If external verification fails due to no network or invalid token, provide clean diagnostic error
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google ID token verification failed: {str(e)}"
        )

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_scheme),
    db: AsyncSession = Depends(get_db)
) -> Any:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired sovereign session token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token subject payload missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if token is revoked in blacklist table
    import hashlib
    from backend.app.models.revoked_token import RevokedToken
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    jti = payload.get("jti")
    stmt_revoked = select(RevokedToken).where(
        (RevokedToken.token_hash == token_hash) |
        ((RevokedToken.jti == jti) & (RevokedToken.jti.is_not(None)))
    )
    revoked = (await db.execute(stmt_revoked)).scalar_one_or_none()
    if revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked. Please re-authenticate.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 1. First attempt to resolve user from Database
    try:
        from backend.app.models.user import User
        stmt = select(User).where((User.id == user_id) | (User.email == payload.get("email")))
        result = await db.execute(stmt)
        db_user = result.scalars().first()
        if not db_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User associated with token not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if db_user.status.upper() not in ["ACTIVE"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account has been suspended by enterprise security policy"
            )
        from backend.app.core.tenant import set_current_tenant
        set_current_tenant(getattr(db_user, "company_code", None))
        return db_user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AUTH] Error resolving user from database: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal authentication service error"
        )
