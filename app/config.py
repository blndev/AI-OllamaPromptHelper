"""Application configuration loading (see README.md section 3)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel


class AppConfig(BaseModel):
    ollamaUrl: str
    credentials: str | None = None
    presetFolder: str
    outputFolder: str


class ConfigError(RuntimeError):
    """Raised when the configuration file is missing or invalid."""


DEFAULT_CONFIG_PATH = Path("config.json")


@lru_cache
def load_config(path: Path = DEFAULT_CONFIG_PATH) -> AppConfig:
    if not path.exists():
        raise ConfigError(f"Configuration file not found: {path.resolve()}")

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ConfigError(
            f"Configuration file is not valid JSON: {path.resolve()} ({exc})"
        ) from exc

    try:
        config = AppConfig(**raw)
    except Exception as exc:  # pydantic ValidationError
        raise ConfigError(f"Configuration file is invalid: {exc}") from exc

    Path(config.presetFolder).mkdir(parents=True, exist_ok=True)
    Path(config.outputFolder).mkdir(parents=True, exist_ok=True)

    return config
