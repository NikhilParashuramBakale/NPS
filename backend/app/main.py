from datetime import UTC, datetime, timedelta

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import create_access_token, verify_password
from .audit import log_event, prune_expired_assignments, recent_events_for_user
from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .deps import get_current_user, require_admin
from .models import Assignment, Camera, User, UserRole
from .schemas import (
    AssignmentCreate,
    AssignmentOut,
    CameraOut,
    LoginRequest,
    LoginResponse,
    SecurityEventOut,
    UserOut,
)
from .seed import seed_data

app = FastAPI(title="SecureCam Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_data(db)
        prune_expired_assignments(db)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or user.role.value != payload.role:
        log_event(
            db,
            "login_failure",
            actor_username=payload.username,
            details={"requested_role": payload.role, "reason": "invalid_credentials"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(payload.password, user.password_hash):
        log_event(
            db,
            "login_failure",
            actor_username=payload.username,
            details={"requested_role": payload.role, "reason": "invalid_credentials"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(subject=str(user.id), role=user.role.value)
    log_event(
        db,
        "login_success",
        actor_username=user.username,
        target_username=user.username,
        details={"role": user.role.value},
    )
    return LoginResponse(
        access_token=token,
        user=UserOut(id=user.id, username=user.username, role=user.role.value),
    )


@app.get("/api/v1/auth/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut(id=current_user.id, username=current_user.username, role=current_user.role.value)


@app.get("/api/v1/cameras", response_model=list[CameraOut])
def list_cameras(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[CameraOut]:
    _ = current_user
    cameras = db.scalars(select(Camera).order_by(Camera.id)).all()
    return [CameraOut(id=c.id, name=c.name, status=c.status.value) for c in cameras]


def _as_assignment_out(a: Assignment, db: Session) -> AssignmentOut:
    viewer = db.get(User, a.viewer_id)
    now = datetime.now(UTC).replace(tzinfo=None)
    remaining = int(max(0, (a.expires_at - now).total_seconds()))
    return AssignmentOut(
        id=a.id,
        viewer_id=a.viewer_id,
        viewer_name=viewer.username if viewer else f"Viewer {a.viewer_id}",
        camera_ids=a.camera_ids,
        expires_in=remaining,
        expires_at=a.expires_at,
    )


@app.get("/api/v1/assignments", response_model=list[AssignmentOut])
def list_assignments(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[AssignmentOut]:
    prune_expired_assignments(db)
    now = datetime.now(UTC).replace(tzinfo=None)
    stmt = select(Assignment).where(Assignment.expires_at > now)
    if current_user.role == UserRole.viewer:
        stmt = stmt.where(Assignment.viewer_id == current_user.id)

    assignments = db.scalars(stmt.order_by(Assignment.expires_at.asc())).all()
    return [_as_assignment_out(a, db) for a in assignments]


@app.post("/api/v1/assignments", response_model=AssignmentOut)
def create_assignment(
    payload: AssignmentCreate,
    _admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AssignmentOut:
    prune_expired_assignments(db)
    viewer = db.get(User, payload.viewer_id)
    if not viewer or viewer.role != UserRole.viewer:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="viewer_id must be a viewer user")

    cameras = db.scalars(select(Camera).where(Camera.id.in_(payload.camera_ids))).all()
    if len(cameras) != len(set(payload.camera_ids)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more camera_ids are invalid")

    expires_at = datetime.now(UTC).replace(tzinfo=None) + timedelta(minutes=payload.duration_minutes)
    assignment = Assignment(viewer_id=payload.viewer_id, camera_ids=sorted(set(payload.camera_ids)), expires_at=expires_at)
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    log_event(
        db,
        "assignment_created",
        actor_username=_admin_user.username,
        target_username=viewer.username,
        details={"assignment_id": assignment.id, "camera_ids": assignment.camera_ids, "expires_at": assignment.expires_at.isoformat()},
    )
    return _as_assignment_out(assignment, db)


@app.delete("/api/v1/assignments/{assignment_id}")
def revoke_assignment(
    assignment_id: str,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    assignment = db.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    viewer = db.get(User, assignment.viewer_id)
    db.delete(assignment)
    db.commit()
    log_event(
        db,
        "assignment_revoked",
        actor_username=admin_user.username,
        target_username=viewer.username if viewer else str(assignment.viewer_id),
        details={"assignment_id": assignment_id, "camera_ids": assignment.camera_ids},
    )
    return {"status": "revoked", "assignment_id": assignment_id}


@app.get("/api/v1/security/events", response_model=list[SecurityEventOut])
def security_events(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[SecurityEventOut]:
    events = recent_events_for_user(db, current_user.username, current_user.role.value)
    return [
        SecurityEventOut(
            id=event.id,
            event_type=event.event_type,
            actor_username=event.actor_username,
            target_username=event.target_username,
            details=event.details or {},
            created_at=event.created_at,
        )
        for event in events
    ]
