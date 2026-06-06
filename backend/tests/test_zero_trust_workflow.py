from datetime import UTC, datetime, timedelta

from sqlalchemy import select


def _login(client, username: str, password: str, role: str) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password, "role": role},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_resident_request_approval_creates_temporary_assignment(client):
    resident_token = _login(client, "resident_b", "resident123", "resident")
    admin_token = _login(client, "admin_user", "admin123", "admin")

    create_response = client.post(
        "/api/v1/requests",
        headers={"Authorization": f"Bearer {resident_token}"},
        json={"camera_id": 1, "reason": "My bicycle was stolen from the parking area."},
    )
    assert create_response.status_code == 200
    request_id = create_response.json()["id"]

    approve_response = client.post(
        f"/api/v1/requests/{request_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"duration_hours": 24},
    )
    assert approve_response.status_code == 200
    payload = approve_response.json()
    assert payload["user_id"] == 5
    assert payload["camera_id"] == 1
    assert payload["status"] == "active"
    assert payload["expires_in"] > 23 * 60 * 60


def test_capability_token_is_required_and_replay_protected(client):
    resident_token = _login(client, "resident_a", "resident123", "resident")

    issue_response = client.post(
        "/api/v1/capabilities",
        headers={"Authorization": f"Bearer {resident_token}"},
        json={"camera_id": 1, "permissions": ["VIEW"]},
    )
    assert issue_response.status_code == 200
    capability_token = issue_response.json()["capability_token"]

    nonce = "faculty-demo-nonce-001"
    first_validation = client.post(
        "/api/v1/capabilities/validate",
        headers={"Authorization": f"Bearer {resident_token}"},
        json={"camera_id": 1, "capability_token": capability_token, "nonce": nonce},
    )
    assert first_validation.status_code == 200
    assert first_validation.json()["status"] == "ok"

    replay = client.post(
        "/api/v1/capabilities/validate",
        headers={"Authorization": f"Bearer {resident_token}"},
        json={"camera_id": 1, "capability_token": capability_token, "nonce": nonce},
    )
    assert replay.status_code == 409

    admin_token = _login(client, "admin_user", "admin123", "admin")
    events = client.get("/api/v1/security-events", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert any(event["event_type"] == "REPLAY_ATTACK_DETECTED" for event in events)


def test_expired_assignment_generates_audit_and_security_event(client):
    admin_token = _login(client, "admin_user", "admin123", "admin")

    from app.database import SessionLocal
    from app.models import Assignment

    with SessionLocal() as db:
        assignment = db.scalar(select(Assignment).where(Assignment.status == "active"))
        assert assignment is not None
        assignment.expires_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=1)
        db.add(assignment)
        db.commit()

    dashboard = client.get("/api/v1/security-dashboard", headers={"Authorization": f"Bearer {admin_token}"})
    assert dashboard.status_code == 200
    payload = dashboard.json()
    assert payload["expired_assignments"] >= 1
    assert any(event["event_type"] == "ACCESS_EXPIRED" for event in payload["recent_security_events"])
