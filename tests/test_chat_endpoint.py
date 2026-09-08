"""Tests for the POST /api/chat endpoint (Phase 4/6 non-streaming chat)."""
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.config import AppConfig
from app.main import app
from app.models.preset import Preset
from app.services.chat_service import ChatReply
from app.services.preset_repository import PresetNotFoundError

client = TestClient(app)


def _fake_load_config(tmp_path: Path) -> AppConfig:
    return AppConfig(
        ollamaUrl="http://localhost:11434",
        credentials=None,
        presetFolder=str(tmp_path / "presets"),
        outputFolder=str(tmp_path / "output"),
    )


def _make_preset() -> Preset:
    return Preset(
        id="preset-1",
        name="Preset One",
        systemPrompt="You are a helpful assistant.",
        model="llama3",
        thinking=False,
    )


@pytest.fixture()
def isolated_chat_config(tmp_path: Path):
    """Point app.api.chat at a temp config instead of the real project's ./presets."""
    fake_config = _fake_load_config(tmp_path)
    with patch("app.api.chat.load_config", return_value=fake_config):
        yield tmp_path


class TestChatEndpoint:
    """Tests covering success, missing preset, and downstream LLM failure."""

    def test_valid_request_returns_generated_content(self, isolated_chat_config: Path):
        """A valid presetId + messages returns 200 with the mocked reply content."""
        with patch(
            "app.api.chat.PresetRepository.get", return_value=_make_preset()
        ), patch(
            "app.api.chat.generate_reply", new_callable=AsyncMock
        ) as mock_generate_reply:
            mock_generate_reply.return_value = ChatReply(content="Mocked assistant reply")

            response = client.post(
                "/api/chat",
                json={
                    "presetId": "preset-1",
                    "messages": [{"role": "user", "content": "Hello"}],
                },
            )

        assert response.status_code == 200
        assert response.json() == {"content": "Mocked assistant reply", "thinking": None}

    def test_valid_request_returns_thinking_when_present(self, isolated_chat_config: Path):
        """When generate_reply returns thinking text, it is surfaced in the response body."""
        with patch(
            "app.api.chat.PresetRepository.get", return_value=_make_preset()
        ), patch(
            "app.api.chat.generate_reply", new_callable=AsyncMock
        ) as mock_generate_reply:
            mock_generate_reply.return_value = ChatReply(content="42", thinking="Let me think...")

            response = client.post(
                "/api/chat",
                json={
                    "presetId": "preset-1",
                    "messages": [{"role": "user", "content": "6*7?"}],
                },
            )

        assert response.status_code == 200
        assert response.json() == {"content": "42", "thinking": "Let me think..."}

    def test_tuning_overrides_do_not_persist_to_preset_file(self, isolated_chat_config: Path):
        """systemPrompt/temperature/top_p/num_ctx overrides never trigger a preset write."""
        with patch(
            "app.api.chat.PresetRepository.get", return_value=_make_preset()
        ), patch(
            "app.api.chat.PresetRepository.update"
        ) as mock_update, patch(
            "app.api.chat.PresetRepository.create"
        ) as mock_create, patch(
            "app.api.chat.generate_reply", new_callable=AsyncMock
        ) as mock_generate_reply:
            mock_generate_reply.return_value = ChatReply(content="ok")

            response = client.post(
                "/api/chat",
                json={
                    "presetId": "preset-1",
                    "messages": [{"role": "user", "content": "Hello"}],
                    "systemPrompt": "You are a pirate. Unsaved edit.",
                    "temperature": 0.1,
                    "top_p": 0.5,
                    "num_ctx": 2048,
                },
            )

        assert response.status_code == 200
        mock_update.assert_not_called()
        mock_create.assert_not_called()
        effective_preset = mock_generate_reply.call_args.args[1]
        assert effective_preset.systemPrompt == "You are a pirate. Unsaved edit."
        assert effective_preset.temperature == 0.1
        assert effective_preset.top_p == 0.5
        assert effective_preset.num_ctx == 2048

    def test_unknown_preset_id_returns_404(self, isolated_chat_config: Path):
        """A presetId that does not exist returns 404, without calling generate_reply."""
        with patch(
            "app.api.chat.PresetRepository.get", side_effect=PresetNotFoundError("missing")
        ), patch(
            "app.api.chat.generate_reply", new_callable=AsyncMock
        ) as mock_generate_reply:
            response = client.post(
                "/api/chat",
                json={
                    "presetId": "missing",
                    "messages": [{"role": "user", "content": "Hello"}],
                },
            )

        assert response.status_code == 404
        mock_generate_reply.assert_not_called()

    def test_llm_failure_returns_502(self, isolated_chat_config: Path):
        """When generate_reply raises, the endpoint returns 502 with a descriptive message."""
        with patch(
            "app.api.chat.PresetRepository.get", return_value=_make_preset()
        ), patch(
            "app.api.chat.generate_reply", new_callable=AsyncMock
        ) as mock_generate_reply:
            mock_generate_reply.side_effect = RuntimeError("connection refused")

            response = client.post(
                "/api/chat",
                json={
                    "presetId": "preset-1",
                    "messages": [{"role": "user", "content": "Hello"}],
                },
            )

        assert response.status_code == 502
        assert "LLM request failed" in response.json()["detail"]

    def test_preset_with_empty_model_uses_first_available_model(
        self, isolated_chat_config: Path
    ):
        """A preset saved without a model falls back to the first model the
        Ollama instance offers instead of failing."""
        empty_model_preset = _make_preset().model_copy(update={"model": ""})
        with patch(
            "app.api.chat.PresetRepository.get", return_value=empty_model_preset
        ), patch(
            "app.api.chat.OllamaClient.list_models",
            new_callable=AsyncMock,
            return_value=["llama3", "mistral"],
        ), patch(
            "app.api.chat.generate_reply", new_callable=AsyncMock
        ) as mock_generate_reply:
            mock_generate_reply.return_value = ChatReply(content="Hi", thinking=None)
            response = client.post(
                "/api/chat",
                json={
                    "presetId": "preset-1",
                    "messages": [{"role": "user", "content": "Hello"}],
                },
            )

        assert response.status_code == 200
        assert mock_generate_reply.call_args.args[1].model == "llama3"

    def test_preset_with_empty_model_and_no_models_returns_400(
        self, isolated_chat_config: Path
    ):
        """Without any model available there is nothing to fall back to."""
        empty_model_preset = _make_preset().model_copy(update={"model": ""})
        with patch(
            "app.api.chat.PresetRepository.get", return_value=empty_model_preset
        ), patch(
            "app.api.chat.OllamaClient.list_models",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "app.api.chat.generate_reply", new_callable=AsyncMock
        ) as mock_generate_reply:
            response = client.post(
                "/api/chat",
                json={
                    "presetId": "preset-1",
                    "messages": [{"role": "user", "content": "Hello"}],
                },
            )

        assert response.status_code == 400
        assert "no model configured" in response.json()["detail"]
        mock_generate_reply.assert_not_called()


class TestApplyOverrides:
    """Tests for apply_overrides producing an in-memory effective preset."""

    def test_no_overrides_returns_preset_values_unchanged(self):
        """When no override fields are set, the returned preset keeps the original values."""
        from app.api.chat import ChatRequest, apply_overrides

        preset = _make_preset()
        preset = preset.model_copy(update={"temperature": 0.5, "top_p": 0.8, "num_ctx": 1024})
        request = ChatRequest(presetId="preset-1", messages=[])

        effective = apply_overrides(preset, request)

        assert effective.temperature == 0.5
        assert effective.top_p == 0.8
        assert effective.num_ctx == 1024

    def test_partial_overrides_only_replace_provided_fields(self):
        """Only the request fields that are set override the preset's stored values."""
        from app.api.chat import ChatRequest, apply_overrides

        preset = _make_preset()
        preset = preset.model_copy(update={"temperature": 0.5, "top_p": 0.8, "num_ctx": 1024})
        request = ChatRequest(presetId="preset-1", messages=[], temperature=0.9)

        effective = apply_overrides(preset, request)

        assert effective.temperature == 0.9
        assert effective.top_p == 0.8
        assert effective.num_ctx == 1024
        assert effective.id == preset.id

    def test_system_prompt_override_replaces_preset_system_prompt(self):
        """An unsaved systemPrompt from the request takes effect for this chat."""
        from app.api.chat import ChatRequest, apply_overrides

        preset = _make_preset()
        request = ChatRequest(
            presetId="preset-1", messages=[], systemPrompt="You are a pirate."
        )

        effective = apply_overrides(preset, request)

        assert effective.systemPrompt == "You are a pirate."

    def test_model_override_replaces_an_unavailable_preset_model(self):
        """The model currently selected in the UI wins without saving the preset."""
        from app.api.chat import ChatRequest, apply_overrides

        preset = _make_preset().model_copy(update={"model": "no-longer-installed"})
        request = ChatRequest(presetId="preset-1", messages=[], model="llama3")

        effective = apply_overrides(preset, request)

        assert effective.model == "llama3"

    def test_blank_system_prompt_override_is_ignored(self):
        """A blank/whitespace-only systemPrompt override does not blank out the preset."""
        from app.api.chat import ChatRequest, apply_overrides

        preset = _make_preset()
        request = ChatRequest(presetId="preset-1", messages=[], systemPrompt="   ")

        effective = apply_overrides(preset, request)

        assert effective.systemPrompt == preset.systemPrompt
