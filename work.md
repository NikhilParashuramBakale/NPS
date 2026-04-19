---
noteId: "f94dc8903be511f1adf6ebef35e971fb"
tags: []

---

After that, PAKE or other work?
Do PAKE next, but also implement these non-PAKE security items (required for strong demo):

Password hashing upgrade on backend to Argon2id or scrypt (current is demo-safe but not final-grade).
Time-bound access tokens for camera stream sessions.
Backend-enforced assignment checks on every protected endpoint.
Audit log events: login success/failure, assignment create/revoke, expiry.
HTTPS/TLS + CORS hardening for production mode.
WebRTC signaling auth (JWT-required signaling channel).
PAKE placement

Keep current JWT flow as baseline.
Replace password verify step in auth.py with PAKE handshake endpoints.
On success, issue same JWT and keep rest of system unchanged.
This minimizes rewrites and keeps architecture clean.
Short answer

Yes, PAKE should be implemented.
But first complete frontend-backend integration.
Also add the above security controls; PAKE alone is not enough for your project demo.