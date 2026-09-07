"""FastAPI entrypoint: serves the REST/SSE API and the static frontend."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.types import Scope

from app.api import chat, chat_history, health, models, presets, prompts
from app.config import ConfigError, load_config


class NoCacheStaticFiles(StaticFiles):
    """Force revalidation on every request so browsers never keep a stale
    copy of app.js/style.css after an edit (ETag-based, so it's still fast)."""

    async def get_response(self, path: str, scope: Scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache"
        return response


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        load_config()
    except ConfigError as exc:
        raise RuntimeError(str(exc)) from exc
    yield


app = FastAPI(title="AI-OllamaPromptHelper", lifespan=lifespan)

app.include_router(health.router)
app.include_router(models.router)
app.include_router(presets.router)
app.include_router(chat.router)
app.include_router(prompts.router)
app.include_router(chat_history.router)
app.mount("/", NoCacheStaticFiles(directory="static", html=True), name="static")
