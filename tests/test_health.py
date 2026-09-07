"""Tests for the GET /api/health endpoint."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestHealthEndpoint:
    """Tests for /api/health response contract."""

    def test_health_returns_ok_status(self):
        """GET /api/health responds with HTTP 200 and status ok."""
        response = client.get("/api/health")

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"

    def test_health_does_not_leak_raw_credentials(self):
        """Response body must not expose the raw credentials value."""
        response = client.get("/api/health")

        body = response.json()
        assert "credentials" not in body
        assert "credentialsConfigured" in body
        assert isinstance(body["credentialsConfigured"], bool)
