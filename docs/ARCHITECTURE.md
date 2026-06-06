# Architecture

## System Overview

The application models a residential apartment surveillance access process. Residents request temporary access to specific cameras after an incident. Admins approve or reject each request. Approved requests create expiring assignments, and camera viewing requires a separate capability token.

The admin operates exactly **two** system cameras:

| Camera | Purpose | Source type after setup |
| --- | --- | --- |
| Admin Webcam | Browser webcam uploaded as JPEG frames | `admin_local` |
| Admin IP Camera | Network MJPEG camera proxied by the backend | `ip_mjpeg` |

Residents may also register their own cameras (`viewer_local` or `ip_mjpeg`) and optionally request admin approval to share them with other viewers.

## Components

- React + TypeScript frontend for login, admin dashboard, resident dashboard, request history, audit logs, security events, and security dashboard.
- FastAPI backend for authentication, authorization, request workflow, assignments, capability tokens, audit logs, security events, and camera streaming.
- SQLAlchemy models backed by SQLite for demo mode and compatible with PostgreSQL via `DATABASE_URL`.
- PAKE bridge for password-authenticated key exchange before issuing JWT identity tokens.

## Folder Structure

```text
backend/app/
  auth.py          JWT, password hashing, capability token helpers
  audit.py         audit/security event helpers and expiry pruning
  database.py      database engine and SQLite compatibility migration helpers
  main.py          FastAPI routes and workflow orchestration
  models.py        SQLAlchemy models
  schemas.py       Pydantic request/response schemas
  seed.py          demo users, cameras, requests, assignments, events

Frontend/src/
  context/         application session, polling, and shared data state
  lib/             API client and PAKE browser helper
  pages/           login, admin, resident, request, audit, event dashboards
  components/      camera tiles, dialogs, stream helpers, UI components
```

## Camera Model

Each camera has a `source_type`:

| Value | Meaning |
| --- | --- |
| `unconfigured` | Admin camera not yet set up |
| `admin_local` | Admin browser webcam; frames uploaded to backend |
| `ip_mjpeg` | MJPEG URL proxied through `/stream` |
| `viewer_local` | Viewer browser webcam; owner uploads frames |

Live preview behavior:

- `admin_local` / `viewer_local`: clients poll `GET /api/v1/cameras/{id}/frame` for the latest JPEG.
- `ip_mjpeg`: clients render `GET /api/v1/cameras/{id}/stream` (token passed as query param for `<img>` usage).

## User Flows

### Admin first login

1. Admin logs in and sees **Admin Webcam** and **Admin IP Camera**.
2. If either camera is still `unconfigured`, a setup banner appears on the admin dashboard.
3. Admin configures:
   - **Admin Webcam** → `admin_local`, then clicks **Start Stream**.
   - **Admin IP Camera** → `ip_mjpeg` with MJPEG URL, then uses **Test stream**.

### Resident access request

1. Resident opens **Request Access** (`/requests`).
2. Frontend loads admin cameras from `GET /api/v1/cameras/requestable` (not from the general camera list).
3. Resident submits a reason for a selected camera.
4. Admin approves from the pending-requests panel.
5. Backend creates an expiring assignment.

### Resident viewing after approval

1. Viewer dashboard polls cameras and assignments every 10 seconds.
2. New assignments appear without a full page reload.
3. Assigned camera preview depends on source type:
   - `unconfigured` → waiting message until admin configures the camera.
   - `admin_local` → frame preview once admin starts streaming.
   - `ip_mjpeg` → MJPEG stream once admin sets the URL.
4. Opening an assigned camera issues and validates a capability token with a fresh nonce.

## Trust Boundaries

- Browser to API: all state-changing actions require JWT authentication.
- JWT to camera access: JWT identifies the user only. It is not sufficient to view a camera.
- Camera capability: a separate camera-scoped token is issued only for an active assignment or admin/owner preview.
- Replay boundary: every capability validation requires a fresh nonce.
- Request discovery: residents can list requestable admin cameras, but cannot view them until an assignment exists.

## Security Model

1. User authenticates through PAKE.
2. Backend issues a JWT containing identity and role only.
3. Resident selects an admin camera from the requestable list and creates an access request with a reason.
4. Admin approves for a bounded duration.
5. Backend creates an active assignment and logs `REQUEST_APPROVED` and `ACCESS_GRANTED`.
6. Viewer requests a camera capability token.
7. Backend issues a token scoped to one user, one camera, one assignment, `VIEW`, and assignment expiry.
8. Capability validation requires a fresh nonce.
9. Reused nonce is rejected and logged as `REPLAY_ATTACK_DETECTED`.
10. Expired or revoked assignments are excluded from active access and logged.

## Seeded Demo Data

On first database seed:

- Users: `admin_user`, `viewer_a`, `viewer_b`, `resident_a`, `resident_b`, `guard_a`
- Admin cameras: `Admin Webcam`, `Admin IP Camera`
- Demo assignment: `resident_a` already has temporary access to `Admin Webcam`
- Demo pending request: `resident_b` requested `Admin IP Camera`

If an older database still contains legacy cameras (Parking, Gate, Lobby, Elevator), delete `backend/nps.db` and restart the backend to re-seed.
