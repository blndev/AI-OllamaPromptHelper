"""Tests for the GET /api/models endpoint."""
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestModelsEndpoint:
    """Tests for /api/models response contract."""

    def test_list_models_returns_200_with_models(self):
        """GET /api/models returns the models reported by OllamaClient."""
        with patch(
            "app.api.models.OllamaClient.list_models",
            new=AsyncMock(return_value=["llama3", "llava:13b"]),
        ):
            response = client.get("/api/models")

        assert response.status_code == 200
        assert response.json() == {"models": ["llama3", "llava:13b"]}

    def test_list_models_returns_502_when_ollama_unreachable(self):
        """GET /api/models returns HTTP 502 with a clear message if Ollama is down."""
        with patch(
            "app.api.models.OllamaClient.list_models",
            new=AsyncMock(side_effect=httpx.ConnectError("connection refused")),
        ):
            response = client.get("/api/models")

        assert response.status_code == 502
        body = response.json()
        assert "detail" in body
        assert "http://localhost:11434" in body["detail"]
