import os
import tempfile
from pathlib import Path

# Point the app at throwaway storage before it is imported.
_folder = Path(tempfile.mkdtemp(prefix="ui-pg-tests-"))
os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{(_folder / 'test.db').as_posix()}",
        "PROCESSED_DIR": str(_folder / "processed"),  # empty, so no documents are imported on startup
        "EMBEDDING_MODEL": "BAAI/bge-small-en-v1.5",
        "ADMIN_EMAIL": "boss@example.com",
        "ADMIN_PASSWORD": "a-long-test-password",
        "SECRET_KEY": "test-secret",
        "GROQ_API_KEY": "unused",
    }
)

import pytest
from fastapi.testclient import TestClient

from app.api.main import app
from app.services import ratelimit, settings


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def clean_state():
    ratelimit._hits.clear()
    yield
    settings.save({"rate_limit_count": 20, "min_relevance": 0.35, "log_questions": True, "student_model_choice": False})


@pytest.fixture
def admin(client):
    response = client.post("/api/admin/login", json={"email": "boss@example.com", "password": "a-long-test-password"})
    assert response.status_code == 200
    yield client
    client.post("/api/admin/logout")
