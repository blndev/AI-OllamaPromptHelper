"""Tests for the /api/presets CRUD endpoints."""
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
def isolated_preset_folder(tmp_path: Path):
    """Point app.api.presets at a temp preset folder instead of the real project's ./presets."""
    fake_config = _fake_load_config(tmp_path)
    with patch("app.api.presets.load_config", return_value=fake_config):
        yield tmp_path


class TestPresetsCrudEndpoints:
    """Full CRUD lifecycle against an isolated preset folder."""

    def test_full_crud_lifecycle(self, isolated_preset_folder: Path):
        """POST -> GET -> PUT -> GET(list) -> DELETE all behave with the expected status codes."""
        payload = {
            "name": "My Test Preset",
            "systemPrompt": "You are helpful.",
            "model": "llama3",
            "thinking": False,
        }

        create_response = client.post("/api/presets", json=payload)
        assert create_response.status_code == 201
        created = create_response.json()
        preset_id = created["id"]
        assert preset_id == "my-test-preset"

        get_response = client.get(f"/api/presets/{preset_id}")
        assert get_response.status_code == 200
        assert get_response.json()["name"] == "My Test Preset"

        update_payload = dict(payload, name="My Test Preset", systemPrompt="Updated prompt.")
        put_response = client.put(f"/api/presets/{preset_id}", json=update_payload)
        assert put_response.status_code == 200
        assert put_response.json()["systemPrompt"] == "Updated prompt."

        list_response = client.get("/api/presets")
        assert list_response.status_code == 200
        assert any(p["id"] == preset_id for p in list_response.json())

        delete_response = client.delete(f"/api/presets/{preset_id}")
        assert delete_response.status_code == 204

        get_after_delete = client.get(f"/api/presets/{preset_id}")
        assert get_after_delete.status_code == 404

    def test_create_with_duplicate_slug_returns_409(self, isolated_preset_folder: Path):
        """POST with a name that slugifies to an existing id returns 409."""
        payload = {
            "name": "Duplicate Name",
            "systemPrompt": "You are helpful.",
            "model": "llama3",
        }

        first = client.post("/api/presets", json=payload)
        assert first.status_code == 201

        second = client.post("/api/presets", json=payload)
        assert second.status_code == 409

    def test_get_with_slash_encoded_id_is_safe(self, isolated_preset_folder: Path):
        """A path-traversal-style id in the URL never returns 500 or escapes the folder."""
        response = client.get("/api/presets/..%2f..%2fsecret")

        assert response.status_code in (400, 404)

    def test_get_with_dotdot_id_is_safe(self, isolated_preset_folder: Path):
        """A literal '..' id is rejected safely, never causing a 500 or filesystem escape."""
        response = client.get("/api/presets/..")

        assert response.status_code in (400, 404)

    def test_list_ignores_malformed_preset_file_on_disk(self, isolated_preset_folder: Path):
        """A malformed preset JSON file on disk does not crash the list endpoint."""
        payload = {
            "name": "Good Preset",
            "systemPrompt": "You are helpful.",
            "model": "llama3",
        }
        create_response = client.post("/api/presets", json=payload)
        assert create_response.status_code == 201

        (isolated_preset_folder / "presets" / "broken.json").write_text(
            "{not valid json", encoding="utf-8"
        )

        list_response = client.get("/api/presets")

        assert list_response.status_code == 200
        assert any(p["name"] == "Good Preset" for p in list_response.json())

    def test_create_with_empty_model_returns_400(self, isolated_preset_folder: Path):
        """Saving a preset with no model selected is rejected with a clear message."""
        payload = {
            "name": "No Model Preset",
            "systemPrompt": "You are helpful.",
            "model": "",
        }

        response = client.post("/api/presets", json=payload)

        assert response.status_code == 400
        assert "model" in response.json()["detail"].lower()

    def test_update_with_empty_model_returns_400(self, isolated_preset_folder: Path):
        """Updating a preset to have no model is rejected, existing file untouched."""
        payload = {
            "name": "Has Model",
            "systemPrompt": "You are helpful.",
            "model": "llama3",
        }
        created = client.post("/api/presets", json=payload)
        preset_id = created.json()["id"]

        response = client.put(
            f"/api/presets/{preset_id}",
            json={**payload, "model": "   "},
        )

        assert response.status_code == 400
        assert client.get(f"/api/presets/{preset_id}").json()["model"] == "llama3"

    def test_list_still_returns_preexisting_preset_with_empty_model(
        self, isolated_preset_folder: Path
    ):
        """An already-saved preset with an empty model still loads (not silently
        hidden), even though new saves with an empty model are now rejected."""
        presets_dir = isolated_preset_folder / "presets"
        presets_dir.mkdir(parents=True, exist_ok=True)
        (presets_dir / "legacy.json").write_text(
            '{"name": "Legacy", "systemPrompt": "hi", "model": "", '
            '"thinking": false, "promptIdentifier": null, "temperature": null, '
            '"top_p": null, "num_ctx": null}',
            encoding="utf-8",
        )

        list_response = client.get("/api/presets")

        assert list_response.status_code == 200
        assert any(p["id"] == "legacy" for p in list_response.json())

