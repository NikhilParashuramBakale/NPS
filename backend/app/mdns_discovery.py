"""
mDNS Camera Discovery Service

Discovers cameras on the local network using Multicast DNS (mDNS / DNS-SD).
Uses the `zeroconf` library to listen for `_camera._tcp.local.` service
announcements and adds discovered cameras to the database (inactive by default,
requiring admin approval).

Network concepts demonstrated:
  - IP Multicast (IGMP) via mDNS group 224.0.0.251:5353
  - DNS Service Discovery (RFC 6763)
  - Multicast DNS (RFC 6762)
  - UDP multicast sockets
"""

from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .audit import log_event
from .config import settings
from .database import SessionLocal
from .models import Camera, CameraSourceType, CameraStatus

logger = logging.getLogger("securecam.mdns")

SERVICE_TYPE = "_camera._tcp.local."
ALTERNATE_SERVICE_TYPES = [
    "_mjpeg._tcp.local.",
    "_axis-video._tcp.local.",
    "_rtsp._tcp.local.",
]


@dataclass
class DiscoveredCamera:
    """Information about a camera discovered via mDNS."""
    name: str
    ip: str
    port: int
    service_type: str
    properties: dict[str, bytes] = field(default_factory=dict)
    discovered_at: datetime = field(default_factory=lambda: datetime.now(UTC).replace(tzinfo=None))

    @property
    def mjpeg_url(self) -> str | None:
        """Construct MJPEG URL from service properties or known paths."""
        # Check if properties contain a path
        path = self.properties.get(b"path", b"/video").decode("utf-8", errors="ignore")
        if not path.startswith("/"):
            path = f"/{path}"
        return f"http://{self.ip}:{self.port}{path}"

    @property
    def model(self) -> str:
        return self.properties.get(b"model", b"Unknown").decode("utf-8", errors="ignore")


class MDNSCameraDiscovery:
    """
    Background service that listens for mDNS camera announcements
    and adds discovered cameras to the database for admin approval.
    """

    def __init__(self) -> None:
        self._zeroconf: Any = None  # zeroconf.Zeroconf instance (lazy import)
        self._browser: Any = None
        self._thread: threading.Thread | None = None
        self._running = False
        self._discovered: dict[str, DiscoveredCamera] = {}
        self._lock = threading.Lock()

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def discovered_count(self) -> int:
        with self._lock:
            return len(self._discovered)

    def get_discovered(self) -> list[DiscoveredCamera]:
        """Get list of recently discovered cameras."""
        with self._lock:
            return list(self._discovered.values())

    def start(self) -> None:
        """Start the mDNS discovery service in a background thread."""
        if self._running:
            logger.warning("mDNS discovery already running")
            return

        try:
            from zeroconf import Zeroconf, ServiceBrowser  # noqa: PLC0415
        except ImportError:
            logger.error(
                "zeroconf library not installed. Run: pip install zeroconf"
            )
            return

        self._zeroconf = Zeroconf()
        self._running = True

        # Listen for standard camera service type
        self._browser = ServiceBrowser(
            self._zeroconf,
            SERVICE_TYPE,
            handlers=[self._on_service_state_change],
        )

        # Also listen for alternate service types
        for alt_type in ALTERNATE_SERVICE_TYPES:
            ServiceBrowser(
                self._zeroconf,
                alt_type,
                handlers=[self._on_service_state_change],
            )

        logger.info("mDNS camera discovery started (listening for %s and alternatives)", SERVICE_TYPE)
        log_event(
            SessionLocal(),
            "MDNS_DISCOVERY_STARTED",
            severity="low",
            category="network",
            description="mDNS camera discovery service started.",
        )

    def stop(self) -> None:
        """Stop the mDNS discovery service."""
        if not self._running:
            return

        self._running = False
        try:
            if self._zeroconf:
                self._zeroconf.close()
        except Exception as exc:
            logger.warning("Error closing zeroconf: %s", exc)

        self._zeroconf = None
        self._browser = None

        logger.info("mDNS camera discovery stopped")
        log_event(
            SessionLocal(),
            "MDNS_DISCOVERY_STOPPED",
            severity="low",
            category="network",
            description="mDNS camera discovery service stopped.",
        )

    def _on_service_state_change(
        self,
        zeroconf: Any,
        service_type: str,
        name: str,
        state_change: Any,
    ) -> None:
        """Callback for mDNS service state changes."""
        try:
            from zeroconf import ServiceStateChange  # noqa: PLC0415

            if state_change == ServiceStateChange.Added:
                info = zeroconf.get_service_info(service_type, name)
                if info is None:
                    return

                if not info.addresses:
                    return

                ip = ".".join(str(b) for b in info.addresses[0])
                # ip can also be accessed via parsed addresses in newer zeroconf
                try:
                    import socket  # noqa: PLC0415
                    ip = socket.inet_ntoa(info.addresses[0])
                except Exception:
                    pass

                discovered = DiscoveredCamera(
                    name=name.replace(f".{service_type}", ""),
                    ip=ip,
                    port=info.port,
                    service_type=service_type,
                    properties=info.properties,
                )

                with self._lock:
                    self._discovered[name] = discovered

                self._add_to_database(discovered)

        except Exception as exc:
            logger.error("Error in mDNS callback: %s", exc)

    def _add_to_database(self, discovered: DiscoveredCamera) -> None:
        """Add or update discovered camera in the database (inactive by default)."""
        try:
            with SessionLocal() as db:
                # Check if camera already exists by name or IP
                existing = db.scalar(
                    select(Camera).where(Camera.source_url == discovered.mjpeg_url)
                )
                if existing:
                    # Update discovered_at if already exists
                    existing.discovered_at = datetime.now(UTC).replace(tzinfo=None)
                    db.add(existing)
                    db.commit()
                    return

                # Check by name
                existing_by_name = db.scalar(
                    select(Camera).where(Camera.name == discovered.name)
                )
                if existing_by_name:
                    return

                # Create new camera entry (inactive — admin must activate)
                camera = Camera(
                    name=discovered.name,
                    status=CameraStatus.online,
                    source_type=CameraSourceType.ip_mjpeg,
                    source_url=discovered.mjpeg_url,
                    is_active=False,  # Requires admin approval
                    owner_id=None,    # Admin-managed
                    location=f"mDNS: {discovered.ip}:{discovered.port} ({discovered.model})",
                )
                db.add(camera)
                db.commit()
                db.refresh(camera)

                log_event(
                    db,
                    "CAMERA_DISCOVERED",
                    severity="low",
                    category="network",
                    details={
                        "camera_id": camera.id,
                        "camera_name": discovered.name,
                        "ip": discovered.ip,
                        "port": discovered.port,
                        "model": discovered.model,
                        "mjpeg_url": discovered.mjpeg_url,
                    },
                    description=f"Camera '{discovered.name}' discovered via mDNS at {discovered.ip}:{discovered.port}",
                )
                logger.info(
                    "Discovered camera '%s' via mDNS at %s:%s",
                    discovered.name, discovered.ip, discovered.port,
                )

        except Exception as exc:
            logger.error("Failed to add discovered camera to DB: %s", exc)


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

mdns_discovery_service = MDNSCameraDiscovery()