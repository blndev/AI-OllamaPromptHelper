"""Health/config-summary endpoint used to verify the running configuration."""
from fastapi import APIRouter

from app.config import load_config

router = APIRouter()


@router.get("/api/health")
def health() -> dict:
    config = load_config()
    return {
        "status": "ok",
        "ollamaUrl": config.ollamaUrl,
        "credentialsConfigured": bool(config.credentials),
        "presetFolder": config.presetFolder,
        "outputFolder": config.outputFolder,
        "appTitle": config.appTitle,
        "version": config.version,
        "debugMode": config.debugMode,
    }
