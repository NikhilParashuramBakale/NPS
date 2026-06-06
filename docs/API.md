# API Design

All routes are available under `/api/v1`. Spec aliases such as `/auth/login`, `/requests`, `/audit-logs`, `/security-events`, and `/security-dashboard` are also exposed where required.

## Auth

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/pake/start`
- `POST /api/v1/auth/pake/finish`
- `POST /api/v1/auth/pake/upgrade`

## Cameras

- `GET /api/v1/cameras`
- `POST /api/v1/cameras`
- `GET /api/v1/cameras/{camera_id}/frame`
- `GET /api/v1/cameras/{camera_id}/stream`
- `PUT /api/v1/cameras/{camera_id}`
- `POST /api/v1/cameras/{camera_id}/share-request`

## Requests

- `POST /api/v1/requests`
- `GET /api/v1/requests/my`
- `GET /api/v1/requests/pending`
- `POST /api/v1/requests/{request_id}/approve`
- `POST /api/v1/requests/{request_id}/reject`

Approve body:

```json
{ "duration_hours": 24 }
```

## Assignments

- `GET /api/v1/assignments`
- `POST /api/v1/assignments`
- `DELETE /api/v1/assignments/{assignment_id}`

Assignments are active only until `expires_at` and can be marked `revoked` or `expired`.

## Capability Tokens

- `POST /api/v1/capabilities`
- `POST /api/v1/capabilities/validate`

Issue request:

```json
{ "camera_id": 1, "permissions": ["VIEW"] }
```

Validate request:

```json
{
  "camera_id": 1,
  "capability_token": "jwt...",
  "nonce": "fresh-client-nonce"
}
```

Reusing a nonce returns `409` and creates a `REPLAY_ATTACK_DETECTED` event.

## Audit And Security

- `GET /api/v1/audit-logs`
- `GET /api/v1/security-events`
- `GET /api/v1/security-dashboard`

Dashboard fields:

- `authentication_success_count`
- `authentication_failure_count`
- `pending_requests`
- `approved_requests`
- `rejected_requests`
- `expired_assignments`
- `revoked_assignments`
- `recent_security_events`
- `recent_audit_logs`
