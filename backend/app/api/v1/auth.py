from datetime import datetime, timedelta, timezone
import hashlib
import os
import secrets
import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, Security, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.core.auth import get_current_user, verify_google_id_token, security_scheme
from backend.app.core.config import settings
from backend.app.core.rbac import record_audit_log
from backend.app.core.security import create_access_token, decode_access_token, hash_password, verify_password, hash_token
from backend.app.core.rate_limit import check_auth_rate_limit, reset_auth_rate_limit
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.models.revoked_token import RevokedToken
from backend.app.schemas.auth import (
    GoogleLoginRequest,
    LocalLoginRequest,
    TokenResponse,
    UserResponse,
    MessageResponse
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.get("/csrf")
async def get_csrf_token(response: Response):
    """Issue a per-session CSRF token and set it as a secure cookie."""
    token = secrets.token_urlsafe(32)
    response.set_cookie(
        key="csrf_token",
        value=token,
        httponly=True,
        secure=(settings.ENVIRONMENT.lower() in {"production", "staging"}),
        samesite="lax",
        max_age=3600,
    )
    return {"csrf_token": token}

@router.post("/google-login", response_model=TokenResponse)
async def google_login(
    payload: GoogleLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Exchange verified Google / Firebase ID token for a sovereign KELVRIN JWT session token.
    Identity verification only; no cloud storage or Firestore invoked.
    """
    await check_auth_rate_limit(request, identifier="google_oauth")
    # 1. Cryptographically verify Google ID Token
    google_profile = await verify_google_id_token(payload.id_token)
    email = google_profile.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google ID token does not contain an email address"
        )
    
    # 2. Check in database first
    stmt = select(User).where(User.email == email)
    user = (await db.execute(stmt)).scalars().first()

    profile_name = google_profile.get("name", "")

    if user is None:
        # Auto-provision new OAuth user with strictly least-privilege Employee role
        user = User(
            email=email,
            full_name=profile_name or email.split("@")[0].capitalize(),
            avatar_url=google_profile.get("picture"),
            role="Employee",
            status="ACTIVE"
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # Keep existing database role and status completely intact. Never derive or escalate role.
        needs_update = False
        if profile_name and user.full_name != profile_name:
            user.full_name = profile_name
            needs_update = True
        picture = google_profile.get("picture")
        if picture and user.avatar_url != picture:
            user.avatar_url = picture
            needs_update = True
        if needs_update:
            await db.commit()
            await db.refresh(user)

    # 3. Security Gate: Check if user account is suspended
    if str(user.status).upper() not in ["ACTIVE"]:
        await record_audit_log(
            db,
            action="LOGIN_DENIED",
            resource_type="auth",
            actor=user,
            status="DENIED",
            details={"reason": "User suspended"}
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is suspended. Access denied by Sovereign Security Policy."
        )
    
    # 4. Mint local sovereign KELVRIN session token
    access_token = create_access_token(
        subject=user.id,
        email=user.email,
        role=user.role,
        permissions=user.permissions
    )

    await record_audit_log(
        db,
        action="LOGIN_GOOGLE",
        resource_type="auth",
        actor=user,
        resource_id=user.id,
        status="SUCCESS",
        details={"provider": "google_firebase", "role": user.role}
    )
    await db.commit()
    
    return TokenResponse(
        token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        token_type="bearer",
        user=user.to_schema()
    )

@router.post("/local-login", response_model=TokenResponse)
async def local_login(
    payload: LocalLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticate against local air-gapped credentials when offline.
    Enforces sliding-window brute force protection (max 5 attempts per 60s).
    """
    uname_key = payload.username.strip().lower()
    await check_auth_rate_limit(request, identifier=uname_key)

    stmt = select(User).where((User.email == payload.username) | (User.id == payload.username))
    user = (await db.execute(stmt)).scalars().first()

    if not user:
        try:
            from backend.app.api.v1.companies import _read_store
            store = _read_store()
            admins = store.get("admins", {})
            matched_admin = None
            for email_key, adm in admins.items():
                if email_key == uname_key or (adm.get("username") and adm.get("username").strip().lower() == uname_key):
                    matched_admin = adm
                    break
            if matched_admin:
                admin_pwd = matched_admin.get("password")
                admin_pwd_hash = matched_admin.get("password_hash")
                pwd_ok = False
                if admin_pwd and admin_pwd == payload.password:
                    pwd_ok = True
                elif admin_pwd_hash and verify_password(payload.password, admin_pwd_hash):
                    pwd_ok = True

                if pwd_ok:
                    user = User(
                        email=matched_admin["email"],
                        full_name=matched_admin.get("fullName") or matched_admin.get("username") or matched_admin["email"],
                        role="Super Admin",
                        auth_provider="airgap_local",
                        password_hash=hash_password(payload.password),
                        status="ACTIVE",
                        company_code=matched_admin.get("companyCode"),
                    )
                    db.add(user)
                    await db.commit()
                    await db.refresh(user)
        except Exception:
            pass

    if not user:
        await record_audit_log(
            db,
            action="LOGIN_FAILED",
            resource_type="auth",
            resource_id=payload.username,
            status="FAILURE",
            details={"mode": "AIR_GAP_LOCAL", "reason": "User not found"}
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials for Sovereign Enclave"
        )
    
    if str(user.status).upper() not in ["ACTIVE"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended by Sovereign Security Policy"
        )
    
    # Verify password
    hashed_pwd = getattr(user, "password_hash", None) or getattr(user, "hashed_password", None)
    if not hashed_pwd or not verify_password(payload.password, hashed_pwd):
        await record_audit_log(
            db,
            action="LOGIN_FAILED",
            resource_type="auth",
            resource_id=payload.username,
            status="FAILURE",
            details={"mode": "AIR_GAP_LOCAL", "reason": "Invalid credentials"}
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials for Sovereign Enclave"
        )

    # Reset rate limit counter on successful verification
    await reset_auth_rate_limit(request, identifier=uname_key)
    
    access_token = create_access_token(
        subject=user.id,
        email=user.email,
        role=user.role,
        permissions=user.permissions
    )

    await record_audit_log(
        db,
        action="LOGIN_AIRGAP",
        resource_type="auth",
        actor=user,
        resource_id=user.id,
        status="SUCCESS",
        details={"mode": "AIR_GAP_LOCAL"}
    )
    await db.commit()
    
    return TokenResponse(
        token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        token_type="bearer",
        user=user.to_schema()
    )

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: Any = Depends(get_current_user)):
    """
    Return currently authenticated operator profile and active permission matrix.
    """
    return current_user.to_schema()

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_scheme),
    current_user: Any = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Issue fresh sovereign JWT for active session and revoke the consumed token (token rotation).
    """
    if credentials and credentials.credentials:
        raw_token = credentials.credentials
        token_hash = hash_token(raw_token)
        payload = decode_access_token(raw_token)
        exp_timestamp = payload.get("exp") if payload else None
        if exp_timestamp:
            expires_at = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
        else:
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        jti = payload.get("jti") if payload else None

        stmt = select(RevokedToken).where(RevokedToken.token_hash == token_hash)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if not existing:
            revocation = RevokedToken(
                token_hash=token_hash,
                jti=jti,
                user_id=getattr(current_user, "id", None),
                expires_at=expires_at,
                reason="token_refresh_rotation"
            )
            db.add(revocation)

    access_token = create_access_token(
        subject=current_user.id,
        email=current_user.email,
        role=current_user.role,
        permissions=current_user.permissions
    )
    await db.commit()
    return TokenResponse(
        token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        token_type="bearer",
        user=current_user.to_schema()
    )

@router.post("/logout", response_model=MessageResponse)
async def logout(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_scheme),
    current_user: Any = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Terminate session and revoke bearer token in the cryptographic blacklist table.
    """
    if credentials and credentials.credentials:
        raw_token = credentials.credentials
        token_hash = hash_token(raw_token)
        payload = decode_access_token(raw_token)
        exp_timestamp = payload.get("exp") if payload else None
        if exp_timestamp:
            expires_at = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
        else:
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        jti = payload.get("jti") if payload else None

        stmt = select(RevokedToken).where(RevokedToken.token_hash == token_hash)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if not existing:
            revocation = RevokedToken(
                token_hash=token_hash,
                jti=jti,
                user_id=getattr(current_user, "id", None),
                expires_at=expires_at,
                reason="user_logout"
            )
            db.add(revocation)

    await record_audit_log(
        db,
        action="LOGOUT",
        resource_type="auth",
        actor=current_user,
        resource_id=current_user.id,
        details={"email": current_user.email}
    )
    await db.commit()

    return MessageResponse(
        success=True,
        message=f"Session for operator {current_user.email} successfully terminated"
    )
