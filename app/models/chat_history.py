"""Chat history schema for save/load/autosave (see README.md section 7)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class ChatHistoryMessage(BaseModel):
    """A single chat message as persisted in a saved/autosaved chat history."""

    role: Literal["user", "assistant"]
    content: str
    images: list[str] | None = None
    checked: bool = True


class ChatHistory(BaseModel):
    """The full state of a chat session that can be saved, loaded, or autosaved."""

    presetId: str | None = None
    topic: str = ""
    messages: list[ChatHistoryMessage] = []
