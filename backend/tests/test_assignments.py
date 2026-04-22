def _login(client, username: str, password: str, role: str) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password, "role": role},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_admin_can_create_assignment(client):
    token = _login(client, "admin_user", "admin123", "admin")

    response = client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {token}"},
        json={"viewer_id": 2, "camera_ids": [1, 2], "duration_minutes": 10},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["viewer_id"] == 2
    assert payload["camera_ids"] == [1, 2]
    assert payload["expires_in"] > 0


def test_viewer_cannot_create_assignment(client):
    token = _login(client, "viewer_a", "viewer123", "viewer")

    response = client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {token}"},
        json={"viewer_id": 3, "camera_ids": [1], "duration_minutes": 10},
    )

    assert response.status_code == 403


def test_create_assignment_rejects_unknown_camera_id(client):
    token = _login(client, "admin_user", "admin123", "admin")

    response = client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {token}"},
        json={"viewer_id": 2, "camera_ids": [999], "duration_minutes": 10},
    )

    assert response.status_code == 400


def test_viewer_only_sees_own_assignments(client):
    admin_token = _login(client, "admin_user", "admin123", "admin")
    viewer_a_token = _login(client, "viewer_a", "viewer123", "viewer")
    viewer_b_token = _login(client, "viewer_b", "viewer123", "viewer")

    create_a = client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"viewer_id": 2, "camera_ids": [1], "duration_minutes": 10},
    )
    assert create_a.status_code == 200

    create_b = client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"viewer_id": 3, "camera_ids": [2], "duration_minutes": 10},
    )
    assert create_b.status_code == 200

    response_a = client.get("/api/v1/assignments", headers={"Authorization": f"Bearer {viewer_a_token}"})
    response_b = client.get("/api/v1/assignments", headers={"Authorization": f"Bearer {viewer_b_token}"})

    assert response_a.status_code == 200
    assert response_b.status_code == 200

    assignments_a = response_a.json()
    assignments_b = response_b.json()

    assert len(assignments_a) == 1
    assert len(assignments_b) == 1
    assert assignments_a[0]["viewer_name"] == "viewer_a"
    assert assignments_b[0]["viewer_name"] == "viewer_b"


def test_admin_can_revoke_assignment(client):
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
    assert revoke_response.json()["status"] == "revoked"
