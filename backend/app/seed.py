from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import hash_password
from .pake_bridge import compute_verifier, generate_salt
from datetime import UTC, datetime, timedelta

from .models import (
    AccessRequest,
    AccessRequestStatus,
    Assignment,
    AuditLog,
    Camera,
    CameraSourceType,
    CameraStatus,
    SecurityEvent,
    User,
    UserRole,
)


def seed_data(db: Session) -> None:
    has_user = db.scalar(select(User.id).limit(1))
    if has_user:
        return

    def build_user(username: str, password: str, role: UserRole) -> User:
        salt = generate_salt()
        verifier = compute_verifier(password, salt, username)
        return User(
            username=username,
            password_hash=hash_password(password),
            role=role,
            pake_salt=salt,
            pake_verifier=verifier,
        )

    users = [
        build_user("admin_user", "admin123", UserRole.admin),
        build_user("viewer_a", "viewer123", UserRole.viewer),
        build_user("viewer_b", "viewer123", UserRole.viewer),
        build_user("resident_a", "resident123", UserRole.resident),
        build_user("resident_b", "resident123", UserRole.resident),
        build_user("guard_a", "guard123", UserRole.security_guard),
    ]

    cameras = [
        Camera(name="Admin Webcam", location="Admin workstation", status=CameraStatus.online, source_type=CameraSourceType.unconfigured),
        Camera(name="Admin IP Camera", location="Network camera", status=CameraStatus.online, source_type=CameraSourceType.unconfigured),
    ]

    db.add_all(users + cameras)
    db.commit()

    admin = db.scalar(select(User).where(User.username == "admin_user"))
    resident_a = db.scalar(select(User).where(User.username == "resident_a"))
    resident_b = db.scalar(select(User).where(User.username == "resident_b"))
    admin_webcam = db.scalar(select(Camera).where(Camera.name == "Admin Webcam"))
    admin_ip = db.scalar(select(Camera).where(Camera.name == "Admin IP Camera"))
    now = datetime.now(UTC).replace(tzinfo=None)

    if admin and resident_a and resident_b and admin_webcam and admin_ip:
        approved_request = AccessRequest(
            requester_id=resident_a.id,
            camera_id=admin_webcam.id,
            reason="My bicycle was stolen from the parking area.",
            status=AccessRequestStatus.approved,
            requested_at=now - timedelta(hours=3),
            reviewed_at=now - timedelta(hours=2),
            reviewed_by=admin.id,
        )
        pending_request = AccessRequest(
            requester_id=resident_b.id,
            camera_id=admin_ip.id,
            reason="Vehicle was scratched near the entry gate.",
            status=AccessRequestStatus.pending,
            requested_at=now - timedelta(minutes=45),
        )
        assignment = Assignment(
            viewer_id=resident_a.id,
            user_id=resident_a.id,
            camera_id=admin_webcam.id,
            camera_ids=[admin_webcam.id],
            expires_at=now + timedelta(hours=22),
            granted_by=admin.id,
            status="active",
        )
        db.add_all([approved_request, pending_request, assignment])
        db.commit()
        assignment.access_request_id = approved_request.id
        db.add_all(
            [
                SecurityEvent(
                    event_type="ACCESS_GRANTED",
                    severity="low",
                    category="authorization",
                    description="Demo temporary access granted for Admin Webcam.",
                    actor_username=admin.username,
                    target_username=resident_a.username,
                    details={"camera_id": admin_webcam.id, "assignment_id": assignment.id},
                ),
                SecurityEvent(
                    event_type="SECURITY_ALERT",
                    severity="medium",
                    category="incident",
                    description="Demo alert: suspicious activity near parking area.",
                    actor_username="system",
                    target_username=resident_a.username,
                    details={"camera_id": admin_webcam.id},
                ),
                AuditLog(
                    event_type="ACCESS_GRANTED",
                    actor_id=admin.id,
                    target_id=assignment.id,
                    description="Seeded demo grant for resident_a to Admin Webcam.",
                ),
            ]
        )
        db.commit()
