---
noteId: "2cf7dde03be411f1adf6ebef35e971fb"
tags: []

---

# Project Handover (NPS SecureCam)

Date: 2026-04-19
Project root: G:/6thsemproject/NPS

## 1) Project Goal (Current Direction)
Build a Zero-Trust Smart Camera Access System where:
- Admin can assign camera access to viewers for limited time.
- Authentication is secure (target: PAKE in later phase).
- Video/signaling should be encrypted.
- Demo should visibly show security state and expiry/revocation behavior.

## 2) What Is Done So Far

### Frontend
Status: Implemented UI with local/mock state.

Key files:
- Frontend/src/pages/Login.tsx
- Frontend/src/pages/AdminDashboard.tsx
- Frontend/src/pages/ViewerDashboard.tsx
- Frontend/src/context/AppContext.tsx

Implemented behavior:
- Role-based login UI (admin/viewer).
- Admin dashboard:
  - Camera list with online/offline status.
  - Live feed placeholders.
  - Assignment list with countdown and revoke.
  - Assignment creation dialog exists in UI flow.
- Viewer dashboard:
  - Shows only assigned cameras.
  - Session expiry toast behavior.
  - Encrypted stream indicator in UI.
- Security bar and toast-based notifications.

Validation done:
- Frontend production build passed.
- Frontend tests passed.
- Lint has a few issues in generated UI files (non-blocking for runtime).

### Backend
Status: FastAPI scaffold implemented and verified.

Backend structure:
- backend/app/main.py
- backend/app/models.py
- backend/app/schemas.py
- backend/app/database.py
- backend/app/config.py
- backend/app/auth.py
- backend/app/deps.py
- backend/app/seed.py
- backend/requirements.txt
- backend/.env.example

Implemented API endpoints:
- GET /health
- POST /api/v1/auth/login
- GET /api/v1/auth/me
- GET /api/v1/cameras
- GET /api/v1/assignments
- POST /api/v1/assignments (admin only)
- DELETE /api/v1/assignments/{assignment_id} (admin only)

Auth and data:
- JWT-based auth added.
- Role checks for admin routes.
- Seeded users and cameras on startup.
- Assignment expiry logic included.

Database:
- SQLite working now (backend/nps.db present).
- PostgreSQL support prepared via DATABASE_URL config in .env.

Validation done:
- Server starts successfully.
- /health returns OK.
- Login endpoint tested successfully with seeded credentials.

## 3) Seeded Credentials (Current)
- admin_user / admin123
- viewer_a / viewer123
- viewer_b / viewer123
- viewer_c / viewer123

## 4) Git/Repository State (Important)
- Main repository remote is configured to:
  - https://github.com/NikhilParashuramBakale/NPS.git
- Current branch: main
- No submodules currently detected.
- Working tree was reported clean in latest check.

Note on previous push issue:
- A 403 permission error happened earlier when local credentials mapped to a different GitHub account.
- If push fails again, refresh Windows Git credentials and re-authenticate with correct account.

## 5) What Is Remaining

### High Priority (Next Steps)
1. Connect frontend to backend APIs (remove mock-only AppContext logic):
   - Replace local login with POST /api/v1/auth/login.
   - Store JWT token securely in client state (or localStorage for demo).
   - Fetch cameras and assignments from backend.
   - Wire create/revoke assignment actions to backend endpoints.

2. Add API service layer in frontend:
   - Create Frontend/src/lib/api.ts for typed API calls.
   - Add auth token interceptor/helper.
   - Add centralized error handling.

3. Add .env support in frontend for backend base URL:
   - Example: VITE_API_BASE_URL=http://127.0.0.1:8000

### Security/Project Objective Tasks
4. Implement PAKE authentication flow (replace plain password verification path).
5. Add encrypted signaling and WebRTC stream path.
6. Add security telemetry/simulation panel:
   - Auth success/failure.
   - Access grant/revoke.
   - Session expiry events.
   - Encryption active indicators.

### Data/Infra Tasks
7. Move from SQLite demo DB to PostgreSQL for final presentation.
8. Add DB migration workflow (Alembic or equivalent).
9. Add deployment-ready configuration (CORS, secrets, env separation).

### Quality Tasks
10. Fix frontend lint errors in generated UI files.
11. Add backend tests for auth and assignment authorization.
12. Add end-to-end happy path test for admin assign -> viewer access.

## 6) PostgreSQL Setup (When Ready)
1. Install PostgreSQL + pgAdmin.
2. Create database: nps_securecam
3. Create backend/.env from backend/.env.example
4. Set DATABASE_URL:
   - postgresql+psycopg://postgres:<password>@localhost:5432/nps_securecam
5. Start backend and verify:
   - GET /health
   - POST /api/v1/auth/login

## 7) Run Commands (Current)

Frontend:
- cd Frontend
- npm install
- npm run dev

Backend:
- cd backend
- g:/6thsemproject/NPS/.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

## 8) Ready Prompt for New Chat Agent
Use this exactly in a new chat:

"Continue this project from PROJECT_HANDOVER.md. First task: connect frontend to backend APIs end-to-end (login, cameras, assignments create/revoke) and remove mock-only data flow in AppContext while preserving current UI behavior. Then run build/test checks and summarize changed files."
