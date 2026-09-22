from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class UserBase(BaseModel):
    email: str
    full_name: str
    department: Optional[str] = "Engineering"
    avatar_url: Optional[str] = None
    role: str = "Analyst"
    status: str = "ACTIVE"

class UserCreate(UserBase):
    password: Optional[str] = Field(None, min_length=8)

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    avatar_url: Optional[str] = None

class UserStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(ACTIVE|SUSPENDED|DEACTIVATED)$")

class UserRoleUpdate(BaseModel):
    role_name: str = Field(..., description="Role to assign to user")

class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    department: Optional[str] = "Engineering"
    avatar_url: Optional[str] = None
    role: str
    status: str
    permissions: List[str] = []
    last_login_at: Optional[str] = None
    created_at: str

    model_config = ConfigDict(from_attributes=True)

class PermissionOut(BaseModel):
    id: str
    code: str
    module: str
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class RoleOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    is_system_role: bool
    permissions: List[str] = []

    model_config = ConfigDict(from_attributes=True)
