"""Unit tests for app.services.chat_service (Phase 4 chat loop)."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_ollama import ChatOllama

from app.config import AppConfig
from app.models.preset import Preset
from app.services.chat_service import (
    ChatMessageIn,
    build_chat_model,
    build_messages,
    generate_reply,
)


def _make_preset(**overrides) -> Preset:
    defaults = dict(
        id="preset-1",
        name="Preset One",
        systemPrompt="You are a helpful assistant.",
        model="llama3",
        thinking=False,
        injectPromptTemplate=False,
        temperature=None,
        top_p=None,
        num_ctx=None,
    )
    defaults.update(overrides)
    return Preset(**defaults)


def _make_config() -> AppConfig:
    return AppConfig(
        ollamaUrl="http://localhost:11434",
        credentials=None,
        presetFolder="presets",
        outputFolder="output",
    )


class TestBuildSystemPrompt:
    """Tests for the injectPromptTemplate -> markup-instruction behavior."""

    def test_appends_markup_instruction_when_enabled(self):
        """With injectPromptTemplate=True, the markup instruction is appended."""
        from app.services.chat_service import PROMPT_MARKUP_INSTRUCTION, build_system_prompt

        preset = _make_preset(systemPrompt="Base prompt.", injectPromptTemplate=True)

        result = build_system_prompt(preset)

        assert result == "Base prompt." + PROMPT_MARKUP_INSTRUCTION

    def test_leaves_system_prompt_unchanged_when_disabled(self):
        """With injectPromptTemplate=False (default), the system prompt is untouched."""
        from app.services.chat_service import build_system_prompt

        preset = _make_preset(systemPrompt="Base prompt.", injectPromptTemplate=False)

        result = build_system_prompt(preset)

        assert result == "Base prompt."


class TestBuildMessages:
    """Tests for build_messages history-to-LangChain-message mapping."""

    def test_prepends_system_message_with_preset_prompt(self):
        """The first message is always a SystemMessage using preset.systemPrompt."""
        preset = _make_preset(systemPrompt="Be concise.")

        messages = build_messages(preset, [])

        assert len(messages) == 1
        assert isinstance(messages[0], SystemMessage)
        assert messages[0].content == "Be concise."

    def test_system_prompt_survives_real_ollama_wire_conversion(self):
        """End-to-end (no network): our SystemMessage is converted by the real,
        unmocked ChatOllama into the exact {"role": "system", ...} dict that
        gets sent over the wire to Ollama, proving the system prompt is not
        silently dropped somewhere in the langchain_ollama conversion layer."""
        preset = _make_preset(systemPrompt="You are a pirate. Always answer in pirate speak.")
        history = [ChatMessageIn(role="user", content="Hello there")]

        messages = build_messages(preset, history)
        model = ChatOllama(model="llama3")
        ollama_messages = model._convert_messages_to_ollama_messages(messages)

        assert ollama_messages[0]["role"] == "system"
        assert ollama_messages[0]["content"] == preset.systemPrompt
        assert ollama_messages[1]["role"] == "user"
        assert ollama_messages[1]["content"] == "Hello there"

    def test_maps_history_roles_and_preserves_order(self):
        """user/assistant history entries map to Human/AIMessage in the original order."""
        preset = _make_preset(systemPrompt="System prompt.")
        history = [
            ChatMessageIn(role="user", content="Hello"),
            ChatMessageIn(role="assistant", content="Hi there"),
            ChatMessageIn(role="user", content="How are you?"),
        ]

        messages = build_messages(preset, history)

        assert len(messages) == 4
        assert isinstance(messages[0], SystemMessage)
        assert messages[0].content == "System prompt."
        assert isinstance(messages[1], HumanMessage)
        assert messages[1].content == "Hello"
        assert isinstance(messages[2], AIMessage)
        assert messages[2].content == "Hi there"
        assert isinstance(messages[3], HumanMessage)
        assert messages[3].content == "How are you?"

    def test_user_message_without_image_has_plain_string_content(self):
        """A user entry with no image keeps HumanMessage.content as a plain string."""
        preset = _make_preset()
        history = [ChatMessageIn(role="user", content="Hello", image=None)]

        messages = build_messages(preset, history)

        assert messages[1].content == "Hello"

    def test_user_message_with_image_uses_multimodal_content_blocks(self):
        """A user entry with image produces the text+image_url block shape ChatOllama expects."""
        preset = _make_preset()
        history = [ChatMessageIn(role="user", content="What is this?", image="ZmFrZWJhc2U2NA==")]

        messages = build_messages(preset, history)

        assert messages[1].content == [
            {"type": "text", "text": "What is this?"},
            {"type": "image_url", "image_url": "ZmFrZWJhc2U2NA=="},
        ]


class TestBuildChatModel:
    """Tests for build_chat_model kwargs construction, mocking ChatOllama."""

    @patch("app.services.chat_service.ChatOllama")
    def test_omits_optional_kwargs_when_none(self, mock_chat_ollama: MagicMock):
        """When temperature/top_p/num_ctx are None, they are not passed to ChatOllama."""
        config = _make_config()
        preset = _make_preset(temperature=None, top_p=None, num_ctx=None)

        build_chat_model(config, preset)

        mock_chat_ollama.assert_called_once_with(
            base_url="http://localhost:11434", model="llama3", reasoning=False
        )

    @patch("app.services.chat_service.ChatOllama")
    def test_includes_optional_kwargs_when_set(self, mock_chat_ollama: MagicMock):
        """When temperature/top_p/num_ctx are set, they are forwarded to ChatOllama."""
        config = _make_config()
        preset = _make_preset(temperature=0.7, top_p=0.9, num_ctx=4096)

        build_chat_model(config, preset)

        mock_chat_ollama.assert_called_once_with(
            base_url="http://localhost:11434",
            model="llama3",
            temperature=0.7,
            top_p=0.9,
            num_ctx=4096,
            reasoning=False,
        )

    @patch("app.services.chat_service.ChatOllama")
    def test_passes_reasoning_true_when_preset_thinking_enabled(self, mock_chat_ollama: MagicMock):
        """When preset.thinking is True, reasoning=True is forwarded to ChatOllama."""
        config = _make_config()
        preset = _make_preset(thinking=True)

        build_chat_model(config, preset)

        _, kwargs = mock_chat_ollama.call_args
        assert kwargs["reasoning"] is True


class TestGenerateReply:
    """Tests for generate_reply end-to-end (with ChatOllama mocked out)."""

    @patch("app.services.chat_service.ChatOllama")
    def test_returns_model_response_content(self, mock_chat_ollama: MagicMock):
        """generate_reply returns the .content of the model's ainvoke response."""
        mock_instance = MagicMock()
        mock_instance.ainvoke = AsyncMock(
            return_value=MagicMock(content="Hello back!", additional_kwargs={})
        )
        mock_chat_ollama.return_value = mock_instance

        config = _make_config()
        preset = _make_preset()
        history = [ChatMessageIn(role="user", content="Hi")]

        result = asyncio.run(generate_reply(config, preset, history))

        assert result.content == "Hello back!"
        assert result.thinking is None
        mock_instance.ainvoke.assert_awaited_once()

    @patch("app.services.chat_service.ChatOllama")
    def test_returns_thinking_when_present_in_additional_kwargs(self, mock_chat_ollama: MagicMock):
        """generate_reply surfaces reasoning_content from additional_kwargs as .thinking."""
        mock_response = MagicMock(content="42", additional_kwargs={"reasoning_content": "Let me think..."})
        mock_instance = MagicMock()
        mock_instance.ainvoke = AsyncMock(return_value=mock_response)
        mock_chat_ollama.return_value = mock_instance

        config = _make_config()
        preset = _make_preset(thinking=True)
        history = [ChatMessageIn(role="user", content="How much is 6*7?")]

        result = asyncio.run(generate_reply(config, preset, history))

        assert result.content == "42"
        assert result.thinking == "Let me think..."
