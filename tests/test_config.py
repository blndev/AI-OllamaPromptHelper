"""Tests for app.config.load_config()."""
import json
from pathlib import Path

import pytest

from app.config import ConfigError, load_config


class TestLoadConfig:
    """Tests for load_config parsing and error handling."""

    def test_load_config_parses_valid_file(self, tmp_path: Path):
        """A valid config.json is parsed into an AppConfig with correct values."""
        config_path = tmp_path / "config.json"
        config_path.write_text(
            json.dumps(
                {
                    "ollamaUrl": "http://localhost:11434",
                    "credentials": "secret",
                    "presetFolder": str(tmp_path / "presets"),
                    "outputFolder": str(tmp_path / "output"),
                    "appTitle": "Prompt Studio",
                    "version": "2.4.1",
                }
            ),
            encoding="utf-8",
        )

        config = load_config(config_path)

        assert config.ollamaUrl == "http://localhost:11434"
        assert config.credentials == "secret"
        assert config.presetFolder == str(tmp_path / "presets")
        assert config.outputFolder == str(tmp_path / "output")
        assert config.appTitle == "Prompt Studio"
        assert config.version == "2.4.1"
        assert Path(config.presetFolder).is_dir()
        assert Path(config.outputFolder).is_dir()

    def test_load_config_missing_file_raises_config_error(self, tmp_path: Path):
        """A missing config file raises ConfigError."""
        missing_path = tmp_path / "does_not_exist.json"

        with pytest.raises(ConfigError):
            load_config(missing_path)

    def test_load_config_malformed_json_raises_config_error(self, tmp_path: Path):
        """Malformed JSON content raises ConfigError."""
        config_path = tmp_path / "config.json"
        config_path.write_text("{not valid json", encoding="utf-8")

        with pytest.raises(ConfigError):
            load_config(config_path)

    def test_load_config_missing_required_field_raises_config_error(self, tmp_path: Path):
        """Missing required field triggers pydantic validation failure wrapped in ConfigError."""
        config_path = tmp_path / "config.json"
        config_path.write_text(
            json.dumps(
                {
                    "credentials": None,
                    "presetFolder": str(tmp_path / "presets"),
                    "outputFolder": str(tmp_path / "output"),
                }
            ),
            encoding="utf-8",
        )

        with pytest.raises(ConfigError):
            load_config(config_path)


class TestLoadConfigLocalOverride:
    """Tests for the config.local.json dev-only override (see .gitignore)."""

    def test_local_override_replaces_only_the_fields_it_sets(self, tmp_path: Path):
        """config.local.json overrides individual fields, others come from config.json."""
        config_path = tmp_path / "config.json"
        config_path.write_text(
            json.dumps(
                {
                    "ollamaUrl": "http://localhost:11434",
                    "credentials": None,
                    "presetFolder": str(tmp_path / "presets"),
                    "outputFolder": str(tmp_path / "output"),
                    "debugMode": False,
                }
            ),
            encoding="utf-8",
        )
        (tmp_path / "config.local.json").write_text(
            json.dumps({"ollamaUrl": "http://my-dev-box:11434", "debugMode": True}),
            encoding="utf-8",
        )

        config = load_config(config_path)

        assert config.ollamaUrl == "http://my-dev-box:11434"
        assert config.debugMode is True

    def test_env_ollama_url_overrides_config(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """OLLAMA_URL env var overrides ollamaUrl from config.json."""
        config_path = tmp_path / "config.json"
        config_path.write_text(
            json.dumps(
                {
                    "ollamaUrl": "http://localhost:11434",
                    "credentials": None,
                    "presetFolder": str(tmp_path / "presets"),
                    "outputFolder": str(tmp_path / "output"),
                }
            ),
            encoding="utf-8",
        )
        monkeypatch.setenv("OLLAMA_URL", "http://host.docker.internal:11434")

        config = load_config(config_path)

        assert config.ollamaUrl == "http://host.docker.internal:11434"

        assert config.presetFolder == str(tmp_path / "presets")

    def test_missing_local_override_is_not_an_error(self, tmp_path: Path):
        """Without a config.local.json file, config.json alone is used as before."""
        config_path = tmp_path / "config.json"
        config_path.write_text(
            json.dumps(
                {
                    "ollamaUrl": "http://localhost:11434",
                    "credentials": None,
                    "presetFolder": str(tmp_path / "presets"),
                    "outputFolder": str(tmp_path / "output"),
                }
            ),
            encoding="utf-8",
        )

        config = load_config(config_path)

        assert config.ollamaUrl == "http://localhost:11434"

    def test_malformed_local_override_raises_config_error(self, tmp_path: Path):
        """A broken config.local.json fails loudly instead of being silently ignored."""
        config_path = tmp_path / "config.json"
        config_path.write_text(
            json.dumps(
                {
                    "ollamaUrl": "http://localhost:11434",
                    "credentials": None,
                    "presetFolder": str(tmp_path / "presets"),
                    "outputFolder": str(tmp_path / "output"),
                }
            ),
            encoding="utf-8",
        )
        (tmp_path / "config.local.json").write_text("{not valid json", encoding="utf-8")

        with pytest.raises(ConfigError):
            load_config(config_path)
