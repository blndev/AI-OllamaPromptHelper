"""Model discovery endpoint, backed by the configured Ollama instance."""
import httpx
from fastapi import APIRouter, HTTPException

from app.config import load_config
from app.services.ollama_client import OllamaClient

router = APIRouter()


@router.get("/api/models")
async def list_models() -> dict:
    config = load_config()
    client = OllamaClient(config.ollamaUrl, config.credentials)
    try:
        models = await client.list_models()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach Ollama instance at {config.ollamaUrl}: {exc}",
        ) from exc
    return {"models": models}
