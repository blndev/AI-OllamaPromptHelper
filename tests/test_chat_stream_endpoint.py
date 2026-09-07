"""Tests for the POST /api/chat/stream endpoint (Phase 5 SSE streaming chat)."""
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.config import AppConfig
from app.main import app
from app.models.preset import Preset
from app.services.preset_repository import PresetNotFoundError

client = TestClient(app)


def _fake_load_config(tmp_path: Path, debug_mode: bool = False) -> AppConfig:
    return AppConfig(
        ollamaUrl="http://localhost:11434",
        credentials=None,
        presetFolder=str(tmp_path / "presets"),
        outputFolder=str(tmp_path / "output"),
        debugMode=debug_mode,
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


def _make_fake_model(chunks, error: Exception | None = None):
    """Build a fake chat model whose astream yields the given chunks, then optionally raises.

    Each chunk may be a plain string (content-only) or a (content, thinking) tuple.
    """

    async def fake_astream(_messages):
        for chunk in chunks:
            if isinstance(chunk, tuple):
                content, thinking = chunk
            else:
                content, thinking = chunk, None
            additional_kwargs = {"reasoning_content": thinking} if thinking else {}
            yield SimpleNamespace(content=content, additional_kwargs=additional_kwargs)
        if error is not None:
            raise error

    model = SimpleNamespace()
    model.astream = fake_astream
    model._convert_messages_to_ollama_messages = lambda messages: [
        {"role": "system" if m.type == "system" else "user", "content": m.content}
        for m in messages
    ]
    return model


class TestChatStreamEndpoint:
    """Tests covering success, missing preset, and mid-stream LLM failure."""

    def test_valid_request_streams_deltas_then_done(self, isolated_chat_config: Path):
        """A valid presetId + messages streams delta chunks and ends with an event: done line."""
        fake_model = _make_fake_model(["Hello", " world"])
        with patch(
            "app.api.chat.PresetRepository.get", return_value=_make_preset()
        ), patch(
            "app.api.chat.build_chat_model", return_value=fake_model
        ):
            response = client.post(
                "/api/chat/stream",
                json={
                    "presetId": "preset-1",
                    "messages": [{"role": "user", "content": "Hi"}],
                },
            )

        assert response.status_code == 200
        body = response.text
        assert 'data: {"delta": "Hello"}' in body
        assert 'data: {"delta": " world"}' in body
        assert body.rstrip().endswith("event: done\ndata: {}")

    def test_stream_emits_debug_event_with_exact_ollama_payload(self, isolated_chat_config: Path):
        """With debugMode enabled, an event: debug line contains the exact
        role/content payload sent to Ollama, so it's visible without a debugger."""
        fake_model = _make_fake_model(["Hi there"])
        with patch(
            "app.api.chat.load_config",
            return_value=_fake_load_config(isolated_chat_config, debug_mode=True),
        ), patch(
            "app.api.chat.PresetRepository.get", return_value=_make_preset()
        ), patch(
            "app.api.chat.build_chat_model", return_value=fake_model
        ):
            response = client.post(
                "/api/chat/stream",
                json={
                    "presetId": "preset-1",
                    "messages": [{"role": "user", "content": "Hi"}],
                },
            )

        assert response.status_code == 200
        body = response.text
        debug_index = body.index("event: debug")
        delta_index = body.index('data: {"delta"')
        assert debug_index < delta_index
        assert '"model": "llama3"' in body
        assert '"role": "system"' in body
        assert '"content": "You are a helpful assistant."' in body

    def test_stream_omits_debug_event_by_default(self, isolated_chat_config: Path):
        """Without debugMode enabled, no event: debug line is emitted at all."""
        fake_model = _make_fake_model(["Hi there"])
        with patch(
            "app.api.chat.PresetRepository.get", return_value=_make_preset()
        ), patch(
            "app.api.chat.build_chat_model", return_value=fake_model
        ):
            response = client.post(
                "/api/chat/stream",
                json={
                    "presetId": "preset-1",
                    "messages": [{"role": "user", "content": "Hi"}],
                },
            )

        assert response.status_code == 200
        assert "event: debug" not in response.text

    def test_unknown_preset_id_returns_404_without_streaming(self, isolated_chat_config: Path):
        """A presetId that does not exist returns a normal JSON 404, not an SSE stream."""
        with patch(
            "app.api.chat.PresetRepository.get", side_effect=PresetNotFoundError("missing")
        ):
            response = client.post(
                "/api/chat/stream",
                json={
                    "presetId": "missing",
                    "messages": [{"role": "user", "content": "Hi"}],
                },
            )

        assert response.status_code == 404
        assert response.json()["detail"] == "Preset not found"
        assert "text/event-stream" not in response.headers.get("content-type", "")

    def test_llm_failure_mid_stream_yields_error_event(self, isolated_chat_config: Path):
        """When astream raises partway through, the response contains an event: error line."""
        fake_model = _make_fake_model(["Hello"], error=RuntimeError("connection refused"))
        with patch(
            "app.api.chat.PresetRepository.get", return_value=_make_preset()
        ), patch(
            "app.api.chat.build_chat_model", return_value=fake_model
        ):
            response = client.post(
                "/api/chat/stream",
                json={
                    "presetId": "preset-1",
                    "messages": [{"role": "user", "content": "Hi"}],
                },
            )

        assert response.status_code == 200
        body = response.text
        assert 'data: {"delta": "Hello"}' in body
        assert "event: error" in body
        assert '"detail": "LLM request failed: connection refused"' in body

    def test_thinking_chunks_emit_a_distinct_thinking_event(self, isolated_chat_config: Path):
        """When chunks carry reasoning_content, an event: thinking line precedes the content."""
        fake_model = _make_fake_model([("", "Reasoning..."), "42"])
        with patch(
            "app.api.chat.PresetRepository.get", return_value=_make_preset()
        ), patch(
            "app.api.chat.build_chat_model", return_value=fake_model
        ):
            response = client.post(
                "/api/chat/stream",
                json={
                    "presetId": "preset-1",
                    "messages": [{"role": "user", "content": "6*7?"}],
                },
            )

        assert response.status_code == 200
        body = response.text
        assert 'event: thinking\ndata: {"delta": "Reasoning..."}' in body
        assert 'data: {"delta": "42"}' in body

    def test_tuning_overrides_do_not_persist_to_preset_file(self, isolated_chat_config: Path):
        """Temperature/top_p/num_ctx overrides never trigger a preset repository write."""
        fake_model = _make_fake_model(["Hello"])
        with patch(
            "app.api.chat.PresetRepository.get", return_value=_make_preset()
        ), patch(
            "app.api.chat.PresetRepository.update"
        ) as mock_update, patch(
            "app.api.chat.PresetRepository.create"
        ) as mock_create, patch(
            "app.api.chat.build_chat_model", return_value=fake_model
        ) as mock_build_chat_model:
            response = client.post(
                "/api/chat/stream",
                json={
                    "presetId": "preset-1",
                    "messages": [{"role": "user", "content": "Hi"}],
                    "temperature": 0.2,
                    "top_p": 0.4,
                    "num_ctx": 512,
                },
            )

        assert response.status_code == 200
        mock_update.assert_not_called()
        mock_create.assert_not_called()
        effective_preset = mock_build_chat_model.call_args.args[1]
        assert effective_preset.temperature == 0.2
        assert effective_preset.top_p == 0.4
        assert effective_preset.num_ctx == 512
