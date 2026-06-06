from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_user_pake_columns() -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as conn:
        try:
            rows = conn.execute(text("PRAGMA table_info(users)")).mappings().all()
        except Exception:  # noqa: BLE001
            return

        columns = {row["name"] for row in rows}
        if "pake_salt" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN pake_salt VARCHAR(255)"))
        if "pake_verifier" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN pake_verifier VARCHAR(512)"))
        conn.commit()


def ensure_camera_source_columns() -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as conn:
        try:
            rows = conn.execute(text("PRAGMA table_info(cameras)")).mappings().all()
        except Exception:  # noqa: BLE001
            return

        columns = {row["name"] for row in rows}
        if "source_type" not in columns:
            conn.execute(text("ALTER TABLE cameras ADD COLUMN source_type VARCHAR(32)"))
        if "source_url" not in columns:
            conn.execute(text("ALTER TABLE cameras ADD COLUMN source_url VARCHAR(512)"))
        if "owner_id" not in columns:
            conn.execute(text("ALTER TABLE cameras ADD COLUMN owner_id INTEGER"))
        if "is_active" not in columns:
            conn.execute(text("ALTER TABLE cameras ADD COLUMN is_active BOOLEAN"))
        if "share_requested" not in columns:
            conn.execute(text("ALTER TABLE cameras ADD COLUMN share_requested BOOLEAN"))
        if "share_approved" not in columns:
            conn.execute(text("ALTER TABLE cameras ADD COLUMN share_approved BOOLEAN"))
        if "location" not in columns:
            conn.execute(text("ALTER TABLE cameras ADD COLUMN location VARCHAR(160)"))
        if "created_at" not in columns:
            conn.execute(text("ALTER TABLE cameras ADD COLUMN created_at DATETIME"))

        conn.execute(text("UPDATE cameras SET is_active = 1 WHERE is_active IS NULL"))
        conn.execute(text("UPDATE cameras SET share_requested = 0 WHERE share_requested IS NULL"))
        conn.execute(text("UPDATE cameras SET share_approved = 1 WHERE share_approved IS NULL"))
        conn.execute(text("UPDATE cameras SET location = 'Unspecified' WHERE location IS NULL"))
        conn.commit()


def ensure_security_project_columns() -> None:
    if engine.dialect.name != "sqlite":
        return

    def columns_for(conn, table_name: str) -> set[str]:
        try:
            rows = conn.execute(text(f"PRAGMA table_info({table_name})")).mappings().all()
        except Exception:  # noqa: BLE001
            return set()
        return {row["name"] for row in rows}

    with engine.connect() as conn:
        user_columns = columns_for(conn, "users")
        if user_columns and "created_at" not in user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN created_at DATETIME"))

        assignment_columns = columns_for(conn, "assignments")
        if assignment_columns:
            if "user_id" not in assignment_columns:
                conn.execute(text("ALTER TABLE assignments ADD COLUMN user_id INTEGER"))
            if "camera_id" not in assignment_columns:
                conn.execute(text("ALTER TABLE assignments ADD COLUMN camera_id INTEGER"))
            if "granted_by" not in assignment_columns:
                conn.execute(text("ALTER TABLE assignments ADD COLUMN granted_by INTEGER"))
            if "access_request_id" not in assignment_columns:
                conn.execute(text("ALTER TABLE assignments ADD COLUMN access_request_id INTEGER"))
            if "status" not in assignment_columns:
                conn.execute(text("ALTER TABLE assignments ADD COLUMN status VARCHAR(32)"))
            if "revoked_at" not in assignment_columns:
                conn.execute(text("ALTER TABLE assignments ADD COLUMN revoked_at DATETIME"))
            if "created_at" not in assignment_columns:
                conn.execute(text("ALTER TABLE assignments ADD COLUMN created_at DATETIME"))
            conn.execute(text("UPDATE assignments SET user_id = viewer_id WHERE user_id IS NULL"))
            conn.execute(text("UPDATE assignments SET status = 'active' WHERE status IS NULL"))

        event_columns = columns_for(conn, "security_events")
        if event_columns:
            if "severity" not in event_columns:
                conn.execute(text("ALTER TABLE security_events ADD COLUMN severity VARCHAR(24)"))
            if "category" not in event_columns:
                conn.execute(text("ALTER TABLE security_events ADD COLUMN category VARCHAR(64)"))
            if "description" not in event_columns:
                conn.execute(text("ALTER TABLE security_events ADD COLUMN description TEXT"))
            conn.execute(text("UPDATE security_events SET severity = 'low' WHERE severity IS NULL"))
            conn.execute(text("UPDATE security_events SET category = 'general' WHERE category IS NULL"))
            conn.execute(text("UPDATE security_events SET description = event_type WHERE description IS NULL"))

        conn.commit()
