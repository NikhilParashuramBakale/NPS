---
noteId: "acd9c30061c511f1b5c859fd855165b1"
tags: []

---

# Zero-Trust Smart Surveillance Access System using PAKE Authentication

Final year Network Security project for a residential apartment surveillance workflow.


## Demo Cameras

The admin account manages exactly two cameras (configured after login):

| Camera | Setup |
| --- | --- |
| Admin Webcam | Set source to `admin_local`, then click **Start Stream** |
| Admin IP Camera | Set source to `ip_mjpeg` and provide the MJPEG URL |

Residents request access from the **Request Access** page, which lists admin cameras via `GET /api/v1/cameras/requestable`.

## Security Features

- PAKE login flow using the existing SPAKE2 prototype bridge.
- JWT identity tokens that do not automatically grant camera access.
- Camera-scoped capability tokens with `VIEW` permission and expiry.
- Nonce replay protection with `REPLAY_ATTACK_DETECTED` events.
- Temporary assignments created only after admin approval.
- Audit logs for login, request review, grant, revoke, expiry, and stream access.
- Security dashboard with auth, request, expiry, revocation, audit, and event metrics.

## Run Locally

Backend:

```bash
cd backend
uv run uvicorn app.main:app --reload
```

Frontend:

```bash
cd Frontend
npm install
npm run dev
```

Open the Vite URL and log in with one of the demo accounts.

## Tests

Backend:

```bash
cd backend
uv run pytest
```

Frontend:

```bash
cd Frontend
npm run build
npm test -- --run
```

## Documentation

- [Master Documentation](docs/MASTER_DOCUMENTATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API Design](docs/API.md)
- [Diagrams](docs/DIAGRAMS.md)
- [Threat Model](docs/THREAT_MODEL.md)
- [Project Status](STATUS.md)
