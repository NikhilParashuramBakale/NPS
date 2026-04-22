---
noteId: "2e3654803e5911f182802704183bb7fe"
tags: []

---

# NPS SecureCam - Project Status & Roadmap

**Last Updated:** April 22, 2026  
**Project Root:** G:/6thsemproject/NPS

---

## 1. Completed Work (This Session)

### Backend
- ✅ **Audit Event Logging System** (new `backend/app/audit.py`)
  - Added `SecurityEvent` model for persistent audit trail storage
  - Implemented `log_event()` for recording login success/failure, assignment create/revoke, and assignment expiry
  - Added `prune_expired_assignments()` to auto-revoke expired assignments and log expiry events
  - Added `recent_events_for_user()` to filter audit events by user role (admin sees all, viewers see only their events)
  
- ✅ **Enhanced API Endpoints**
  - `POST /api/v1/auth/login` now logs login success/failure with details
  - `POST /api/v1/assignments` now logs assignment creation with admin, viewer, cameras, and expiry metadata
  - `DELETE /api/v1/assignments/{assignment_id}` now logs revocation with assignment details
  - `GET /api/v1/security/events` (new endpoint) returns recent audit events filtered by user role

- ✅ **Database Schema Update**
  - Added `security_events` table with indexed fields: event_type, actor_username, target_username, created_at

### Frontend
- ✅ **Live Security Bar**
  - `SecurityBar` component now fetches live events from `/api/v1/security/events` every 10 seconds
  - Displays latest audit event (e.g., "login success · admin_user") instead of static text
  - Shows "Live audit" badge to indicate real-time backend state

- ✅ **Instant Login (No Mock Delay)**
  - Removed artificial 700ms setTimeout delay from `Login.tsx`
  - Login now calls API immediately and reflects real backend response time
  - Added proper error handling and try/catch for async flow

- ✅ **API Layer Update**
  - Added `SecurityEvent` type definition in `Frontend/src/lib/api.ts`
  - Added `fetchSecurityEvents()` function for audit endpoint consumption

### Validation
- ✅ Frontend production build passed
- ✅ Frontend test suite passed (1/1 tests)
- ✅ Backend modules import cleanly in project venv
- ✅ No syntax or type errors in touched files

---

## 2. Current State Summary

### What Works Now
1. **End-to-end flow**: Login → Admin Dashboard → Create Assignment → Viewer sees assigned cameras
2. **Real-time feedback**: Security bar shows live audit events from backend
3. **Role-based access**: Admins see all assignments and audit logs; viewers see only their assigned cameras and relevant events
4. **Assignment lifecycle**: Create with expiry time → Countdown timer → Auto-expiry + log → Revoke with log
5. **Database persistence**: SQLite currently; PostgreSQL config ready in `.env.example`

### Architecture (Current)
```
Frontend (React + TypeScript)
├── Login → JWT token stored in localStorage
├── Admin Dashboard → manage camera assignments, see live audit
├── Viewer Dashboard → see only assigned cameras, session countdown
└── Security Bar → live audit feed (polls /api/v1/security/events every 10s)

Backend (FastAPI + SQLAlchemy)
├── Authentication: JWT-based, password hashed with PBKDF2
├── Authorization: Role checks (admin-only routes)
├── Data: Users, Cameras, Assignments, SecurityEvents (audit trail)
├── API: 8 endpoints + 1 health check
└── Database: SQLite (nps.db) or PostgreSQL (configurable via DATABASE_URL)
```

---

## 3. Remaining Work (High Priority)

### Phase 1: Security Hardening (Next)
**Goal:** Make the system production-ready for demo  
**Estimated effort:** 2-3 days

- [ ] **Password Hashing Upgrade**
  - Replace PBKDF2 with Argon2id for better resistance to GPU attacks
  - Add `argon2-cffi` to `backend/requirements.txt`
  - Update `backend/app/auth.py` hash/verify functions

- [ ] **Backend Testing**
  - Add pytest unit tests for auth endpoints (login success/failure, role validation)
  - Add integration tests for assignment flow (create → list → revoke)
  - Add tests for audit log generation
  - Target: ~20 tests covering happy path and edge cases

- [ ] **CORS & HTTPS Readiness**
  - Verify CORS headers correctly set for frontend origins
  - Document HTTPS setup (self-signed cert or Let's Encrypt path for prod)
  - Add security headers (X-Frame-Options, X-Content-Type-Options, etc.)

- [ ] **Environment Separation**
  - Create `.env.dev`, `.env.prod` templates
  - Add validation that critical secrets are set before startup
  - Document dev vs prod configuration differences

### Phase 2: Authentication Enhancement (After Phase 1)
**Goal:** Implement PAKE to replace plaintext password verification  
**Estimated effort:** 5-7 days

- [ ] **PAKE Protocol Integration**
  - Choose library: `spake2` (SPAKE2) or `srp` (SRP-6a)
  - Refactor `POST /api/v1/auth/login` into multi-step handshake:
    - Step 1: Client sends username → Server returns challenge (PAKE identifier)
    - Step 2: Client sends PAKE response → Server verifies, returns JWT on success
  - Never send plaintext password over wire
  - Update frontend `login()` flow to handle handshake

- [ ] **Session Key Derivation**
  - Use PAKE-derived shared secret to derive encryption key for session
  - Store session metadata (client_id, key_hash, created_at, last_activity) in new `sessions` table
  - Implement session validation on every protected endpoint

- [ ] **Replay Attack Prevention**
  - Add nonce/timestamp validation to PAKE messages
  - Prevent reuse of old handshake responses

### Phase 3: Encrypted Media & Signaling (Later)
**Goal:** Add WebRTC signaling + end-to-end encrypted video streams  
**Estimated effort:** 7-10 days

- [ ] **WebRTC Signaling Server**
  - Add WebSocket endpoint for real-time offer/answer exchange
  - Implement session-aware signaling (JWT auth + session ID)
  - Store SDP offers/answers in cache (Redis or in-memory)

- [ ] **Encrypted Signaling**
  - Encrypt SDP messages using session key from Phase 2
  - Verify message integrity with HMAC

- [ ] **Video Stream Setup**
  - Client-side WebRTC PeerConnection
  - Implement DTLS-SRTP encryption at transport layer
  - Handle ICE candidates + NAT traversal
  - Display encrypted stream indicator in UI

- [ ] **Camera Feed Mock**
  - Create test video source (synthetic stream or test file)
  - Encode and transmit via WebRTC
  - Display playback in viewer dashboard with "Lock" badge when encrypted

### Phase 4: Demo & Presentation Assets (Final)
**Goal:** Package for 2-3 minute secure demo  
**Estimated effort:** 1-2 days

- [ ] **Demo Script**
  - Write 3-minute walkthrough:
    1. Show login with PAKE handshake (security telemetry visible)
    2. Admin assigns Camera 3 to Viewer A for 10 minutes
    3. Viewer A logs in, sees Camera 3 encrypted stream
    4. Show audit log of all actions
    5. Timer expires, access auto-revoked
  
- [ ] **Security Dashboard (Optional)**
  - Add visualization of audit events (timeline, event counts)
  - Show auth success/failure rates
  - Display encryption status + session key active indicator
  - Mock attack rejection scenario (e.g., replay attempt blocked)

- [ ] **Documentation**
  - Architecture diagram (ASCII or Mermaid)
  - Sequence flow diagram (login → assign → view → expiry)
  - README with setup & run instructions
  - Security claims summary (what's protected, threat model)

---

## 4. Testing & Validation Checklist

### Before Demo
- [ ] Frontend production build passes
- [ ] Frontend tests pass
- [ ] Backend unit tests pass (>80% coverage on auth/assignment modules)
- [ ] End-to-end flow tested: login → assign → view → revoke → expiry
- [ ] Audit log captures all events correctly
- [ ] Security bar updates in real-time
- [ ] Handled edge cases: invalid login, expired assignment, role mismatch, etc.

### Before Final Submission
- [ ] Lint passes (ESLint for frontend)
- [ ] Type safety: no `any` or unsafe casts without justification
- [ ] Error messages are user-friendly (no stack traces in UI)
- [ ] Database migrations documented (if moving to PostgreSQL)
- [ ] .env files configured and .gitignore excludes secrets
- [ ] No hardcoded credentials in code

---

## 5. Run Commands (Current)

### Frontend
```bash
cd Frontend
npm install  # if node_modules missing
npm run dev    # development server on http://localhost:5173
npm run build  # production build
npm test       # run tests
npm run lint   # check for linting issues
```

### Backend
```bash
cd backend
# Ensure venv activated:
# g:/6thsemproject/NPS/.venv/Scripts/Activate.ps1

pip install -r requirements.txt  # if not already done

# Start server:
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Or via full path:
g:/6thsemproject/NPS/.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Test Credentials (Seeded on Backend Startup)
- **Admin:** `admin_user` / `admin123`
- **Viewers:** `viewer_a`, `viewer_b`, `viewer_c` / `viewer123` (all)

---

## 6. File Structure (Key Files)

### Backend
- `backend/app/main.py` - FastAPI app + all endpoints
- `backend/app/audit.py` - Audit event logging (new)
- `backend/app/auth.py` - JWT + password hashing
- `backend/app/models.py` - Database models (added `SecurityEvent`)
- `backend/app/schemas.py` - Pydantic schemas (added `SecurityEventOut`)
- `backend/app/database.py` - SQLAlchemy setup
- `backend/app/seed.py` - Test data seeder
- `backend/requirements.txt` - Python dependencies
- `backend/.env` - Local config (DATABASE_URL, JWT_SECRET, etc.)

### Frontend
- `Frontend/src/pages/Login.tsx` - Login UI (no more mock delay)
- `Frontend/src/pages/AdminDashboard.tsx` - Admin camera/assignment management
- `Frontend/src/pages/ViewerDashboard.tsx` - Viewer camera list
- `Frontend/src/context/AppContext.tsx` - Global state (user, cameras, assignments)
- `Frontend/src/components/SecurityBar.tsx` - Live audit feed (new)
- `Frontend/src/lib/api.ts` - API client layer (added `fetchSecurityEvents`)
- `Frontend/package.json` - Dependencies (React, TypeScript, Tailwind, shadcn/ui)

---

## 7. Project Handover Notes

If passing to another developer, start with:

1. Read [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) for original requirements
2. Review [know.md](know.md) for architecture philosophy (PAKE + encrypted signaling + audit)
3. Run frontend + backend locally (see Section 5)
4. Test login → assign → view flow with seeded credentials
5. Check `/api/v1/security/events` endpoint in browser to see audit trail
6. Pick a task from "Remaining Work" and iterate

**Next developer prompt:**
> "Continue from STATUS.md Phase 1: implement Argon2id password hashing upgrade and add backend pytest tests for auth + assignment endpoints. Run frontend/backend validation and summarize what passed and what needs fixes."

---

## 8. Git Status

- Main branch: ready for commit
- All changes tracked and validated
- No breaking changes to existing API (only additions)
- Database schema migration: automatic on backend startup (SQLAlchemy creates new `security_events` table)

