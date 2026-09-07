---
goal: FastAPI + Vanilla HTML/JS implementation of the Prompt Workshop
version: 1.0
date_created: 2026-09-07
owner: AI-OllamaPromptHelper
status: 'Completed'
tags: [feature, architecture, fastapi, frontend]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

Implementation plan for the Prompt Workshop application: a FastAPI backend (REST + SSE streaming) serving a Vanilla HTML/CSS/JS frontend, integrating Ollama via LangChain, with JSON/Markdown file-based persistence. Based on [README.md](../README.md) "Detailed Requirements" and [analysis-tech-stack.md](../.local/decisions/analysis-tech-stack.md). The plan is split into milestones, each ending with a concrete, user-verifiable validation step so the direction can be confirmed before continuing.

## 1. Requirements & Constraints

- **REQ-001**: Single FastAPI process serves both the REST/SSE API and the static frontend (same origin, no CORS setup).
- **REQ-002**: LangChain (Python) used for conversation memory/chains against the Ollama HTTP API (`langchain-ollama`).
- **REQ-003**: Configuration loaded from a JSON file (`ollamaUrl`, optional `credentials`, `presetFolder`, `outputFolder`).
- **REQ-004**: Presets loaded/persisted as JSON files; fully CRUD-manageable from the UI; fields: `systemPrompt`, `model`, `thinking`, `promptIdentifier`, `temperature`, `top_p`, `num_ctx`.
- **REQ-005**: Model list for the preset editor is auto-discovered from Ollama, not free text.
- **REQ-006**: Chat UI: scrollable history, fixed bottom input, image attachment (multimodal), per-message checkbox controlling LLM context inclusion (default checked), deselect-all, delete-with-undo, regenerate last response.
- **REQ-007**: Chat save/load as JSON; periodic autosave independent of manual save.
- **REQ-008**: Topic field changeable at any time; determines the target Markdown file for extracted prompts.
- **REQ-009**: Thinking mode togglable per preset; rendered visually separate from the final response.
- **REQ-010**: Prompt extraction via a defined markup (e.g. `<prompt type="...">...</prompt>`) parsed from LLM responses; appended to the topic's Markdown file with description, type, prompt text, empty feedback placeholder.
- **REQ-011**: One-click copy-to-clipboard for extracted prompt text (chat view and library view).
- **REQ-012**: Tuning parameters overridable per-chat temporarily without modifying the preset file.
- **REQ-013**: UI shows an approximate context size indicator (message count + token estimate).
- **CON-001**: No database — only flat JSON and Markdown files.
- **CON-002**: Single local user; no authentication/login flow required.
- **CON-003**: No Node build toolchain for the frontend (plain HTML/CSS/JS, no bundler required to run the app).
- **GUD-001**: Keep backend and frontend concerns separated by a stable REST/SSE contract, so the frontend can later be replaced (e.g. by React) without backend changes.
- **PAT-001**: Streaming chat responses use Server-Sent Events (SSE) from FastAPI to the browser via `EventSource`/`fetch` streaming.

## 2. Implementation Steps

### Implementation Phase 1: Project Skeleton & Config

- GOAL-001: A running FastAPI app serving a static placeholder page and loading configuration, with nothing else functional yet.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Scaffold project structure: `app/main.py`, `app/api/`, `app/services/`, `app/models/`, `static/`, `config.json` | ✅ | 2026-09-07 |
| TASK-002 | Implement config loader (Pydantic model) reading `config.json` (`ollamaUrl`, `credentials`, `presetFolder`, `outputFolder`), with clear startup error if the file is missing/invalid | ✅ | 2026-09-07 |
| TASK-003 | Mount `static/` via FastAPI `StaticFiles`, serve a minimal `index.html` at `/` | ✅ | 2026-09-07 |
| TASK-004 | Add `/api/health` endpoint returning config summary (no secrets) for manual verification | ✅ | 2026-09-07 |

**Milestone 1 validation**: Run `uvicorn app.main:app --reload`, open the app in a browser, confirm the placeholder page loads and `/api/health` reflects the values from `config.json`.

### Implementation Phase 2: Ollama Connectivity & Model Discovery

- GOAL-002: Backend can talk to Ollama directly (no LangChain yet) and list installed models.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | Implement `OllamaClient` service wrapping the Ollama HTTP API (list models, basic generate call), using `credentials` if configured | ✅ | 2026-09-07 |
| TASK-006 | Add `/api/models` endpoint returning the auto-discovered model list | ✅ | 2026-09-07 |
| TASK-007 | Add a minimal debug page/script that calls `/api/models` and prints the result | ✅ | 2026-09-07 |

**Milestone 2 validation**: With a local Ollama instance running, calling `/api/models` returns the actually installed models; verified manually against `ollama list`.

### Implementation Phase 3: Presets (CRUD + Persistence)

- GOAL-003: Presets can be listed, created, edited, and deleted via the API and are persisted as JSON files in `presetFolder`.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-008 | Define preset schema (Pydantic): `systemPrompt`, `model`, `thinking`, `promptIdentifier`, `temperature`, `top_p`, `num_ctx` | ✅ | 2026-09-07 |
| TASK-009 | Implement `PresetRepository` (list/read/write/delete JSON files in `presetFolder`) | ✅ | 2026-09-07 |
| TASK-010 | Add `/api/presets` (GET list, POST create), `/api/presets/{id}` (GET, PUT update, DELETE) | ✅ | 2026-09-07 |
| TASK-011 | Build minimal frontend preset editor page: dropdown to select, form to edit/create, model dropdown fed by `/api/models` | ✅ | 2026-09-07 |

**Milestone 3 validation**: Create a preset via the UI, confirm a corresponding JSON file appears in `presetFolder` with correct content; edit and delete it via the UI and confirm the file updates/disappears accordingly.

### Implementation Phase 4: Core Chat Loop (Non-Streaming, LangChain Integration)

- GOAL-004: A basic working chat: user sends a message with a selected preset, LangChain (via `langchain-ollama`) returns a full response, shown in the UI.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-012 | Integrate LangChain conversation chain/memory backed by `langchain-ollama`, parameterized by the active preset (`systemPrompt`, `model`, `temperature`, `top_p`, `num_ctx`) | ✅ | 2026-09-07 |
| TASK-013 | Add `/api/chat` POST endpoint accepting message + preset id + active context messages, returning the full assistant response (non-streaming first) | ✅ | 2026-09-07 |
| TASK-014 | Build chat UI: fixed bottom input, scrollable message list, send button, render user/assistant bubbles | ✅ | 2026-09-07 |

**Milestone 4 validation**: User can select a preset, type a message, and receive a coherent LLM response rendered in the chat UI, using the preset's configured model and system prompt.

### Implementation Phase 5: Streaming, Context Control, Message Actions

- GOAL-005: Responses stream token-by-token; per-message checkboxes control what is sent as context; delete/undo and regenerate work.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-015 | Convert `/api/chat` to a streaming SSE endpoint; update frontend to consume the stream via `EventSource`/`fetch` + `ReadableStream` | ✅ | 2026-09-07 |
| TASK-016 | Add per-message checkbox (default checked) in the UI; only checked messages are included when building the next request's context | ✅ | 2026-09-07 |
| TASK-017 | Add "Deselect all" control | ✅ | 2026-09-07 |
| TASK-018 | Add per-message delete action with a timed "Undo" toast before permanent removal | ✅ | 2026-09-07 |
| TASK-019 | Add "Regenerate" action on the last assistant message, resending the current context | ✅ | 2026-09-07 |
| TASK-020 | Add context-size indicator (message count + approximate token estimate) updating live as checkboxes/messages change | ✅ | 2026-09-07 |

**Milestone 5 validation**: Responses visibly stream in; unchecking a message and sending a new one confirms (via logs/dev tools inspection of the outgoing request) that unchecked messages are excluded from the context sent to Ollama; delete+undo and regenerate work as expected in the UI.

### Implementation Phase 6: Multimodal Input, Thinking Mode, Tuning Overrides

- GOAL-006: Image attachment, distinct thinking-section rendering, and temporary per-chat tuning overrides are functional.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-021 | Add image attach control in the input bar; encode and send image alongside text to multimodal-capable models | ✅ | 2026-09-07 |
| TASK-022 | Render an image thumbnail in the corresponding chat bubble | ✅ | 2026-09-07 |
| TASK-023 | Implement thinking mode: request/parse the model's reasoning output when the active preset has `thinking=true`; render it in a visually distinct, collapsible section separate from the final response | ✅ | 2026-09-07 |
| TASK-024 | Add a collapsible "Tuning" panel to override `temperature`/`top_p`/`num_ctx` for the current chat only, without persisting to the preset file | ✅ | 2026-09-07 |

**Milestone 6 validation**: Sending an image with a multimodal model produces a relevant response; toggling thinking on a preset visibly separates reasoning from the final answer; changing tuning values in the panel measurably affects response behavior without altering the preset JSON file on disk.

### Implementation Phase 7: Topic Field & Prompt Extraction/Markdown Export

- GOAL-007: Prompts are detected via markup in LLM responses and exported into a per-topic Markdown library, with copy-to-clipboard support.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-025 | Add editable "Topic" field and "Prompt type" selector to the UI header/toolbar | ✅ | 2026-09-07 |
| TASK-026 | Extend system prompt construction: when `promptIdentifier` is set on the active preset, instruct the model to wrap generated prompts in `<prompt type="...">...</prompt>` markup | ✅ | 2026-09-07 |
| TASK-027 | Implement a parser that scans LLM responses for the prompt markup and extracts description/type/prompt text | ✅ | 2026-09-07 |
| TASK-028 | Implement `MarkdownExporter` that appends extracted prompts to `outputFolder/<topic>.md` (creating the file/section if missing) with description, type, prompt text, and an empty Feedback placeholder | ✅ | 2026-09-07 |
| TASK-029 | Render detected prompt blocks distinctly in the chat UI with a copy-to-clipboard button | ✅ | 2026-09-07 |
| TASK-030 | Build the "Prompt Library" sidebar reading the current topic's Markdown file and rendering entries with a copy-to-clipboard button per entry | ✅ | 2026-09-07 |

**Milestone 7 validation**: Sending a prompt-generation request with a preset that has `promptIdentifier` set results in a new entry appended to `outputFolder/<topic>.md` with the correct structure; clicking copy on the entry places the exact prompt text on the clipboard; changing the Topic field routes subsequent extractions to a different Markdown file.

### Implementation Phase 8: Chat Persistence (Save/Load/Autosave)

- GOAL-008: Full chat state (messages, checkbox/inclusion state) can be saved/loaded manually and is autosaved periodically.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-031 | Define chat history JSON schema (messages with role, content, image ref, checkbox state, timestamps) | ✅ | 2026-09-07 |
| TASK-032 | Add `/api/chat-history` save/load endpoints and UI controls ("Save history", "Load history", "New chat") | ✅ | 2026-09-07 |
| TASK-033 | Implement autosave (periodic timer and/or on-new-message) writing to a dedicated autosave file, with a small "Autosaved Xs ago" UI indicator | ✅ | 2026-09-07 |

**Milestone 8 validation**: Save a chat, reload the app, load it back, and confirm messages plus checkbox states are restored exactly; kill and restart the server mid-chat and confirm the autosave file allows recovering the conversation.

### Implementation Phase 9: Polish & End-to-End Validation

- GOAL-009: All Detailed Requirements sections in [README.md](../README.md) are verified end-to-end in one pass.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-034 | Walk through README "Detailed Requirements" sections 1–10 and cross-check each bullet against the running app | ✅ | 2026-09-07 |
| TASK-035 | Fix gaps found during the walkthrough | ✅ | 2026-09-07 |
| TASK-036 | Basic error handling pass: missing/invalid config, unreachable Ollama instance, invalid preset JSON, filesystem write failures | ✅ | 2026-09-07 |

**Milestone 9 validation**: Full manual run-through of a realistic session (pick preset → chat with tuning override → attach image → toggle thinking → extract a prompt → copy it → edit checkboxes → delete+undo a message → regenerate → change topic → save/load chat → restart and confirm autosave) completes without errors.

## 3. Alternatives

- **ALT-001**: React/Vite SPA frontend from the start — rejected initially in favor of Vanilla JS to avoid a Node build step for this simple, single-user tool; kept as a documented fallback if state management becomes unwieldy (see [analysis-tech-stack.md](../.local/decisions/analysis-tech-stack.md)).
- **ALT-002**: Gradio/Streamlit UI — rejected because their component/rerun model does not fit the required per-message checkbox context control and custom widgets (see prior chat discussion).
- **ALT-003**: Flask instead of FastAPI — rejected due to weaker native async/streaming support needed for SSE-based token streaming.

## 4. Dependencies

- **DEP-001**: `fastapi`, `uvicorn` — web framework and ASGI server.
- **DEP-002**: `langchain`, `langchain-ollama` — conversation memory/chains and Ollama integration.
- **DEP-003**: `pydantic` — config/preset schema validation.
- **DEP-004**: A running local Ollama instance with at least one text model and one multimodal model installed for full validation of Phase 6.

## 5. Files

- **FILE-001**: `app/main.py` — FastAPI app entrypoint, static mount, router registration.
- **FILE-002**: `app/api/` — route modules (`config.py`, `models.py`, `presets.py`, `chat.py`, `chat_history.py`, `prompts.py`).
- **FILE-003**: `app/services/ollama_client.py` — Ollama HTTP API wrapper.
- **FILE-004**: `app/services/preset_repository.py` — preset JSON CRUD.
- **FILE-005**: `app/services/markdown_exporter.py` — prompt markup parsing and Markdown append logic.
- **FILE-006**: `app/services/chat_history.py` — chat save/load/autosave logic.
- **FILE-007**: `static/index.html`, `static/app.js`, `static/style.css` — frontend.
- **FILE-008**: `config.json` — runtime configuration (not committed with real credentials).

## 6. Testing

- **TEST-001**: Unit tests for the prompt-markup parser (valid markup, missing markup, multiple prompts in one response, malformed tags).
- **TEST-002**: Unit tests for `PresetRepository` CRUD (create/read/update/delete round-trip against a temp folder).
- **TEST-003**: Unit tests for `MarkdownExporter` (new topic file creation, appending to an existing file, correct section structure).
- **TEST-004**: Integration test for `/api/chat` context-building logic (only checked messages are included in the outgoing context).
- **TEST-005**: Manual/exploratory test per milestone validation step described above (Phases 1–9).

## Known Gaps

- Filesystem write failures (e.g. `outputFolder`/`presetFolder` unwritable due to permissions) are not explicitly caught around individual `write_text()` calls in `preset_repository.py`, `chat_history_repository.py`, and `markdown_exporter.py`; such a failure surfaces as an unhandled 500 rather than a clean error message. Accepted as a low-priority risk for this local single-user tool (see RISK section below); not fixed in Phase 9 per the deliberate scope decision to avoid over-engineering an unlikely edge case.

## 7. Risks & Assumptions

- **RISK-001**: Prompt markup detection depends on the model reliably following system-prompt formatting instructions; some models may not comply consistently, requiring a fallback/retry or a more lenient parser.
- **RISK-002**: Token estimation for the context indicator (REQ-013) is approximate since no exact tokenizer per model is guaranteed to be available client-side.
- **RISK-003**: Multimodal image support depends on the selected Ollama model actually supporting image input; the UI should surface a clear error if an incompatible model is selected with an attached image.
- **ASSUMPTION-001**: A local Ollama instance is available during development/validation with both a standard and a multimodal model installed.
- **ASSUMPTION-002**: No concurrent multi-user access is required, simplifying file-based persistence (no locking strategy needed beyond basic safe writes).

## 8. Related Specifications / Further Reading

[README.md](../README.md) — Requirements and Detailed Requirements
[analysis-tech-stack.md](../.local/decisions/analysis-tech-stack.md) — Technology stack recommendation and rationale
[concept-ui-draft-realistic.svg](../.local/decisions/concept-ui-draft-realistic.svg) — UI draft reference
