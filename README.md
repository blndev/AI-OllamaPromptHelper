# AI-OllamaPromptHelper
Simple Web based UI which uses Ollama to support in Prompt generation

Vibe Coded 

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
