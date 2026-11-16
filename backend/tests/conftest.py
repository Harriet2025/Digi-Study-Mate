"""Tests run against a throwaway SQLite database and a temp media folder; no MySQL or API keys needed."""

import os
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="study_mate_test_"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["MEDIA_DIR"] = str(_TMP / "media")
os.environ["GROQ_API_KEY"] = "test-groq-key"
os.environ["ELEVENLABS_API_KEY"] = "test-elevenlabs-key"


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.db import Base, get_engine
    from app.main import app

    Base.metadata.create_all(get_engine())
    with TestClient(app) as c:
        r = c.post("/api/auth/signup", json={"name": "Test Student", "email": "student@example.com", "password": "correct horse"})
        assert r.status_code == 201, r.text
        yield c


@pytest.fixture
def make_client(client):
    """A separate browser (own cookie jar) signed in as a new user."""
    from uuid import uuid4

    from fastapi.testclient import TestClient

    from app.main import app

    def make(name: str = "Other Student") -> TestClient:
        c = TestClient(app)
        r = c.post("/api/auth/signup", json={"name": name, "email": f"{uuid4().hex[:10]}@example.com", "password": "password123"})
        assert r.status_code == 201, r.text
        return c

    return make


FIXTURES = Path(__file__).parent / "fixtures"
