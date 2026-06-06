import asyncio
import contextlib
from datetime import UTC, datetime, timedelta
import logging
from typing import AsyncIterator

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from .auth import (
    create_access_token,
    create_capability_token,
    decode_capability_token,
    hash_password,
    needs_password_rehash,
    verify_password,
)
from .audit import log_event, prune_expired_assignments, recent_events_for_user, write_audit_log
from .config import settings
from .database import (
    Base,
    SessionLocal,
    engine,
    ensure_camera_source_columns,
    ensure_security_project_columns,
    ensure_user_pake_columns,
    get_db,
)
from .deps import get_current_user, get_current_user_from_token, require_admin
from .models import (
    AccessRequest,
    AccessRequestStatus,
    Assignment,
    AuditLog,
    Camera,
    CameraSourceType,
    CameraStatus,
    PakeSession,
    SecurityEvent,
    UsedNonce,
    User,
    UserRole,
)
from .pake_bridge import compute_verifier, finish_pake, generate_salt, pake_public_config, start_pake
from .schemas import (
    AdminCameraAccessUpdate,
    AdminUserCreate,
    AccessRequestCreate,
    AccessRequestOut,
    AccessRequestReview,
    AuditLogOut,
    AssignmentCreate,
    AssignmentOut,
    CapabilityIssueRequest,
    CapabilityTokenOut,
    CapabilityValidateOut,
    CapabilityValidateRequest,
    CameraCreate,
    CameraOut,
    CameraUpdate,
    LoginRequest,
    LoginResponse,
    PakeFinishRequest,
    PakeFinishResponse,
    PakeStartRequest,
    PakeStartResponse,
    PakeUpgradeRequest,
    PakeUpgradeResponse,
    RejectRequestPayload,
    SecurityDashboardOut,
    SecurityEventOut,
    UserOut,
)
from .seed import seed_data

app = FastAPI(title="SecureCam Backend", version="0.1.0")
logger = logging.getLogger("securecam.auth")

CAMERA_FRAMES: dict[int, bytes] = {}
CAMERA_STREAM_HUBS: dict[int, "CameraStreamHub"] = {}
CAMERA_STREAM_LOCK = asyncio.Lock()


class CameraStreamHub:
    def __init__(self, camera_id: int, source_url: str) -> None:
        self.camera_id = camera_id
        self.source_url = source_url
        self._subscribers: set[asyncio.Queue[bytes | None]] = set()
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    async def add_subscriber(self) -> asyncio.Queue[bytes | None]:
        queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=200)
        async with self._lock:
            self._subscribers.add(queue)
            if not self._task or self._task.done():
                self._task = asyncio.create_task(self._run())
        return queue

    async def remove_subscriber(self, queue: asyncio.Queue[bytes | None]) -> None:
        async with self._lock:
            self._subscribers.discard(queue)

    async def shutdown(self) -> None:
        async with self._lock:
            subscribers = list(self._subscribers)
        for queue in subscribers:
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(None)
        if self._task and not self._task.done():
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        self._task = None

    async def _run(self) -> None:
        while True:
            async with self._lock:
                if not self._subscribers:
                    return

            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(5.0, read=None), follow_redirects=True) as client:
                    async with client.stream("GET", self.source_url) as response:
                        if response.status_code >= 400:
                            await asyncio.sleep(1.5)
                            continue
                        async for chunk in response.aiter_bytes():
                            if not chunk:
                                continue
                            async with self._lock:
                                subscribers = list(self._subscribers)
                            if not subscribers:
                                return
                            for queue in subscribers:
                                if queue.full():
                                    with contextlib.suppress(asyncio.QueueEmpty):
                                        queue.get_nowait()
                                with contextlib.suppress(asyncio.QueueFull):
                                    queue.put_nowait(chunk)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                await asyncio.sleep(1.5)


async def _get_stream_hub(camera_id: int, source_url: str) -> CameraStreamHub:
    async with CAMERA_STREAM_LOCK:
        hub = CAMERA_STREAM_HUBS.get(camera_id)
        if hub and hub.source_url != source_url:
            await hub.shutdown()
            hub = None
        if not hub:
            hub = CameraStreamHub(camera_id, source_url)
            CAMERA_STREAM_HUBS[camera_id] = hub
        return hub


async def _release_stream_hub(camera_id: int) -> None:
    async with CAMERA_STREAM_LOCK:
        hub = CAMERA_STREAM_HUBS.get(camera_id)
        if not hub:
            return
        async with hub._lock:
            if hub._subscribers:
                return
        await hub.shutdown()
        CAMERA_STREAM_HUBS.pop(camera_id, None)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.url.scheme == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
        return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)


def _validate_startup_settings() -> None:
    if not settings.cors_origin_list:
        raise RuntimeError("CORS_ORIGINS must not be empty")

    if settings.pake_session_ttl_seconds <= 0:
        raise RuntimeError("PAKE_SESSION_TTL_SECONDS must be positive")

    if settings.app_env.lower() == "prod":
        weak_secrets = {"dev-only-secret", "change-this-before-production"}
        if settings.jwt_secret in weak_secrets or len(settings.jwt_secret) < 16:
            raise RuntimeError("JWT_SECRET must be set to a strong value in production")


@app.on_event("startup")
def startup() -> None:
    _validate_startup_settings()
    Base.metadata.create_all(bind=engine)
    ensure_user_pake_columns()
    ensure_camera_source_columns()
    ensure_security_project_columns()
    with SessionLocal() as db:
        seed_data(db)
        prune_expired_assignments(db)
        _prune_expired_pake_sessions(db)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/login", response_model=LoginResponse)
@app.post("/api/v1/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not _role_matches(user, payload.role):
        log_event(
            db,
            "LOGIN_FAILURE",
            actor_username=payload.username,
            details={"requested_role": payload.role, "reason": "invalid_credentials"},
            severity="medium",
            category="authentication",
            description="Login failed because credentials or role did not match.",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(payload.password, user.password_hash):
        log_event(
            db,
            "LOGIN_FAILURE",
            actor_username=payload.username,
            details={"requested_role": payload.role, "reason": "invalid_credentials"},
            severity="medium",
            category="authentication",
            description="Login failed because credentials were invalid.",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if needs_password_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)
        db.add(user)
        db.commit()

    token = create_access_token(subject=str(user.id), role=user.role.value)
    log_event(
        db,
        "LOGIN_SUCCESS",
        actor_username=user.username,
        target_username=user.username,
        details={"role": user.role.value},
        severity="low",
        category="authentication",
        description="User authenticated successfully.",
    )
    write_audit_log(
        db,
        "LOGIN_SUCCESS",
        actor_id=user.id,
        target_id=user.id,
        description=f"{user.username} authenticated with password fallback.",
    )
    return LoginResponse(
        access_token=token,
        user=UserOut(id=user.id, username=user.username, role=user.role.value),
    )


def _prune_expired_pake_sessions(db: Session) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    db.execute(delete(PakeSession).where(PakeSession.expires_at <= now))
    db.commit()


def _as_camera_out(camera: Camera) -> CameraOut:
    return CameraOut(
        id=camera.id,
        name=camera.name,
        location=camera.location or "Unspecified",
        status=camera.status.value,
        source_type=camera.source_type.value if camera.source_type else CameraSourceType.unconfigured.value,
        source_url=camera.source_url,
        owner_id=camera.owner_id,
        is_active=camera.is_active,
        share_requested=camera.share_requested,
        share_approved=camera.share_approved,
    )


def _role_value(role: str) -> str:
    return "resident" if role == "viewer" else role


def _is_resident_role(role: UserRole) -> bool:
    return role in {UserRole.resident, UserRole.viewer}


def _uses_temporary_access(role: UserRole) -> bool:
    return role in {UserRole.resident, UserRole.viewer, UserRole.security_guard}


def _role_matches(user: User, requested_role: str) -> bool:
    return _role_value(user.role.value) == _role_value(requested_role)


def _as_security_event_out(event: SecurityEvent) -> SecurityEventOut:
    return SecurityEventOut(
        id=event.id,
        event_type=event.event_type,
        severity=event.severity or "low",
        category=event.category or "general",
        description=event.description or "",
        actor_username=event.actor_username,
        target_username=event.target_username,
        details=event.details or {},
        created_at=event.created_at,
    )


def _as_audit_log_out(log: AuditLog) -> AuditLogOut:
    return AuditLogOut(
        id=log.id,
        event_type=log.event_type,
        actor_id=log.actor_id,
        target_id=log.target_id,
        description=log.description,
        created_at=log.created_at,
    )


def _as_access_request_out(request: AccessRequest, db: Session) -> AccessRequestOut:
    requester = db.get(User, request.requester_id)
    camera = db.get(Camera, request.camera_id)
    return AccessRequestOut(
        id=request.id,
        requester_id=request.requester_id,
        requester_name=requester.username if requester else f"User {request.requester_id}",
        camera_id=request.camera_id,
        camera_name=camera.name if camera else f"Camera {request.camera_id}",
        reason=request.reason,
        status=request.status.value if hasattr(request.status, "value") else str(request.status),
        requested_at=request.requested_at,
        reviewed_at=request.reviewed_at,
        reviewed_by=request.reviewed_by,
    )


def _active_assignment_for(db: Session, user_id: int, camera_id: int) -> Assignment | None:
    now = datetime.now(UTC).replace(tzinfo=None)
    assignments = db.scalars(
        select(Assignment).where(
            Assignment.expires_at > now,
            Assignment.status == "active",
        )
    ).all()
    for assignment in assignments:
        assignee = assignment.user_id or assignment.viewer_id
        camera_ids = assignment.camera_ids or ([] if assignment.camera_id is None else [assignment.camera_id])
        if assignee == user_id and camera_id in set(camera_ids):
            return assignment
    return None


@app.post("/api/v1/auth/pake/start", response_model=PakeStartResponse)
def pake_start(payload: PakeStartRequest, db: Session = Depends(get_db)) -> PakeStartResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not _role_matches(user, payload.role):
        log_event(
            db,
            "LOGIN_FAILURE",
            actor_username=payload.username,
            details={"requested_role": payload.role, "reason": "invalid_credentials"},
            severity="medium",
            category="authentication",
            description="PAKE login start failed because credentials or role did not match.",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.pake_salt or not user.pake_verifier:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="PAKE verifier missing; reset password")

    _prune_expired_pake_sessions(db)
    result = start_pake(user.pake_verifier, user.username)
    now = datetime.now(UTC).replace(tzinfo=None)
    expires_at = now + timedelta(seconds=settings.pake_session_ttl_seconds)
    session = PakeSession(user_id=user.id, server_state=result["server_state"], expires_at=expires_at)
    db.add(session)
    db.commit()

    public_cfg = pake_public_config()
    return PakeStartResponse(
        session_id=session.id,
        salt=user.pake_salt,
        server_msg=result["server_msg"],
        server_id=public_cfg["server_id"],
        mhf=public_cfg["mhf"],
        kdf_aad=public_cfg["kdf_aad"],
    )


@app.post("/api/v1/auth/pake/finish", response_model=PakeFinishResponse)
def pake_finish(payload: PakeFinishRequest, db: Session = Depends(get_db)) -> PakeFinishResponse:
    session = db.get(PakeSession, payload.session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    now = datetime.now(UTC).replace(tzinfo=None)
    if session.expires_at <= now:
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    user = db.get(User, session.user_id)
    if not user:
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    try:
        result = finish_pake(session.server_state, payload.client_msg, payload.confirm_a)
    except Exception as exc:  # noqa: BLE001
        db.delete(session)
        db.commit()
        logger.exception("PAKE finish failed for user %s", user.username)
        log_event(
            db,
            "LOGIN_FAILURE",
            actor_username=user.username,
            details={"requested_role": user.role.value, "reason": "pake_failed", "error": str(exc)},
            severity="medium",
            category="authentication",
            description="PAKE confirmation failed.",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    db.delete(session)
    db.commit()

    token = create_access_token(subject=str(user.id), role=user.role.value)
    log_event(
        db,
        "LOGIN_SUCCESS",
        actor_username=user.username,
        target_username=user.username,
        details={"role": user.role.value, "method": "pake"},
        severity="low",
        category="authentication",
        description="User authenticated successfully with PAKE.",
    )
    write_audit_log(
        db,
        "LOGIN_SUCCESS",
        actor_id=user.id,
        target_id=user.id,
        description=f"{user.username} authenticated with PAKE.",
    )
    return PakeFinishResponse(
        access_token=token,
        confirm_b=result["confirm_b"],
        user=UserOut(id=user.id, username=user.username, role=user.role.value),
    )


@app.post("/api/v1/auth/pake/upgrade", response_model=PakeUpgradeResponse)
def pake_upgrade(payload: PakeUpgradeRequest, db: Session = Depends(get_db)) -> PakeUpgradeResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not _role_matches(user, payload.role):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    salt = generate_salt()
    verifier = compute_verifier(payload.password, salt, payload.username)
    user.pake_salt = salt
    user.pake_verifier = verifier
    db.add(user)
    db.commit()

    log_event(
        db,
        "pake_upgraded",
        actor_username=user.username,
        target_username=user.username,
        details={"role": user.role.value},
    )

    return PakeUpgradeResponse(status="ok")


@app.get("/api/v1/auth/me", response_model=UserOut)
@app.get("/auth/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut(id=current_user.id, username=current_user.username, role=current_user.role.value)


@app.post("/auth/logout")
@app.post("/api/v1/auth/logout")
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, str]:
    log_event(
        db,
        "LOGOUT",
        actor_username=current_user.username,
        target_username=current_user.username,
        severity="low",
        category="authentication",
        description="User logged out.",
    )
    write_audit_log(
        db,
        "LOGOUT",
        actor_id=current_user.id,
        target_id=current_user.id,
        description=f"{current_user.username} logged out.",
    )
    return {"status": "ok"}


@app.get("/cameras", response_model=list[CameraOut])
@app.get("/api/v1/cameras", response_model=list[CameraOut])
def list_cameras(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[CameraOut]:
    prune_expired_assignments(db)
    if _uses_temporary_access(current_user.role):
        now = datetime.now(UTC).replace(tzinfo=None)
        assignments = db.scalars(
            select(Assignment).where(Assignment.viewer_id == current_user.id, Assignment.expires_at > now)
        ).all()
        assigned_ids = {cid for a in assignments for cid in a.camera_ids}
        owned = db.scalars(select(Camera).where(Camera.owner_id == current_user.id).order_by(Camera.id)).all()
        cameras: dict[int, Camera] = {}
        if assigned_ids:
            for cam in db.scalars(select(Camera).where(Camera.id.in_(assigned_ids)).order_by(Camera.id)).all():
                cameras[cam.id] = cam
        for cam in owned:
            cameras[cam.id] = cam
        visible = [cam for cam in cameras.values() if cam.is_active]
        visible.sort(key=lambda cam: cam.id)
        return [_as_camera_out(camera) for camera in visible]
    else:
        cameras = db.scalars(select(Camera).order_by(Camera.id)).all()
        return [_as_camera_out(camera) for camera in cameras]


@app.post("/api/v1/cameras", response_model=CameraOut)
def create_viewer_camera(
    payload: CameraCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CameraOut:
    if not _is_resident_role(current_user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Resident role required")

    if payload.source_type not in {CameraSourceType.ip_mjpeg.value, CameraSourceType.viewer_local.value}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid source_type")

    if payload.source_type == CameraSourceType.ip_mjpeg.value and not payload.source_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source_url required for ip_mjpeg")

    existing = db.scalar(select(Camera).where(Camera.name == payload.name))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Camera name already exists")

    camera = Camera(
        name=payload.name,
        status=CameraStatus.online,
        location=payload.location or "Unspecified",
        source_type=CameraSourceType(payload.source_type),
        source_url=payload.source_url if payload.source_type == CameraSourceType.ip_mjpeg.value else None,
        owner_id=current_user.id,
        is_active=True,
        share_requested=bool(payload.request_share),
        share_approved=False,
    )
    db.add(camera)
    db.commit()
    db.refresh(camera)

    log_event(
        db,
        "viewer_camera_created",
        actor_username=current_user.username,
        target_username=None,
        details={"camera_id": camera.id, "source_type": camera.source_type.value, "request_share": camera.share_requested},
    )

    return _as_camera_out(camera)


@app.put("/api/v1/cameras/{camera_id}", response_model=CameraOut)
def update_viewer_camera(
    camera_id: int,
    payload: CameraUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CameraOut:
    camera = db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    if camera.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Camera owner required")

    if not camera.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Camera is disabled")

    if payload.source_type not in {CameraSourceType.ip_mjpeg.value, CameraSourceType.viewer_local.value}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid source_type")

    if payload.source_type == CameraSourceType.ip_mjpeg.value and not payload.source_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source_url required for ip_mjpeg")

    camera.source_type = CameraSourceType(payload.source_type)
    camera.source_url = payload.source_url if payload.source_type == CameraSourceType.ip_mjpeg.value else None
    db.add(camera)
    db.commit()
    db.refresh(camera)

    log_event(
        db,
        "viewer_camera_updated",
        actor_username=current_user.username,
        target_username=None,
        details={"camera_id": camera.id, "source_type": camera.source_type.value},
    )

    return _as_camera_out(camera)


@app.post("/api/v1/cameras/{camera_id}/share-request", response_model=CameraOut)
def request_camera_share(
    camera_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CameraOut:
    camera = db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    if camera.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Camera owner required")

    if not camera.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Camera is disabled")

    camera.share_requested = True
    db.add(camera)
    db.commit()
    db.refresh(camera)

    log_event(
        db,
        "viewer_camera_share_requested",
        actor_username=current_user.username,
        target_username=None,
        details={"camera_id": camera.id},
    )

    return _as_camera_out(camera)


@app.get("/api/v1/cameras/{camera_id}/frame")
def get_camera_frame(
    camera_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    camera = db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    if not camera.is_active and current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Camera is disabled")

    is_owner = camera.owner_id == current_user.id

    if _uses_temporary_access(current_user.role) and not is_owner:
        now = datetime.now(UTC).replace(tzinfo=None)
        assignments = db.scalars(
            select(Assignment).where(
                Assignment.viewer_id == current_user.id,
                Assignment.expires_at > now,
            )
        ).all()
        allowed_ids = {cid for a in assignments for cid in a.camera_ids}
        if camera_id not in allowed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Camera not assigned")

    frame = CAMERA_FRAMES.get(camera_id)
    if not frame:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No frame available")

    return Response(content=frame, media_type="image/jpeg")


@app.get("/api/v1/cameras/{camera_id}/stream")
async def stream_camera(
    camera_id: int,
    current_user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    camera = db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    if not camera.is_active and current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Camera is disabled")

    if camera.source_type != CameraSourceType.ip_mjpeg or not camera.source_url:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Camera is not configured for ip_mjpeg")

    is_owner = camera.owner_id == current_user.id

    if _uses_temporary_access(current_user.role) and not is_owner:
        now = datetime.now(UTC).replace(tzinfo=None)
        assignments = db.scalars(
            select(Assignment).where(
                Assignment.viewer_id == current_user.id,
                Assignment.expires_at > now,
            )
        ).all()
        allowed_ids = {cid for a in assignments for cid in a.camera_ids}
        if camera_id not in allowed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Camera not assigned")

    media_type = "multipart/x-mixed-replace"
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            head = await client.head(camera.source_url)
            if head.status_code < 400:
                media_type = head.headers.get("content-type", media_type)
    except httpx.HTTPError:
        pass

    hub = await _get_stream_hub(camera_id, camera.source_url)
    queue = await hub.add_subscriber()

    async def iter_stream() -> AsyncIterator[bytes]:
        try:
            while True:
                chunk = await queue.get()
                if chunk is None:
                    return
                yield chunk
        finally:
            await hub.remove_subscriber(queue)
            await _release_stream_hub(camera_id)

    return StreamingResponse(
        iter_stream(),
        media_type=media_type,
        headers={"Cache-Control": "no-store"},
    )


@app.post("/api/v1/admin/cameras/{camera_id}/frame")
async def upload_camera_frame(
    camera_id: int,
    file: UploadFile = File(...),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    _ = admin_user
    camera = db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    if camera.source_type != CameraSourceType.admin_local:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Camera is not configured for admin_local")

    contents = await file.read()
    if len(contents) > 2_000_000:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Frame too large")

    CAMERA_FRAMES[camera_id] = contents
    return {"status": "ok"}


@app.post("/api/v1/cameras/{camera_id}/frame")
async def upload_viewer_camera_frame(
    camera_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    camera = db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    if camera.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Camera owner required")

    if not camera.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Camera is disabled")

    if camera.source_type != CameraSourceType.viewer_local:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Camera is not configured for viewer_local")

    contents = await file.read()
    if len(contents) > 2_000_000:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Frame too large")

    CAMERA_FRAMES[camera_id] = contents
    return {"status": "ok"}


@app.put("/api/v1/admin/cameras/{camera_id}", response_model=CameraOut)
def update_camera_source(
    camera_id: int,
    payload: CameraUpdate,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CameraOut:
    if payload.source_type not in {
        CameraSourceType.unconfigured.value,
        CameraSourceType.ip_mjpeg.value,
        CameraSourceType.admin_local.value,
    }:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid source_type")

    camera = db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    if camera.owner_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Viewer-managed camera")

    if payload.source_type == CameraSourceType.ip_mjpeg.value and not payload.source_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source_url required for ip_mjpeg")

    if payload.source_type != CameraSourceType.ip_mjpeg.value:
        payload.source_url = None

    camera.source_type = CameraSourceType(payload.source_type)
    camera.source_url = payload.source_url
    db.add(camera)
    db.commit()
    db.refresh(camera)

    log_event(
        db,
        "camera_source_updated",
        actor_username=admin_user.username,
        target_username=None,
        details={"camera_id": camera.id, "source_type": camera.source_type.value},
    )

    return _as_camera_out(camera)


@app.put("/api/v1/admin/cameras/{camera_id}/access", response_model=CameraOut)
def update_camera_access(
    camera_id: int,
    payload: AdminCameraAccessUpdate,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CameraOut:
    camera = db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    if payload.is_active is not None:
        camera.is_active = payload.is_active

    if payload.share_approved is not None:
        camera.share_approved = payload.share_approved
        camera.share_requested = False
    elif payload.clear_share_request:
        camera.share_requested = False

    db.add(camera)
    db.commit()
    db.refresh(camera)

    log_event(
        db,
        "camera_access_updated",
        actor_username=admin_user.username,
        target_username=None,
        details={
            "camera_id": camera.id,
            "is_active": camera.is_active,
            "share_approved": camera.share_approved,
            "share_requested": camera.share_requested,
        },
    )

    return _as_camera_out(camera)


@app.get("/api/v1/admin/cameras/{camera_id}/probe")
def probe_camera_source(
    camera_id: int,
    _admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, str | int | bool]:
    camera = db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    if camera.source_type != CameraSourceType.ip_mjpeg or not camera.source_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Camera source is not ip_mjpeg")

    try:
        with httpx.Client(timeout=5.0, follow_redirects=True) as client:
            response = client.get(camera.source_url)
            content_type = response.headers.get("content-type", "")
            if response.status_code >= 400:
                return {"ok": False, "status_code": response.status_code, "detail": "HTTP error"}
            if "multipart" not in content_type and "image" not in content_type:
                return {"ok": False, "status_code": response.status_code, "detail": "Unexpected content-type"}
            return {"ok": True, "status_code": response.status_code, "detail": "ok"}
    except httpx.HTTPError as exc:
        return {"ok": False, "status_code": 0, "detail": str(exc)}


@app.get("/api/v1/admin/users", response_model=list[UserOut])
def list_users(
    role: str | None = None,
    _admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    stmt = select(User)
    if role:
        allowed_roles = {r.value for r in UserRole}
        if role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid role")
        stmt = stmt.where(User.role == UserRole(role))
    users = db.scalars(stmt.order_by(User.username.asc())).all()
    return [UserOut(id=user.id, username=user.username, role=user.role.value) for user in users]


@app.post("/api/v1/admin/users", response_model=UserOut)
def create_user(
    payload: AdminUserCreate,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> UserOut:
    if payload.role not in {r.value for r in UserRole}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid role")

    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    salt = generate_salt()
    verifier = compute_verifier(payload.password, salt, payload.username)
    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=UserRole(payload.role),
        pake_salt=salt,
        pake_verifier=verifier,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_event(
        db,
        "user_created",
        actor_username=admin_user.username,
        target_username=user.username,
        details={"role": user.role.value},
    )

    return UserOut(id=user.id, username=user.username, role=user.role.value)


def _as_assignment_out(a: Assignment, db: Session) -> AssignmentOut:
    assignee_id = a.user_id or a.viewer_id
    viewer = db.get(User, assignee_id)
    now = datetime.now(UTC).replace(tzinfo=None)
    remaining = int(max(0, (a.expires_at - now).total_seconds()))
    return AssignmentOut(
        id=a.id,
        viewer_id=assignee_id,
        viewer_name=viewer.username if viewer else f"Viewer {a.viewer_id}",
        camera_ids=a.camera_ids,
        user_id=assignee_id,
        camera_id=a.camera_id,
        status=a.status,
        expires_in=remaining,
        expires_at=a.expires_at,
    )


@app.get("/assignments", response_model=list[AssignmentOut])
@app.get("/api/v1/assignments", response_model=list[AssignmentOut])
def list_assignments(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[AssignmentOut]:
    prune_expired_assignments(db)
    now = datetime.now(UTC).replace(tzinfo=None)
    stmt = select(Assignment).where(Assignment.expires_at > now, Assignment.status == "active")
    if _uses_temporary_access(current_user.role):
        stmt = stmt.where(Assignment.viewer_id == current_user.id)

    assignments = db.scalars(stmt.order_by(Assignment.expires_at.asc())).all()
    return [_as_assignment_out(a, db) for a in assignments]


@app.post("/assignments", response_model=AssignmentOut)
@app.post("/api/v1/assignments", response_model=AssignmentOut)
def create_assignment(
    payload: AssignmentCreate,
    _admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AssignmentOut:
    prune_expired_assignments(db)
    viewer = db.get(User, payload.viewer_id)
    if not viewer or not _uses_temporary_access(viewer.role):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="viewer_id must be a resident or guard user")

    cameras = db.scalars(select(Camera).where(Camera.id.in_(payload.camera_ids))).all()
    if len(cameras) != len(set(payload.camera_ids)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more camera_ids are invalid")

    for camera in cameras:
        if not camera.is_active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Camera is disabled")
        # Allow admins to assign viewer-managed cameras even if the owner hasn't approved sharing.
        if camera.owner_id is not None and not camera.share_approved:
            # log that admin is overriding owner's share approval
            log_event(
                db,
                "assignment_created_admin_override",
                actor_username=_admin_user.username,
                target_username=None,
                details={"camera_id": camera.id, "owner_id": camera.owner_id},
            )

    expires_at = datetime.now(UTC).replace(tzinfo=None) + timedelta(minutes=payload.duration_minutes)
    unique_camera_ids = sorted(set(payload.camera_ids))
    assignment = Assignment(
        viewer_id=payload.viewer_id,
        user_id=payload.viewer_id,
        camera_id=unique_camera_ids[0] if len(unique_camera_ids) == 1 else None,
        camera_ids=unique_camera_ids,
        expires_at=expires_at,
        granted_by=_admin_user.id,
        status="active",
    )
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


@app.delete("/assignments/{assignment_id}")
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
    assignment.status = "revoked"
    assignment.revoked_at = datetime.now(UTC).replace(tzinfo=None)
    db.add(assignment)
    db.commit()
    log_event(
        db,
        "ACCESS_REVOKED",
        actor_username=admin_user.username,
        target_username=viewer.username if viewer else str(assignment.viewer_id),
        details={"assignment_id": assignment_id, "camera_ids": assignment.camera_ids},
        severity="medium",
        category="authorization",
        description="Temporary camera access was manually revoked.",
    )
    write_audit_log(
        db,
        "ACCESS_REVOKED",
        actor_id=admin_user.id,
        target_id=assignment_id,
        description=f"{admin_user.username} revoked assignment {assignment_id}.",
    )
    return {"status": "revoked", "assignment_id": assignment_id}


@app.get("/security-events", response_model=list[SecurityEventOut])
@app.get("/api/v1/security-events", response_model=list[SecurityEventOut])
@app.get("/api/v1/security/events", response_model=list[SecurityEventOut])
def security_events(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[SecurityEventOut]:
    events = recent_events_for_user(db, current_user.username, current_user.role.value)
    return [_as_security_event_out(event) for event in events]


@app.get("/audit-logs", response_model=list[AuditLogOut])
@app.get("/api/v1/audit-logs", response_model=list[AuditLogOut])
def audit_logs(_admin_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[AuditLogOut]:
    logs = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(100)).all()
    return [_as_audit_log_out(log) for log in logs]


@app.post("/requests", response_model=AccessRequestOut)
@app.post("/api/v1/requests", response_model=AccessRequestOut)
def create_access_request(
    payload: AccessRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AccessRequestOut:
    if not _is_resident_role(current_user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Resident role required")
    camera = db.get(Camera, payload.camera_id)
    if not camera or not camera.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    request_row = AccessRequest(
        requester_id=current_user.id,
        camera_id=camera.id,
        reason=payload.reason,
        status=AccessRequestStatus.pending,
    )
    db.add(request_row)
    db.commit()
    db.refresh(request_row)
    log_event(
        db,
        "REQUEST_CREATED",
        actor_username=current_user.username,
        target_username=None,
        details={"request_id": request_row.id, "camera_id": camera.id},
        severity="low",
        category="authorization",
        description="Resident requested temporary camera access.",
    )
    write_audit_log(
        db,
        "REQUEST_CREATED",
        actor_id=current_user.id,
        target_id=request_row.id,
        description=f"{current_user.username} requested temporary access to {camera.name}.",
    )
    return _as_access_request_out(request_row, db)


@app.get("/requests/my", response_model=list[AccessRequestOut])
@app.get("/api/v1/requests/my", response_model=list[AccessRequestOut])
def my_access_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AccessRequestOut]:
    rows = db.scalars(
        select(AccessRequest)
        .where(AccessRequest.requester_id == current_user.id)
        .order_by(AccessRequest.requested_at.desc())
    ).all()
    return [_as_access_request_out(row, db) for row in rows]


@app.get("/requests/pending", response_model=list[AccessRequestOut])
@app.get("/api/v1/requests/pending", response_model=list[AccessRequestOut])
def pending_access_requests(
    _admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[AccessRequestOut]:
    rows = db.scalars(
        select(AccessRequest)
        .where(AccessRequest.status == AccessRequestStatus.pending)
        .order_by(AccessRequest.requested_at.asc())
    ).all()
    return [_as_access_request_out(row, db) for row in rows]


@app.post("/requests/{request_id}/approve", response_model=AssignmentOut)
@app.post("/api/v1/requests/{request_id}/approve", response_model=AssignmentOut)
def approve_access_request(
    request_id: int,
    payload: AccessRequestReview,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AssignmentOut:
    prune_expired_assignments(db)
    request_row = db.get(AccessRequest, request_id)
    if not request_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if request_row.status != AccessRequestStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request already reviewed")

    camera = db.get(Camera, request_row.camera_id)
    requester = db.get(User, request_row.requester_id)
    if not camera or not camera.is_active or not requester:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request target is no longer valid")

    now = datetime.now(UTC).replace(tzinfo=None)
    request_row.status = AccessRequestStatus.approved
    request_row.reviewed_at = now
    request_row.reviewed_by = admin_user.id
    expires_at = now + timedelta(hours=payload.duration_hours)
    assignment = Assignment(
        viewer_id=requester.id,
        user_id=requester.id,
        camera_id=camera.id,
        camera_ids=[camera.id],
        expires_at=expires_at,
        granted_by=admin_user.id,
        access_request_id=request_row.id,
        status="active",
    )
    db.add_all([request_row, assignment])
    db.commit()
    db.refresh(assignment)

    for event_type, description in (
        ("REQUEST_APPROVED", "Access request approved."),
        ("ACCESS_GRANTED", "Temporary camera access granted."),
    ):
        log_event(
            db,
            event_type,
            actor_username=admin_user.username,
            target_username=requester.username,
            details={"request_id": request_row.id, "camera_id": camera.id, "assignment_id": assignment.id},
            severity="low",
            category="authorization",
            description=description,
        )
        write_audit_log(
            db,
            event_type,
            actor_id=admin_user.id,
            target_id=request_row.id if event_type == "REQUEST_APPROVED" else assignment.id,
            description=f"{admin_user.username}: {description} Camera={camera.name}, resident={requester.username}.",
        )
    return _as_assignment_out(assignment, db)


@app.post("/requests/{request_id}/reject", response_model=AccessRequestOut)
@app.post("/api/v1/requests/{request_id}/reject", response_model=AccessRequestOut)
def reject_access_request(
    request_id: int,
    payload: RejectRequestPayload,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AccessRequestOut:
    request_row = db.get(AccessRequest, request_id)
    if not request_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if request_row.status != AccessRequestStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request already reviewed")

    requester = db.get(User, request_row.requester_id)
    request_row.status = AccessRequestStatus.rejected
    request_row.reviewed_at = datetime.now(UTC).replace(tzinfo=None)
    request_row.reviewed_by = admin_user.id
    db.add(request_row)
    db.commit()
    db.refresh(request_row)
    log_event(
        db,
        "REQUEST_REJECTED",
        actor_username=admin_user.username,
        target_username=requester.username if requester else str(request_row.requester_id),
        details={"request_id": request_row.id, "camera_id": request_row.camera_id, "note": payload.note},
        severity="low",
        category="authorization",
        description="Access request rejected.",
    )
    write_audit_log(
        db,
        "REQUEST_REJECTED",
        actor_id=admin_user.id,
        target_id=request_row.id,
        description=f"{admin_user.username} rejected access request {request_row.id}.",
    )
    return _as_access_request_out(request_row, db)


@app.post("/api/v1/capabilities", response_model=CapabilityTokenOut)
def issue_capability_token(
    payload: CapabilityIssueRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CapabilityTokenOut:
    prune_expired_assignments(db)
    camera = db.get(Camera, payload.camera_id)
    if not camera or not camera.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    assignment = _active_assignment_for(db, current_user.id, camera.id)
    if not assignment and current_user.role != UserRole.admin and camera.owner_id != current_user.id:
        log_event(
            db,
            "UNAUTHORIZED_CAMERA_ACCESS",
            actor_username=current_user.username,
            details={"camera_id": camera.id},
            severity="high",
            category="authorization",
            description="User attempted to issue a capability without active assignment.",
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No active assignment for camera")

    if assignment:
        expires_at = assignment.expires_at
        assignment_id = assignment.id
    else:
        expires_at = datetime.now(UTC).replace(tzinfo=None) + timedelta(minutes=15)
        assignment_id = "admin-owner-preview"

    permissions = sorted(set(payload.permissions or ["VIEW"]))
    token = create_capability_token(
        user_id=current_user.id,
        camera_id=camera.id,
        assignment_id=assignment_id,
        permissions=permissions,
        expires_at=expires_at,
    )
    return CapabilityTokenOut(
        capability_token=token,
        camera_id=camera.id,
        permissions=permissions,
        expires_at=expires_at,
    )


@app.post("/api/v1/capabilities/validate", response_model=CapabilityValidateOut)
def validate_capability_token(
    payload: CapabilityValidateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CapabilityValidateOut:
    now = datetime.now(UTC).replace(tzinfo=None)
    db.execute(delete(UsedNonce).where(UsedNonce.expires_at <= now))
    reused = db.scalar(
        select(UsedNonce).where(
            UsedNonce.user_id == current_user.id,
            UsedNonce.nonce == payload.nonce,
            UsedNonce.purpose == "capability",
        )
    )
    if reused:
        log_event(
            db,
            "REPLAY_ATTACK_DETECTED",
            actor_username=current_user.username,
            details={"nonce": payload.nonce, "camera_id": payload.camera_id},
            severity="critical",
            category="replay",
            description="A previously used nonce was submitted with a capability token.",
        )
        write_audit_log(
            db,
            "REPLAY_ATTACK_DETECTED",
            actor_id=current_user.id,
            target_id=payload.camera_id,
            description="Rejected replayed nonce for capability validation.",
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nonce already used")

    try:
        token_payload = decode_capability_token(payload.capability_token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid capability token") from exc

    permissions = token_payload.get("permissions", [])
    if (
        int(token_payload.get("sub", 0)) != current_user.id
        or int(token_payload.get("camera_id", 0)) != payload.camera_id
        or "VIEW" not in permissions
    ):
        log_event(
            db,
            "UNAUTHORIZED_CAMERA_ACCESS",
            actor_username=current_user.username,
            details={"camera_id": payload.camera_id},
            severity="high",
            category="authorization",
            description="Capability token did not match the requested camera/user scope.",
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Capability scope mismatch")

    db.add(
        UsedNonce(
            user_id=current_user.id,
            nonce=payload.nonce,
            purpose="capability",
            expires_at=now + timedelta(minutes=10),
        )
    )
    db.commit()
    write_audit_log(
        db,
        "CAMERA_VIEW_STARTED",
        actor_id=current_user.id,
        target_id=payload.camera_id,
        description=f"{current_user.username} validated capability token for camera {payload.camera_id}.",
    )
    return CapabilityValidateOut(status="ok", camera_id=payload.camera_id, permissions=permissions)


@app.get("/security-dashboard", response_model=SecurityDashboardOut)
@app.get("/api/v1/security-dashboard", response_model=SecurityDashboardOut)
def security_dashboard(
    _admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> SecurityDashboardOut:
    prune_expired_assignments(db)
    events = db.scalars(select(SecurityEvent).order_by(SecurityEvent.created_at.desc()).limit(10)).all()
    logs = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(10)).all()
    return SecurityDashboardOut(
        authentication_success_count=db.scalar(select(func.count()).select_from(SecurityEvent).where(SecurityEvent.event_type == "LOGIN_SUCCESS")) or 0,
        authentication_failure_count=db.scalar(select(func.count()).select_from(SecurityEvent).where(SecurityEvent.event_type == "LOGIN_FAILURE")) or 0,
        pending_requests=db.scalar(select(func.count()).select_from(AccessRequest).where(AccessRequest.status == AccessRequestStatus.pending)) or 0,
        approved_requests=db.scalar(select(func.count()).select_from(AccessRequest).where(AccessRequest.status == AccessRequestStatus.approved)) or 0,
        rejected_requests=db.scalar(select(func.count()).select_from(AccessRequest).where(AccessRequest.status == AccessRequestStatus.rejected)) or 0,
        expired_assignments=db.scalar(select(func.count()).select_from(Assignment).where(Assignment.status == "expired")) or 0,
        revoked_assignments=db.scalar(select(func.count()).select_from(Assignment).where(Assignment.status == "revoked")) or 0,
        recent_security_events=[_as_security_event_out(event) for event in events],
        recent_audit_logs=[_as_audit_log_out(log) for log in logs],
    )
