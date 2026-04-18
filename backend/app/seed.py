from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import hash_password
from .models import Camera, CameraStatus, User, UserRole


def seed_data(db: Session) -> None:
    has_user = db.scalar(select(User.id).limit(1))
    if has_user:
        return

    users = [
        User(username="admin_user", password_hash=hash_password("admin123"), role=UserRole.admin),
        User(username="viewer_a", password_hash=hash_password("viewer123"), role=UserRole.viewer),
        User(username="viewer_b", password_hash=hash_password("viewer123"), role=UserRole.viewer),
        User(username="viewer_c", password_hash=hash_password("viewer123"), role=UserRole.viewer),
    ]

    cameras = [
        Camera(name="Camera 1", status=CameraStatus.online),
        Camera(name="Camera 2", status=CameraStatus.online),
        Camera(name="Camera 3", status=CameraStatus.offline),
        Camera(name="Camera 4", status=CameraStatus.online),
    ]

    db.add_all(users + cameras)
    db.commit()
