from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, cast
from jose import jwt, JWTError  # type: ignore
import bcrypt
import hashlib
import hmac
import logging
import os
from backend.app.core.config import settings

logger = logging.getLogger("kelvrin.security")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain password against stored hash.
    Supports modern Bcrypt hashes ($2a$, $2b$, $2y$) and legacy PBKDF2 hashes (salt:key).
    """
    if not plain_password or not hashed_password:
        return False

    try:
        # 1. Check if bcrypt hash
        if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
            pw_bytes = plain_password.encode("utf-8")[:72]
            return bcrypt.checkpw(pw_bytes, hashed_password.encode("utf-8"))

        # 2. Backward compatibility fallback: PBKDF2 salt:key
        if ":" in hashed_password:
            salt, key = hashed_password.split(":")
            new_key = hashlib.pbkdf2_hmac(
                'sha256',
                plain_password.encode('utf-8'),
                bytes.fromhex(salt),
                100000
            )
            return hmac.compare_digest(new_key.hex(), key)

        return False
    except Exception as e:
        logger.warning(f"[SECURITY] Password hash verification failed or malformed hash: {e}")
        return False

def hash_password(password: str) -> str:
    """
    Cryptographically hashes a plain password using Bcrypt with a work factor of 12 rounds.
    Never stores plain passwords. Truncates cleanly to 72 bytes per Bcrypt specification.
    """
    pw_bytes = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pw_bytes, bcrypt.gensalt(rounds=12)).decode("utf-8")



import uuid

def hash_token(token: str) -> str:
    """Compute SHA-256 hash of a raw session token for blacklist revocation storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def create_access_token(
    subject: str,
    email: str,
    role: str,
    permissions: List[str],
    expires_delta: Optional[timedelta] = None,
    jti: Optional[str] = None
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    token_jti = jti or uuid.uuid4().hex
    """
    Generates a cryptographically signed HMAC-SHA256 JWT access token.
    Contains subject identifier, user email, canonical role, permissions array,
    expiration timestamp, issued-at timestamp, sovereign issuer, and unique JTI.
    """
    to_encode: Dict[str, Any] = {
        "sub": subject,
        "email": email,
        "role": role,
        "permissions": permissions,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "iss": "kelvrin-sovereign-gateway",
        "jti": token_jti
    }
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decodes and cryptographically verifies an incoming JWT access token
    against JWT_SECRET_KEY, the configured algorithm, and the sovereign issuer.
    Returns decoded claims dictionary or None if expired or tampered.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            issuer="kelvrin-sovereign-gateway"
        )
        return cast(Dict[str, Any], payload)
    except JWTError:
        return None

# Canonical re-exports of document and vault security functions
from backend.app.core.document_security import (
    FORMAT_CONFIG,
    sanitize_filename,
    validate_file_format,
    validate_file_size,
    assert_path_confined,
)

