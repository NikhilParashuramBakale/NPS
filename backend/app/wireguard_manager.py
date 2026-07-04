"""
WireGuard Tunnel Manager — Modular Abstraction

Provides a unified interface for managing WireGuard tunnels for camera feeds.
Supports two backends:
  - RealWGBackend: Uses actual `wg`/`wg-quick` commands via subprocess.
  - SimWGBackend: In-memory simulation for development/testing without WireGuard.

The backend is selected automatically based on settings.wireguard_backend:
  "auto" → tries RealWGBackend, falls back to SimWGBackend
  "real" → forces RealWGBackend (raises if not available)
  "sim"  → forces SimWGBackend
"""

from __future__ import annotations

import abc
import base64
import logging
import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import ClassVar

from .config import settings

logger = logging.getLogger("securecam.wireguard")


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class TunnelConfig:
    """Configuration for a single WireGuard tunnel."""
    camera_id: int
    interface_name: str
    listen_port: int
    private_key: str
    peer_public_key: str
    peer_endpoint: str  # IP:Port of the camera
    allowed_ips: str     # e.g. "10.0.0.2/32"
    persistent_keepalive: int = 25


@dataclass
class TunnelStatus:
    """Runtime status of a WireGuard tunnel."""
    interface_name: str
    is_active: bool
    bytes_sent: int = 0
    bytes_received: int = 0
    latest_handshake: datetime | None = None
    peer_endpoint: str | None = None
    error_message: str | None = None


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------

class WireGuardBackend(abc.ABC):
    """Abstract interface for WireGuard tunnel operations."""

    @abc.abstractmethod
    def is_available(self) -> bool:
        """Check if this backend can operate (e.g. wg binary exists)."""
        ...

    @abc.abstractmethod
    def create_tunnel(self, config: TunnelConfig) -> None:
        """Create and bring up a WireGuard tunnel."""
        ...

    @abc.abstractmethod
    def destroy_tunnel(self, interface_name: str) -> None:
        """Tear down and remove a WireGuard tunnel."""
        ...

    @abc.abstractmethod
    def get_tunnel_status(self, interface_name: str) -> TunnelStatus:
        """Query live status of a tunnel."""
        ...

    @abc.abstractmethod
    def list_tunnels(self) -> list[TunnelStatus]:
        """List all active WireGuard tunnels matching our prefix."""
        ...


# ---------------------------------------------------------------------------
# Real backend (uses wg / wg-quick)
# ---------------------------------------------------------------------------

class RealWGBackend(WireGuardBackend):
    """Backend that delegates to the real WireGuard tools."""

    WG_QUICK: ClassVar[str] = "wg-quick"
    WG: ClassVar[str] = "wg"

    def is_available(self) -> bool:
        return shutil.which(self.WG) is not None and shutil.which(self.WG_QUICK) is not None

    def _config_path(self, iface: str) -> str:
        return os.path.join(settings.wireguard_config_dir, f"{iface}.conf")

    def _write_config(self, config: TunnelConfig) -> None:
        conf_dir = settings.wireguard_config_dir
        os.makedirs(conf_dir, exist_ok=True)
        path = self._config_path(config.interface_name)
        content = (
            f"[Interface]\n"
            f"PrivateKey = {config.private_key}\n"
            f"ListenPort = {config.listen_port}\n"
            f"\n"
            f"[Peer]\n"
            f"PublicKey = {config.peer_public_key}\n"
            f"Endpoint = {config.peer_endpoint}\n"
            f"AllowedIPs = {config.allowed_ips}\n"
            f"PersistentKeepalive = {config.persistent_keepalive}\n"
        )
        with open(path, "w") as f:
            f.write(content)

    def create_tunnel(self, config: TunnelConfig) -> None:
        self._write_config(config)
        result = subprocess.run(
            [self.WG_QUICK, "up", config.interface_name],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"wg-quick up failed: {result.stderr.strip() or result.stdout.strip()}"
            )
        logger.info("WireGuard tunnel %s is up", config.interface_name)

    def destroy_tunnel(self, interface_name: str) -> None:
        result = subprocess.run(
            [self.WG_QUICK, "down", interface_name],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            logger.warning("wg-quick down %s returned %d: %s",
                           interface_name, result.returncode, result.stderr.strip())
        conf_path = self._config_path(interface_name)
        if os.path.exists(conf_path):
            os.remove(conf_path)
        logger.info("WireGuard tunnel %s is down", interface_name)

    def _parse_wg_show(self, interface_name: str) -> dict:
        """Parse `wg show <iface> dump` output into a dict."""
        try:
            result = subprocess.run(
                [self.WG, "show", interface_name, "dump"],
                capture_output=True, text=True, timeout=15,
            )
            if result.returncode != 0:
                return {}
            return self._parse_dump(result.stdout)
        except Exception:
            return {}

    @staticmethod
    def _parse_dump(dump: str) -> dict:
        """Parse `wg show dump` output.

        Format (tab-separated):
          interface: private_key, listen_port, fwmark
          peer:      public_key, preshared_key, endpoint, allowed_ips,
                     latest_handshake, transfer_rx, transfer_tx, persistent_keepalive
        """
        lines = dump.strip().splitlines()
        if not lines:
            return {}
        result: dict = {}
        parts = lines[0].split("\t")
        if len(parts) >= 2:
            result["listen_port"] = int(parts[1])
        if len(lines) > 1:
            peer_parts = lines[1].split("\t")
            if len(peer_parts) >= 6:
                result["endpoint"] = peer_parts[2]
                result["latest_handshake"] = int(peer_parts[4]) if peer_parts[4] != "0" else 0
                result["transfer_rx"] = int(peer_parts[5])
                result["transfer_tx"] = int(peer_parts[6]) if len(peer_parts) > 6 else 0
        return result

    def get_tunnel_status(self, interface_name: str) -> TunnelStatus:
        data = self._parse_wg_show(interface_name)
        if not data:
            return TunnelStatus(
                interface_name=interface_name,
                is_active=False,
                error_message="Tunnel not found or wg show failed",
            )
        hs = data.get("latest_handshake", 0)
        latest_handshake = (
            datetime.fromtimestamp(hs, tz=UTC).replace(tzinfo=None)
            if hs > 0 else None
        )
        return TunnelStatus(
            interface_name=interface_name,
            is_active=True,
            bytes_sent=data.get("transfer_tx", 0),
            bytes_received=data.get("transfer_rx", 0),
            latest_handshake=latest_handshake,
            peer_endpoint=data.get("endpoint"),
        )

    def list_tunnels(self) -> list[TunnelStatus]:
        prefix = settings.wireguard_interface_prefix
        try:
            result = subprocess.run(
                [self.WG, "show", "interfaces"],
                capture_output=True, text=True, timeout=15,
            )
            if result.returncode != 0:
                return []
            interfaces = result.stdout.strip().split()
            matching = [iface for iface in interfaces if iface.startswith(prefix)]
            return [self.get_tunnel_status(iface) for iface in matching]
        except Exception:
            return []


# ---------------------------------------------------------------------------
# Simulated backend (in-memory, no kernel dependency)
# ---------------------------------------------------------------------------

@dataclass
class _SimTunnel:
    config: TunnelConfig
    created_at: float = field(default_factory=time.time)
    bytes_sent: int = 0
    bytes_received: int = 0
    last_handshake: float = 0.0
    is_active: bool = True


class SimWGBackend(WireGuardBackend):
    """In-memory simulation of WireGuard tunnels for development/testing."""

    def __init__(self) -> None:
        self._tunnels: dict[str, _SimTunnel] = {}

    def is_available(self) -> bool:
        return True  # Always available

    def create_tunnel(self, config: TunnelConfig) -> None:
        if config.interface_name in self._tunnels:
            raise RuntimeError(f"Tunnel {config.interface_name} already exists")
        self._tunnels[config.interface_name] = _SimTunnel(
            config=config,
            created_at=time.time(),
            last_handshake=time.time(),
        )
        logger.info("Simulated WireGuard tunnel %s created", config.interface_name)

    def destroy_tunnel(self, interface_name: str) -> None:
        tunnel = self._tunnels.pop(interface_name, None)
        if tunnel is None:
            logger.warning("Simulated tunnel %s not found", interface_name)
            return
        logger.info("Simulated WireGuard tunnel %s destroyed", interface_name)

    def get_tunnel_status(self, interface_name: str) -> TunnelStatus:
        tunnel = self._tunnels.get(interface_name)
        if not tunnel:
            return TunnelStatus(
                interface_name=interface_name,
                is_active=False,
                error_message="Tunnel not found",
            )
        # Simulate increasing transfer stats
        elapsed = time.time() - tunnel.created_at
        simulated_bytes = int(elapsed * 1024 * 10)  # ~10 KB/s simulated throughput
        hs_ts = tunnel.last_handshake
        latest_handshake = (
            datetime.fromtimestamp(hs_ts, tz=UTC).replace(tzinfo=None)
            if hs_ts > 0 else None
        )
        return TunnelStatus(
            interface_name=interface_name,
            is_active=tunnel.is_active,
            bytes_sent=simulated_bytes,
            bytes_received=simulated_bytes,
            latest_handshake=latest_handshake,
            peer_endpoint=tunnel.config.peer_endpoint,
        )

    def list_tunnels(self) -> list[TunnelStatus]:
        prefix = settings.wireguard_interface_prefix
        return [
            self.get_tunnel_status(name)
            for name in self._tunnels
            if name.startswith(prefix)
        ]


# ---------------------------------------------------------------------------
# Public factory / manager
# ---------------------------------------------------------------------------

class WireGuardManager:
    """High-level manager that selects the appropriate backend and exposes
    a unified API for the rest of the application."""

    def __init__(self) -> None:
        self._backend: WireGuardBackend | None = None

    def _resolve_backend(self) -> WireGuardBackend:
        mode = settings.wireguard_backend
        if mode == "sim":
            return SimWGBackend()
        if mode == "real":
            backend = RealWGBackend()
            if not backend.is_available():
                raise RuntimeError(
                    "WireGuard backend set to 'real' but wg/wg-quick not found on PATH"
                )
            return backend
        # "auto" — try real, fall back to sim
        real = RealWGBackend()
        if real.is_available():
            logger.info("WireGuard: using real backend")
            return real
        logger.info("WireGuard: real backend not available, using simulated backend")
        return SimWGBackend()

    @property
    def backend(self) -> WireGuardBackend:
        if self._backend is None:
            self._backend = self._resolve_backend()
        return self._backend

    def reset_backend(self) -> None:
        """Force re-resolution on next call (useful for tests)."""
        self._backend = None

    # --- Convenience helpers ---

    def _interface_name(self, camera_id: int) -> str:
        return f"{settings.wireguard_interface_prefix}-{camera_id}"

    def _generate_keypair(self) -> tuple[str, str]:
        """Generate a Curve25519 keypair.

        If the real backend is active, delegates to `wg genkey | wg pubkey`.
        Otherwise generates a random base64-encoded keypair for simulation.
        """
        if isinstance(self.backend, RealWGBackend):
            try:
                priv = subprocess.run(
                    ["wg", "genkey"], capture_output=True, text=True, timeout=15,
                ).stdout.strip()
                pub = subprocess.run(
                    ["wg", "pubkey"], input=priv, capture_output=True, text=True, timeout=15,
                ).stdout.strip()
                return priv, pub
            except Exception as exc:
                raise RuntimeError("Failed to generate WireGuard keypair") from exc
        # Simulated: generate random base64 keys (32 bytes each)
        priv_bytes = os.urandom(32)
        pub_bytes = os.urandom(32)
        priv = base64.urlsafe_b64encode(priv_bytes).decode().rstrip("=")
        pub = base64.urlsafe_b64encode(pub_bytes).decode().rstrip("=")
        return priv, pub

    def create_tunnel(
        self,
        camera_id: int,
        peer_public_key: str,
        peer_endpoint: str,
        allowed_ips: str = "10.0.0.2/32",
    ) -> TunnelConfig:
        """Create a new WireGuard tunnel for the given camera."""
        iface = self._interface_name(camera_id)
        port = settings.wireguard_base_port + camera_id
        priv_key, _ = self._generate_keypair()

        config = TunnelConfig(
            camera_id=camera_id,
            interface_name=iface,
            listen_port=port,
            private_key=priv_key,
            peer_public_key=peer_public_key,
            peer_endpoint=peer_endpoint,
            allowed_ips=allowed_ips,
        )
        self.backend.create_tunnel(config)
        return config

    def destroy_tunnel(self, camera_id: int) -> None:
        """Tear down the tunnel for a given camera."""
        iface = self._interface_name(camera_id)
        self.backend.destroy_tunnel(iface)

    def get_tunnel_status(self, camera_id: int) -> TunnelStatus:
        """Get live status of the tunnel for a camera."""
        iface = self._interface_name(camera_id)
        return self.backend.get_tunnel_status(iface)

    def list_tunnels(self) -> list[TunnelStatus]:
        """List all active camera tunnels."""
        return self.backend.list_tunnels()


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

wireguard_manager = WireGuardManager()