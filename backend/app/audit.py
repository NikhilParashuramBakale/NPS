from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Assignment, AuditLog, SecurityEvent, User


def log_event(
    db: Session,
    event_type: str,
    *,
    actor_username: str | None = None,
    target_username: str | None = None,
    details: dict | None = None,
    severity: str = "low",
    category: str = "general",
    description: str | None = None,
) -> None:
    db.add(
        SecurityEvent(
            event_type=event_type,
            severity=severity,
            category=category,
            description=description or event_type.replace("_", " ").title(),
            actor_username=actor_username,
            target_username=target_username,
            details=details or {},
        )
    )
    db.commit()


def write_audit_log(
    db: Session,
    event_type: str,
    *,
    actor_id: int | None = None,
    target_id: str | int | None = None,
    description: str,
) -> None:
    db.add(
        AuditLog(
            event_type=event_type,
            actor_id=actor_id,
            target_id=str(target_id) if target_id is not None else None,
            description=description,
        )
    )
    db.commit()


def prune_expired_assignments(db: Session) -> list[Assignment]:
    now = datetime.now(UTC).replace(tzinfo=None)
    expired_assignments = list(
        db.scalars(select(Assignment).where(Assignment.expires_at <= now, Assignment.status == "active")).all()
    )

    for assignment in expired_assignments:
        user_id = assignment.user_id or assignment.viewer_id
        viewer = db.get(User, user_id)
        assignment.status = "expired"
        db.add(assignment)
        db.add(
            SecurityEvent(
                event_type="ACCESS_EXPIRED",
                severity="medium",
                category="authorization",
                description="Temporary camera access expired automatically.",
                actor_username="system",
                target_username=viewer.username if viewer else str(user_id),
                details={
                    "assignment_id": assignment.id,
                    "camera_ids": assignment.camera_ids,
                    "camera_id": assignment.camera_id,
                },
            )
        )
        db.add(
            AuditLog(
                event_type="ACCESS_EXPIRED",
                actor_id=None,
                target_id=assignment.id,
                description="Assignment expired and was removed from active access.",
            )
        )

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
