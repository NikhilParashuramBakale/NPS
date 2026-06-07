# NPS SecureCam — Project Status

**Last Updated:** June 2026  
**Project Root:** `Documents/nps_label/NPS`

## Completed

- PAKE (SPAKE2) login as default frontend authentication path
- JWT identity tokens (no automatic camera access)
- Access request workflow with admin approve/reject
- Expiring assignments with soft revoke (`status=revoked`)
- Capability token issue and validate routes
- Nonce replay detection (`REPLAY_ATTACK_DETECTED`)
- Role-based access for viewer, resident, and security_guard
- Audit logs and security dashboard API routes
- Frontend wired to capability-gated camera streams
- Backend pytest suite (21 tests passing)
- Master documentation and prototype AI analytics panel

## Demo Users

| Username | Password | Role |
| --- | --- | --- |
| `admin_user` | `admin123` | Admin |
| `resident_a` | `resident123` | Resident (seeded assignment to Admin Webcam) |
| `resident_b` | `resident123` | Resident |
| `guard_a` | `guard123` | Security Guard |
| `viewer_a` / `viewer_b` | `viewer123` | Viewer (legacy) |

## Run

```bash
# Backend
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Frontend
cd Frontend
npm run dev
```

## Tests

```bash
cd backend
python -m pytest tests/ -q
```

## Future Work

- Encrypted WebRTC transport
- Production database (PostgreSQL) and secrets management
- Real ML-based analytics (current panel is rule-based prototype)
