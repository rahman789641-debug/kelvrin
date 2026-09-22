import json
import os
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

logger = logging.getLogger("kelvrin.companies")

router = APIRouter(prefix="/companies", tags=["Companies & Access Control"])

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data")
STORE_FILE = os.path.join(DATA_DIR, "companies_store.json")

import asyncio
import tempfile

_store_lock = asyncio.Lock()
_cache: Optional[Dict[str, Any]] = None

def _ensure_store_exists():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(STORE_FILE):
        default_data = {
            "companies": {},
            "admins": {},
            "access_requests": []
        }
        with open(STORE_FILE, "w", encoding="utf-8") as f:
            json.dump(default_data, f, indent=2)

def _read_store() -> Dict[str, Any]:
    global _cache
    if _cache is not None:
        return dict(_cache)
    _ensure_store_exists()
    try:
        with open(STORE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            _cache = data
            return dict(data)
    except Exception as e:
        logger.error(f"[CompaniesStore] Read error: {e}")
        return {"companies": {}, "admins": {}, "access_requests": []}

def _write_store(data: Dict[str, Any]):
    global _cache
    _ensure_store_exists()
    _cache = dict(data)
    tmp_file = f"{STORE_FILE}.tmp.{os.getpid()}"
    try:
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_file, STORE_FILE)
    except Exception as e:
        logger.error(f"[CompaniesStore] Write error: {e}")
        if os.path.exists(tmp_file):
            try:
                os.remove(tmp_file)
            except OSError as oe:
                logger.warning(f"[CompaniesStore] Could not remove temp file '{tmp_file}': {oe}")

# Pydantic Schemas
class CompanyCreate(BaseModel):
    name: str
    code: str
    country: Optional[str] = "IN"
    state: Optional[str] = "TN"
    district: Optional[str] = "Chennai"
    logoDataUrl: Optional[str] = None
    website: Optional[str] = None
    registeredAt: Optional[str] = None

class AdminCreate(BaseModel):
    username: Optional[str] = None
    email: str
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    fullName: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    companyCode: str
    companyName: Optional[str] = None
    securityQuestionType: Optional[str] = None
    securityAnswer: Optional[str] = None

class AccessRequestCreate(BaseModel):
    id: Optional[str] = None
    fullName: str
    email: str
    role: str
    companyCode: str
    companyName: Optional[str] = None
    avatarUrl: Optional[str] = None
    authProvider: Optional[str] = "google"

class AccessRequestStatusUpdate(BaseModel):
    status: str # 'approved' | 'rejected'
    approvedBy: Optional[str] = "Super Admin"

@router.post("", status_code=status.HTTP_201_CREATED)
async def register_company(payload: CompanyCreate):
    """Register or update a company code in the backend."""
    store = _read_store()
    code_key = payload.code.strip().upper()
    
    comp_record = {
        "name": payload.name.strip(),
        "code": code_key,
        "country": payload.country or "IN",
        "state": payload.state or "TN",
        "district": payload.district or "Chennai",
        "logoDataUrl": payload.logoDataUrl,
        "website": payload.website,
        "registeredAt": payload.registeredAt or datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    
    store["companies"][code_key] = comp_record
    _write_store(store)
    logger.info(f"[Companies] Successfully registered company {code_key} ({payload.name})")
    return {"success": True, "company": comp_record}

@router.get("")
async def list_companies():
    """List all registered companies."""
    store = _read_store()
    return list(store.get("companies", {}).values())

# ==========================================
# ACCESS REQUESTS (MUST PRECEDE /{code})
# ==========================================

@router.post("/access-requests", status_code=status.HTTP_201_CREATED)
async def submit_access_request(payload: AccessRequestCreate):
    """Submit an access authorization request for Super Admin approval."""
    store = _read_store()
    req_id = payload.id or f"req_{int(datetime.now().timestamp() * 1000)}"
    email_key = payload.email.strip().lower()
    code_key = payload.companyCode.strip().upper()

    req_record = {
        "id": req_id,
        "fullName": payload.fullName.strip(),
        "email": email_key,
        "role": payload.role,
        "companyCode": code_key,
        "companyName": payload.companyName,
        "avatarUrl": payload.avatarUrl,
        "status": "pending_approval",
        "requestedAt": datetime.now(timezone.utc).isoformat(),
        "authProvider": payload.authProvider or "google"
    }

    requests: List[Dict[str, Any]] = store.get("access_requests", [])
    updated = False
    for i, r in enumerate(requests):
        if r.get("email") == email_key and r.get("companyCode") == code_key:
            if r.get("status") == "approved":
                return r
            requests[i] = req_record
            updated = True
            break

    if not updated:
        requests.insert(0, req_record)

    store["access_requests"] = requests
    _write_store(store)
    logger.info(f"[AccessRequests] Created request {req_id} for {email_key} ({payload.role})")
    return req_record

@router.get("/access-requests")
async def list_access_requests(company_code: Optional[str] = Query(None)):
    """List access requests, optionally filtered by company code."""
    store = _read_store()
    requests = store.get("access_requests", [])
    if company_code:
        code_key = company_code.strip().upper()
        return [r for r in requests if r.get("companyCode", "").upper() == code_key]
    return requests

@router.put("/access-requests/{request_id}/status")
async def update_access_request_status(request_id: str, payload: AccessRequestStatusUpdate):
    """Approve or reject an access authorization request."""
    store = _read_store()
    requests = store.get("access_requests", [])
    found = None
    for i, r in enumerate(requests):
        if r.get("id") == request_id:
            requests[i]["status"] = payload.status
            requests[i]["approvedBy"] = payload.approvedBy
            requests[i]["approvedAt"] = datetime.now(timezone.utc).isoformat()
            found = requests[i]
            break

    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access request not found")

    store["access_requests"] = requests
    _write_store(store)
    logger.info(f"[AccessRequests] Request {request_id} updated to {payload.status} by {payload.approvedBy}")
    return {"success": True, "request": found}

# ==========================================
# ADMINS
# ==========================================

@router.post("/admins")
async def register_admin(payload: AdminCreate):
    """Register super admin credentials in the backend."""
    store = _read_store()
    email_key = payload.email.strip().lower()
    admin_record = {
        **payload.dict(),
        "email": email_key,
        "companyCode": payload.companyCode.strip().upper(),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    store["admins"][email_key] = admin_record
    _write_store(store)
    return {"success": True, "admin": admin_record}

@router.get("/admins/{identifier}")
async def get_admin(identifier: str):
    """Retrieve super admin by email or username."""
    store = _read_store()
    target = identifier.strip().lower()
    for email, admin in store.get("admins", {}).items():
        if email == target or (admin.get("username") and admin.get("username").lower() == target):
            return admin
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")

@router.post("/purge-company")
async def purge_company(payload: Dict[str, Any]):
    """Purge all records for a specific company code or reset store."""
    company_code = payload.get("companyCode", "").strip().upper()
    store = _read_store()
    if company_code:
        if company_code in store.get("companies", {}):
            del store["companies"][company_code]
        store["access_requests"] = [r for r in store.get("access_requests", []) if r.get("companyCode", "").upper() != company_code]
        store["admins"] = {k: v for k, v in store.get("admins", {}).items() if v.get("companyCode", "").upper() != company_code}
        logger.info(f"[Companies] Purged all backend data for company {company_code}")
    else:
        store = {"companies": {}, "admins": {}, "access_requests": []}
        logger.info("[Companies] Complete backend reset performed.")
    _write_store(store)
    return {"success": True, "message": "Company purged successfully"}

# ==========================================
# COMPANY VERIFICATION & LOOKUP BY CODE
# ==========================================

@router.get("/verify/{code}")
async def verify_company(code: str):
    """
    Verify if a company code is registered in the sovereign registry.
    Returns verified status and details so cross-system clients (e.g. India <-> US) can verify instantly.
    """
    store = _read_store()
    code_key = code.strip().upper()
    comp = store.get("companies", {}).get(code_key)
    if not comp:
        for k, v in store.get("companies", {}).items():
            if k.upper() == code_key:
                comp = v
                break

    if comp:
        return {
            "verified": True,
            "company": comp,
            "message": f"Company '{comp.get('name')}' ({code_key}) is verified and registered."
        }

    return {
        "verified": False,
        "company": None,
        "message": f"Company Code '{code}' is not registered or unverified."
    }

@router.get("/{code}")
async def get_company(code: str):
    """Retrieve company details by Company Code."""
    store = _read_store()
    code_key = code.strip().upper()
    comp = store.get("companies", {}).get(code_key)
    if not comp:
        for k, v in store.get("companies", {}).items():
            if k.upper() == code_key:
                return v
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company Code '{code}' not registered."
        )
    return comp
