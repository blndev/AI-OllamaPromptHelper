// Minimal preset editor: list/select/create/update/delete presets, model
// dropdown auto-discovered from /api/models (see README.md sections 4/5).
console.log("AI Ollama Prompt Helper frontend loaded");

// --- Dark mode: persisted in localStorage, defaults to the OS preference ---
const THEME_STORAGE_KEY = "theme";
const themeToggleButton = document.getElementById("theme-toggle");

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    themeToggleButton.textContent = "☀️ Light mode";
  } else {
    document.documentElement.removeAttribute("data-theme");
    themeToggleButton.textContent = "🌙 Dark mode";
  }
}

function initTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(stored ?? (prefersDark ? "dark" : "light"));
}

themeToggleButton.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const nextTheme = isDark ? "light" : "dark";
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
});

initTheme();

const presetSelect = document.getElementById("preset-select");
const presetModel = document.getElementById("preset-model");
const presetForm = document.getElementById("preset-form");
const presetStatus = document.getElementById("preset-status");

let presets = [];
let selectedId = null;
// Model requested by the selected preset; re-applied once /api/models answers,
// since models and presets are loaded in parallel.
let desiredModel = "";
// Sensible starting values for a new preset (README.md section 4: optional tuning fields).
const DEFAULT_TUNING = { temperature: 0.8, top_p: 0.9, num_ctx: 4096 };
// Shown via the "Insert example system prompt" button, pairs well with the
// "Inject prompt template" checkbox (see README.md section 9).
const EXAMPLE_SYSTEM_PROMPT =
  "You are a creative assistant that helps the user brainstorm and refine prompts " +
  "for AI image, video and text generators. Ask a clarifying question if the topic " +
  "is vague, otherwise suggest 2-3 concrete prompt variations for the user's topic.";

document.getElementById("preset-systemPrompt-example").addEventListener("click", () => {
  fieldEl("systemPrompt").value = EXAMPLE_SYSTEM_PROMPT;
  markUnsaved();
});

function setStatus(message, variant = null) {
  presetStatus.textContent = message;
  presetStatus.classList.toggle("status-text--error", variant === "error");
  presetStatus.classList.toggle("status-text--success", variant === "success");
  if (variant === "success") {
    // Brief flash so a save is noticeable even if you're not looking at the
    // status line, not just a quiet color/text change.
    presetStatus.classList.remove("status-text--flash");
    // Force a reflow so the animation restarts on consecutive saves.
    void presetStatus.offsetWidth;
    presetStatus.classList.add("status-text--flash");
  }
}

function updatePresetSummaryName() {
  const current = presets.find((p) => p.id === selectedId);
  document.getElementById("preset-summary-name").textContent = current ? ` — ${current.name}` : "";
}

function fieldEl(name) {
  return document.getElementById(`preset-${name}`);
}

function markUnsaved() {
  setStatus('⚠ Unsaved changes — click "Save preset" to keep them.', "error");
}

function fillForm(preset) {
  fieldEl("name").value = preset?.name ?? "";
  fieldEl("systemPrompt").value = preset?.systemPrompt ?? "";
  fieldEl("thinking").checked = preset ? Boolean(preset.thinking) : true;
  fieldEl("injectPromptTemplate").checked = Boolean(preset?.injectPromptTemplate);
  fieldEl("temperature").value = preset?.temperature ?? DEFAULT_TUNING.temperature;
  fieldEl("top_p").value = preset?.top_p ?? DEFAULT_TUNING.top_p;
  fieldEl("num_ctx").value = preset?.num_ctx ?? DEFAULT_TUNING.num_ctx;
  desiredModel = preset?.model ?? "";
  applyModelSelection();
}

function applyModelSelection() {
  if (!presetModel.options.length) {
    return;
  }
  presetModel.value = desiredModel;
  if (desiredModel && !presetModel.value) {
    // Saved model is gone from the Ollama instance: fall back to the first one.
    presetModel.selectedIndex = presetModel.options.length > 1 ? 1 : 0;
    setStatus(
      `⚠ Model '${desiredModel}' is not available — switched to '${presetModel.value || "automatic"}'. Unsaved changes.`,
      "error"
    );
  }
}

async function loadModels() {
  try {
    const response = await fetch("/api/models");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // fetch() resolves normally for HTTP error statuses, so a 502 from an
      // unreachable Ollama instance would otherwise pass silently unnoticed.
      setStatus(`⚠ ${data.detail ?? "Could not reach the Ollama instance."}`, "error");
      presetModel.innerHTML = "";
      return;
    }
    presetModel.innerHTML = "";
    // Empty value = save the preset without a fixed model.
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = "(no model — pick the first available one)";
    presetModel.appendChild(noneOption);
    for (const model of data.models ?? []) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      presetModel.appendChild(option);
    }
    applyModelSelection();
  } catch (err) {
    setStatus(`⚠ Could not load models: ${err}`, "error");
  }
}

async function loadPresets(selectId) {
  const response = await fetch("/api/presets");
  presets = await response.json();
  presetSelect.innerHTML = "";
  for (const preset of presets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    presetSelect.appendChild(option);
  }
  selectedId = selectId && presets.some((p) => p.id === selectId) ? selectId : presets[0]?.id ?? null;
  if (selectedId) {
    presetSelect.value = selectedId;
    fillForm(presets.find((p) => p.id === selectedId));
  } else {
    fillForm(null);
  }
  updatePresetSummaryName();
}

presetSelect.addEventListener("change", () => {
  selectedId = presetSelect.value;
  setStatus("");
  fillForm(presets.find((p) => p.id === selectedId));
  updatePresetSummaryName();
});

document.getElementById("preset-new").addEventListener("click", () => {
  selectedId = null;
  setStatus("");
  fillForm(null);
  updatePresetSummaryName();
});

// Client-side only: keep the current field values but detach them from the
// selected preset, so saving creates a new one.
document.getElementById("preset-duplicate").addEventListener("click", () => {
  selectedId = null;
  const name = fieldEl("name").value.trim();
  fieldEl("name").value = name ? `${name} (copy)` : "";
  updatePresetSummaryName();
  markUnsaved();
  fieldEl("name").focus();
});

// Programmatic updates in fillForm() don't fire these events, so the warning
// only appears for actual user edits.
presetForm.addEventListener("input", markUnsaved);
presetForm.addEventListener("change", markUnsaved);

presetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    name: fieldEl("name").value,
    systemPrompt: fieldEl("systemPrompt").value,
    model: presetModel.value,
    thinking: fieldEl("thinking").checked,
    injectPromptTemplate: fieldEl("injectPromptTemplate").checked,
    temperature: fieldEl("temperature").value ? Number(fieldEl("temperature").value) : null,
    top_p: fieldEl("top_p").value ? Number(fieldEl("top_p").value) : null,
    num_ctx: fieldEl("num_ctx").value ? Number(fieldEl("num_ctx").value) : null,
  };

  const isUpdate = Boolean(selectedId);
  const url = isUpdate ? `/api/presets/${selectedId}` : "/api/presets";
  const response = await fetch(url, {
    method: isUpdate ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    setStatus(`⚠ ${error.detail ?? response.statusText}`, "error");
    return;
  }

  const saved = await response.json();
  setStatus(`✅ Saved preset '${saved.name}'.`, "success");
  await loadPresets(saved.id);
});

document.getElementById("preset-delete").addEventListener("click", async () => {
  if (!selectedId) {
    return;
  }
  const response = await fetch(`/api/presets/${selectedId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const error = await response.json().catch(() => ({}));
    setStatus(`⚠ ${error.detail ?? response.statusText}`, "error");
    return;
  }
  setStatus("Preset deleted.", "success");
  selectedId = null;
  await loadPresets();
});

function applyStaticHeaderConfig(config) {
  const title = document.getElementById("app-title");
  const version = document.getElementById("app-version");
  if (title && config.appTitle) {
    title.textContent = config.appTitle;
    document.title = config.appTitle;
  }
  if (version && config.version) {
    version.textContent = `v${config.version}`;
  }
}

async function applyServerFeatureFlags() {
  // The debug panel is opt-in via config.json ("debugMode": true) so system
  // prompts/message content are never exposed unless explicitly enabled.
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    applyStaticHeaderConfig(data);
    const debugPanel = document.getElementById("debug-panel");
    if (data.debugMode) {
      debugPanel.style.display = "";
    }
  } catch (err) {
    // Non-fatal: debug panel just stays hidden if this check fails.
    console.warn("Could not read server feature flags", err);
  }
}

const topicSuggestionsEl = document.getElementById("topic-suggestions");

async function loadTopicSuggestions() {
  try {
    const response = await fetch("/api/prompts/topics");
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    topicSuggestionsEl.innerHTML = "";
    for (const topic of data.topics ?? []) {
      const option = document.createElement("option");
      option.value = topic;
      topicSuggestionsEl.appendChild(option);
    }
  } catch (err) {
    // Non-fatal: the topic field just stays a plain free-text input.
    console.warn("Could not load topic suggestions", err);
  }
}

(async function init() {
  // Run in parallel: an unreachable Ollama instance can take several
  // seconds to time out, and must not block the preset list from loading.
  await Promise.all([loadModels(), loadPresets(), applyServerFeatureFlags(), loadTopicSuggestions()]);
})();

// --- Chat (Phase 5/6: streaming, checkboxes, undo, regenerate, images, thinking, tuning) ---
const chatHistoryEl = document.getElementById("chat-history");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatImageDropzone = document.getElementById("chat-image-dropzone");
const chatImageListEl = document.getElementById("chat-image-list");
// Images attached to the message currently being composed, in drop order.
let selectedImages = []; // { name, base64, dataUrl }
const chatStatus = document.getElementById("chat-status");
const contextIndicator = document.getElementById("chat-context-indicator");
const undoToast = document.getElementById("chat-undo-toast");
const undoButton = document.getElementById("chat-undo-button");
const deselectAllButton = document.getElementById("chat-deselect-all");
const topicInput = document.getElementById("topic-input");
const promptLibraryEl = document.getElementById("prompt-library");
const chatNewButton = document.getElementById("chat-new");
const chatSaveButton = document.getElementById("chat-save");
const chatLoadButton = document.getElementById("chat-load");
const chatHistorySelect = document.getElementById("chat-history-select");
const chatAutosaveStatus = document.getElementById("chat-autosave-status");
const chatStopButton = document.getElementById("chat-stop");
// Set while a streaming reply is in flight so "Stop" can abort it.
let activeStreamController = null;

chatStopButton.addEventListener("click", () => {
  activeStreamController?.abort();
});

// --- Image lightbox: click a chat thumbnail to view it full-size ---
const imageLightbox = document.getElementById("image-lightbox");
const imageLightboxImg = document.getElementById("image-lightbox-img");
const imageLightboxClose = document.getElementById("image-lightbox-close");

function openImageLightbox(src) {
  imageLightboxImg.src = src;
  imageLightbox.style.display = "flex";
}

function closeImageLightbox() {
  imageLightbox.style.display = "none";
  imageLightboxImg.src = "";
}

imageLightboxClose.addEventListener("click", closeImageLightbox);
// Clicking the dark backdrop closes it too, but not clicking the image itself.
imageLightbox.addEventListener("click", (event) => {
  if (event.target === imageLightbox) {
    closeImageLightbox();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && imageLightbox.style.display !== "none") {
    closeImageLightbox();
  }
});

// Errors (e.g. "LLM unreachable") stay visible until the next successful
// action, instead of being wiped out by the "" reset right after the call.
function setChatError(message) {
  chatStatus.textContent = `⚠ ${message}`;
  chatStatus.classList.add("status-text--error");
}

function clearChatStatus(message = "") {
  chatStatus.textContent = message;
  chatStatus.classList.remove("status-text--error");
}

let chatMessages = []; // { id, role, content, checked, images, thinking }
let nextMessageId = 1;
let lastDeleted = null; // { message, index }
let undoTimer = null;
let lastAutosaveAt = null;
// Name of the saved history currently loaded (via "Load"), so "Save history"
// can default to updating it instead of always asking for a brand new name.
// Reset by "New chat" since that starts an unsaved conversation again.
let currentHistoryName = null;

function updateContextIndicator() {
  const included = chatMessages.filter((m) => m.checked);
  // Rough only: actual image token cost depends on the model's vision
  // encoder/resolution and can be far higher than this estimate.
  const IMAGE_TOKEN_ESTIMATE = 768;
  const textTokens = included.reduce((sum, m) => sum + m.content.length, 0) / 4;
  const imageTokens = included.reduce((sum, m) => sum + (m.images?.length ?? 0), 0) * IMAGE_TOKEN_ESTIMATE;
  const approxTokens = Math.round(textTokens + imageTokens);
  const imageCount = included.reduce((sum, m) => sum + (m.images?.length ?? 0), 0);
  const imageNote = imageCount > 0 ? ` (incl. ${imageCount} image${imageCount === 1 ? "" : "s"}, rough estimate)` : "";
  contextIndicator.textContent = `${included.length} msgs · ~${approxTokens} tokens in context${imageNote}`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const [, base64] = String(reader.result).split(",");
      resolve(base64 ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function tuningOverrides() {
  // Overrides come straight from the (possibly unsaved) preset form fields,
  // so editing them without clicking "Save preset" only affects this chat.
  return {
    systemPrompt: fieldEl("systemPrompt").value || null,
    model: presetModel.value || null,
    temperature: fieldEl("temperature").value ? Number(fieldEl("temperature").value) : null,
    top_p: fieldEl("top_p").value ? Number(fieldEl("top_p").value) : null,
    num_ctx: fieldEl("num_ctx").value ? Number(fieldEl("num_ctx").value) : null,
  };
}

const debugPanel = document.getElementById("debug-panel");
const debugPanelBody = document.getElementById("debug-panel-body");

function showLastRequestDebug(payload) {
  debugPanelBody.textContent = JSON.stringify(payload, null, 2);
  debugPanel.open = true;
}

function renderMessageText(message) {
  const content = message.content ?? "";
  const fragment = document.createDocumentFragment();
  const rolePrefix = document.createElement("span");
  rolePrefix.textContent = `${message.role}: `;
  fragment.appendChild(rolePrefix);

  const promptTagPattern = /<prompt\s+([^>]*?)>([\s\S]*?)<\/prompt>/gi;
  let lastIndex = 0;
  let match;
  let foundPrompt = false;

  while ((match = promptTagPattern.exec(content)) !== null) {
    foundPrompt = true;
    const before = content.slice(lastIndex, match.index);
    if (before) {
      const beforeNode = document.createElement("span");
      beforeNode.textContent = before;
      fragment.appendChild(beforeNode);
    }

    const attrs = match[1] ?? "";
    const promptBody = match[2] ?? "";
    const typeMatch = /(?:^|\s)type\s*=\s*"([^"]*)"/i.exec(attrs);
    const descriptionMatch = /(?:^|\s)description\s*=\s*"([^"]*)"/i.exec(attrs);
    fragment.appendChild(
      renderPromptEntry({
        type: typeMatch?.[1] ?? "text",
        description: descriptionMatch?.[1] ?? "Prompt",
        prompt: promptBody.trim(),
      })
    );

    lastIndex = match.index + match[0].length;
  }

  const tail = content.slice(lastIndex);
  if (tail || !foundPrompt) {
    const textNode = document.createElement("span");
    textNode.textContent = foundPrompt ? tail : content;
    fragment.appendChild(textNode);
  }

  return fragment;
}

function renderChat() {
  chatHistoryEl.innerHTML = "";
  chatMessages.forEach((message, index) => {
    const row = document.createElement("div");
    row.className = "chat-message";
    row.dataset.role = message.role;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = message.checked;
    checkbox.addEventListener("change", () => {
      message.checked = checkbox.checked;
      updateContextIndicator();
    });

    row.append(checkbox);

    if (message.thinking) {
      const details = document.createElement("details");
      details.className = "chat-thinking";
      // Kept on the message so streaming re-renders don't collapse it again.
      details.open = Boolean(message.thinkingOpen);
      details.addEventListener("toggle", () => {
        if (details.open === Boolean(message.thinkingOpen)) {
          return;
        }
        message.thinkingOpen = details.open;
        // A manual toggle wins over the automatic open/close while streaming.
        message.thinkingManual = true;
      });
      const summary = document.createElement("summary");
      summary.textContent = "Thinking";
      const thinkingText = document.createElement("span");
      thinkingText.className = "chat-thinking-text";
      thinkingText.textContent = message.thinking;
      details.append(summary, thinkingText);
      row.append(details);
    }

    if (message.images?.length) {
      for (const image of message.images) {
        const thumb = document.createElement("img");
        thumb.src = image;
        thumb.className = "chat-image-thumb";
        thumb.addEventListener("click", () => openImageLightbox(image));
        row.append(thumb);
      }
    }

    if (message.failed) {
      const failedNote = document.createElement("span");
      failedNote.className = "chat-message-failed";
      failedNote.textContent = "⚠ No response — the LLM request failed. See status below.";
      row.append(failedNote);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteMessage(index));

    if (message.editing) {
      const textarea = document.createElement("textarea");
      textarea.className = "chat-message-edit";
      textarea.value = message.content;
      row.append(textarea);

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => saveEditedMessage(message, textarea.value, index, false));
      row.append(saveBtn);

      // Only a user message can be resent — resending an edited assistant
      // reply would mean asking the model to answer itself.
      if (message.role === "user") {
        const saveResendBtn = document.createElement("button");
        saveResendBtn.type = "button";
        saveResendBtn.textContent = "Save & Resend";
        saveResendBtn.addEventListener("click", () => saveEditedMessage(message, textarea.value, index, true));
        row.append(saveResendBtn);
      }

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => {
        message.editing = false;
        renderChat();
      });
      row.append(cancelBtn);
    } else {
      const body = renderMessageText(message);
      row.append(body);

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => {
        message.editing = true;
        renderChat();
      });
      row.append(editBtn);

      if (message.role === "assistant" && index === chatMessages.length - 1) {
        const regenBtn = document.createElement("button");
        regenBtn.type = "button";
        regenBtn.textContent = "Regenerate";
        regenBtn.addEventListener("click", regenerateLast);
        row.append(regenBtn);
      }
    }
    row.append(deleteBtn);
    chatHistoryEl.appendChild(row);
  });
  updateContextIndicator();
}

// Saving an edit just updates the text in place. Saving-and-resending a user
// message additionally drops every message after it (the conversation
// branches from here) and immediately asks the model for a fresh reply.
function saveEditedMessage(message, newContent, index, resend) {
  message.content = newContent;
  message.editing = false;
  if (resend && message.role === "user") {
    chatMessages = chatMessages.slice(0, index + 1);
    renderChat();
    triggerAutosave();
    scrollChatHistoryToBottom();
    clearChatStatus("Waiting for response...");
    streamAssistantReply(chatMessages.filter((m) => m.checked)).then((ok) => {
      if (ok) {
        clearChatStatus();
      }
    });
    return;
  }
  triggerAutosave();
  renderChat();
}

function scrollChatHistoryToBottom() {
  requestAnimationFrame(() => {
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
  });
}

function deleteMessage(index) {
  const [message] = chatMessages.splice(index, 1);
  lastDeleted = { message, index };
  renderChat();
  undoToast.style.display = "block";
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undoToast.style.display = "none";
    lastDeleted = null;
  }, 6000);
}

undoButton.addEventListener("click", () => {
  if (!lastDeleted) {
    return;
  }
  chatMessages.splice(lastDeleted.index, 0, lastDeleted.message);
  lastDeleted = null;
  clearTimeout(undoTimer);
  undoToast.style.display = "none";
  renderChat();
});

deselectAllButton.addEventListener("click", () => {
  chatMessages.forEach((m) => (m.checked = false));
  renderChat();
});

async function streamAssistantReply(historyForContext) {
  const controller = new AbortController();
  activeStreamController = controller;
  chatStopButton.style.display = "";
  try {
    return await runAssistantStream(historyForContext, controller.signal);
  } finally {
    activeStreamController = null;
    chatStopButton.style.display = "none";
  }
}

async function runAssistantStream(historyForContext, signal) {
  let response;
  try {
    response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        presetId: selectedId,
        messages: historyForContext.map((m) => ({
          role: m.role,
          content: m.content,
          images: m.imagesBase64 ?? null,
        })),
        ...tuningOverrides(),
      }),
    });
  } catch (err) {
    if (err.name === "AbortError") {
      clearChatStatus("⏹ Generation stopped.");
      return false;
    }
    // The FastAPI server itself is unreachable (not just Ollama).
    setChatError(`Could not reach the server: ${err}`);
    return false;
  }

  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => ({}));
    setChatError(error.detail ?? response.statusText);
    return false;
  }

  const assistantMessage = {
    id: nextMessageId++,
    role: "assistant",
    content: "",
    checked: true,
    thinking: "",
  };
  chatMessages.push(assistantMessage);
  triggerAutosave();
  renderChat();
  scrollChatHistoryToBottom();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let failed = false;
  let stopped = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop();
      for (const rawEvent of events) {
        const lines = rawEvent.split("\n");
        const eventLine = lines.find((line) => line.startsWith("event: "));
        const dataLine = lines.find((line) => line.startsWith("data: "));
        if (!dataLine) {
          continue;
        }
        const eventType = eventLine ? eventLine.slice("event: ".length) : "message";
        const payload = JSON.parse(dataLine.slice("data: ".length));
        if (eventType === "debug") {
          // Exact payload the backend sends to Ollama's API (role/content/images),
          // shown in the "Request sent to Ollama" panel so it's visible without
          // a debugger or the browser network tab.
          showLastRequestDebug(payload);
        } else if (eventType === "thinking" && payload.delta) {
          assistantMessage.thinking += payload.delta;
          // Show the reasoning while it streams, so long "thinking" phases
          // don't look like a frozen UI.
          if (!assistantMessage.thinkingManual) {
            assistantMessage.thinkingOpen = true;
          }
          clearChatStatus("Thinking...");
          renderChat();
          scrollChatHistoryToBottom();
        } else if (payload.delta) {
          assistantMessage.content += payload.delta;
          // The actual answer takes over, so collapse the reasoning again.
          if (!assistantMessage.thinkingManual) {
            assistantMessage.thinkingOpen = false;
          }
          renderChat();
          scrollChatHistoryToBottom();
        } else if (payload.detail) {
          failed = true;
          assistantMessage.failed = true;
          setChatError(payload.detail);
          renderChat();
          scrollChatHistoryToBottom();
        }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      throw err;
    }
    stopped = true;
  }
  renderChat();
  if (stopped) {
    clearChatStatus("⏹ Generation stopped — the partial answer was kept.");
    return false;
  }
  if (failed) {
    return false;
  }
  await extractPrompts(assistantMessage);
  return true;
}

function renderPromptEntry(entry) {
  const block = document.createElement("div");
  block.className = "prompt-entry";

  const title = document.createElement("strong");
  title.textContent = `${entry.description} (${entry.type})`;

  const body = document.createElement("pre");
  body.textContent = entry.prompt;

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", async () => {
    const originalLabel = copyBtn.textContent;
    // Visual feedback that the copy actually happened (or failed), since
    // clipboard writes are otherwise silent/invisible to the user.
    try {
      await navigator.clipboard.writeText(entry.prompt);
      copyBtn.textContent = "✅ Copied!";
      copyBtn.classList.add("btn--copied");
    } catch (err) {
      copyBtn.textContent = "⚠ Copy failed";
      copyBtn.classList.add("btn--copy-failed");
    }
    setTimeout(() => {
      copyBtn.textContent = originalLabel;
      copyBtn.classList.remove("btn--copied", "btn--copy-failed");
    }, 1500);
  });

  block.append(title, body, copyBtn);
  return block;
}

async function extractPrompts(assistantMessage) {
  const topic = topicInput.value.trim();
  try {
    const response = await fetch("/api/prompts/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, text: assistantMessage.content }),
    });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    assistantMessage.extractedPrompts = data.extracted ?? [];
    renderChat();
    if (assistantMessage.extractedPrompts.length > 0) {
      await loadPromptLibrary();
      await loadTopicSuggestions();
    }
  } catch (err) {
    chatStatus.textContent = `Prompt extraction failed: ${err}`;
  }
}

async function loadPromptLibrary() {
  const topic = topicInput.value.trim();
  promptLibraryEl.innerHTML = "";
  if (!topic) {
    return;
  }
  try {
    const response = await fetch(`/api/prompts/library?topic=${encodeURIComponent(topic)}`);
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    for (const entry of data.entries ?? []) {
      promptLibraryEl.appendChild(renderPromptEntry(entry));
    }
  } catch (err) {
    chatStatus.textContent = `Could not load topic prompt history: ${err}`;
  }
}

topicInput.addEventListener("change", loadPromptLibrary);
topicInput.addEventListener("blur", loadPromptLibrary);

async function regenerateLast() {
  const lastAssistantIndex = chatMessages.map((m) => m.role).lastIndexOf("assistant");
  if (lastAssistantIndex === -1) {
    return;
  }
  chatMessages.splice(lastAssistantIndex, 1);
  renderChat();
  clearChatStatus("Regenerating...");
  const ok = await streamAssistantReply(chatMessages.filter((m) => m.checked));
  if (ok) {
    clearChatStatus();
  }
}

function resetImageSelection() {
  selectedImages = [];
  renderSelectedImages();
}

function renderSelectedImages() {
  chatImageListEl.innerHTML = "";
  selectedImages.forEach((image, index) => {
    const item = document.createElement("div");
    item.className = "chat-image-list-item";
    const thumb = document.createElement("img");
    thumb.src = image.dataUrl;
    thumb.alt = image.name;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "✕";
    removeBtn.title = `Remove ${image.name}`;
    removeBtn.addEventListener("click", () => {
      selectedImages.splice(index, 1);
      renderSelectedImages();
    });
    item.append(thumb, removeBtn);
    chatImageListEl.appendChild(item);
  });
}

async function addImageFiles(files) {
  const imageFiles = [...files].filter((f) => f.type.startsWith("image/"));
  if (imageFiles.length === 0) {
    setChatError("Only image files can be attached here.");
    return;
  }
  for (const file of imageFiles) {
    const base64 = await readFileAsBase64(file);
    selectedImages.push({ name: file.name, base64, dataUrl: `data:${file.type};base64,${base64}` });
  }
  renderSelectedImages();
}

// Drag & drop is the only way to attach images, so it supports any number of
// files at once, and works when dropping anywhere on the chat form (including
// over the message textarea), not just directly on the dropzone hint.
["dragenter", "dragover"].forEach((eventName) => {
  chatForm.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    chatImageDropzone.classList.add("chat-image-dropzone--active");
  });
});

["dragleave", "dragend", "drop"].forEach((eventName) => {
  chatForm.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    chatImageDropzone.classList.remove("chat-image-dropzone--active");
  });
});

chatForm.addEventListener("drop", (event) => {
  addImageFiles(event.dataTransfer?.files ?? []);
});

chatForm.addEventListener("paste", (event) => {
  const imageFiles = [...(event.clipboardData?.items ?? [])]
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file) => file !== null);

  if (imageFiles.length > 0) {
    event.preventDefault();
    addImageFiles(imageFiles);
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedId) {
    setChatError("Select a preset first.");
    return;
  }
  const text = chatInput.value;
  const userMessage = { id: nextMessageId++, role: "user", content: text, checked: true };
  if (selectedImages.length > 0) {
    userMessage.imagesBase64 = selectedImages.map((image) => image.base64);
    userMessage.images = selectedImages.map((image) => image.dataUrl);
  }
  chatMessages.push(userMessage);
  triggerAutosave();
  renderChat();
  scrollChatHistoryToBottom();
  chatInput.value = "";
  resetImageSelection();
  clearChatStatus("Waiting for response...");

  const ok = await streamAssistantReply(chatMessages.filter((m) => m.checked));
  if (ok) {
    clearChatStatus();
  }
});

// Enter sends the message, Shift+Enter inserts a newline in the textarea.
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

// --- Chat history: save/load/new chat/autosave (Phase 8, README.md section 7) ---

function currentHistoryPayload() {
  return {
    presetId: selectedId,
    topic: topicInput.value.trim(),
    messages: chatMessages.map((m) => ({
      role: m.role,
      content: m.content,
      images: m.images ?? null,
      checked: m.checked,
    })),
  };
}

function applyHistory(history) {
  // Keep the visible dropdown and the internal selectedId in sync, even
  // when the history has no preset (otherwise the UI can show a preset as
  // selected while chat actions still behave as if none were chosen).
  selectedId = history.presetId ?? null;
  if (selectedId && presets.some((p) => p.id === selectedId)) {
    presetSelect.value = selectedId;
    fillForm(presets.find((p) => p.id === selectedId));
  } else {
    selectedId = null;
    presetSelect.value = "";
  }
  updatePresetSummaryName();
  topicInput.value = history.topic ?? "";
  chatMessages = (history.messages ?? []).map((m) => ({
    id: nextMessageId++,
    role: m.role,
    content: m.content,
    images: m.images ?? null,
    checked: m.checked ?? true,
  }));
  renderChat();
}

async function triggerAutosave() {
  if (chatMessages.length === 0) {
    return;
  }
  try {
    const response = await fetch("/api/chat-history/autosave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentHistoryPayload()),
    });
    if (response.ok) {
      lastAutosaveAt = new Date();
    }
  } catch (err) {
    // Autosave failures are non-fatal; the user can still save manually.
    console.warn("Autosave failed", err);
  }
}

function updateAutosaveStatusText() {
  if (!lastAutosaveAt) {
    return;
  }
  const seconds = Math.round((Date.now() - lastAutosaveAt.getTime()) / 1000);
  chatAutosaveStatus.textContent = seconds < 5 ? "Autosaved just now" : `Autosaved ${seconds}s ago`;
}

setInterval(triggerAutosave, 30000);
setInterval(updateAutosaveStatusText, 1000);

async function loadHistoryNames() {
  try {
    const response = await fetch("/api/chat-history/list");
    const data = await response.json();
    const previouslySelected = chatHistorySelect.value;
    chatHistorySelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "-- select saved chat --";
    chatHistorySelect.appendChild(placeholder);
    for (const name of data.names ?? []) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      chatHistorySelect.appendChild(option);
    }
    chatHistorySelect.value = previouslySelected;
  } catch (err) {
    chatStatus.textContent = `Could not load chat history list: ${err}`;
  }
}

chatNewButton.addEventListener("click", () => {
  // Keep the currently selected preset — only the conversation is cleared.
  chatMessages = [];
  topicInput.value = "";
  promptLibraryEl.innerHTML = "";
  // Clear the load-history selection too, otherwise it still points at the
  // previously loaded/saved chat even though the conversation was reset.
  chatHistorySelect.value = "";
  // A fresh conversation is no longer tied to the previously loaded save.
  currentHistoryName = null;
  renderChat();
});

chatSaveButton.addEventListener("click", async () => {
  const name = window.prompt("Save chat history as:", currentHistoryName ?? "");
  if (!name) {
    return;
  }
  try {
    const response = await fetch("/api/chat-history/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, history: currentHistoryPayload() }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      chatStatus.textContent = `Error: ${error.detail ?? response.statusText}`;
      return;
    }
    const saved = await response.json();
    currentHistoryName = saved.name;
    chatStatus.textContent = `Saved chat history as '${saved.name}'.`;
    await loadHistoryNames();
  } catch (err) {
    chatStatus.textContent = `Save failed: ${err}`;
  }
});

chatLoadButton.addEventListener("click", async () => {
  const name = chatHistorySelect.value;
  if (!name) {
    return;
  }
  try {
    const response = await fetch(`/api/chat-history/load?name=${encodeURIComponent(name)}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      chatStatus.textContent = `Error: ${error.detail ?? response.statusText}`;
      return;
    }
    const history = await response.json();
    applyHistory(history);
    currentHistoryName = name;
    await loadPromptLibrary();
    chatStatus.textContent = `Loaded '${name}' (${history.messages?.length ?? 0} messages).`;
  } catch (err) {
    chatStatus.textContent = `Load failed: ${err}`;
  }
});

(async function restoreAutosaveOnLoad() {
  // No login/session concept in this app, so the autosaved chat (if any) is
  // restored automatically rather than prompting the user.
  await loadHistoryNames();
  try {
    const response = await fetch("/api/chat-history/autosave");
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (data.history) {
      applyHistory(data.history);
      await loadPromptLibrary();
    }
  } catch (err) {
    console.warn("Could not restore autosave", err);
  }
})();
