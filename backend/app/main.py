import asyncio
import contextlib
from datetime import UTC, datetime, timedelta
import logging
from typing import AsyncIterator

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from .auth import create_access_token, hash_password, needs_password_rehash, verify_password
from .audit import log_event, prune_expired_assignments, recent_events_for_user
from .config import settings
from .database import Base, SessionLocal, engine, ensure_camera_source_columns, ensure_user_pake_columns, get_db
from .deps import get_current_user, get_current_user_from_token, require_admin
from .models import Assignment, Camera, CameraSourceType, CameraStatus, PakeSession, User, UserRole
from .pake_bridge import compute_verifier, finish_pake, generate_salt, pake_public_config, start_pake
from .schemas import (
    AdminCameraAccessUpdate,
    AdminUserCreate,
    AssignmentCreate,
    AssignmentOut,
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
    with SessionLocal() as db:
        seed_data(db)
        prune_expired_assignments(db)
        _prune_expired_pake_sessions(db)


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

    if needs_password_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)
        db.add(user)
        db.commit()

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


def _prune_expired_pake_sessions(db: Session) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    db.execute(delete(PakeSession).where(PakeSession.expires_at <= now))
    db.commit()


def _as_camera_out(camera: Camera, current_user_id: int, current_user_role: UserRole) -> CameraOut:
    is_owner_or_admin = current_user_role == UserRole.admin or camera.owner_id == current_user_id
    safe_source_url = camera.source_url if is_owner_or_admin else ("***" if camera.source_url else None)
    
    return CameraOut(
        id=camera.id,
        name=camera.name,
        status=camera.status.value,
        source_type=camera.source_type.value if camera.source_type else CameraSourceType.unconfigured.value,
        source_url=safe_source_url,
        owner_id=camera.owner_id,
        is_active=camera.is_active,
        share_requested=camera.share_requested,
        share_approved=camera.share_approved,
    )


@app.post("/api/v1/auth/pake/start", response_model=PakeStartResponse)
def pake_start(payload: PakeStartRequest, db: Session = Depends(get_db)) -> PakeStartResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or user.role.value != payload.role:
        log_event(
            db,
            "login_failure",
            actor_username=payload.username,
            details={"requested_role": payload.role, "reason": "invalid_credentials"},
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
            "login_failure",
            actor_username=user.username,
            details={"requested_role": user.role.value, "reason": "pake_failed", "error": str(exc)},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    db.delete(session)
    db.commit()

    token = create_access_token(subject=str(user.id), role=user.role.value)
    log_event(
        db,
        "login_success",
        actor_username=user.username,
        target_username=user.username,
        details={"role": user.role.value, "method": "pake"},
    )
    return PakeFinishResponse(
        access_token=token,
        confirm_b=result["confirm_b"],
        user=UserOut(id=user.id, username=user.username, role=user.role.value),
    )


@app.post("/api/v1/auth/pake/upgrade", response_model=PakeUpgradeResponse)
def pake_upgrade(payload: PakeUpgradeRequest, db: Session = Depends(get_db)) -> PakeUpgradeResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or user.role.value != payload.role:
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
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut(id=current_user.id, username=current_user.username, role=current_user.role.value)


@app.get("/api/v1/cameras", response_model=list[CameraOut])
def list_cameras(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[CameraOut]:
    prune_expired_assignments(db)
    if current_user.role == UserRole.viewer:
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
        return [_as_camera_out(camera, current_user.id, current_user.role) for camera in visible]
    else:
        cameras = db.scalars(select(Camera).order_by(Camera.id)).all()
        return [_as_camera_out(camera, current_user.id, current_user.role) for camera in cameras]


@app.post("/api/v1/cameras", response_model=CameraOut)
def create_viewer_camera(
    payload: CameraCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CameraOut:
    if current_user.role not in {UserRole.viewer, UserRole.resident}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Viewer or resident role required")

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

    return _as_camera_out(camera, current_user.id, current_user.role)


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

    return _as_camera_out(camera, current_user.id, current_user.role)


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

    return _as_camera_out(camera, current_user.id, current_user.role)


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

    if current_user.role == UserRole.viewer and not is_owner:
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

    if current_user.role == UserRole.viewer and not is_owner:
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

    return _as_camera_out(camera, admin_user.id, admin_user.role)


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

    return _as_camera_out(camera, admin_user.id, admin_user.role)


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
        if role not in {UserRole.admin.value, UserRole.viewer.value}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role must be admin or viewer")
        stmt = stmt.where(User.role == UserRole(role))
    users = db.scalars(stmt.order_by(User.username.asc())).all()
    return [UserOut(id=user.id, username=user.username, role=user.role.value) for user in users]


@app.post("/api/v1/admin/users", response_model=UserOut)
def create_user(
    payload: AdminUserCreate,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> UserOut:
    if payload.role not in {UserRole.admin.value, UserRole.viewer.value}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role must be admin or viewer")

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
