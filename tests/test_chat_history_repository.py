"""Tests for chat_history_repository (save/load/autosave/list, path-traversal
safety) — see README.md section 7."""
from pathlib import Path

import pytest

from app.models.chat_history import ChatHistory, ChatHistoryMessage
from app.services.chat_history_repository import (
    ChatHistoryNotFoundError,
    list_names,
    load,
    load_autosave,
    save,
    save_autosave,
    slugify_history_name,
)


def _sample_history() -> ChatHistory:
    return ChatHistory(
        presetId="p1",
        topic="My Topic",
        promptType="image",
        messages=[
            ChatHistoryMessage(role="user", content="Hello"),
            ChatHistoryMessage(role="assistant", content="Hi there", checked=False),
        ],
    )


class TestSlugifyHistoryName:
    def test_lowercases_and_replaces_invalid_chars(self):
        assert slugify_history_name("My Chat 1!") == "my-chat-1"

    def test_empty_or_fully_invalid_falls_back_to_untitled(self):
        assert slugify_history_name("   ") == "untitled"
        assert slugify_history_name("///") == "untitled"

    def test_leading_underscore_cannot_survive_whitelist(self):
        # This guarantees a user-chosen name can never collide with the
        # reserved "_autosave" filename.
        assert not slugify_history_name("_autosave").startswith("_")


class TestSaveLoadRoundTrip:
    def test_save_then_load_returns_same_history(self, tmp_path: Path):
        history = _sample_history()

        slug = save(str(tmp_path), "My Chat", history)
        loaded = load(str(tmp_path), "My Chat")

        assert slug == "my-chat"
        assert loaded == history

    def test_load_missing_name_raises_not_found(self, tmp_path: Path):
        with pytest.raises(ChatHistoryNotFoundError):
            load(str(tmp_path), "does-not-exist")

    def test_list_names_reflects_saved_entries(self, tmp_path: Path):
        save(str(tmp_path), "Chat One", _sample_history())
        save(str(tmp_path), "Chat Two", _sample_history())

        names = list_names(str(tmp_path))

        assert names == ["chat-one", "chat-two"]

    def test_list_names_excludes_autosave_file(self, tmp_path: Path):
        save(str(tmp_path), "Chat One", _sample_history())
        save_autosave(str(tmp_path), _sample_history())

        names = list_names(str(tmp_path))

        assert names == ["chat-one"]


class TestAutosave:
    def test_autosave_save_and_load_round_trip(self, tmp_path: Path):
        history = _sample_history()

        save_autosave(str(tmp_path), history)
        loaded = load_autosave(str(tmp_path))

        assert loaded == history

    def test_load_autosave_returns_none_when_not_present(self, tmp_path: Path):
        assert load_autosave(str(tmp_path)) is None

    def test_autosave_independent_of_named_saves(self, tmp_path: Path):
        named = _sample_history()
        autosaved = ChatHistory(topic="Autosaved", messages=[])

        save(str(tmp_path), "autosave", named)
        save_autosave(str(tmp_path), autosaved)

        assert load(str(tmp_path), "autosave") == named
        assert load_autosave(str(tmp_path)) == autosaved


class TestPathTraversalSafety:
    def test_save_and_load_with_malicious_name_stay_inside_output_folder(self, tmp_path: Path):
        output_folder = tmp_path / "output"
        output_folder.mkdir()
        malicious_name = "../../evil"

        slug = save(str(output_folder), malicious_name, _sample_history())

        chats_dir = (output_folder / "chats").resolve()
        written_path = chats_dir / f"{slug}.json"
        assert written_path.exists()
        assert written_path.resolve().is_relative_to(chats_dir)

        loaded = load(str(output_folder), malicious_name)
        assert loaded == _sample_history()

        # Nothing was written outside the output folder.
        escaped_path = tmp_path.parent.parent / "evil.json"
        assert not escaped_path.exists()
