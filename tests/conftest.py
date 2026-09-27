"""Isolated SQLite test engine; production uses PostgreSQL + Redis/Celery."""

import os
import tempfile
from pathlib import Path

import pytest

os.environ["AGENTLAB_ENV"] = "test"
os.environ["AGENTLAB_AUTH_MODE"] = "disabled"
os.environ["AGENTLAB_QUEUE_MODE"] = "local-thread"
os.environ["AGENTLAB_DEMO_SEED"] = "false"
os.environ["AGENTLAB_DATABASE_URL"] = "sqlite:///" + str(
    Path(tempfile.gettempdir()) / f"agentlab-pytest-{os.getpid()}.db"
)

import agentlab.models  # noqa: E402,F401
from agentlab.db import Base, engine  # noqa: E402
from agentlab_api.main import app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as http:
        yield http
