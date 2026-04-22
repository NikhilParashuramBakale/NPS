from app.auth import hash_password, verify_password


def test_hash_password_uses_argon2id_prefix():
    password_hash = hash_password("strong-password")
    assert password_hash.startswith("$argon2id$")


def test_verify_password_accepts_valid_argon2_hash():
    password_hash = hash_password("secret")
    assert verify_password("secret", password_hash) is True


def test_verify_password_rejects_invalid_password():
    password_hash = hash_password("secret")
    assert verify_password("incorrect", password_hash) is False


def test_login_success_returns_token_and_user(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin_user", "password": "admin123", "role": "admin"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "access_token" in payload
    assert payload["user"]["username"] == "admin_user"
    assert payload["user"]["role"] == "admin"


def test_login_failure_wrong_password_returns_401(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin_user", "password": "wrong", "role": "admin"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_login_failure_wrong_role_returns_401(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin_user", "password": "admin123", "role": "viewer"},
    )

    assert response.status_code == 401
