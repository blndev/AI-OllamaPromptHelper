# Changelog

### v1.9.0
* The interface now follows the browser language for English, Spanish, German, Italian or French, with English as the fallback. Translations are stored in separate JSON files.

### v1.8.0
* Added a chat-toolbar button that jumps to the next bookmarked message and wraps back to the first bookmark.
* Assistant messages can now deselect all earlier messages from the context.
* Starting a new chat now asks for confirmation, clears the active conversation and composer, and saves the empty chat state without deleting named histories.
* The chat selection control switches between selecting all messages and deselecting all selected messages.

### v1.7.0
* Before generating a reply, the app automatically deselects the oldest messages when the estimated context exceeds `num_ctx` minus an output reserve of 110% of the average size of the latest three assistant answers. The newest checked user message is retained.

### v1.6.0
* Chat messages from either the user or assistant can be bookmarked, highlighted, and retained in saved chat histories.

### v1.5.0
* Chat and thinking responses now render common Markdown formatting while the editor continues to show and preserve the raw source text.
* Thinking responses can now be edited separately from the assistant's final answer, and are preserved in saved chat histories.

### v1.4.0
* The Topic Prompt History sidebar can now be hidden or shown from the chat controls, with the preference retained across page reloads.
* The sidebar stays fixed within the desktop viewport and its prompt entries scroll independently from chat history.

### v1.3.0
* Chat messages from both the user and assistant now open in a spacious editor dialog; image attachments can be added, replaced or removed before saving.
* Saving edited user messages can still resend the revised message and its updated images.
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