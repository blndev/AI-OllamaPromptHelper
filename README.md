# AI-OllamaPromptHelper
Simple Web based UI which uses Ollama to support in Prompt generation

Vibe Coded 

## Features

**AI-OllamaPromptHelper** turns your local [Ollama](https://ollama.com) instance into a full-blown **prompt engineering workshop** — chat your way to better prompts, then reuse them anywhere.

* **Chat-based prompt workshop** — iteratively refine prompts for image, video and text generators through a natural conversation with your local LLM
* **Fully editable presets** — switch, create and edit system prompt / model / tuning presets right from the UI, no config file editing required
* **Multimodal input** — attach images by drag and drop or paste them from the clipboard for vision-capable models
* **Visible "thinking"** — reasoning output is shown separately from the final answer when a model supports it
* **Fine-grained context control** — check/uncheck individual messages to control exactly what's sent to the model, with a live context-size indicator
* **Automatic prompt extraction** — recognized prompts are pulled out of the conversation and collected into per-topic Markdown libraries, ready to copy with one click
* **Autosave & manual save/load** — never lose a chat session, with undo for accidental deletions
* **Local-first & private** — everything runs on your machine (or your own server); no data leaves your network unless you point it at a remote Ollama instance
* **Ready-to-run container image** — pull it from GHCR and get going with Docker/Podman/Docker Compose in minutes


![AI-OllamaPromptHelper screenshot](assets/screenshot.png)


## Best Practices

* **Treat presets as suggestions** — adjust the system prompt, model and tuning settings to fit your workflow and desired result. The included presets are examples, not fixed rules. You can also use a preset for a different task by replacing its instructions.
* **Choose a preset that fits the target generator** — prompt style differs between Krea 2, Qwen-Image, FLUX.1, Stable Diffusion and MiniMax H3. The wrong preset may work, but it will not use the target generator well.
* **Describe the output format you need** — FLUX.1, Krea 2 and Qwen-Image create three image variants. LTX-2 and MiniMax H3 create one production prompt. You can ask for a different number of results or change what should vary. For example:
  ```text
  Create exactly three clearly different variants for the same scene.
  Keep the subject, number of people and portrait orientation unchanged
  in all variants. Vary only the camera angle, lighting and visual style.
  Give each variant a short German description and one ready-to-use
  image prompt in English.
  ```
* **Separate fixed requirements from creative details** — keep every clear user requirement in every result unless you limit it to one result. Let the model vary perspective, composition, light, materials or mood. Do not let it invent brands, people, logos or places. For example:
  ```text
  Create three variants of a red bicycle in front of an old brick wall.
  Keep the red bicycle, brick wall, landscape orientation and morning
  atmosphere in every variant. Vary only the focal length, camera
  position, composition and character of the light. Invent no brand
  and add no extra text.
  ```
* **Set the language for explanations and prompts separately** — the presets usually use German for the conversation and English for the image or video prompt. Tell the model to keep visible text, dialogue and names unchanged when needed. For example:
  ```text
  Answer in German. Write the short explanation and variant description
  in German. Write the actual FLUX.1 image prompt in English. Preserve
  the visible text "Sommermarkt am See" exactly as written.
  ```
* **Try a different workflow when the bundled presets do not fit** — the system prompt can define a different image or video task, such as one product image, a short tutorial animation or a technical illustration. For example:
  ```text
  You are an e-commerce product photographer. Turn the user's product
  facts into one image prompt for a clean catalogue photo. Use a white
  background, soft shadow and front-facing camera. Show the whole product
  and keep its colours and shape accurate. Do not add a logo, label or
  feature that the user did not provide. Return only the image prompt.
  ```
  ```text
  You are a short-form tutorial video director. Turn the user's topic
  into a 20-second vertical video with four clear shots that explain one
  simple process. For each shot, give the action, camera movement, on-screen
  text and duration. Use plain language and keep the same object and setting
  across all shots. Return a compact shot list, not three creative variants.
  ```
  ```text
  You create technical cutaway illustrations. Turn the user's description
  into one image prompt for a labelled cross-section of the object. Show the
  inside parts in their real positions, use a clean background and keep all
  labels short and readable. Do not invent parts or labels. Return the image
  prompt in English and a one-sentence explanation in German.
  ```
* **Say exactly what to take from a reference image** — specify whether to keep the identity, clothes, colours, light, composition or only one visual element. Use a vision-capable Ollama model and say what should change. For example:
  ```text
  Use the attached image as a reference for the same character.
  Preserve the facial features, hairstyle, clothing and dark-red
  colour palette. Change the environment, camera angle and lighting
  in the three variants. Keep the character recognisable, but do not
  identify or describe a real person.
  ```
* **Use images only with a vision-capable model** — select a multimodal model such as `qwen2.5vl`, `llava` or `gemma3` before you attach an image. A text-only model cannot inspect the image and may guess its content.
* **Say what should be there, not only what to avoid** — image generators usually follow positive instructions better than phrases such as "no X". Negative prompts are mainly useful with the Stable Diffusion preset.
* **Set the Topic before you generate** — the Topic field decides which Markdown file the extracted prompts land in. Change it whenever you switch subject so your prompt library stays sorted.
* **Prune the context with the message checkboxes** — uncheck earlier turns once a direction is settled. It keeps the context small and fast, and stops the model from mixing abandoned ideas back in.


## Getting Started

### Prerequisites
* Python 3.12+ (a virtual environment is recommended)
* [Ollama](https://ollama.com) installed and running locally (or reachable over the network), with at least one model pulled (e.g. `ollama pull llama3`)

### Download & Install

**Windows (PowerShell):**
```powershell
git clone https://github.com/blndev/ai-ollamaprompthelper.git
cd ai-ollamaprompthelper

python -m venv .venv
.\.venv\Scripts\pip.exe install -r requirements.txt
```

**Linux / macOS:**
```bash
git clone https://github.com/blndev/ai-ollamaprompthelper.git
cd ai-ollamaprompthelper

python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```
*(No manual activation is required when invoking the virtual environment's executables directly).*

### Configure
The app is configured via [config.json](config.json) in the project root:

| Field | Required | Default | Description |
|---|---|---|---|
| `ollamaUrl` | yes | – | Base URL of the Ollama instance, e.g. `http://localhost:11434` (or `http://host.docker.internal:11434` for containers) |
| `credentials` | no | `null` | Bearer token, only needed for a remote/secured Ollama instance |
| `presetFolder` | yes | – | Folder where preset JSON files are stored, e.g. `./presets` |
| `outputFolder` | yes | – | Folder for chat history exports and extracted prompt Markdown files, e.g. `./output` |
| `debugMode` | no | `false` | When `true`, shows a "Request sent to Ollama" panel with the exact payload sent (see [Detailed Requirements § 3](#3-configuration-file)) |

For local development or container overrides, you can create a **`config.local.json`** next to [config.json](config.json) to override individual fields (e.g. `{"ollamaUrl": "http://host.docker.internal:11434", "debugMode": true}`) without touching the committed file — it is git-ignored and overlaid automatically. You can also override the Ollama URL via the `OLLAMA_URL` environment variable.

### Run

**Windows (PowerShell):**
```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

**Linux / macOS / Git Bash:**
```bash
./run.sh
```
*(The [run.sh](run.sh) script automatically detects and executes the virtual environment in `.venv` without needing `source .venv/bin/activate` beforehand).*

Then open **http://127.0.0.1:8000/** in your browser.

## Docker / Podman

A [Dockerfile](Dockerfile) is provided. It builds a lightweight container running Python 3.13, creating a non-root user `appuser` and enforcing `debugMode: false` in the base image.

`presetFolder` (`./presets`) and `outputFolder` (`./output`) resolve inside the container's `/app` working directory, so mount them as volumes to persist presets and chat/prompt output across container restarts and rebuilds.

Mounting an *empty* host folder over `/app/presets` would otherwise hide the bundled example presets that ship inside the image, leaving you with zero presets on first start. To avoid that, the image's [entrypoint.sh](entrypoint.sh) copies the bundled example presets into `/app/presets` on container start, but **only if that folder is still empty** — it never overwrites presets you already created/edited or have previously seeded. So the first `docker run`/`podman run`/`docker compose up` against the empty `./presets` folder created in Step 1 below automatically populates it with the example presets; later restarts leave your (now non-empty) preset folder untouched.

### Connecting the container to a local host Ollama server (non-container)

When Ollama runs directly on your host machine (not in Docker), keep two crucial points in mind:

1. **Host Network Binding (`OLLAMA_HOST`)**:
   By default, Ollama on the host listens only on `127.0.0.1:11434`. Requests from inside a Docker container arrive via the Docker bridge network interface (e.g. `172.17.0.1`), not `127.0.0.1`. Therefore, the host Ollama server must be configured to bind to `0.0.0.0`:
   * **Windows**: Set user/system environment variable `OLLAMA_HOST=0.0.0.0` and restart Ollama from the system tray.
   * **Linux (systemd)**: Run `sudo systemctl edit ollama.service` and add:
     ```ini
     [Service]
     Environment="OLLAMA_HOST=0.0.0.0"
     ```
     then run `sudo systemctl daemon-reload && sudo systemctl restart ollama`.
   * **macOS**: Run `launchctl setenv OLLAMA_HOST "0.0.0.0"` and restart the Ollama app.

2. **Container-to-Host Address (`host.docker.internal`)**:
   Inside the container, point `ollamaUrl` to `http://host.docker.internal:11434` (via `config.local.json` or `-e OLLAMA_URL=http://host.docker.internal:11434`).
   * On **Windows and macOS (Docker Desktop)**, `host.docker.internal` resolves automatically.
   * On **Linux (Docker Engine / Podman)**, pass `--add-host=host.docker.internal:host-gateway` (or use `extra_hosts` in compose).

All commands below use the pre-built GHCR image tag `ghcr.io/blndev/ai-ollamaprompthelper:latest` directly, so `docker run`/`podman run` pull it automatically if it isn't present locally yet — no separate `pull` step is required. Replace `:latest` with a specific version tag (e.g. `:v1.2.0`) to pin a release.

If you'd rather build the image yourself instead of using GHCR, build it under the *same* tag so the run commands below don't need to change:
```bash
docker build -t ghcr.io/blndev/ai-ollamaprompthelper:latest .
# or
podman build -t ghcr.io/blndev/ai-ollamaprompthelper:latest .
```

### Step 1 — Create the folders and `config.local.json`

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path presets, output | Out-Null
@'
{ "ollamaUrl": "http://host.docker.internal:11434" }
'@ | Set-Content -Encoding utf8 config.local.json
```

**Linux / macOS (bash/zsh):**
```bash
mkdir -p presets output
cat > config.local.json <<'EOF'
{ "ollamaUrl": "http://host.docker.internal:11434" }
EOF
```

### Step 2 — Run the container against host Ollama

**Docker (Windows, PowerShell):**
```powershell
docker run -d --name ai-ollama-prompt-helper `
  -p 8000:8000 `
  -v ${PWD}/presets:/app/presets `
  -v ${PWD}/output:/app/output `
  -v ${PWD}/config.local.json:/app/config.local.json:ro `
  --add-host=host.docker.internal:host-gateway `
  ghcr.io/blndev/ai-ollamaprompthelper:latest
```

**Docker (Linux / macOS, bash):**
```bash
docker run -d --name ai-ollama-prompt-helper \
  -p 8000:8000 \
  -v "$(pwd)/presets:/app/presets" \
  -v "$(pwd)/output:/app/output" \
  -v "$(pwd)/config.local.json:/app/config.local.json:ro" \
  --add-host=host.docker.internal:host-gateway \
  ghcr.io/blndev/ai-ollamaprompthelper:latest
```
*(Alternatively, you can pass `-e OLLAMA_URL=http://host.docker.internal:11434` instead of mounting `config.local.json`.)* The container runs as the non-root `appuser` (uid `1000`); if `docker run` reports permission errors writing to `presets`/`output` on Linux, align ownership with `sudo chown -R 1000:1000 presets output`.

**Podman (Linux, rootless):**
```bash
podman run -d --name ai-ollama-prompt-helper \
  --userns=keep-id \
  -p 8000:8000 \
  -v ./presets:/app/presets:Z \
  -v ./output:/app/output:Z \
  -v ./config.local.json:/app/config.local.json:ro,Z \
  --add-host=host.docker.internal:host-gateway \
  ghcr.io/blndev/ai-ollamaprompthelper:latest
```
`--userns=keep-id` is required here: without it, Podman's rootless UID remapping makes the container's `appuser` (uid `1000`) resolve to a *different*, unwritable UID on the host, so the app fails to write presets/chat history even though the bind mounts look correct. `--userns=keep-id` maps `appuser` back to your current host user, which already owns the `presets`/`output` folders created in Step 1. The `:Z` suffix relabels the volumes for SELinux (common on Fedora/RHEL); omit it if not applicable. `--add-host=host.docker.internal:host-gateway` requires Podman 3.2+ — alternatively use `--network=host` on Linux to reach Ollama on the host's `localhost:11434` directly (less isolation, no port mapping needed, and `-p`/`--add-host` are then unnecessary).

Then open **http://localhost:8000/** in your browser (or **http://127.0.0.1:8000/** with `--network=host`). Container health can be checked at `/api/health` (also used by the image's built-in `HEALTHCHECK`), e.g. `docker logs ai-ollama-prompt-helper` / `podman logs ai-ollama-prompt-helper` if the container exits immediately.

### Docker Compose (app + Ollama)
A [docker-compose.yml](docker-compose.yml) is provided that starts both the app (pulled from GHCR as `ghcr.io/blndev/ai-ollamaprompthelper:latest`) and an `ollama` container, with a named volume so pulled models persist across restarts.

**Windows (PowerShell):**
```powershell
# 1. Create the local folders used by the app container
New-Item -ItemType Directory -Force -Path presets, output | Out-Null

# 2. Point the app at the ollama service from the same compose network
@'
{ "ollamaUrl": "http://ollama:11434" }
'@ | Set-Content -Encoding utf8 config.local.json

# 3. Start both containers
docker compose up -d
```

**Linux / macOS (bash):**
```bash
# 1. Create the local folders used by the app container
mkdir -p presets output

# 2. Point the app at the ollama service from the same compose network
cat > config.local.json <<'EOF'
{ "ollamaUrl": "http://ollama:11434" }
EOF

# 3. Start both containers
docker compose up -d
```
As with plain `docker run` above, the app container writes to `presets`/`output` as uid `1000`; if `docker compose up` logs permission errors on Linux, run `sudo chown -R 1000:1000 presets output`. If you use `podman-compose` instead of Docker Compose, add `userns_mode: "keep-id"` under the `app` service in [docker-compose.yml](docker-compose.yml) for the same reason described in the Podman section above.

Once both containers are healthy, open **http://localhost:8000/** in your browser. Pull a model into the `ollama` container so it's available to the app, e.g.:
```powershell
docker compose exec ollama ollama pull llama3
```
Models are stored in the `ollama-models` named volume, so they survive `docker compose down` (use `docker compose down -v` to also remove them). GPU acceleration can be enabled by uncommenting the `deploy.resources` block for the `ollama` service in [docker-compose.yml](docker-compose.yml) (requires the NVIDIA Container Toolkit).

### CI: building the image automatically
[.github/workflows/docker-build.yml](.github/workflows/docker-build.yml) runs the test suite and then builds the Docker image on every push/PR to `main`, pushing it to the GitHub Container Registry (`ghcr.io`) on non-PR events.

## Running Tests
The project uses `pytest` with FastAPI's `TestClient`:

**Windows (PowerShell):**
```powershell
.\.venv\Scripts\python.exe -m pytest tests/ -v
```

**Linux / macOS:**
```bash
.venv/bin/python -m pytest tests/ -v
# or
.venv/bin/pytest tests/ -v
```
The same test suite runs automatically in CI (see [.github/workflows/docker-build.yml](.github/workflows/docker-build.yml)) before an image is built/published.

## Contributing
Contributions, bug reports and feature ideas are welcome — please open an issue or pull request. Before submitting a PR:
* Make sure `pytest tests/ -v` passes.
* Keep changes focused and describe the motivation/behavior change in the PR description.
* For larger changes, consider opening an issue first to discuss the approach.

## License
This project is licensed under the [MIT License](LICENSE).

## Version 2 Roadmap

### Prompt library: deletable entries and retroactive topic assignment

* **Deletable entries** — individual entries in the extracted-prompt Markdown library (short description, type, prompt text, feedback section) can currently only be removed by hand-editing the Markdown file (see § 9). Version 2 should add a "Delete" action per entry in the prompt library UI, backed by a new endpoint that removes just that `---`-separated segment from the topic's Markdown file — reusing the same segment-based parsing as `read_library` so neighboring entries are never corrupted.
* **Retroactive topic assignment** — today, changing the Topic field only affects *future* extractions; prompts already extracted during the current chat stay in whatever topic file was active at the time (see § 5). When the user sets/changes the Topic partway through an existing chat (i.e. prompts were already extracted under a different or empty topic), the UI should ask whether the prompts extracted so far in this chat should be moved to the newly chosen topic's Markdown file, or whether the new topic should only apply to prompts extracted from now on. Moving existing entries relocates the corresponding `---` segments from the old topic file into the new one; declining leaves already-extracted entries where they are.

### Preset quality: reduce repetitive follow-up suggestions

Several presets currently tend to end their answer with the same recurring list of "next steps"/follow-up ideas (e.g. always the same five bullet points), regardless of how the conversation actually developed. Version 2 should revise the affected preset system prompts to:

* explicitly instruct the model to derive follow-up suggestions from the concrete conversation state (what was just discussed, what is still open) instead of falling back to a generic, memorized list;
* explicitly forbid repeating a suggestion that was already made earlier in the same chat (the injected instruction can reference the existing conversation history for this);
* vary the *number* of suggestions instead of always proposing a fixed count, and omit the suggestion list entirely once there is nothing meaningfully new to propose.

This is a prompt-engineering fix in the bundled presets' `systemPrompt`s (and, where used, the `injectPromptTemplate` boilerplate in `chat_service.py`), not a new feature/endpoint — but it should be validated the same way as other preset changes: manual/subagent-simulated review across a multi-turn conversation per affected preset, checking that suggestions actually change and shrink/disappear as a topic is exhausted.

### Multi-pass prompt refinement

Version 2 should optionally process refinement presets as a controlled pipeline instead of producing the final answer in a single model call:

1. **Analysis pass** — a dedicated analyst system prompt examines the original request and attached reference images. It identifies the input language, intended style and medium, mandatory details, protected values such as names or visible text, ambiguities, and useful areas for expansion. It must not write the final prompt.
2. **Refinement pass** — a separate refiner system prompt receives the unchanged original request plus the structured analysis. It intensively expands the prompt while preserving its language, style, subject identity, explicit constraints, and requested output type.
3. **Validation pass** — an independent validator agent receives the original request, analysis, and candidate answer. It checks the result against the criteria below and returns a structured verdict rather than rewriting the answer immediately.
4. **Optional correction pass** — when validation fails, the refiner receives only the validator's concrete findings and produces one corrected answer. The pipeline validates that revision once more but performs no further automatic revisions, preventing loops and unbounded model usage.

The analysis and validator use independent system prompts with narrowly defined responsibilities. They may use the same Ollama model as the refiner or separately configured models. Intermediate analysis is internal by default; debug mode may expose it for troubleshooting. Only the approved or final corrected answer is added to chat history and prompt libraries.

### Validator agent

The validator should return machine-readable output containing an `approved` boolean, a list of findings, and correction instructions. Each finding should identify a criterion, severity, and concise evidence from the candidate answer. Validation covers:

* input language is preserved in the refined prompt;
* requested artistic style and medium are preserved rather than replaced;
* every explicit user requirement remains present and no requirement is contradicted;
* names, quoted text, subject count, identity-defining traits, and other protected values remain unchanged;
* additions are compatible with the original intent and unsupported brands, real people, locations, or text are not invented;
* suggestions such as clothing, poses, environment, lighting, or composition are either compatible refinements or clearly marked as optional alternatives;
* required `<prompt>` markup is complete and valid when prompt extraction is enabled;
* the answer follows the requested response structure and contains a usable final prompt.

The validator is advisory for ordinary chat presets and enforceable for multi-pass refinement presets. Infrastructure or parsing failures must be surfaced to the user; they must not silently mark an unchecked response as approved.

### Proposed preset configuration

The exact schema remains an implementation decision, but the intended configuration surface is:

```json
{
  "multiPassRefinement": true,
  "analysisSystemPrompt": "...",
  "systemPrompt": "...",
  "validationEnabled": true,
  "validationSystemPrompt": "...",
  "analysisModel": "qwen3:8b",
  "validationModel": "qwen3:8b",
  "maxRevisionAttempts": 1
}
```

Existing presets remain single-pass unless `multiPassRefinement` is explicitly enabled. Missing analysis or validation models fall back to the preset's main model. Version 2 should expose the mode, prompts, models, and validation result in the preset editor without making the default single-pass workflow more complicated.

### Streaming and user experience

During a multi-pass request, the UI should show distinct status phases: `Analyzing`, `Refining`, `Validating`, and, when necessary, `Correcting`. The candidate answer should not stream into the permanent chat message before validation because a rejected draft would otherwise be visible and could be autosaved or extracted. The final answer may be streamed after approval, or displayed atomically when buffering is required by the validation flow.

### Layout: independently scrollable prompt library

The extracted-prompt library panel currently scrolls together with the page/chat history. Version 2 should give the prompt library its own scroll container (fixed/constrained height, internal overflow) so scrolling through a long chat history does not move the prompt library out of view, and vice versa — scrolling the prompt library must not scroll the chat. Both panels keep their own scroll position independently when switching topics or receiving new messages/extracted prompts.

### Acceptance criteria

* Single-pass presets behave exactly as in version 1.
* Multi-pass presets use separate analyst and refiner instructions and never replace the original request with the analysis.
* Validation runs before chat persistence and Markdown prompt extraction.
* A failed validation can trigger at most the configured number of correction attempts.
* The final validation result is available to the frontend and stored with saved chat history for traceability.
* Cancellation stops the active pass and prevents subsequent passes from starting.
* Automated tests cover successful approval, correction after rejection, repeated rejection, malformed validator output, model/network failure, cancellation, and fallback model selection.
* The chat history and the prompt library panel each scroll independently, with their own scrollbar and scroll position, regardless of content length in the other panel.

## Changelog

### v1.2.0
* Multiple images can now be attached to a single chat message (previously limited to one).
* Images are attached via drag & drop only (the "Browse..." file picker was removed); each attached image shows as a thumbnail that can be removed individually before sending.
* The preset editor panel is now collapsed by default on startup, and its header is styled to make expanding/collapsing it more discoverable.
* Added the "Kreativ-Geschichten-Werkstatt" preset: an interactive co-writer that develops a story with the user turn by turn and derives standalone image/video/music prompt ideas from it after every passage.
* The Topic field now offers existing topics (from prior prompt extractions) as autocomplete suggestions via a new `GET /api/prompts/topics` endpoint, instead of always starting from a blank field.
* Hardened the Markdown prompt library parser (`read_library`) against manual edits: entries are now parsed per `---`-separated segment, so free-form notes, extra headings or code blocks added by hand between two entries no longer corrupt or swallow the following entry.
* Clicking an attached image thumbnail in the chat history now opens it full-size in a lightbox overlay. Dropping image(s) now also works anywhere over the message input area, not just directly on the dropzone hint.
* "Save history" now defaults to the name of the currently loaded/last-saved history, so pressing Enter/OK updates that same file instead of always requiring a new name — until "New chat" is clicked, which resets it back to asking for a fresh name.
* Added a dark mode toggle in the header (persisted in the browser via `localStorage`, defaulting to the OS color-scheme preference).
* Any chat message (user or assistant) can now be edited in place via a new "Edit" button. Editing a user message additionally offers "Save & Resend", which drops every message after it and asks the model for a fresh reply based on the edited text.

### v1.2.1
* Rewrote the Docker/Podman `run` instructions for correct, copy-pasteable Linux/macOS commands (previously Windows-only in places) and switched them to reference the published `ghcr.io/blndev/ai-ollamaprompthelper` image directly; documented the `--userns=keep-id` fix needed for rootless Podman to avoid presets/output permission errors.
* The container image now bundles the example presets (previously not copied into the image at all) and its new [entrypoint.sh](entrypoint.sh) seeds an empty, bind-mounted `presets/` folder with them on first start, so mounting `./presets` as a volume no longer leaves the app with zero presets.

### v1.1.0
* Added `docker-compose.yml` to start the app together with an `ollama` container (with a named volume for pulled models).
* Documented running the app via [`run.sh`](run.sh) on Linux/macOS.
* Added Features, Running Tests, Contributing and License sections to the README.
* "New chat" now also resets the "load history" dropdown, so it no longer keeps pointing at a chat that was just cleared.
* Removed the "Prompt type" dropdown from the chat controls — it had no effect on the model or extraction; the extracted prompt type is decided by the model via the `<prompt type="...">` markup.

### v1.0.0
* Initial release: chat-based prompt workshop with presets, multimodal input, thinking mode, chat history management and Markdown prompt extraction.

# Core Requirements
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

## Detailed Requirements

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
* Each preset defines: `systemPrompt`, `model`, `thinking` (bool), `injectPromptTemplate` (bool), and LLM tuning parameters `temperature`, `top_p`, `num_ctx` (all optional, falling back to Ollama's defaults when not set).
* Presets are fully manageable from the UI: the user can select/switch presets via dropdown, edit existing presets, and create new presets.
* Any change made in the UI (edit or create) is persisted back to the preset JSON file(s), not just kept for the current session.
* The `model` field in the preset editor is filled from a dropdown of models auto-discovered from the Ollama instance (e.g. via its model-list endpoint) instead of free text entry, to avoid typos/invalid model names.
* The tuning parameters (`temperature`, `top_p`, `num_ctx`) can additionally be overridden temporarily within an ongoing chat (e.g. via a collapsible "tuning" panel), without modifying the underlying preset file — the preset always remains the source of the default values.
* Saving a preset (create or update) gives clear visual confirmation (e.g. a green, briefly highlighted status message), so it's obvious the save succeeded without having to guess.
* The Presets area is collapsible; the name of the currently selected preset stays visible next to the section heading even while the section is collapsed.
* The System prompt editor is at least 15 rows tall so multi-paragraph prompts stay readable while editing; an "Insert example system prompt" helper fills in a ready-to-use example.
* The `injectPromptTemplate` field is a plain checkbox ("Inject prompt template"): when checked, the app automatically appends a ready-made extraction instruction to the system prompt behind the scenes — the user does not have to write the `<prompt>` markup instruction into their System prompt themselves. It was originally a free-text "prompt identifier" field, but only its truthiness was ever used, so a checkbox is clearer and less misleading than a text input.

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

### 7a. "New chat", overwriting and deleting saved histories
* **New chat** only clears the in-memory conversation (messages, topic, prompt library view) in the browser. It does **not** delete or modify any file on disk — neither a named save nor the autosave slot. The "load history" dropdown is also reset to its empty placeholder so it no longer points at a chat that is no longer on screen.
* **Autosave** runs on a fixed timer (every 30s) and after every new message, always into one single reserved file (`_autosave.json` under `<outputFolder>/chats/`), completely independent of the "load history" dropdown selection. Starting a new chat and then waiting/sending a message overwrites `_autosave.json` with the (now empty/new) conversation — this is expected and does **not** touch any named save.
* **Save history** always asks for a name (a browser prompt) and writes `<outputFolder>/chats/<slugified-name>.json`. Saving again under a name that already exists **silently overwrites** that file — there is currently no confirmation dialog, so double-check the name before saving if you want to keep the previous version.
* **Load** reads the selected named file and replaces the current in-memory conversation; it does not affect any file on disk.
* **Deleting** a saved history is not exposed in the UI yet — remove the corresponding file directly from `<outputFolder>/chats/` (e.g. `output/chats/my-chat.json`) to delete it; it will then disappear from the dropdown the next time the list is refreshed (e.g. after a page reload).

## 8. Thinking Mode
* "Thinking" is a per-preset setting (on/off) reflecting whether the selected model's reasoning/thinking output is requested and shown.
* When enabled, the model's "thinking" output is visually distinguished from the final response (e.g. separate/collapsible section, rendered in italics), not mixed into the same message bubble.

## 9. Prompt Extraction & Markdown Export
* Detection mechanism: when a preset has "Inject prompt template" (`injectPromptTemplate`) checked, the system prompt instructs the model to wrap generated prompts in a defined, machine-parseable markup (e.g. a dedicated tag or fenced code block with a type attribute, such as `<prompt type="image">...</prompt>`). The UI parses the LLM response for this markup to detect prompts automatically.
* Prompt type (video/image/text): decided entirely by the model itself via the `type="..."` attribute it writes in the `<prompt type="..." description="...">` markup (see the injected instruction in `chat_service.py`). There used to be a "Prompt type" dropdown in the UI, but it had no effect on the model or extraction (it only round-tripped through the chat history JSON), so it was removed.
* Detected prompts are appended to the Markdown file for the currently active topic. Each entry contains:
  * short description
  * prompt type (video/image/text)
  * prompt text
  * an empty "Feedback" section — this is only a placeholder for later manual editing outside the tool; the application does not populate or manage feedback content itself.
* Each extracted prompt entry (in the chat message and in the prompt library view) offers a one-click "copy to clipboard" action that copies the prompt text only (not description/type/feedback) for direct reuse in other tools, with visual confirmation (e.g. the button briefly changes to "✅ Copied!") so it's clear the copy actually happened.

## 10. Assumptions
> **Assumption:** No specific persistence beyond flat JSON files (presets, config, chat history exports, Markdown output) is required — no database.
> **Assumption:** No non-functional requirements (performance, scalability, security hardening) beyond basic local single-user usage are in scope, consistent with the "vibe coded" nature of the project.
> **Assumption:** The token estimate for the context-size indicator (point 7) is an approximation, since exact tokenization depends on the model in use and is not necessarily available client-side.
