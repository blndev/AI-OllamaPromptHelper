"""JSON-file backed storage for chat histories: named save/load and a single
reserved autosave slot, both under ``<outputFolder>/chats/`` (see
README.md section 7).

Filenames are derived from user-supplied names through `slugify_history_name`,
which only ever keeps `[a-z0-9-]` characters (mirroring
`markdown_exporter.slugify_topic`). This makes path traversal impossible
regardless of input, and additionally guarantees that a user-supplied name can
never produce the reserved autosave filename `_autosave`, because the leading
underscore is stripped by the same whitelist before it ever reaches the
filesystem.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from app.models.chat_history import ChatHistory

_SLUG_INVALID_RE = re.compile(r"[^a-z0-9]+")
_MAX_SLUG_LENGTH = 80

# Reserved filename (without extension) for the autosave slot. A leading "_"
# can never be produced by slugify_history_name (it strips everything but
# a-z0-9-), so this can never collide with a user-chosen save name.
_AUTOSAVE_NAME = "_autosave"


class ChatHistoryNotFoundError(LookupError):
    """Raised when a named chat history does not exist."""


def slugify_history_name(name: str) -> str:
    """Build a filesystem-safe slug for a chat history name.

    Defensive by construction: only lowercase letters and digits are ever kept,
    everything else (including "..", "/", "\\") becomes a single "-"
    separator, so path traversal is impossible even for adversarial input.
    Falls back to "untitled" if the result would otherwise be empty.
    """
    lowered = name.strip().lower()
    slug = _SLUG_INVALID_RE.sub("-", lowered).strip("-")
    slug = slug[:_MAX_SLUG_LENGTH].strip("-")
    return slug or "untitled"


def _chats_dir(output_folder: str) -> Path:
    chats_dir = Path(output_folder) / "chats"
    chats_dir.mkdir(parents=True, exist_ok=True)
    return chats_dir


def _history_path(output_folder: str, slug: str) -> Path:
    """Resolve the JSON file path for slug, guaranteed to stay inside the
    chats directory (defense in depth on top of slugify_history_name)."""
    base = _chats_dir(output_folder).resolve()
    candidate = (base / f"{slug}.json").resolve()
    if candidate != base and base not in candidate.parents:
        raise ValueError(f"Resolved path {candidate} escapes chats folder {base}")
    return candidate


def save(output_folder: str, name: str, history: ChatHistory) -> str:
    """Save history under a slug derived from name. Returns the slug used."""
    slug = slugify_history_name(name)
    path = _history_path(output_folder, slug)
    path.write_text(history.model_dump_json(indent=2), encoding="utf-8")
    return slug


def load(output_folder: str, name: str) -> ChatHistory:
    """Load a previously saved chat history by name."""
    slug = slugify_history_name(name)
    path = _history_path(output_folder, slug)
    if not path.exists():
        raise ChatHistoryNotFoundError(name)
    data = json.loads(path.read_text(encoding="utf-8"))
    return ChatHistory(**data)


def list_names(output_folder: str) -> list[str]:
    """List the slugs of all named (non-autosave) saved chat histories."""
    chats_dir = _chats_dir(output_folder)
    return sorted(
        file.stem for file in chats_dir.glob("*.json") if file.stem != _AUTOSAVE_NAME
    )


def save_autosave(output_folder: str, history: ChatHistory) -> None:
    """Persist history to the reserved autosave slot."""
    path = _history_path(output_folder, _AUTOSAVE_NAME)
    path.write_text(history.model_dump_json(indent=2), encoding="utf-8")


def load_autosave(output_folder: str) -> ChatHistory | None:
    """Load the autosaved chat history, or None if none has been saved yet."""
    path = _history_path(output_folder, _AUTOSAVE_NAME)
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return ChatHistory(**data)
