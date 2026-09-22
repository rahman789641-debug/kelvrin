from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field

class GoogleLoginRequest(BaseModel):
    id_token: str = Field(..., description="Google ID Token issued by Firebase/Google Auth")

class LocalLoginRequest(BaseModel):
    username: str = Field(..., description="Operator identifier or internal email")
    password: str = Field(..., description="Plaintext enclave keypass/password")

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    avatar_url: Optional[str] = None
    role: str
    company_code: Optional[str] = None
    department: Optional[str] = "Engineering"
    status: str = "active"
    permissions: List[str]
    last_login_at: Optional[str] = None
    created_at: str

class TokenResponse(BaseModel):
    token: str
    expires_in: int
    token_type: str = "bearer"
    user: UserResponse

class ApiResponse(BaseModel):
    success: bool
    data: Optional[TokenResponse] = None
    message: Optional[str] = None

class MessageResponse(BaseModel):
    success: bool
    message: str
