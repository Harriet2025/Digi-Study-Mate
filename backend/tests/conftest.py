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
        yield c


FIXTURES = Path(__file__).parent / "fixtures"
