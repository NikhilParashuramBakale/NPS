# Threat Model

## Assets

- Resident identity and PAKE password verifier.
- Camera streams and recent frames.
- Temporary access assignments.
- Capability tokens.
- Audit logs and security events.

## Actors

- Society Administrator: privileged reviewer and revoker.
- Resident: requester with temporary camera access only after approval.
- Security Guard: assigned camera viewer for operational incidents.
- Attacker: stolen token user, replay attacker, unauthorized resident, or compromised client.

## Threats And Mitigations

| Threat | Mitigation |
| --- | --- |
| Password interception | PAKE flow avoids sending plaintext password to the backend. |
| Permanent over-authorization | Assignments expire and are excluded after expiry. |
| JWT leakage | JWT alone does not authorize camera access. |
| Capability token leakage | Capability is scoped to one user, camera, assignment, permission, and expiry. |
| Replay attack | Nonce store rejects reused nonces and logs `REPLAY_ATTACK_DETECTED`. |
| Unauthorized camera attempt | Capability issuance and validation check active assignment and camera scope. |
| Silent admin action | Request approval, rejection, grant, revoke, expiry, and login events are audited. |
| Missed expiry | Expiry pruning runs on startup, assignment listing, dashboard reads, and capability issuance. |

## Security Events

- `LOGIN_SUCCESS`
- `LOGIN_FAILURE`
- `REQUEST_CREATED`
- `REQUEST_APPROVED`
- `REQUEST_REJECTED`
- `ACCESS_GRANTED`
- `ACCESS_REVOKED`
- `ACCESS_EXPIRED`
- `CAMERA_VIEW_STARTED`
- `REPLAY_ATTACK_DETECTED`
- `UNAUTHORIZED_CAMERA_ACCESS`
- `SECURITY_ALERT`

## Residual Risks

- Demo mode uses SQLite by default. Production deployment should use PostgreSQL with backups.
- Stream transport security depends on deployment TLS termination.
- PAKE bridge remains a prototype dependency and should be reviewed before production use.
- Capability validation is demonstrated through the API and frontend camera-open flow; stream transport can be further hardened by requiring capability query parameters on every stream request.
