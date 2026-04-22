def _login(client, username: str, password: str, role: str) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password, "role": role},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_failed_login_creates_login_failure_event(client):
    failed = client.post(
        "/api/v1/auth/login",
        json={"username": "admin_user", "password": "wrong", "role": "admin"},
    )
    assert failed.status_code == 401

    token = _login(client, "admin_user", "admin123", "admin")
    events_response = client.get("/api/v1/security/events", headers={"Authorization": f"Bearer {token}"})

    assert events_response.status_code == 200
    events = events_response.json()
    assert any(event["event_type"] == "login_failure" for event in events)


def test_assignment_create_and_revoke_are_logged(client):
    token = _login(client, "admin_user", "admin123", "admin")

    create_response = client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {token}"},
        json={"viewer_id": 2, "camera_ids": [1], "duration_minutes": 10},
    )
    assert create_response.status_code == 200
    assignment_id = create_response.json()["id"]

    revoke_response = client.delete(
        f"/api/v1/assignments/{assignment_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert revoke_response.status_code == 200

    events_response = client.get("/api/v1/security/events", headers={"Authorization": f"Bearer {token}"})
    assert events_response.status_code == 200
    events = events_response.json()

    event_types = [event["event_type"] for event in events]
    assert "assignment_created" in event_types
    assert "assignment_revoked" in event_types


def test_viewer_sees_only_relevant_events(client):
    admin_token = _login(client, "admin_user", "admin123", "admin")
    viewer_a_token = _login(client, "viewer_a", "viewer123", "viewer")

    create_response = client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"viewer_id": 2, "camera_ids": [1], "duration_minutes": 10},
    )
    assert create_response.status_code == 200

    admin_events = client.get("/api/v1/security/events", headers={"Authorization": f"Bearer {admin_token}"})
    viewer_events = client.get("/api/v1/security/events", headers={"Authorization": f"Bearer {viewer_a_token}"})

    assert admin_events.status_code == 200
    assert viewer_events.status_code == 200

    admin_event_types = {event["event_type"] for event in admin_events.json()}
    viewer_event_types = {event["event_type"] for event in viewer_events.json()}

    assert "assignment_created" in admin_event_types
    assert "assignment_created" in viewer_event_types
