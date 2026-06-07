from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import create_capability_token, decode_capability_token
from .models import Assignment, Camera, UsedNonce, User, UserRole

LIMITED_ROLES = {UserRole.viewer, UserRole.resident, UserRole.security_guard}
ASSIGNABLE_ROLES = LIMITED_ROLES


def is_limited_role(user: User) -> bool:
    return user.role in LIMITED_ROLES


def is_assignable_role(role: UserRole) -> bool:
    return role in ASSIGNABLE_ROLES


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def get_active_assignments_for_user(db: Session, user_id: int) -> list[Assignment]:
    now = _now()
    return list(
        db.scalars(
            select(Assignment).where(
                Assignment.viewer_id == user_id,
                Assignment.status == "active",
                Assignment.expires_at > now,
            )
        ).all()
    )


def assignment_covers_camera(assignment: Assignment, camera_id: int) -> bool:
    if assignment.camera_id == camera_id:
        return True
    return camera_id in (assignment.camera_ids or [])


def user_has_active_assignment(db: Session, user_id: int, camera_id: int) -> Assignment | None:
    for assignment in get_active_assignments_for_user(db, user_id):
        if assignment_covers_camera(assignment, camera_id):
            return assignment
    return None


def get_assigned_camera_ids(db: Session, user_id: int) -> set[int]:
    ids: set[int] = set()
    for assignment in get_active_assignments_for_user(db, user_id):
        ids.update(assignment.camera_ids or [])
        if assignment.camera_id is not None:
            ids.add(assignment.camera_id)
    return ids


def user_can_access_camera(db: Session, user: User, camera: Camera) -> bool:
    if user.role == UserRole.admin:
        return True
    if camera.owner_id == user.id:
        return True
    if not is_limited_role(user):
        return False
    return user_has_active_assignment(db, user.id, camera.id) is not None


def user_requires_capability_for_camera(user: User, camera: Camera) -> bool:
    if user.role == UserRole.admin:
        return False
    if camera.owner_id == user.id:
        return False
    return is_limited_role(user)


def prune_expired_nonces(db: Session) -> None:
    now = _now()
    expired = list(db.scalars(select(UsedNonce).where(UsedNonce.expires_at <= now)).all())
    for nonce in expired:
        db.delete(nonce)
    if expired:
        db.commit()


def nonce_already_used(db: Session, *, user_id: int, nonce: str) -> bool:
    return (
        db.scalar(select(UsedNonce).where(UsedNonce.user_id == user_id, UsedNonce.nonce == nonce)) is not None
    )


def store_nonce(db: Session, *, user_id: int, nonce: str, expires_at: datetime) -> None:
    if nonce_already_used(db, user_id=user_id, nonce=nonce):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nonce already used")
    db.add(
        UsedNonce(
            user_id=user_id,
            nonce=nonce,
            purpose="capability",
            expires_at=expires_at,
        )
    )
    db.commit()


def validate_capability_payload(
    db: Session,
    *,
    user: User,
    camera_id: int,
    capability_token: str,
) -> dict:
    try:
        payload = decode_capability_token(capability_token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid capability token") from exc

    if int(payload.get("sub", "0")) != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Capability token user mismatch")

    if int(payload.get("camera_id", 0)) != camera_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Capability token camera mismatch")

    if user.role != UserRole.admin and camera_id:
        camera = db.get(Camera, camera_id)
        if camera and camera.owner_id != user.id:
            assignment = user_has_active_assignment(db, user.id, camera_id)
            if not assignment:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No active assignment for camera")
            assignment_id = payload.get("assignment_id")
            if assignment_id and assignment.id != assignment_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Assignment no longer valid")

    return payload


def issue_capability_for_user(
    db: Session,
    *,
    user: User,
    camera_id: int,
    permissions: list[str],
) -> tuple[str, datetime]:
    camera = db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    if not camera.is_active and user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Camera is disabled")

    if user.role == UserRole.admin:
        expires_at = _now() + timedelta(minutes=30)
        assignment_id = "admin-override"
    elif camera.owner_id == user.id:
        expires_at = _now() + timedelta(minutes=30)
        assignment_id = "owner-access"
    else:
        assignment = user_has_active_assignment(db, user.id, camera_id)
        if not assignment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No active assignment for camera")
        assignment_id = assignment.id
        expires_at = min(assignment.expires_at, _now() + timedelta(minutes=15))

    token = create_capability_token(
        user_id=user.id,
        camera_id=camera_id,
        assignment_id=assignment_id,
        permissions=permissions,
        expires_at=expires_at,
    )
    return token, expires_at


def enforce_camera_access(
    db: Session,
    *,
    user: User,
    camera: Camera,
    capability_token: str | None = None,
) -> None:
    if not camera.is_active and user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Camera is disabled")

    if user.role == UserRole.admin or camera.owner_id == user.id:
        return

    if not is_limited_role(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Camera not accessible")

    assignment = user_has_active_assignment(db, user.id, camera.id)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Camera not assigned")

    if user_requires_capability_for_camera(user, camera):
        if not capability_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Capability token required",
            )
        validate_capability_payload(
            db,
            user=user,
            camera_id=camera.id,
            capability_token=capability_token,
        )
