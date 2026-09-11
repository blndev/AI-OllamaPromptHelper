"""Prompt extraction and Markdown library endpoints (see README.md section 9)."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import load_config
from app.services.markdown_exporter import (
    ExtractedPrompt,
    export_prompts,
    list_topics,
    parse_prompts,
    read_library,
)

router = APIRouter()


class ExtractRequest(BaseModel):
    topic: str
    text: str


class ExtractResponse(BaseModel):
    extracted: list[ExtractedPrompt]


class LibraryResponse(BaseModel):
    entries: list[ExtractedPrompt]


class TopicsResponse(BaseModel):
    topics: list[str]


@router.post("/api/prompts/extract", response_model=ExtractResponse)
def extract_prompts(request: ExtractRequest) -> ExtractResponse:
    config = load_config()
    prompts = parse_prompts(request.text)
    if prompts:
        try:
            export_prompts(config.outputFolder, request.topic, prompts)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid topic") from exc
    return ExtractResponse(extracted=prompts)


@router.get("/api/prompts/library", response_model=LibraryResponse)
def get_library(topic: str) -> LibraryResponse:
    config = load_config()
    try:
        entries = read_library(config.outputFolder, topic)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid topic") from exc
    return LibraryResponse(entries=entries)


@router.get("/api/prompts/topics", response_model=TopicsResponse)
def get_topics() -> TopicsResponse:
    config = load_config()
    return TopicsResponse(topics=list_topics(config.outputFolder))
