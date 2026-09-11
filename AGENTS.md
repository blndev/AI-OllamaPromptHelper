# AGENTS.md

Guidance for AI coding agents working in this repository. See [README.md](README.md) for user-facing docs and the full requirements/changelog.

## Project shape

* FastAPI backend (`app/`) + vanilla JS/HTML/CSS frontend (`static/`), no build step, no frontend framework.
* Backend layers:
  * `app/api/` – FastAPI routers (HTTP only, thin: validation + delegating to services).
  * `app/services/` – business logic (Ollama client, chat generation via LangChain, preset/chat-history repositories, Markdown prompt exporter).
  * `app/models/` – Pydantic schemas for persisted data (`preset.py`, `chat_history.py`).
  * `app/config.py` – loads `config.json`, optionally overlaid by a git-ignored `config.local.json` for local dev overrides.
* Frontend is a single `static/app.js` (no modules/bundler) + `static/index.html` + `static/style.css`. Bump the `?v=N` query string on `<link>`/`<script src>` in `index.html` whenever you edit `app.js`/`style.css` — browsers cache them aggressively otherwise.
* Presets live as JSON files in `presets/` (schema: `app/models/preset.py`); the filename stem is the preset's `id`.
* Runtime output (chat history saves/autosave, per-topic Markdown prompt libraries) is written to `output/` (`outputFolder` in `config.json`): chats under `output/chats/`, prompt libraries directly as `output/<slug>.md`.

## Running things

```powershell
.\.venv\Scripts\pip.exe install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest tests/ -v          # full test suite (also what CI runs, via `pytest -q`)
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload   # run the app locally at http://127.0.0.1:8000/
# or on Linux/macOS / Git Bash:
./run.sh
```

There is **no linter/formatter configured** in this repo (no `.flake8`, no `ruff`/`black` config) — do not assume one exists. CI (`.github/workflows/docker-build.yml`) only runs `pytest -q` before building the Docker image.

## Conventions actually used in this codebase

* Logging: `logger = logging.getLogger(__name__)` at module level, `%s`-style formatting (not f-strings) in log calls, e.g. `logger.error("LLM request failed for preset %s: %s", name, exc)`.
* Errors from external services (Ollama unreachable, etc.) are surfaced as `HTTPException` with a clear `detail` message, not swallowed.
* Security-sensitive path handling: preset ids and topic names are user input that becomes a filename. Both `PresetRepository._path` and `markdown_exporter.slugify_topic`/`_library_path` defend against path traversal — follow the same pattern (whitelist characters, resolve-and-check-parent) for any new user-controlled filename.
* Pydantic models are the schema/validation boundary everywhere (API request/response bodies, presets, chat history) — don't hand-roll dict validation.
* New backend features generally need: a Pydantic model (if new data shape) → a service function (business logic, easy to unit test) → a thin router endpoint → tests in `tests/test_*.py` (FastAPI `TestClient`, see existing tests for the `isolated_output_folder`/`isolated_preset_folder`-style fixtures that patch `load_config`).
* Frontend state lives in plain top-level `let`/`const` variables in `app.js` (e.g. `chatMessages`, `selectedImages`, `presets`) — no framework/store. New UI state follows the same pattern: a module-level variable + a `render*()` function that rebuilds the relevant DOM subtree.
* Markdown prompt library format (`app/services/markdown_exporter.py`) is intentionally hand-edit-friendly: entries are separated by `---` lines and parsed per-segment, so a broken/edited segment is skipped rather than corrupting neighboring entries. Keep this segment-based parsing approach if you touch it.

## Testing notes

* Tests mock `load_config` (via `unittest.mock.patch`) and point it at `tmp_path`, never at the real `presets/`/`output/` folders.
* No live Ollama instance is available in this environment/CI — anything that needs a real model response is either mocked (`ChatOllama`/`OllamaClient` patched) or not covered by automated tests. Manual/subagent-simulated review is used instead for prompt-quality checks (e.g. preset system prompts).
