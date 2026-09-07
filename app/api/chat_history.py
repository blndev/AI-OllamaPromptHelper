"""Chat history save/load/autosave endpoints (see README.md section 7)."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import load_config
from app.models.chat_history import ChatHistory
from app.services.chat_history_repository import (
    ChatHistoryNotFoundError,
    list_names,
    load,
    load_autosave,
    save,
    save_autosave,
)

router = APIRouter()


class SaveRequest(BaseModel):
    name: str
    history: ChatHistory


class SaveResponse(BaseModel):
    name: str


class ListResponse(BaseModel):
    names: list[str]


class AutosaveResponse(BaseModel):
    status: str = "ok"


class AutosaveLoadResponse(BaseModel):
    history: ChatHistory | None = None


@router.post("/api/chat-history/save", response_model=SaveResponse)
def save_history(request: SaveRequest) -> SaveResponse:
    config = load_config()
    slug = save(config.outputFolder, request.name, request.history)
    return SaveResponse(name=slug)


@router.get("/api/chat-history/load", response_model=ChatHistory)
def load_history(name: str) -> ChatHistory:
    config = load_config()
    try:
        return load(config.outputFolder, name)
    except ChatHistoryNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Chat history not found") from exc


@router.get("/api/chat-history/list", response_model=ListResponse)
def list_histories() -> ListResponse:
    config = load_config()
    return ListResponse(names=list_names(config.outputFolder))


@router.post("/api/chat-history/autosave", response_model=AutosaveResponse)
def autosave_history(history: ChatHistory) -> AutosaveResponse:
    config = load_config()
    save_autosave(config.outputFolder, history)
    return AutosaveResponse()


@router.get("/api/chat-history/autosave", response_model=AutosaveLoadResponse)
def get_autosave() -> AutosaveLoadResponse:
    config = load_config()
    return AutosaveLoadResponse(history=load_autosave(config.outputFolder))
