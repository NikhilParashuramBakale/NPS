---
noteId: "ad073ba161c511f1b5c859fd855165b1"
tags: []

---

# API Design

All routes are available under `/api/v1`. Spec aliases such as `/auth/login`, `/requests`, `/audit-logs`, `/security-events`, and `/security-dashboard` are also exposed where required.

## Auth

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout` *(not implemented — client clears token locally)*
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/pake/start`
- `POST /api/v1/auth/pake/finish`
- `POST /api/v1/auth/pake/upgrade`

## Cameras

### List and discover

- `GET /api/v1/cameras`
  - **Admin:** returns all cameras.
  - **Resident / viewer / security guard:** returns only cameras the user owns plus cameras in active assignments.
- `GET /api/v1/cameras/requestable`
  - **Resident / viewer / security guard only.**
  - Returns active admin-managed cameras (`owner_id` is `null`) that can be selected when creating an access request.
  - Does not grant viewing access by itself.

### Viewer-owned cameras

- `POST /api/v1/cameras` — create a viewer-owned camera
- `PUT /api/v1/cameras/{camera_id}` — update viewer-owned camera source
- `POST /api/v1/cameras/{camera_id}/share-request` — request admin approval to share a viewer camera

Create body example:

```json
{
  "name": "My Phone Camera",
  "source_type": "viewer_local",
  "source_url": null,
  "request_share": false
}
```

Allowed viewer `source_type` values: `viewer_local`, `ip_mjpeg`.

### Admin-managed cameras

- `PUT /api/v1/admin/cameras/{camera_id}` — configure admin camera source
- `PUT /api/v1/admin/cameras/{camera_id}/access` — enable/disable camera or approve viewer share
- `GET /api/v1/admin/cameras/{camera_id}/probe` — test MJPEG reachability
- `POST /api/v1/admin/cameras/{camera_id}/frame` — upload admin local webcam frame (admin only)

Admin configure body example:

```json
{
  "source_type": "admin_local",
  "source_url": null
}
```

Allowed admin `source_type` values: `unconfigured`, `ip_mjpeg`, `admin_local`.

For `ip_mjpeg`, `source_url` is required (for example `http://192.168.0.10:8080/video`).

Admin access update body example:

```json
{
  "is_active": true,
  "share_approved": true,
  "clear_share_request": false
}
```

### Streaming and frames

- `GET /api/v1/cameras/{camera_id}/frame` — fetch latest uploaded JPEG frame (`admin_local` / `viewer_local`)
- `POST /api/v1/cameras/{camera_id}/frame` — upload viewer local webcam frame (owner only)
- `GET /api/v1/cameras/{camera_id}/stream` — proxy MJPEG stream for `ip_mjpeg` cameras

Frame and stream access require JWT authentication. Residents may access only assigned cameras or cameras they own. Admins may access all cameras.

## Requests

- `POST /api/v1/requests`
- `GET /api/v1/requests/my`
- `GET /api/v1/requests/pending` (admin only)
- `POST /api/v1/requests/{request_id}/approve`
- `POST /api/v1/requests/{request_id}/reject`

Create request body:

```json
{
  "camera_id": 1,
  "reason": "My bicycle was stolen from the parking area."
}
```

Approve body:

```json
{ "duration_hours": 24 }
```

## Assignments

- `GET /api/v1/assignments`
- `POST /api/v1/assignments` (admin only)
- `DELETE /api/v1/assignments/{assignment_id}` (admin only)

Assignments are active only until `expires_at` and can be marked `revoked` or `expired`.

Create assignment body:

```json
{
  "viewer_id": 4,
  "camera_ids": [1, 2],
  "duration_minutes": 10
}
```

## Admin Users

- `GET /api/v1/admin/users?role=resident`
- `POST /api/v1/admin/users`

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
- `GET /api/v1/security/events`
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
