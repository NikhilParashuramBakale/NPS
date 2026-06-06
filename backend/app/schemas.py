from datetime import datetime

from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: int
    username: str
    role: str


class LoginRequest(BaseModel):
    username: str
    password: str
    role: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class PakeStartRequest(BaseModel):
    username: str
    role: str


class PakeStartResponse(BaseModel):
    session_id: str
    salt: str
    server_msg: str
    server_id: str
    mhf: dict
    kdf_aad: str


class PakeFinishRequest(BaseModel):
    session_id: str
    client_msg: str
    confirm_a: str


class PakeFinishResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    confirm_b: str
    user: UserOut


class PakeUpgradeRequest(BaseModel):
    username: str
    password: str
    role: str


class PakeUpgradeResponse(BaseModel):
    status: str


class AdminUserCreate(BaseModel):
    username: str
    password: str = Field(..., min_length=8)
    role: str


class CameraOut(BaseModel):
    id: int
    name: str
    location: str = "Unspecified"
    status: str
    source_type: str
    source_url: str | None = None
    owner_id: int | None = None
    is_active: bool = True
    share_requested: bool = False
    share_approved: bool = True


class CameraCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    location: str = Field(default="Unspecified", max_length=160)
    source_type: str
    source_url: str | None = None
    request_share: bool = False


class CameraUpdate(BaseModel):
    source_type: str
    source_url: str | None = None


class AdminCameraAccessUpdate(BaseModel):
    is_active: bool | None = None
    share_approved: bool | None = None
    clear_share_request: bool = False


class AssignmentCreate(BaseModel):
    viewer_id: int = Field(..., ge=1)
    camera_ids: list[int] = Field(..., min_length=1)
    duration_minutes: int = Field(..., ge=1, le=240)


class AssignmentOut(BaseModel):
    id: str
    viewer_id: int
    viewer_name: str
    camera_ids: list[int]
    user_id: int | None = None
    camera_id: int | None = None
    status: str = "active"
    expires_in: int
    expires_at: datetime


class SecurityEventOut(BaseModel):
    id: str
    event_type: str
    severity: str = "low"
    category: str = "general"
    description: str = ""
    actor_username: str | None = None
    target_username: str | None = None
    details: dict = Field(default_factory=dict)
    created_at: datetime


class AccessRequestCreate(BaseModel):
    camera_id: int = Field(..., ge=1)
    reason: str = Field(..., min_length=10, max_length=1000)


class AccessRequestOut(BaseModel):
    id: int
    requester_id: int
    requester_name: str
    camera_id: int
    camera_name: str
    reason: str
    status: str
    requested_at: datetime
    reviewed_at: datetime | None = None
    reviewed_by: int | None = None


class AccessRequestReview(BaseModel):
    duration_hours: int = Field(default=24, ge=1, le=72)


class RejectRequestPayload(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class AuditLogOut(BaseModel):
    id: str
    event_type: str
    actor_id: int | None = None
    target_id: str | None = None
    description: str
    created_at: datetime


class CapabilityIssueRequest(BaseModel):
    camera_id: int = Field(..., ge=1)
    permissions: list[str] = Field(default_factory=lambda: ["VIEW"])


class CapabilityTokenOut(BaseModel):
    capability_token: str
    token_type: str = "capability"
    camera_id: int
    permissions: list[str]
    expires_at: datetime


class CapabilityValidateRequest(BaseModel):
    camera_id: int = Field(..., ge=1)
    capability_token: str
    nonce: str = Field(..., min_length=8, max_length=128)


class CapabilityValidateOut(BaseModel):
    status: str
    camera_id: int
    permissions: list[str]


class SecurityDashboardOut(BaseModel):
    authentication_success_count: int
    authentication_failure_count: int
    pending_requests: int
    approved_requests: int
    rejected_requests: int
    expired_assignments: int
    revoked_assignments: int
    recent_security_events: list[SecurityEventOut]
    recent_audit_logs: list[AuditLogOut]
