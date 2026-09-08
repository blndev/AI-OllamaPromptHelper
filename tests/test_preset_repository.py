"""Tests for app.services.preset_repository.PresetRepository."""
import json
from pathlib import Path

import pytest

from app.models.preset import PresetIn
from app.services.preset_repository import (
    InvalidPresetIdError,
    PresetAlreadyExistsError,
    PresetNotFoundError,
    PresetRepository,
)

TRAVERSAL_IDS = [
    "../../etc/passwd",
    "..%2f..%2fsecret",
    "a/b",
    "a\\b",
    "..",
    "",
]


def _make_preset(name: str = "My Preset") -> PresetIn:
    return PresetIn(name=name, systemPrompt="You are helpful.", model="llama3")


def test_existing_preset_without_thinking_keeps_thinking_disabled() -> None:
    """Older stored presets without a thinking field preserve the old behavior."""
    preset = PresetIn.model_validate({"name": "My Preset", "systemPrompt": "You are helpful."})

    assert preset.thinking is False


class TestPresetRepositoryCrud:
    """Tests for create/get/list/update/delete round-trips."""

    def test_create_then_get_round_trip(self, tmp_path: Path):
        """A created preset can be read back with identical fields."""
        repo = PresetRepository(str(tmp_path))
        preset_in = _make_preset()

        created = repo.create("my-preset", preset_in)
        fetched = repo.get("my-preset")

        assert created.id == "my-preset"
        assert fetched == created
        assert fetched.name == "My Preset"
        assert fetched.systemPrompt == "You are helpful."
        assert fetched.model == "llama3"

    def test_list_returns_created_presets(self, tmp_path: Path):
        """list() returns all presets that were created in the folder."""
        repo = PresetRepository(str(tmp_path))
        repo.create("preset-a", _make_preset("Preset A"))
        repo.create("preset-b", _make_preset("Preset B"))

        presets = repo.list()

        assert {p.id for p in presets} == {"preset-a", "preset-b"}

    def test_list_skips_malformed_json_file_and_returns_valid_presets(self, tmp_path: Path):
        """A malformed JSON preset file is skipped, not crashing list() for the others."""
        repo = PresetRepository(str(tmp_path))
        repo.create("preset-a", _make_preset("Preset A"))
        (tmp_path / "broken.json").write_text("{not valid json", encoding="utf-8")

        presets = repo.list()

        assert {p.id for p in presets} == {"preset-a"}

    def test_list_skips_preset_file_failing_schema_validation(self, tmp_path: Path):
        """A preset file missing required fields is skipped, not crashing list() for the others."""
        repo = PresetRepository(str(tmp_path))
        repo.create("preset-a", _make_preset("Preset A"))
        (tmp_path / "invalid-schema.json").write_text(
            json.dumps({"name": "Missing fields"}), encoding="utf-8"
        )

        presets = repo.list()

        assert {p.id for p in presets} == {"preset-a"}


    def test_update_overwrites_content(self, tmp_path: Path):
        """update() replaces the stored content for an existing preset id."""
        repo = PresetRepository(str(tmp_path))
        repo.create("my-preset", _make_preset("Original"))

        updated = repo.update("my-preset", _make_preset("Updated"))
        fetched = repo.get("my-preset")

        assert updated.name == "Updated"
        assert fetched.name == "Updated"

    def test_delete_removes_the_file(self, tmp_path: Path):
        """delete() removes the preset's JSON file so it can no longer be fetched."""
        repo = PresetRepository(str(tmp_path))
        repo.create("my-preset", _make_preset())

        repo.delete("my-preset")

        assert not (tmp_path / "my-preset.json").exists()
        with pytest.raises(PresetNotFoundError):
            repo.get("my-preset")

    def test_create_duplicate_id_raises_already_exists(self, tmp_path: Path):
        """create() raises PresetAlreadyExistsError when the id is already taken."""
        repo = PresetRepository(str(tmp_path))
        repo.create("my-preset", _make_preset())

        with pytest.raises(PresetAlreadyExistsError):
            repo.create("my-preset", _make_preset("Other"))


class TestPresetRepositoryNotFound:
    """Tests for PresetNotFoundError on missing ids."""

    def test_get_missing_id_raises_not_found(self, tmp_path: Path):
        """get() raises PresetNotFoundError for a valid but non-existent id."""
        repo = PresetRepository(str(tmp_path))

        with pytest.raises(PresetNotFoundError):
            repo.get("does-not-exist")

    def test_update_missing_id_raises_not_found(self, tmp_path: Path):
        """update() raises PresetNotFoundError for a valid but non-existent id."""
        repo = PresetRepository(str(tmp_path))

        with pytest.raises(PresetNotFoundError):
            repo.update("does-not-exist", _make_preset())

    def test_delete_missing_id_raises_not_found(self, tmp_path: Path):
        """delete() raises PresetNotFoundError for a valid but non-existent id."""
        repo = PresetRepository(str(tmp_path))

        with pytest.raises(PresetNotFoundError):
            repo.delete("does-not-exist")


class TestPresetRepositoryPathTraversal:
    """Security tests: path-traversal-style ids must never touch the filesystem."""

    @pytest.mark.parametrize("bad_id", TRAVERSAL_IDS)
    def test_get_rejects_path_traversal_id(self, tmp_path: Path, bad_id: str):
        """get() raises InvalidPresetIdError and never reads outside the folder."""
        repo = PresetRepository(str(tmp_path))

        with pytest.raises(InvalidPresetIdError):
            repo.get(bad_id)

    @pytest.mark.parametrize("bad_id", TRAVERSAL_IDS)
    def test_create_rejects_path_traversal_id(self, tmp_path: Path, bad_id: str):
        """create() raises InvalidPresetIdError and never writes outside the folder."""
        repo = PresetRepository(str(tmp_path))

        with pytest.raises(InvalidPresetIdError):
            repo.create(bad_id, _make_preset())

        # Nothing should have been written anywhere, in or outside the folder.
        assert list(tmp_path.rglob("*.json")) == []

    @pytest.mark.parametrize("bad_id", TRAVERSAL_IDS)
    def test_update_rejects_path_traversal_id(self, tmp_path: Path, bad_id: str):
        """update() raises InvalidPresetIdError and never writes outside the folder."""
        repo = PresetRepository(str(tmp_path))

        with pytest.raises(InvalidPresetIdError):
            repo.update(bad_id, _make_preset())

        assert list(tmp_path.rglob("*.json")) == []

    @pytest.mark.parametrize("bad_id", TRAVERSAL_IDS)
    def test_delete_rejects_path_traversal_id(self, tmp_path: Path, bad_id: str):
        """delete() raises InvalidPresetIdError and never deletes outside the folder."""
        repo = PresetRepository(str(tmp_path))

        with pytest.raises(InvalidPresetIdError):
            repo.delete(bad_id)

    def test_traversal_id_cannot_escape_folder_on_disk(self, tmp_path: Path):
        """A crafted id must not resolve to a path outside the repository folder."""
        outside_file = tmp_path.parent / "escaped-secret.json"
        folder = tmp_path / "presets"
        repo = PresetRepository(str(folder))

        with pytest.raises(InvalidPresetIdError):
            repo.create("../escaped-secret", _make_preset())

        assert not outside_file.exists()
