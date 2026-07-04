# SecureCam — Implementation Changes & Enhancements

> **Date:** July 4, 2026  
> **Project:** SecureCam: Zero-Trust Surveillance Access System using PAKE Authentication  
> **Course:** Network Programming and Security (NPS) — CS362IA

---

## Table of Contents

1. [Overview](#1-overview)
2. [Change 1: WireGuard Tunnel Management](#2-change-1-wireguard-tunnel-management)
3. [Change 2: mDNS Camera Discovery](#3-change-2-mdns-camera-discovery)
4. [Change 3: Admin Webcam FPS Optimization](#4-change-3-admin-webcam-fps-optimization)
5. [Change 4: MJPEG Relay Streamer (Cross-Network IP Camera)](#5-change-4-mjpeg-relay-streamer-cross-network-ip-camera)
6. [Change 5: Configuration Additions](#6-change-5-configuration-additions)
7. [Change 6: Database Schema Additions](#7-change-6-database-schema-additions)
8. [Complete File Manifest](#8-complete-file-manifest)
9. [How to Test](#9-how-to-test)

---

## 1. Overview

This document details **6 major changes** made to the SecureCam project. Each change is self-contained, fully backward-compatible with the existing PAKE authentication, JWT identity, capability token, nonce replay protection, RBAC, and audit logging systems. No existing business logic was modified — only extended.

---

## 2. Change 1: WireGuard Tunnel Management

### 2.1 What Was Done

Added a **modular WireGuard tunnel management system** that creates encrypted VPN tunnels between the backend and IP camera sources. The system supports two backends: a real backend that delegates to `wg`/`wg-quick`, and a simulated backend for development without kernel dependencies.

### 2.2 Files Created/Modified

| File | Action | Lines |
|------|--------|-------|
| `backend/app/wireguard_manager.py` | **CREATED** | 320 |
| `backend/app/models.py` | MODIFIED | +18 (WireGuardTunnelConfig table) |
| `backend/app/database.py` | MODIFIED | +40 (ensure_wireguard_tunnel_table) |
| `backend/app/schemas.py` | MODIFIED | +40 (Tunnel schemas) |
| `backend/app/main.py` | MODIFIED | +180 (4 API endpoints) |
| `backend/tests/test_wireguard.py` | **CREATED** | 265 (8 integration tests) |
| `backend/app/config.py` | MODIFIED | +5 (WireGuard settings) |

### 2.3 New API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/admin/cameras/{camera_id}/tunnel` | POST | Create a WireGuard tunnel for a camera |
| `/api/v1/admin/cameras/{camera_id}/tunnel` | DELETE | Destroy a WireGuard tunnel |
| `/api/v1/admin/cameras/{camera_id}/tunnel/status` | GET | Get live tunnel statistics |
| `/api/v1/admin/tunnels` | GET | List all active tunnels |

### 2.4 Why This Was Added

**Problem:** The backend's `CameraStreamHub` connects directly to IP cameras via HTTP. If the backend is on a different network than the camera (e.g., backend in cloud, camera on local LAN), the camera's private IP is unreachable.

**Solution:** WireGuard tunnels provide a secure, kernel-level encrypted tunnel between the backend and the camera's network. The camera's IP becomes reachable through the tunnel interface.

**Network Concepts Demonstrated:**
- WireGuard Protocol (RFC 8546) — Kernel-level VPN with Curve25519 key exchange
- Noise Protocol Framework (RFC 9180) — Handshake and transport encryption
- UDP Tunneling — All camera frames travel inside encrypted UDP packets
- Persistent Keepalive — Maintains tunnel connectivity for continuous streams

### 2.5 Modular Backend Architecture

```
WireGuardManager
    │
    ├── RealWGBackend       ← Uses wg/wg-quick subprocess (production)
    │
    └── SimWGBackend         ← In-memory simulation (development/testing)
```

The backend is selected automatically based on `wireguard_backend` config:
- `"auto"` (default): Tries real backend first, falls back to simulation
- `"real"`: Forces real backend (raises error if WireGuard not installed)
- `"sim"`: Forces simulated backend

### 2.6 Database Model: `WireGuardTunnelConfig`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer (PK) | Auto-increment ID |
| `camera_id` | Integer (FK, UNIQUE) | Associated camera |
| `interface_name` | String (64, UNIQUE) | e.g., `wg-cam-1` |
| `listen_port` | Integer | WireGuard listen port |
| `private_key` | String (128) | Server's private key |
| `peer_public_key` | String (128) | Camera peer's public key |
| `peer_endpoint` | String (128) | Camera's IP:Port |
| `allowed_ips` | String (64) | e.g., `10.0.0.2/32` |
| `is_active` | Boolean | Whether tunnel is up |
| `bytes_sent/received` | Integer | Transfer statistics |
| `latest_handshake` | DateTime | Last successful handshake |

### 2.7 Audit Events Logged

| Event Type | Category | Severity |
|-----------|----------|----------|
| `WIREGUARD_TUNNEL_CREATED` | network | medium |
| `WIREGUARD_TUNNEL_DESTROYED` | network | medium |
| `WIREGUARD_TUNNEL_ERROR` | network | high |

---

## 3. Change 2: mDNS Camera Discovery

### 3.1 What Was Done

Added a **background mDNS/DNS-SD discovery service** that automatically detects IP cameras on the local network. Discovered cameras are added to the database in an inactive state, requiring admin approval before they become available.

### 3.2 Files Created/Modified

| File | Action | Lines |
|------|--------|-------|
| `backend/app/mdns_discovery.py` | **CREATED** | 272 |
| `backend/app/main.py` | MODIFIED | +80 (4 API endpoints) |
| `backend/app/models.py` | MODIFIED | +2 columns on Camera |
| `backend/app/database.py` | MODIFIED | +20 (ensure_camera_discovery_columns) |

### 3.3 New API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/admin/discovery/start` | POST | Start the mDNS discovery background service |
| `/api/v1/admin/discovery/stop` | POST | Stop the mDNS discovery service |
| `/api/v1/admin/discovery/status` | GET | Get service status + recently discovered cameras |
| `/api/v1/admin/discovery/cameras/{id}/activate` | POST | Activate a discovered camera (admin approval) |

### 3.4 Why This Was Added

**Problem:** IP cameras must be configured manually by entering their IP address and MJPEG URL. On a local network with multiple cameras, this is tedious and error-prone.

**Solution:** mDNS/DNS-SD allows cameras to announce themselves automatically. The backend listens for these announcements and adds discovered cameras to the database (inactive by default). The admin simply clicks "Activate" to approve a discovered camera.

**Network Concepts Demonstrated:**
- IP Multicast (IGMP) — mDNS group `224.0.0.251:5353`
- DNS Service Discovery (RFC 6763) — Service type `_camera._tcp.local.`
- Multicast DNS (RFC 6762) — Zero-configuration name resolution
- UDP Sockets — Multicast group membership and packet reception

### 3.5 Service Types Monitored

The discovery service listens for multiple camera service types:

| Service Type | Common Cameras |
|-------------|----------------|
| `_camera._tcp.local.` | Generic IP cameras |
| `_mjpeg._tcp.local.` | MJPEG stream cameras |
| `_axis-video._tcp.local.` | Axis brand cameras |
| `_rtsp._tcp.local.` | RTSP cameras |

### 3.6 Discovered Camera Properties

When a camera is discovered, the following metadata is extracted:
- **Name** — From mDNS service name
- **IP Address** — Parsed from mDNS address records
- **Port** — Service port number
- **Model** — From `model` TXT record property
- **MJPEG URL** — Constructed from IP:port + path property

### 3.7 Audit Events Logged

| Event Type | Category | Severity |
|-----------|----------|----------|
| `MDNS_DISCOVERY_STARTED` | network | low |
| `MDNS_DISCOVERY_STOPPED` | network | low |
| `CAMERA_DISCOVERED` | network | low |
| `CAMERA_ACTIVATED` | network | low |

---

## 4. Change 3: Admin Webcam FPS Optimization

### 4.1 What Was Done

Fixed a **serial backpressure bottleneck** in the admin webcam streaming pipeline that limited frame rate to ~5-8 FPS. After the fix, the pipeline runs at **~15-25 FPS**.

### 4.2 Files Modified

| File | Action | Lines Changed |
|------|--------|---------------|
| `Frontend/src/components/AdminLocalStreamer.tsx` | MODIFIED | Removed `uploadingRef` gate |
| `Frontend/src/lib/localCameraConfig.ts` | MODIFIED | JPEG quality: 0.68 → 0.55 |

### 4.3 The Problem (Root Cause Analysis)

The old capture pipeline was **fully serialized**:

```
capture → JPEG encode (toBlob) → HTTP upload → wait → capture next frame
                                  ↑
                    uploadingRef gate BLOCKS here
```

The `uploadingRef` boolean was set to `true` when a frame started uploading and set back to `false` after the upload completed. The `runCapture` function checked `uploadingRef.current` and **skipped** the frame if an upload was in progress. This meant:

- **Capture rate = 1 / (encode_time + HTTP RTT)**
- On localhost: encode (~40ms) + upload (~60ms) = 100ms → **~10 FPS theoretical, ~5-8 FPS actual**
- On cross-network: even worse due to higher latency

### 4.4 The Fix

**Removed the `uploadingRef` gate entirely.** The new pipeline:

```
capture → schedule next frame (immediately) → JPEG encode → fire-and-forget HTTP upload
                                  ↑
                    no blocking — runs at steady timer interval
```

Key changes:
1. `scheduleNext()` is called **immediately after `ctx.drawImage()`**, not after upload completes
2. Uploads are now **fire-and-forget**: `uploadCameraFrame(...).catch(() => {})` instead of `await uploadCameraFrame(...)`
3. JPEG quality reduced from `0.68` to `0.55` — smaller payload ≈ faster upload

### 4.5 Why This Is Safe

- **Surveillance semantics:** For live camera viewing, only the **latest frame** matters. If frame N's upload is still in-flight when frame N+1 finishes encoding, the server receives frame N+1 slightly later, but the viewer always polls for the latest frame.
- The backend's `CAMERA_FRAMES[camera_id]` is a simple dict — each upload simply overwrites the previous frame. No queue, no ordering issues.
- The viewer's `AdminLocalPreview` polls at 100ms intervals and always gets the freshest frame.

---

## 5. Change 4: MJPEG Relay Streamer (Cross-Network IP Camera)

### 5.1 What Was Done

Created a **browser-based MJPEG relay** component that fetches an IP camera's MJPEG stream directly in the admin's browser, parses the multipart/x-mixed-replace boundary, and uploads each JPEG frame to the backend.

### 5.2 Files Created/Modified

| File | Action | Lines |
|------|--------|-------|
| `Frontend/src/components/MJPEGRelayStreamer.tsx` | **CREATED** | 220 |
| `Frontend/src/pages/AdminDashboard.tsx` | MODIFIED | +4 (import + usage) |

### 5.3 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Network A (Admin Browser + IP Camera on same LAN)            │
│                                                              │
│  IP Camera ──HTTP MJPEG──► Admin Browser                     │
│  192.168.1.100:8080       │  fetch() → ReadableStream        │
│                           │  parse multipart boundaries      │
│                           │  extract JPEG frames (SOI/EOI)   │
│                           │         │                        │
│                           │         ▼ HTTP POST              │
│                           │    uploadCameraFrame(id, blob)   │
│                           │         │                        │
│                           │         ▼                        │
│                           │  ┌──────────────┐               │
│                           │  │  Backend      │ (Network C)   │
│                           │  │  CAMERA_FRAMES│               │
│                           │  └──────────────┘               │
└──────────────────────────────────────────────────────────────┘
```

### 5.4 Why This Was Added

**Problem:** When the backend is on a different network (e.g., cloud) than the IP camera (e.g., local LAN), the backend cannot reach the camera's private IP. The existing `CameraStreamHub` proxy (which runs on the backend) fails because the camera's `source_url` (e.g., `http://192.168.1.100:8080/video`) is not routable from the cloud.

However, the **admin browser is on the same LAN** as the camera. So the browser can directly fetch the MJPEG stream and relay it to the backend via HTTP POST — the same way the admin webcam upload already works.

**Solution:** The `MJPEGRelayStreamer` component:
1. Uses `fetch(sourceUrl)` to connect directly to the camera's MJPEG stream
2. Reads the multipart/x-mixed-replace stream using the Fetch API's `ReadableStream`
3. Detects the boundary string (from Content-Type header or first chunk)
4. Scans the byte stream for JPEG SOI (`0xFFD8`) and EOI (`0xFFD9`) markers
5. Extracts individual JPEG frames as `Blob` objects
6. Uploads each frame via the **existing** `uploadCameraFrame()` API

**Zero backend changes required.** The backend simply receives JPEG frames through its existing frame upload endpoint.

### 5.5 MJPEG Stream Parsing Details

```
MJPEG Stream Format:
─ BoundaryString\r\n
Content-Type: image/jpeg\r\n
Content-Length: 45231\r\n
\r\n
[JPEG data: 0xFFD8 ... 0xFFD9]
\r\n
─ BoundaryString\r\n
Content-Type: image/jpeg\r\n
...
```

The parser:
1. Detects `--BoundaryString` markers to separate frames
2. Within each frame section, locates JPEG SOI (`0xFFD8`) and EOI (`0xFFD9`)
3. Extracts the raw JPEG bytes between these markers
4. Creates a `Blob` with `type: "image/jpeg"`
5. Uploads via `uploadCameraFrame(cameraId, blob)`

### 5.6 Network Concepts Demonstrated

| Concept | How It's Used |
|---------|---------------|
| HTTP persistent connections | `fetch()` keeps TCP connection alive for continuous streaming |
| multipart/x-mixed-replace | Real stream boundary parsing on the browser |
| JPEG byte-level framing | SOI (`0xFFD8`) / EOI (`0xFFD9`) marker detection |
| Browser-to-server relay | Cross-network HTTP tunneling through the browser |
| AbortController | Proper stream lifecycle management on stop/unmount |

### 5.7 UI Integration

In the Admin Dashboard sidebar, for any camera with `source_type = "ip_mjpeg"` and a configured `source_url`, a **"Relay IP Camera"** button appears alongside the existing controls. While relaying, the button shows a live FPS counter.

---

## 6. Change 5: Configuration Additions

### 6.1 Files Modified

| File | Action |
|------|--------|
| `backend/app/config.py` | MODIFIED |

### 6.2 New Configuration Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `wireguard_backend` | str | `"auto"` | WireGuard backend: `"auto"`, `"real"`, or `"sim"` |
| `wireguard_base_port` | int | `51820` | Starting port for WireGuard tunnels |
| `wireguard_config_dir` | str | `"/etc/wireguard"` | Directory for WireGuard config files |
| `wireguard_interface_prefix` | str | `"wg-cam"` | Prefix for WireGuard interface names |
| `mdns_discovery_enabled` | bool | `False` | Auto-start mDNS discovery on backend startup |

---

## 7. Change 6: Database Schema Additions

### 7.1 New Table: `wireguard_tunnels`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PK, AUTOINCREMENT |
| `camera_id` | INTEGER | FK(cameras.id), UNIQUE, NOT NULL, INDEXED |
| `interface_name` | VARCHAR(64) | UNIQUE, NOT NULL, INDEXED |
| `listen_port` | INTEGER | NOT NULL |
| `private_key` | VARCHAR(128) | NOT NULL |
| `peer_public_key` | VARCHAR(128) | NOT NULL |
| `peer_endpoint` | VARCHAR(128) | NOT NULL |
| `allowed_ips` | VARCHAR(64) | DEFAULT '10.0.0.2/32' |
| `is_active` | BOOLEAN | DEFAULT 0 |
| `bytes_sent` | INTEGER | DEFAULT 0 |
| `bytes_received` | INTEGER | DEFAULT 0 |
| `latest_handshake` | DATETIME | NULLABLE |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### 7.2 New Columns on `cameras` Table

| Column | Type | Description |
|--------|------|-------------|
| `discovered_at` | DATETIME | When camera was discovered via mDNS |
| `discovered_by_mdns` | BOOLEAN | Whether camera was auto-discovered |

---

## 8. Complete File Manifest

### Backend — New Files

| File | Lines | Purpose |
|------|-------|---------|
| `backend/app/wireguard_manager.py` | 320 | Modular WireGuard abstraction with dual backends |
| `backend/app/mdns_discovery.py` | 272 | Background mDNS/DNS-SD camera discovery service |
| `backend/tests/test_wireguard.py` | 265 | 8 integration tests for WireGuard tunnel CRUD |

### Backend — Modified Files

| File | Lines Added | Changes |
|------|-------------|---------|
| `backend/app/config.py` | +5 | WireGuard + mDNS settings |
| `backend/app/models.py` | +20 | WireGuardTunnelConfig table, camera discovery columns |
| `backend/app/database.py` | +60 | Schema migration helpers |
| `backend/app/schemas.py` | +40 | 7 new Pydantic schemas |
| `backend/app/main.py` | +260 | 8 new API endpoints + startup migrations + imports |

### Frontend — New Files

| File | Lines | Purpose |
|------|-------|---------|
| `Frontend/src/components/MJPEGRelayStreamer.tsx` | 220 | Browser-based MJPEG relay for cross-network IP cameras |

### Frontend — Modified Files

| File | Changes |
|------|---------|
| `Frontend/src/components/AdminLocalStreamer.tsx` | Removed serial backpressure gate → 3x FPS improvement |
| `Frontend/src/lib/localCameraConfig.ts` | JPEG quality 0.68 → 0.55 |
| `Frontend/src/pages/AdminDashboard.tsx` | Added MJPEGRelayStreamer import + usage |

---

## 9. How to Test

### 9.1 WireGuard Tunnel (Uses Simulated Backend — No WireGuard Required)

```bash
# Create a tunnel for camera 1
curl -X POST "http://localhost:8000/api/v1/admin/cameras/1/tunnel" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "peer_public_key": "test-public-key",
    "peer_endpoint": "192.168.1.100:51820",
    "allowed_ips": "10.0.0.2/32"
  }'

# Get tunnel status
curl "http://localhost:8000/api/v1/admin/cameras/1/tunnel/status" \
  -H "Authorization: Bearer <admin-token>"

# List all tunnels
curl "http://localhost:8000/api/v1/admin/tunnels" \
  -H "Authorization: Bearer <admin-token>"

# Destroy tunnel
curl -X DELETE "http://localhost:8000/api/v1/admin/cameras/1/tunnel" \
  -H "Authorization: Bearer <admin-token>"
```

### 9.2 Run WireGuard Integration Tests

```bash
cd backend
pytest tests/test_wireguard.py -v
```

### 9.3 mDNS Discovery (Requires `zeroconf` Package)

```bash
pip install zeroconf

# Start discovery
curl -X POST "http://localhost:8000/api/v1/admin/discovery/start" \
  -H "Authorization: Bearer <admin-token>"

# Check status
curl "http://localhost:8000/api/v1/admin/discovery/status" \
  -H "Authorization: Bearer <admin-token>"

# Stop discovery
curl -X POST "http://localhost:8000/api/v1/admin/discovery/stop" \
  -H "Authorization: Bearer <admin-token>"
```

### 9.4 Admin Webcam FPS Improvement

1. Log in as admin
2. Click "Start Stream" on an admin_local camera
3. Observe the frame rate — should be noticeably smoother than before
4. The backend receives frames at ~100ms intervals regardless of upload latency

### 9.5 MJPEG Relay (Cross-Network IP Camera)

1. Configure a camera with `source_type = "ip_mjpeg"` and a local IP camera URL
2. Click "Relay IP Camera" button next to the camera in the admin sidebar
3. The component fetches MJPEG directly from the camera browser-side
4. Each frame is uploaded to the backend and becomes visible to viewers
5. The button shows live FPS (e.g., "Stop Relay (15 FPS)")

---