# AI-OllamaPromptHelper
Simple Web based UI which uses Ollama to support in Prompt generation

Vibe Coded 

## Getting Started

### Prerequisites
* Python 3.12+ (a virtual environment is recommended)
* [Ollama](https://ollama.com) installed and running locally (or reachable over the network), with at least one model pulled (e.g. `ollama pull llama3`)

### Download & Install
```powershell
git clone <this-repository-url>
cd AI-OllamaPromptHelper

python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
```

### Configure
The app is configured via [`config.json`](config.json) in the project root:

| Field | Required | Default | Description |
|---|---|---|---|
| `ollamaUrl` | yes | – | Base URL of the Ollama instance, e.g. `http://localhost:11434` |
| `credentials` | no | `null` | Bearer token, only needed for a remote/secured Ollama instance |
| `presetFolder` | yes | – | Folder where preset JSON files are stored, e.g. `./presets` |
| `outputFolder` | yes | – | Folder for chat history exports and extracted prompt Markdown files, e.g. `./output` |
| `debugMode` | no | `false` | When `true`, shows a "Request sent to Ollama" panel with the exact payload sent (see [Detailed Requirements § 3](#3-configuration-file)) |

For local development, you can create a **`config.local.json`** next to `config.json` to override individual fields (e.g. `{"debugMode": true}`) without touching the committed file — it's git-ignored and only used on your machine.

### Run
```powershell
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```
Then open **http://127.0.0.1:8000/** in your browser.

## Docker / Podman

A [`Dockerfile`](Dockerfile) is provided. It always forces `debugMode` to `false` in the image, regardless of the committed `config.json` value — enable debug mode for a container only via a mounted `config.local.json` (see below).

`presetFolder` (`./presets`) and `outputFolder` (`./output`) resolve inside the container's `/app` working directory, so mount them as volumes to persist presets and chat/prompt output across container restarts and rebuilds.

Since `localhost` inside a container refers to the container itself, not your host machine, point `ollamaUrl` at your host's Ollama instance via a mounted `config.local.json` instead of editing the image's `config.json`.

### Pull the pre-built image from GitHub (GHCR)
Every push to `main` (and tags/PRs, see below) is built by [`.github/workflows/docker-build.yml`](.github/workflows/docker-build.yml) and published to the GitHub Container Registry — no local build required:
```powershell
docker pull ghcr.io/<owner>/<repo>:main
# or a specific version tag, e.g.
docker pull ghcr.io/<owner>/<repo>:v1.0.0
```
Replace `<owner>/<repo>` with this repository's path in **lowercase** (GHCR requires lowercase image names). Available tags mirror the branch/tag pushed (`main`, `v*` semver tags) plus a `sha-<commit>` tag for every build — see the "Packages" section of the GitHub repository page for the full list.

If the package is private, authenticate first: `docker login ghcr.io -u <your-github-username>` using a [personal access token](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) with `read:packages` scope (public packages need no login to pull). Then run it exactly as described under "Run the container" below, just replacing `ai-ollama-prompt-helper` with the pulled `ghcr.io/...` image name/tag.

### Build the image
```powershell
docker build -t ai-ollama-prompt-helper .
# or
podman build -t ai-ollama-prompt-helper .
```

### Create the volumes / override file
```powershell
mkdir presets, output -ErrorAction SilentlyContinue
@'
{ "ollamaUrl": "http://host.docker.internal:11434" }
'@ | Set-Content config.local.json
```

### Run the container

**Docker (Windows/macOS/Linux):**
```powershell
docker run -d --name ai-ollama-prompt-helper `
  -p 8000:8000 `
  -v ${PWD}/presets:/app/presets `
  -v ${PWD}/output:/app/output `
  -v ${PWD}/config.local.json:/app/config.local.json:ro `
  --add-host=host.docker.internal:host-gateway `
  ai-ollama-prompt-helper
```

**Podman (Linux, rootless):**
```bash
podman run -d --name ai-ollama-prompt-helper \
  -p 8000:8000 \
  -v ./presets:/app/presets:Z \
  -v ./output:/app/output:Z \
  -v ./config.local.json:/app/config.local.json:ro,Z \
  --add-host=host.docker.internal:host-gateway \
  ai-ollama-prompt-helper
```
The `:Z` suffix relabels the volumes for SELinux (common on Fedora/RHEL); omit it if not applicable. `--add-host=host.docker.internal:host-gateway` requires Podman 3.2+ — alternatively use `--network=host` on Linux to reach Ollama on the host's `localhost:11434` directly (less isolation, no port mapping needed).

Then open **http://localhost:8000/** in your browser. Container health can be checked at `/api/health` (also used by the image's built-in `HEALTHCHECK`).

### CI: building the image automatically
[`.github/workflows/docker-build.yml`](.github/workflows/docker-build.yml) runs the test suite and then builds the Docker image on every push/PR to `main`, pushing it to the GitHub Container Registry (`ghcr.io`) on non-PR events.

# Requirements
* easy to use
* can simply be used in browser
* uses ollama web api and langchain
* loads configuration from a json file
    * ollama url, credentials optional
    *  preset folder
    * output folders
* supports multiple presets, which can be simple selected/switched via dropdown
* loads presets from a json file
    * system prompt 
    * model
    * thinking (yes, no)
    * prompt identifier
* presets can be modified in the ui
* there is a "topic" text field where the user can specify what these prompts about. this will be used for teh prompt result markdown
* user has a fixed input field on the bottom
* user can use an image as additional input (multimodal model support)
* user chat messages and llm responses are showed in a scrollable chat history
* user can select with a checkbox each message he has send and which was returned by teh ai for being part of teh chat history or not (default true)
* there is an option to deseclet all messages
* there is an option to delet individual messages (dosent matter if from user or llm)
* there is an option to save and load a chat history (json)
* "thinking" of the lmm can be turned on and off as part of the preset setting
* "thinking" is showed differently than the response
* in the presets there can be a prompt identifier be configured
    * if there is a prompt identifier, detected prompts will be extracted in a markdown file (one file per topic)
    * the markdown will have for each prompt
        short description, type of prompt (video, image, text), prompt text, section for feedback 

# Detailed Requirements

> This section resolves ambiguities from the requirements above and documents the clarified, final scope. Assumptions are marked as such; everything else was confirmed by the user.

## 1. Purpose
The application is a **Prompt Workshop**: a chat UI where the user converses with a local LLM (via Ollama) to iteratively develop and refine prompts intended for use in other generative AI tools (image generators, video generators, text/LLM tools). Prompts recognized in the conversation are extracted into a per-topic Markdown library for later reuse.

## 2. Technology
* Web-based UI, runs locally, no specific framework mandated for frontend or backend (free choice of implementation).
* Uses the Ollama HTTP API for model inference.
* Uses LangChain for conversation memory and/or multi-step chains (not just a thin API wrapper).
* Single local user; no authentication/login, no multi-user/account separation.

## 3. Configuration File
A JSON configuration file provides:
* `ollamaUrl` – base URL of the Ollama instance.
* `credentials` – optional; only relevant if a remote/secured Ollama instance requires authentication (e.g. bearer token). For the default local, unauthenticated Ollama setup this stays empty.
* `presetFolder` – folder path where preset JSON files are loaded from.
* `outputFolder` – a single folder path used for all generated output (chat history exports and extracted prompt Markdown files). No per-topic subfolder structure is required by default.
* `debugMode` – optional, defaults to `false`. When `true`, the backend exposes the exact request payload sent to Ollama (system prompt, full message list, model/tuning parameters) via an SSE debug event, and the UI shows a "Request sent to Ollama" panel. Off by default so message content is never exposed unless explicitly enabled.
* `config.local.json` – optional, dev-only, git-ignored local override placed next to `config.json` in the same folder. Any field present in it (e.g. just `{"debugMode": true}`) overrides the corresponding field from `config.json`; fields not present fall back to `config.json`. Intended for local developer machine settings that must never be committed.

## 4. Presets
* Presets are loaded from JSON files in the configured preset folder.
* Each preset defines: `systemPrompt`, `model`, `thinking` (bool), `promptIdentifier`, and LLM tuning parameters `temperature`, `top_p`, `num_ctx` (all optional, falling back to Ollama's defaults when not set).
* Presets are fully manageable from the UI: the user can select/switch presets via dropdown, edit existing presets, and create new presets.
* Any change made in the UI (edit or create) is persisted back to the preset JSON file(s), not just kept for the current session.
* The `model` field in the preset editor is filled from a dropdown of models auto-discovered from the Ollama instance (e.g. via its model-list endpoint) instead of free text entry, to avoid typos/invalid model names.
* The tuning parameters (`temperature`, `top_p`, `num_ctx`) can additionally be overridden temporarily within an ongoing chat (e.g. via a collapsible "tuning" panel), without modifying the underlying preset file — the preset always remains the source of the default values.

## 5. Topic Field
* The "Topic" is a free text field that can be changed at any point during an ongoing chat (not fixed once at session start).
* The current topic value determines the target Markdown file for prompt extraction: when the topic changes, subsequently extracted prompts are written to the Markdown file matching the new topic (one file per topic, created if it does not exist yet).

## 6. Chat Interaction
* Fixed input field at the bottom of the UI for user messages.
* Multimodal input: the user can attach an image alongside a text message for models that support image input.
* Chat messages (user and LLM) are displayed in a scrollable chat history view.
* A "Regenerate" action on the last assistant message resends the same context to the model to produce an alternative response, without requiring the user to retype their last message.

## 7. Chat Context Control (Checkboxes)
* Every message (user or LLM) has a checkbox, checked by default.
* The checkbox state controls whether that message is included as context sent to the LLM on the next request — this is a functional context control, not merely a display/export filter.
* "Deselect all" action unchecks every message at once.
* Individual messages can be deleted regardless of sender (user or LLM). Deleting a message shows a brief "Undo" option (e.g. toast notification) to restore it before it is permanently removed.
* The full chat (including message content and checkbox/inclusion state) can be saved to and loaded from a JSON file.
* The current chat is additionally autosaved periodically (and/or on every new message) to a dedicated autosave file, independent of the manual save/load action, to prevent data loss on crash or reload.
* The UI shows an indicator of the current context size (e.g. number of included messages and an approximate token estimate) so the user can see when the context sent to the LLM grows large.

## 8. Thinking Mode
* "Thinking" is a per-preset setting (on/off) reflecting whether the selected model's reasoning/thinking output is requested and shown.
* When enabled, the model's "thinking" output is visually distinguished from the final response (e.g. separate/collapsible section), not mixed into the same message bubble.

## 9. Prompt Extraction & Markdown Export
* Detection mechanism: when a preset has a `promptIdentifier` configured, the system prompt instructs the model to wrap generated prompts in a defined, machine-parseable markup (e.g. a dedicated tag or fenced code block with a type attribute, such as `<prompt type="image">...</prompt>`). The UI parses the LLM response for this markup to detect prompts automatically.
* Prompt type (video/image/text): specified by the user, analogous to the topic field. The UI may offer a pre-selected default type (e.g. derived from the preset) which the user can change or extend.
* Detected prompts are appended to the Markdown file for the currently active topic. Each entry contains:
  * short description
  * prompt type (video/image/text)
  * prompt text
  * an empty "Feedback" section — this is only a placeholder for later manual editing outside the tool; the application does not populate or manage feedback content itself.
* Each extracted prompt entry (in the chat message and in the prompt library view) offers a one-click "copy to clipboard" action that copies the prompt text only (not description/type/feedback) for direct reuse in other tools.

## 10. Assumptions
> **Assumption:** No specific persistence beyond flat JSON files (presets, config, chat history exports, Markdown output) is required — no database.
> **Assumption:** No non-functional requirements (performance, scalability, security hardening) beyond basic local single-user usage are in scope, consistent with the "vibe coded" nature of the project.
> **Assumption:** The token estimate for the context-size indicator (point 7) is an approximation, since exact tokenization depends on the model in use and is not necessarily available client-side.
