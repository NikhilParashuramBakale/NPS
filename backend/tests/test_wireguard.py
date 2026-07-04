"""Integration tests for WireGuard tunnel management."""

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import Base, SessionLocal, engine
from app.models import User, UserRole, Camera, CameraSourceType, CameraStatus
from app.auth import hash_password
from app.pake_bridge import generate_salt, compute_verifier


@pytest.fixture(autouse=True)
def _setup_db():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        # Ensure admin user exists
        existing = db.query(User).filter(User.username == "admin_test").first()
        if not existing:
            salt = generate_salt()
            verifier = compute_verifier("admin123", salt, "admin_test")
            admin = User(
                username="admin_test",
                password_hash=hash_password("admin123"),
                role=UserRole.admin,
                pake_salt=salt,
                pake_verifier=verifier,
            )
            db.add(admin)
            db.commit()

        # Ensure a test camera exists
        existing_cam = db.query(Camera).filter(Camera.name == "WG Test Cam").first()
        if not existing_cam:
            cam = Camera(
                name="WG Test Cam",
                status=CameraStatus.online,
                source_type=CameraSourceType.ip_mjpeg,
                source_url="http://192.168.1.100:8080/video",
                is_active=True,
            )
            db.add(cam)
            db.commit()
    yield
    # Cleanup wireguard_tunnels table after tests
    with SessionLocal() as db:
        db.execute(Camera.__table__.delete().where(Camera.name == "WG Test Cam"))
        db.execute(User.__table__.delete().where(User.username == "admin_test"))
        db.commit()


@pytest.fixture
def admin_token():
    """Get a valid JWT token for the admin test user."""
    from app.auth import create_access_token
    with SessionLocal() as db:
        user = db.query(User).filter(User.username == "admin_test").first()
        if user:
            return create_access_token(subject=str(user.id), role=user.role.value)
    return None


@pytest.fixture
def camera_id():
    """Get the test camera ID."""
    with SessionLocal() as db:
        cam = db.query(Camera).filter(Camera.name == "WG Test Cam").first()
        return cam.id if cam else 1


@pytest.mark.asyncio
async def test_create_tunnel(admin_token, camera_id):
    """Test creating a WireGuard tunnel for a camera."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/admin/cameras/{camera_id}/tunnel",
            json={
                "peer_public_key": "test-peer-public-key-12345",
                "peer_endpoint": "192.168.1.100:51820",
                "allowed_ips": "10.0.0.2/32",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == status.HTTP_200_OK, response.text
        data = response.json()
        assert data["camera_id"] == camera_id
        assert data["status"] == "created"
        assert data["interface_name"].startswith("wg-cam")
        assert data["listen_port"] > 0
        assert data["peer_public_key"] == "test-peer-public-key-12345"
        assert data["peer_endpoint"] == "192.168.1.100:51820"


@pytest.mark.asyncio
async def test_create_duplicate_tunnel(admin_token, camera_id):
    """Test that creating a duplicate tunnel returns 409."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create first tunnel
        await client.post(
            f"/api/v1/admin/cameras/{camera_id}/tunnel",
            json={
                "peer_public_key": "dup-peer-key",
                "peer_endpoint": "10.0.0.5:51820",
                "allowed_ips": "10.0.0.2/32",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        # Try creating duplicate
        response = await client.post(
            f"/api/v1/admin/cameras/{camera_id}/tunnel",
            json={
                "peer_public_key": "dup-peer-key-2",
                "peer_endpoint": "10.0.0.6:51820",
                "allowed_ips": "10.0.0.2/32",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == status.HTTP_409_CONFLICT


@pytest.mark.asyncio
async def test_get_tunnel_status(admin_token, camera_id):
    """Test getting tunnel status."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create tunnel first
        await client.post(
            f"/api/v1/admin/cameras/{camera_id}/tunnel",
            json={
                "peer_public_key": "status-test-key",
                "peer_endpoint": "10.0.0.7:51820",
                "allowed_ips": "10.0.0.2/32",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        # Get status
        response = await client.get(
            f"/api/v1/admin/cameras/{camera_id}/tunnel/status",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == status.HTTP_200_OK, response.text
        data = response.json()
        assert data["camera_id"] == camera_id
        assert data["is_active"] is True
        assert data["interface_name"].startswith("wg-cam")


@pytest.mark.asyncio
async def test_get_tunnel_status_not_found(admin_token):
    """Test getting status for non-existent tunnel returns 404."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/admin/cameras/9999/tunnel/status",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_destroy_tunnel(admin_token, camera_id):
    """Test destroying a WireGuard tunnel."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create tunnel first
        await client.post(
            f"/api/v1/admin/cameras/{camera_id}/tunnel",
            json={
                "peer_public_key": "destroy-test-key",
                "peer_endpoint": "10.0.0.8:51820",
                "allowed_ips": "10.0.0.2/32",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        # Destroy it
        response = await client.delete(
            f"/api/v1/admin/cameras/{camera_id}/tunnel",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == status.HTTP_200_OK, response.text
        data = response.json()
        assert data["status"] == "destroyed"


@pytest.mark.asyncio
async def test_destroy_tunnel_not_found(admin_token):
    """Test destroying non-existent tunnel returns 404."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete(
            "/api/v1/admin/cameras/9999/tunnel",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_list_tunnels(admin_token, camera_id):
    """Test listing all tunnels."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create a tunnel
        await client.post(
            f"/api/v1/admin/cameras/{camera_id}/tunnel",
            json={
                "peer_public_key": "list-test-key",
                "peer_endpoint": "10.0.0.9:51820",
                "allowed_ips": "10.0.0.2/32",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        # List all
        response = await client.get(
            "/api/v1/admin/tunnels",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == status.HTTP_200_OK, response.text
        data = response.json()
        assert "tunnels" in data
        assert len(data["tunnels"]) >= 1
        found = any(t["camera_id"] == camera_id for t in data["tunnels"])
        assert found, "Created tunnel should appear in list"


@pytest.mark.asyncio
async def test_unauthorized_access(admin_token, camera_id):
    """Test that non-admin users cannot manage tunnels."""
    # Create a non-admin token
    from app.auth import create_access_token
    with SessionLocal() as db:
        salt = generate_salt()
        verifier = compute_verifier("viewer123", salt, "viewer_test")
        viewer = User(
            username="viewer_test",
            password_hash=hash_password("viewer123"),
            role=UserRole.viewer,
            pake_salt=salt,
            pake_verifier=verifier,
        )
        db.add(viewer)
        db.commit()
        viewer_token = create_access_token(subject=str(viewer.id), role=viewer.role.value)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/admin/cameras/{camera_id}/tunnel",
            json={
                "peer_public_key": "unauth-key",
                "peer_endpoint": "10.0.0.10:51820",
                "allowed_ips": "10.0.0.2/32",
            },
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    # Cleanup viewer
    with SessionLocal() as db:
        db.execute(User.__table__.delete().where(User.username == "viewer_test"))
        db.commit()