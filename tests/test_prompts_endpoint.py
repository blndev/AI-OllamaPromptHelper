"""Tests for the /api/prompts/extract and /api/prompts/library endpoints."""
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
    """Point app.api.prompts at a temp output folder instead of the real project's ./output."""
    fake_config = _fake_load_config(tmp_path)
    with patch("app.api.prompts.load_config", return_value=fake_config):
        yield tmp_path


class TestExtractEndpoint:
    def test_extract_with_matching_markup_returns_entries_and_writes_file(
        self, isolated_output_folder: Path
    ):
        text = '<prompt type="image" description="A castle">A castle on a hill</prompt>'

        response = client.post("/api/prompts/extract", json={"topic": "My Topic", "text": text})

        assert response.status_code == 200
        data = response.json()
        assert len(data["extracted"]) == 1
        assert data["extracted"][0]["type"] == "image"
        assert data["extracted"][0]["description"] == "A castle"
        assert data["extracted"][0]["prompt"] == "A castle on a hill"

        library_file = isolated_output_folder / "output" / "my-topic.md"
        assert library_file.exists()

    def test_extract_with_plain_text_returns_empty_list_and_no_file(
        self, isolated_output_folder: Path
    ):
        response = client.post(
            "/api/prompts/extract", json={"topic": "No Prompts Here", "text": "Just a chat reply."}
        )

        assert response.status_code == 200
        assert response.json()["extracted"] == []

        library_file = isolated_output_folder / "output" / "no-prompts-here.md"
        assert not library_file.exists()


class TestLibraryEndpoint:
    def test_library_returns_entries_after_prior_extract(self, isolated_output_folder: Path):
        text = '<prompt type="video" description="Battle scene">Two armies clash</prompt>'
        client.post("/api/prompts/extract", json={"topic": "Wars", "text": text})

        response = client.get("/api/prompts/library", params={"topic": "Wars"})

        assert response.status_code == 200
        entries = response.json()["entries"]
        assert len(entries) == 1
        assert entries[0]["type"] == "video"
        assert entries[0]["description"] == "Battle scene"
        assert entries[0]["prompt"] == "Two armies clash"

    def test_library_returns_empty_list_for_unknown_topic(self, isolated_output_folder: Path):
        response = client.get("/api/prompts/library", params={"topic": "Never Extracted"})

        assert response.status_code == 200
        assert response.json()["entries"] == []
