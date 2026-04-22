from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Assignment, SecurityEvent, User


def log_event(
    db: Session,
    event_type: str,
    *,
    actor_username: str | None = None,
    target_username: str | None = None,
    details: dict | None = None,
) -> None:
    db.add(
        SecurityEvent(
            event_type=event_type,
            actor_username=actor_username,
            target_username=target_username,
            details=details or {},
        )
    )
    db.commit()


def prune_expired_assignments(db: Session) -> list[Assignment]:
    now = datetime.now(UTC).replace(tzinfo=None)
    expired_assignments = list(db.scalars(select(Assignment).where(Assignment.expires_at <= now)).all())

    for assignment in expired_assignments:
        viewer = db.get(User, assignment.viewer_id)
        db.add(
            SecurityEvent(
                event_type="assignment_expired",
                actor_username="system",
                target_username=viewer.username if viewer else str(assignment.viewer_id),
                details={"assignment_id": assignment.id, "camera_ids": assignment.camera_ids},
            )
        )
        db.delete(assignment)

    if expired_assignments:
        db.commit()

    return expired_assignments


def recent_events_for_user(db: Session, username: str, role: str, limit: int = 20) -> Sequence[SecurityEvent]:
    stmt = select(SecurityEvent).order_by(SecurityEvent.created_at.desc()).limit(limit)
    if role != "admin":
        stmt = stmt.where(
            (SecurityEvent.actor_username == username) | (SecurityEvent.target_username == username)
        )
    return list(db.scalars(stmt).all())