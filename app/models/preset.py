"""Preset schema (see README.md section 4)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class PresetIn(BaseModel):
    """Payload accepted when creating or updating a preset."""

    name: str
    systemPrompt: str
    # May be empty: a preset can be saved before any model is picked/available.
    model: str = ""
    thinking: bool = False
    # When True, an instruction to wrap generated prompt suggestions in
    # <prompt> markup is appended to the system prompt (see build_system_prompt
    # in app/services/chat_service.py) so they can be extracted into the
    # Markdown prompt library. This used to be a free-text "promptIdentifier"
    # field, but only its truthiness was ever used, so it's a plain checkbox.
    injectPromptTemplate: bool = False
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    num_ctx: int | None = Field(default=None, gt=0)


class Preset(PresetIn):
    """A preset as stored/returned, including its stable id."""

    id: str
