import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path):
    db_file = tmp_path / "nps_test.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{db_file.as_posix()}"
    os.environ["JWT_SECRET"] = "test-secret"

    for module_name in list(sys.modules):
        if module_name == "app" or module_name.startswith("app."):
            del sys.modules[module_name]

    from app.main import app  # noqa: PLC0415

    with TestClient(app) as test_client:
        yield test_client
