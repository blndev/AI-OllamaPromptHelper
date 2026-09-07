"""JSON-file backed CRUD storage for presets (see README.md section 4)."""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from pydantic import ValidationError

from app.models.preset import Preset, PresetIn

logger = logging.getLogger(__name__)

_SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


class InvalidPresetIdError(ValueError):
    """Raised when a preset id contains characters that are not safe for filenames."""


class PresetNotFoundError(LookupError):
    """Raised when a preset id does not exist."""


class PresetAlreadyExistsError(ValueError):
    """Raised when trying to create a preset id that already exists."""


class PresetRepository:
    def __init__(self, folder: str) -> None:
        self.folder = Path(folder)
        self.folder.mkdir(parents=True, exist_ok=True)

    def _path(self, preset_id: str) -> Path:
        # Reject anything that isn't a plain, safe filename component to
        # prevent path traversal via a crafted preset id (OWASP A01/A03).
        if not _SAFE_ID_RE.match(preset_id):
            raise InvalidPresetIdError(preset_id)
        return self.folder / f"{preset_id}.json"

    def list(self) -> list[Preset]:
        presets = []
        for file in sorted(self.folder.glob("*.json")):
            try:
                data = json.loads(file.read_text(encoding="utf-8"))
                presets.append(Preset(id=file.stem, **data))
            except (json.JSONDecodeError, ValidationError) as exc:
                # Skip an unreadable preset file rather than failing the whole
                # listing for every other, valid preset.
                logger.warning("Skipping unreadable preset file %s: %s", file, exc)
        return presets

    def get(self, preset_id: str) -> Preset:
        path = self._path(preset_id)
        if not path.exists():
            raise PresetNotFoundError(preset_id)
        data = json.loads(path.read_text(encoding="utf-8"))
        return Preset(id=preset_id, **data)

    def create(self, preset_id: str, preset: PresetIn) -> Preset:
        path = self._path(preset_id)
        if path.exists():
            raise PresetAlreadyExistsError(preset_id)
        path.write_text(preset.model_dump_json(indent=2), encoding="utf-8")
        return Preset(id=preset_id, **preset.model_dump())

    def update(self, preset_id: str, preset: PresetIn) -> Preset:
        path = self._path(preset_id)
        if not path.exists():
            raise PresetNotFoundError(preset_id)
        path.write_text(preset.model_dump_json(indent=2), encoding="utf-8")
        return Preset(id=preset_id, **preset.model_dump())

    def delete(self, preset_id: str) -> None:
        path = self._path(preset_id)
        if not path.exists():
            raise PresetNotFoundError(preset_id)
        path.unlink()
