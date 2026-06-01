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

        conn.execute(text("UPDATE cameras SET is_active = 1 WHERE is_active IS NULL"))
        conn.execute(text("UPDATE cameras SET share_requested = 0 WHERE share_requested IS NULL"))
        conn.execute(text("UPDATE cameras SET share_approved = 1 WHERE share_approved IS NULL"))
        conn.commit()
