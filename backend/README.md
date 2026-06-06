# Backend

FastAPI backend for the Zero-Trust Smart Surveillance Access System.

## Run

```bash
uv run uvicorn app.main:app --reload
```

## Test

```bash
uv run pytest
```

The default demo database is SQLite. Set `DATABASE_URL` to a PostgreSQL SQLAlchemy URL for production-style deployment.
