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


class CameraOut(BaseModel):
    id: int
    name: str
    status: str


class AssignmentCreate(BaseModel):
    viewer_id: int = Field(..., ge=1)
    camera_ids: list[int] = Field(..., min_length=1)
    duration_minutes: int = Field(..., ge=1, le=240)


class AssignmentOut(BaseModel):
    id: str
    viewer_id: int
    viewer_name: str
    camera_ids: list[int]
    expires_in: int
    expires_at: datetime


class SecurityEventOut(BaseModel):
    id: str
    event_type: str
    actor_username: str | None = None
    target_username: str | None = None
    details: dict = Field(default_factory=dict)
    created_at: datetime
