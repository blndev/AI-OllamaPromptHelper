"""Application configuration loading (see README.md section 3)."""
from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel


class AppConfig(BaseModel):
    ollamaUrl: str
    credentials: str | None = None
    presetFolder: str
    outputFolder: str
    # When True, the backend emits the raw request payload sent to Ollama as
    # an SSE "debug" event and the frontend shows a "Request sent to Ollama"
    # panel. Off by default so system prompts/messages are never exposed
    # over the wire unless explicitly enabled.
    debugMode: bool = False


class ConfigError(RuntimeError):
    """Raised when the configuration file is missing or invalid."""


DEFAULT_CONFIG_PATH = Path("config.json")


def _local_override_path(path: Path) -> Path:
    """e.g. config.json -> config.local.json (dev-only, git-ignored override)."""
    return path.with_name(f"{path.stem}.local{path.suffix}")


def load_config(path: Path = DEFAULT_CONFIG_PATH) -> AppConfig:
    # Intentionally not cached: config.json / config.local.json are re-read on
    # every call, so editing config.local.json takes effect on the very next
    # request without restarting the server.
    if not path.exists():
        raise ConfigError(f"Configuration file not found: {path.resolve()}")

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ConfigError(
            f"Configuration file is not valid JSON: {path.resolve()} ({exc})"
        ) from exc

    local_path = _local_override_path(path)
    if local_path.exists():
        try:
            local_raw = json.loads(local_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ConfigError(
                f"Local config override is not valid JSON: {local_path.resolve()} ({exc})"
            ) from exc
        raw = {**raw, **local_raw}

    try:
        config = AppConfig(**raw)
    except Exception as exc:  # pydantic ValidationError
        raise ConfigError(f"Configuration file is invalid: {exc}") from exc

    Path(config.presetFolder).mkdir(parents=True, exist_ok=True)
    Path(config.outputFolder).mkdir(parents=True, exist_ok=True)

    return config
