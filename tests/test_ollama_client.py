"""Tests for OllamaClient, using httpx.MockTransport (no real network)."""
import asyncio

import httpx

from app.services import ollama_client as ollama_client_module
from app.services.ollama_client import OllamaClient


def _patch_async_client_transport(monkeypatch, transport: httpx.MockTransport) -> None:
    """Force OllamaClient's internal httpx.AsyncClient to use a mock transport."""
    real_async_client = httpx.AsyncClient

    def _factory(*args, **kwargs):
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(ollama_client_module.httpx, "AsyncClient", _factory)


class TestOllamaClientListModels:
    """Tests for OllamaClient.list_models()."""

    def test_list_models_returns_model_names(self, monkeypatch):
        """list_models() extracts the 'name' field from each model entry."""

        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.path == "/api/tags"
            return httpx.Response(
                200,
                json={"models": [{"name": "llama3"}, {"name": "llava:13b"}]},
            )

        _patch_async_client_transport(monkeypatch, httpx.MockTransport(handler))
        client = OllamaClient("http://ollama.local:11434")

        models = asyncio.run(client.list_models())

        assert models == ["llama3", "llava:13b"]

    def test_list_models_sets_authorization_header_when_credentials_set(self, monkeypatch):
        """When credentials are configured, an Authorization Bearer header is sent."""
        captured_headers: dict[str, str] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured_headers.update(request.headers)
            return httpx.Response(200, json={"models": []})

        _patch_async_client_transport(monkeypatch, httpx.MockTransport(handler))
        client = OllamaClient("http://ollama.local:11434", credentials="secret-token")

        asyncio.run(client.list_models())

        assert captured_headers.get("authorization") == "Bearer secret-token"

    def test_list_models_omits_authorization_header_when_no_credentials(self, monkeypatch):
        """When no credentials are configured, no Authorization header is sent."""
        captured_headers: dict[str, str] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured_headers.update(request.headers)
            return httpx.Response(200, json={"models": []})

        _patch_async_client_transport(monkeypatch, httpx.MockTransport(handler))
        client = OllamaClient("http://ollama.local:11434")

        asyncio.run(client.list_models())

        assert "authorization" not in captured_headers
