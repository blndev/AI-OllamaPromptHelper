"""Tests for the /api/chat-history/* endpoints (save/load/list/autosave)."""
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.config import AppConfig
from app.main import app

client = TestClient(app)


def _fake_load_config(tmp_path: Path) -> AppConfig:
    return AppConfig(
        ollamaUrl="http://localhost:11434",
        credentials=None,
        presetFolder=str(tmp_path / "presets"),
        outputFolder=str(tmp_path / "output"),
    )


@pytest.fixture()
def isolated_output_folder(tmp_path: Path):
    """Point app.api.chat_history at a temp output folder instead of the real project's ./output."""
    fake_config = _fake_load_config(tmp_path)
    with patch("app.api.chat_history.load_config", return_value=fake_config):
        yield tmp_path


def _sample_history_payload() -> dict:
    return {
        "presetId": "p1",
        "topic": "My Topic",
        "messages": [
            {"role": "user", "content": "Hello", "image": None, "checked": True},
            {"role": "assistant", "content": "Hi there", "image": None, "checked": False},
        ],
    }


class TestSaveLoadEndpoints:
    def test_save_then_load_round_trip(self, isolated_output_folder: Path):
        save_response = client.post(
            "/api/chat-history/save",
            json={"name": "My Chat", "history": _sample_history_payload()},
        )

        assert save_response.status_code == 200
        assert save_response.json() == {"name": "my-chat"}

        load_response = client.get("/api/chat-history/load", params={"name": "My Chat"})

        assert load_response.status_code == 200
        assert load_response.json() == _sample_history_payload()

    def test_list_reflects_saved_entry(self, isolated_output_folder: Path):
        client.post(
            "/api/chat-history/save",
            json={"name": "Another Chat", "history": _sample_history_payload()},
        )

        response = client.get("/api/chat-history/list")

        assert response.status_code == 200
        assert "another-chat" in response.json()["names"]

    def test_load_unknown_name_returns_404(self, isolated_output_folder: Path):
        response = client.get("/api/chat-history/load", params={"name": "unknown-chat"})

        assert response.status_code == 404


class TestAutosaveEndpoints:
    def test_autosave_save_then_load_round_trip(self, isolated_output_folder: Path):
        save_response = client.post("/api/chat-history/autosave", json=_sample_history_payload())

        assert save_response.status_code == 200
        assert save_response.json() == {"status": "ok"}

        load_response = client.get("/api/chat-history/autosave")

        assert load_response.status_code == 200
        assert load_response.json() == {"history": _sample_history_payload()}

    def test_autosave_load_returns_null_history_when_nothing_saved_yet(self, tmp_path: Path):
        fake_config = _fake_load_config(tmp_path)
        with patch("app.api.chat_history.load_config", return_value=fake_config):
            response = client.get("/api/chat-history/autosave")

        assert response.status_code == 200
        assert response.json() == {"history": None}
