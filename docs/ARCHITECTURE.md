# Architecture

## System Overview

The application models a residential apartment surveillance access process. Residents request temporary access to specific cameras after an incident. Admins approve or reject each request. Approved requests create expiring assignments, and camera viewing requires a separate capability token.

## Components

- React + TypeScript frontend for login, admin dashboard, resident dashboard, request history, audit logs, security events, and security dashboard.
- FastAPI backend for authentication, authorization, request workflow, assignments, capability tokens, audit logs, and security events.
- SQLAlchemy models backed by SQLite for demo mode and compatible with PostgreSQL via `DATABASE_URL`.
- PAKE bridge for password-authenticated key exchange before issuing JWT identity tokens.

## Trust Boundaries

- Browser to API: all state-changing actions require JWT authentication.
- JWT to camera access: JWT identifies the user only. It is not sufficient to view a camera.
- Camera capability: a separate camera-scoped token is issued only for an active assignment or admin/owner preview.
- Replay boundary: every capability validation requires a fresh nonce.

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
  context/         application session and shared data state
  lib/             API client and PAKE browser helper
  pages/           login, admin, resident, request, audit, event dashboards
  components/      camera tiles, dialogs, stream helpers, UI components
```

## Security Model

1. User authenticates through PAKE.
2. Backend issues a JWT containing identity and role only.
3. Resident creates an access request with a reason.
4. Admin approves for a bounded duration.
5. Backend creates an active assignment and logs `REQUEST_APPROVED` and `ACCESS_GRANTED`.
6. Viewer requests a camera capability token.
7. Backend issues a token scoped to one user, one camera, one assignment, `VIEW`, and assignment expiry.
8. Capability validation requires a fresh nonce.
9. Reused nonce is rejected and logged as `REPLAY_ATTACK_DETECTED`.
10. Expired or revoked assignments are excluded from active access and logged.
