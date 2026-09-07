"""Preset schema (see README.md section 4)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class PresetIn(BaseModel):
    """Payload accepted when creating or updating a preset."""

    name: str
    systemPrompt: str
    model: str
    thinking: bool = False
    promptIdentifier: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    num_ctx: int | None = Field(default=None, gt=0)


class Preset(PresetIn):
    """A preset as stored/returned, including its stable id."""

    id: str
