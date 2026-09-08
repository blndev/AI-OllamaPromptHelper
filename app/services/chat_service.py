"""LangChain-backed chat generation against the configured Ollama instance."""
from __future__ import annotations

from typing import Literal

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from pydantic import BaseModel

from app.config import AppConfig
from app.models.preset import Preset


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    # Base64-encoded image bytes, no "data:image/...;base64," prefix (frontend strips it).
    image: str | None = None


class ChatReply(BaseModel):
    """Result of a non-streaming chat turn: the answer plus optional reasoning text."""

    content: str
    thinking: str | None = None


# Appended to the system prompt when preset.injectPromptTemplate is True,
# instructing the model to mark up prompt suggestions so the frontend/backend
# can extract them into the Markdown library (see README.md section 9).
PROMPT_MARKUP_INSTRUCTION = (
    "\n\nWhenever you suggest a prompt for the user to reuse in another generative "
    "AI tool, wrap each individual suggestion in this exact markup, one <prompt> "
    'block per suggestion: <prompt type="TYPE" description="SHORT DESCRIPTION">'
    "PROMPT TEXT</prompt> — where TYPE is exactly one of image, video, or text, "
    "and description is a short, concise summary of that prompt."
)


def build_system_prompt(preset: Preset) -> str:
    """Return preset.systemPrompt, extended with the prompt-markup instruction
    when the preset has injectPromptTemplate enabled."""
    if preset.injectPromptTemplate:
        return preset.systemPrompt + PROMPT_MARKUP_INSTRUCTION
    return preset.systemPrompt


def build_chat_model(config: AppConfig, preset: Preset) -> ChatOllama:
    kwargs: dict = {"base_url": config.ollamaUrl, "model": preset.model}
    if preset.temperature is not None:
        kwargs["temperature"] = preset.temperature
    if preset.top_p is not None:
        kwargs["top_p"] = preset.top_p
    if preset.num_ctx is not None:
        kwargs["num_ctx"] = preset.num_ctx
    # ChatOllama's `reasoning` constructor param (bool|str|None) controls Ollama's
    # "think" mode; when True the model's reasoning is captured separately in
    # AIMessage(Chunk).additional_kwargs["reasoning_content"] instead of being
    # inlined as <think> tags in the main content (see langchain_ollama.chat_models).
    kwargs["reasoning"] = preset.thinking
    return ChatOllama(**kwargs)


def build_messages(preset: Preset, history: list[ChatMessageIn]) -> list[BaseMessage]:
    messages: list[BaseMessage] = [SystemMessage(content=build_system_prompt(preset))]
    for entry in history:
        if entry.role == "user":
            if entry.image:
                # ChatOllama._convert_messages_to_ollama_messages reads content blocks
                # of type "text" and "image_url" (the image_url value may be a raw
                # base64 string or a data URI); this is the shape it expects.
                content = [
                    {"type": "text", "text": entry.content},
                    {"type": "image_url", "image_url": entry.image},
                ]
                messages.append(HumanMessage(content=content))
            else:
                messages.append(HumanMessage(content=entry.content))
        else:
            messages.append(AIMessage(content=entry.content))
    return messages


async def generate_reply(
    config: AppConfig, preset: Preset, history: list[ChatMessageIn]
) -> ChatReply:
    model = build_chat_model(config, preset)
    messages = build_messages(preset, history)
    response = await model.ainvoke(messages)
    thinking = getattr(response, "additional_kwargs", {}).get("reasoning_content")
    return ChatReply(content=response.content, thinking=thinking)
