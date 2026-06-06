import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    resident = "resident"
    security_guard = "security_guard"
    # Backward-compatible role used by the existing UI/tests. It is treated as
    # resident-equivalent by authorization helpers.
    viewer = "viewer"


class CameraStatus(str, enum.Enum):
    online = "online"
    offline = "offline"


class CameraSourceType(str, enum.Enum):
    unconfigured = "unconfigured"
    ip_mjpeg = "ip_mjpeg"
    admin_local = "admin_local"
    viewer_local = "viewer_local"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    pake_salt: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pake_verifier: Mapped[str | None] = mapped_column(String(512), nullable=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow)


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    location: Mapped[str] = mapped_column(String(160), default="Unspecified")
    status: Mapped[CameraStatus] = mapped_column(Enum(CameraStatus), default=CameraStatus.online)
    source_type: Mapped[CameraSourceType] = mapped_column(Enum(CameraSourceType), default=CameraSourceType.unconfigured)
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    share_requested: Mapped[bool] = mapped_column(default=False)
    share_approved: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow)


class AccessRequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id"), index=True)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[AccessRequestStatus] = mapped_column(
        Enum(AccessRequestStatus),
        default=AccessRequestStatus.pending,
        index=True,
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow, index=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    viewer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    camera_ids: Mapped[list[int]] = mapped_column(JSON)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    camera_id: Mapped[int | None] = mapped_column(ForeignKey("cameras.id"), nullable=True, index=True)
    granted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    access_request_id: Mapped[int | None] = mapped_column(ForeignKey("access_requests.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow, index=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    description: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True, default=datetime.utcnow)


class SecurityEvent(Base):
    __tablename__ = "security_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    severity: Mapped[str] = mapped_column(String(24), default="low", index=True)
    category: Mapped[str] = mapped_column(String(64), default="general", index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    actor_username: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)
    target_username: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True, default=datetime.utcnow)


class PakeSession(Base):
    __tablename__ = "pake_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    server_state: Mapped[str] = mapped_column(String(4096))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class UsedNonce(Base):
    __tablename__ = "used_nonces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    nonce: Mapped[str] = mapped_column(String(128), index=True)
    purpose: Mapped[str] = mapped_column(String(64), default="capability")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow, index=True)
