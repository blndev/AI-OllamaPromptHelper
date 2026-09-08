"""Chat endpoints: a non-streaming turn and an SSE streaming turn (Phase 4/5/6)."""
import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import httpx
from pydantic import BaseModel

from app.config import load_config
from app.models.preset import Preset
from app.services.chat_service import (
    ChatMessageIn,
    build_chat_model,
    build_messages,
    generate_reply,
)
from app.services.ollama_client import OllamaClient
from app.services.preset_repository import PresetNotFoundError, PresetRepository

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatRequest(BaseModel):
    presetId: str
    messages: list[ChatMessageIn]
    # Per-chat overrides; when set they win over the preset's stored defaults
    # for this request only and are never written back to the preset file.
    systemPrompt: str | None = None
    temperature: float | None = None
    top_p: float | None = None
    num_ctx: int | None = None


class ChatResponse(BaseModel):
    content: str
    thinking: str | None = None


def _load_preset(preset_id: str):
    config = load_config()
    try:
        preset = PresetRepository(config.presetFolder).get(preset_id)
    except PresetNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Preset not found") from exc
    return config, preset


def apply_overrides(preset: Preset, request: ChatRequest) -> Preset:
    """Return a copy of preset with systemPrompt/temperature/top_p/num_ctx
    replaced by any request overrides, leaving fields the request left as
    None (or blank for systemPrompt) unchanged. Never persisted: this only
    returns an in-memory copy."""
    overrides = {}
    if request.systemPrompt is not None and request.systemPrompt.strip():
        overrides["systemPrompt"] = request.systemPrompt
    if request.temperature is not None:
        overrides["temperature"] = request.temperature
    if request.top_p is not None:
        overrides["top_p"] = request.top_p
    if request.num_ctx is not None:
        overrides["num_ctx"] = request.num_ctx
    return preset.model_copy(update=overrides) if overrides else preset


def _require_model(preset: Preset) -> None:
    if not preset.model or not preset.model.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                f"Preset '{preset.name}' has no model configured. Open the "
                "preset editor, select a model, and save it again."
            ),
        )


async def resolve_model(config, preset: Preset) -> Preset:
    """Return the preset unchanged, or with the first model the Ollama
    instance offers when the preset has none configured."""
    if preset.model and preset.model.strip():
        return preset
    try:
        models = await OllamaClient(config.ollamaUrl, config.credentials).list_models()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach Ollama instance at {config.ollamaUrl}: {exc}",
        ) from exc
    if not models:
        _require_model(preset)
        return preset
    logger.info("Preset %s has no model, falling back to %s", preset.name, models[0])
    return preset.model_copy(update={"model": models[0]})


@router.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    config, preset = _load_preset(request.presetId)
    effective_preset = await resolve_model(config, apply_overrides(preset, request))

    logger.info(
        "Chat request: preset=%s model=%s temperature=%s top_p=%s num_ctx=%s "
        "thinking=%s messages=%d",
        effective_preset.name,
        effective_preset.model,
        effective_preset.temperature,
        effective_preset.top_p,
        effective_preset.num_ctx,
        effective_preset.thinking,
        len(request.messages),
    )

    try:
        reply = await generate_reply(config, effective_preset, request.messages)
    except Exception as exc:  # network/model errors from the Ollama backend
        logger.error("LLM request failed for preset %s: %s", effective_preset.name, exc)
        raise HTTPException(
            status_code=502, detail=f"LLM request failed: {exc}"
        ) from exc

    return ChatResponse(content=reply.content, thinking=reply.thinking)


@router.post("/api/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    config, preset = _load_preset(request.presetId)
    effective_preset = await resolve_model(config, apply_overrides(preset, request))

    async def event_generator():
        try:
            model = build_chat_model(config, effective_preset)
            messages = build_messages(effective_preset, request.messages)
            logger.info(
                "Sending to Ollama: preset=%s model=%s temperature=%s top_p=%s "
                "num_ctx=%s thinking=%s messages=%d",
                effective_preset.name,
                effective_preset.model,
                effective_preset.temperature,
                effective_preset.top_p,
                effective_preset.num_ctx,
                effective_preset.thinking,
                len(messages),
            )

            if config.debugMode:
                # Exactly what will be sent to Ollama's HTTP API (role/content/
                # images), via the same conversion LangChain performs internally.
                # Only computed/emitted/logged when debugMode is enabled, since
                # it includes the full system prompt and message content.
                wire_messages = model._convert_messages_to_ollama_messages(messages)
                logger.info("Debug mode - full Ollama payload: %s", wire_messages)
                debug_payload = json.dumps(
                    {
                        "model": effective_preset.model,
                        "temperature": effective_preset.temperature,
                        "top_p": effective_preset.top_p,
                        "num_ctx": effective_preset.num_ctx,
                        "thinking": effective_preset.thinking,
                        "messages": wire_messages,
                    }
                )
                yield f"event: debug\ndata: {debug_payload}\n\n"

            async for chunk in model.astream(messages):
                # Reasoning text (when preset.thinking is True) arrives via
                # additional_kwargs["reasoning_content"]; emit it as its own SSE
                # event so the frontend can render it separately from the answer.
                thinking = getattr(chunk, "additional_kwargs", {}).get("reasoning_content")
                if thinking:
                    yield f"event: thinking\ndata: {json.dumps({'delta': thinking})}\n\n"
                text = getattr(chunk, "content", "")
                if text:
                    yield f"data: {json.dumps({'delta': text})}\n\n"
            yield "event: done\ndata: {}\n\n"
        except Exception as exc:  # pragma: no cover - defensive, surfaced to client
            logger.error("LLM streaming request failed for preset %s: %s", effective_preset.name, exc)
            payload = json.dumps({"detail": f"LLM request failed: {exc}"})
            yield f"event: error\ndata: {payload}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

