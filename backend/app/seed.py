from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import hash_password
from .pake_bridge import compute_verifier, generate_salt
from .models import Camera, CameraSourceType, CameraStatus, User, UserRole


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
        build_user("viewer_c", "viewer123", UserRole.viewer),
    ]

    cameras = [
        Camera(name="Camera 1", status=CameraStatus.online, source_type=CameraSourceType.unconfigured),
        Camera(name="Camera 2", status=CameraStatus.online, source_type=CameraSourceType.unconfigured),
        Camera(name="Camera 3", status=CameraStatus.offline, source_type=CameraSourceType.unconfigured),
        Camera(name="Camera 4", status=CameraStatus.online, source_type=CameraSourceType.unconfigured),
    ]

    db.add_all(users + cameras)
    db.commit()
