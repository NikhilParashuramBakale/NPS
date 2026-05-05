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
