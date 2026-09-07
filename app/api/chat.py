"""Chat endpoints: a non-streaming turn and an SSE streaming turn (Phase 4/5/6)."""
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import load_config
from app.models.preset import Preset
from app.services.chat_service import (
    ChatMessageIn,
    build_chat_model,
    build_messages,
    generate_reply,
)
from app.services.preset_repository import PresetNotFoundError, PresetRepository

router = APIRouter()


class ChatRequest(BaseModel):
    presetId: str
    messages: list[ChatMessageIn]
    # Per-chat tuning overrides; when set they win over the preset's stored
    # defaults for this request only and are never written back to the preset.
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
    """Return a copy of preset with temperature/top_p/num_ctx replaced by any
    request overrides, leaving fields the request left as None unchanged.
    Never persisted: this only returns an in-memory copy."""
    overrides = {}
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


@router.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    config, preset = _load_preset(request.presetId)
    effective_preset = apply_overrides(preset, request)
    _require_model(effective_preset)

    try:
        reply = await generate_reply(config, effective_preset, request.messages)
    except Exception as exc:  # network/model errors from the Ollama backend
        raise HTTPException(
            status_code=502, detail=f"LLM request failed: {exc}"
        ) from exc

    return ChatResponse(content=reply.content, thinking=reply.thinking)


@router.post("/api/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    config, preset = _load_preset(request.presetId)
    effective_preset = apply_overrides(preset, request)
    _require_model(effective_preset)

    async def event_generator():
        try:
            model = build_chat_model(config, effective_preset)
            messages = build_messages(effective_preset, request.messages)
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
            payload = json.dumps({"detail": f"LLM request failed: {exc}"})
            yield f"event: error\ndata: {payload}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

