# Project Handover — Secure Camera Access System

**Date:** June 2026  
**Project root:** `Documents/nps_label/NPS`

## Summary

Zero-trust smart surveillance access system with PAKE authentication, temporary assignments, capability tokens, nonce replay protection, and admin audit/security dashboards.

## Architecture

- **Backend:** FastAPI (`backend/app/`)
- **Frontend:** React + Vite (`Frontend/`)
- **Database:** SQLite with runtime column migrations

## Security Flow (implemented)

1. PAKE login → JWT session
2. Limited-role user requests camera access
3. Admin approves → expiring assignment
4. User issues capability token
5. User validates with fresh nonce
6. Stream/frame access uses JWT + capability token
7. Events written to `security_events` and `audit_logs`

## Key Backend Files

| File | Role |
| --- | --- |
| `backend/app/main.py` | API routes |
| `backend/app/access.py` | RBAC and capability enforcement |
| `backend/app/auth.py` | JWT and capability token helpers |
| `backend/app/audit.py` | Logging and assignment expiry |
| `backend/app/models.py` | SQLAlchemy models |
| `backend/tests/` | Integration tests |

## Key Frontend Files

| File | Role |
| --- | --- |
| `Frontend/src/context/AppContext.tsx` | PAKE login, polling |
| `Frontend/src/pages/ViewerDashboard.tsx` | Capability-gated camera viewing |
| `Frontend/src/pages/AdminDashboard.tsx` | Requests, assignments, revoke |
| `Frontend/src/pages/SecurityDashboard.tsx` | Security metrics |
| `Frontend/src/pages/AnalyticsDemo.tsx` | Prototype rule-based analytics |

## Run Locally

```bash
cd backend && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
cd Frontend && npm run dev
```

## Documentation

- [MASTER_DOCUMENTATION.md](docs/MASTER_DOCUMENTATION.md)
- [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [API.md](docs/API.md)
- [THREAT_MODEL.md](docs/THREAT_MODEL.md)
