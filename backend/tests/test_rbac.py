def _login(client, username: str, password: str, role: str) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password, "role": role},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_resident_only_sees_assigned_and_owned_cameras(client):
    resident_token = _login(client, "resident_b", "resident123", "resident")
    response = client.get("/api/v1/cameras", headers={"Authorization": f"Bearer {resident_token}"})
    assert response.status_code == 200
    assert response.json() == []


def test_guard_cannot_access_unassigned_camera_frame(client):
    guard_token = _login(client, "guard_a", "guard123", "security_guard")
    response = client.get(
        "/api/v1/cameras/1/frame",
        headers={"Authorization": f"Bearer {guard_token}"},
    )
    assert response.status_code == 403


def test_resident_with_assignment_can_issue_capability(client):
    resident_token = _login(client, "resident_a", "resident123", "resident")
    response = client.post(
        "/api/v1/capabilities",
        headers={"Authorization": f"Bearer {resident_token}"},
        json={"camera_id": 1, "permissions": ["VIEW"]},
    )
    assert response.status_code == 200
    assert "capability_token" in response.json()


def test_revoked_assignment_blocks_capability_issue(client):
    admin_token = _login(client, "admin_user", "admin123", "admin")
    resident_token = _login(client, "resident_a", "resident123", "resident")

    assignments = client.get("/api/v1/assignments", headers={"Authorization": f"Bearer {admin_token}"})
    assignment_id = assignments.json()[0]["id"]

    revoke = client.delete(
        f"/api/v1/assignments/{assignment_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert revoke.status_code == 200

    issue = client.post(
        "/api/v1/capabilities",
        headers={"Authorization": f"Bearer {resident_token}"},
        json={"camera_id": 1, "permissions": ["VIEW"]},
    )
    assert issue.status_code == 403


def test_unauthorized_camera_access_returns_403(client):
    guard_token = _login(client, "guard_a", "guard123", "security_guard")
    response = client.get(
        "/api/v1/cameras/1/frame",
        headers={"Authorization": f"Bearer {guard_token}"},
    )
    assert response.status_code == 403


def test_unauthorized_camera_access_logging_is_throttled(client):
    guard_token = _login(client, "guard_a", "guard123", "security_guard")
    admin_token = _login(client, "admin_user", "admin123", "admin")

    for _ in range(6):
        response = client.get(
            "/api/v1/cameras/1/frame",
            headers={"Authorization": f"Bearer {guard_token}"},
        )
        assert response.status_code == 403

    events = client.get("/api/v1/security/events", headers={"Authorization": f"Bearer {admin_token}"}).json()
    unauthorized = [
        event
        for event in events
        if event["event_type"] == "UNAUTHORIZED_CAMERA_ACCESS"
        and (event.get("details") or {}).get("camera_id") == 1
        and event.get("actor_username") == "guard_a"
    ]
    assert len(unauthorized) == 1


def test_replay_attack_detection_is_not_throttled(client):
    resident_token = _login(client, "resident_a", "resident123", "resident")
    admin_token = _login(client, "admin_user", "admin123", "admin")

    issue = client.post(
        "/api/v1/capabilities",
        headers={"Authorization": f"Bearer {resident_token}"},
        json={"camera_id": 1, "permissions": ["VIEW"]},
    )
    capability_token = issue.json()["capability_token"]
    nonce = "throttle-test-nonce-001"

    first = client.post(
        "/api/v1/capabilities/validate",
        headers={"Authorization": f"Bearer {resident_token}"},
        json={"camera_id": 1, "capability_token": capability_token, "nonce": nonce},
    )
    assert first.status_code == 200

    for _ in range(3):
        replay = client.post(
            "/api/v1/capabilities/validate",
            headers={"Authorization": f"Bearer {resident_token}"},
            json={"camera_id": 1, "capability_token": capability_token, "nonce": nonce},
        )
        assert replay.status_code == 409

    events = client.get("/api/v1/security/events", headers={"Authorization": f"Bearer {admin_token}"}).json()
    replay_events = [event for event in events if event["event_type"] == "REPLAY_ATTACK_DETECTED"]
    assert len(replay_events) >= 3
