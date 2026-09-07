"""Preset CRUD endpoints (see README.md section 4)."""
import re

from fastapi import APIRouter, HTTPException

from app.config import load_config
from app.models.preset import Preset, PresetIn
from app.services.preset_repository import (
    InvalidPresetIdError,
    PresetAlreadyExistsError,
    PresetNotFoundError,
    PresetRepository,
)

router = APIRouter()

_SLUG_INVALID = re.compile(r"[^a-zA-Z0-9_-]+")


def _repository() -> PresetRepository:
    config = load_config()
    return PresetRepository(config.presetFolder)


def _slugify(name: str) -> str:
    slug = _SLUG_INVALID.sub("-", name.strip()).strip("-").lower()
    return slug or "preset"


def _require_model(preset: PresetIn) -> None:
    # Enforced here (not as a Pydantic field constraint on Preset) so an
    # already-saved preset with an empty model still loads/lists normally;
    # only new saves are blocked until a real model is chosen.
    if not preset.model or not preset.model.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "Model must not be empty. Select a model before saving "
                "(the dropdown is empty if Ollama is unreachable)."
            ),
        )


@router.get("/api/presets", response_model=list[Preset])
def list_presets() -> list[Preset]:
    return _repository().list()


@router.post("/api/presets", response_model=Preset, status_code=201)
def create_preset(preset: PresetIn) -> Preset:
    _require_model(preset)
    repository = _repository()
    preset_id = _slugify(preset.name)
    try:
        return repository.create(preset_id, preset)
    except PresetAlreadyExistsError as exc:
        raise HTTPException(
            status_code=409, detail=f"Preset '{preset_id}' already exists"
        ) from exc


@router.get("/api/presets/{preset_id}", response_model=Preset)
def get_preset(preset_id: str) -> Preset:
    try:
        return _repository().get(preset_id)
    except InvalidPresetIdError as exc:
        raise HTTPException(status_code=400, detail="Invalid preset id") from exc
    except PresetNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Preset not found") from exc


@router.put("/api/presets/{preset_id}", response_model=Preset)
def update_preset(preset_id: str, preset: PresetIn) -> Preset:
    _require_model(preset)
    try:
        return _repository().update(preset_id, preset)
    except InvalidPresetIdError as exc:
        raise HTTPException(status_code=400, detail="Invalid preset id") from exc
    except PresetNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Preset not found") from exc


@router.delete("/api/presets/{preset_id}", status_code=204)
def delete_preset(preset_id: str) -> None:
    try:
        _repository().delete(preset_id)
    except InvalidPresetIdError as exc:
        raise HTTPException(status_code=400, detail="Invalid preset id") from exc
    except PresetNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Preset not found") from exc
