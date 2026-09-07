"""Thin async wrapper around the Ollama HTTP API."""
from __future__ import annotations

import httpx


class OllamaClient:
    def __init__(self, base_url: str, credentials: str | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.credentials = credentials

    def _headers(self) -> dict[str, str]:
        if self.credentials:
            return {"Authorization": f"Bearer {self.credentials}"}
        return {}

    async def list_models(self) -> list[str]:
        async with httpx.AsyncClient(
            base_url=self.base_url, headers=self._headers(), timeout=5.0
        ) as client:
            response = await client.get("/api/tags")
            response.raise_for_status()
            data = response.json()
            return [model["name"] for model in data.get("models", [])]
