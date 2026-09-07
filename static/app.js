// Minimal preset editor: list/select/create/update/delete presets, model
// dropdown auto-discovered from /api/models (see README.md sections 4/5).
console.log("AI Ollama Prompt Helper frontend loaded");

const presetSelect = document.getElementById("preset-select");
const presetModel = document.getElementById("preset-model");
const presetForm = document.getElementById("preset-form");
const presetStatus = document.getElementById("preset-status");

let presets = [];
let selectedId = null;
// Sensible starting values for a new preset (README.md section 4: optional tuning fields).
const DEFAULT_TUNING = { temperature: 0.8, top_p: 0.9, num_ctx: 4096 };

function setStatus(message, isError = false) {
  presetStatus.textContent = message;
  presetStatus.classList.toggle("status-text--error", isError);
}

function fieldEl(name) {
  return document.getElementById(`preset-${name}`);
}

function fillForm(preset) {
  fieldEl("name").value = preset?.name ?? "";
  fieldEl("systemPrompt").value = preset?.systemPrompt ?? "";
  fieldEl("thinking").checked = Boolean(preset?.thinking);
  fieldEl("promptIdentifier").value = preset?.promptIdentifier ?? "";
  fieldEl("temperature").value = preset?.temperature ?? DEFAULT_TUNING.temperature;
  fieldEl("top_p").value = preset?.top_p ?? DEFAULT_TUNING.top_p;
  fieldEl("num_ctx").value = preset?.num_ctx ?? DEFAULT_TUNING.num_ctx;
  presetModel.value = preset?.model ?? "";
}

async function loadModels() {
  try {
    const response = await fetch("/api/models");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // fetch() resolves normally for HTTP error statuses, so a 502 from an
      // unreachable Ollama instance would otherwise pass silently unnoticed.
      setStatus(`⚠ ${data.detail ?? "Could not reach the Ollama instance."}`, true);
      presetModel.innerHTML = "";
      return;
    }
    presetModel.innerHTML = "";
    for (const model of data.models ?? []) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      presetModel.appendChild(option);
    }
  } catch (err) {
    setStatus(`⚠ Could not load models: ${err}`, true);
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
}

presetSelect.addEventListener("change", () => {
  selectedId = presetSelect.value;
  fillForm(presets.find((p) => p.id === selectedId));
});

document.getElementById("preset-new").addEventListener("click", () => {
  selectedId = null;
  fillForm(null);
});

presetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    name: fieldEl("name").value,
    systemPrompt: fieldEl("systemPrompt").value,
    model: presetModel.value,
    thinking: fieldEl("thinking").checked,
    promptIdentifier: fieldEl("promptIdentifier").value || null,
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
    setStatus(`⚠ ${error.detail ?? response.statusText}`, true);
    return;
  }

  const saved = await response.json();
  setStatus(`Saved preset '${saved.name}'.`);
  await loadPresets(saved.id);
});

document.getElementById("preset-delete").addEventListener("click", async () => {
  if (!selectedId) {
    return;
  }
  const response = await fetch(`/api/presets/${selectedId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const error = await response.json().catch(() => ({}));
    setStatus(`⚠ ${error.detail ?? response.statusText}`, true);
    return;
  }
  setStatus("Preset deleted.");
  selectedId = null;
  await loadPresets();
});

(async function init() {
  // Run in parallel: an unreachable Ollama instance can take several
  // seconds to time out, and must not block the preset list from loading.
  await Promise.all([loadModels(), loadPresets()]);
})();

// --- Chat (Phase 5/6: streaming, checkboxes, undo, regenerate, images, thinking, tuning) ---
const chatHistoryEl = document.getElementById("chat-history");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatImageInput = document.getElementById("chat-image-input");
const chatStatus = document.getElementById("chat-status");
const contextIndicator = document.getElementById("chat-context-indicator");
const undoToast = document.getElementById("chat-undo-toast");
const undoButton = document.getElementById("chat-undo-button");
const deselectAllButton = document.getElementById("chat-deselect-all");
const topicInput = document.getElementById("topic-input");
const promptTypeSelect = document.getElementById("prompt-type-select");
const promptLibraryEl = document.getElementById("prompt-library");
const chatNewButton = document.getElementById("chat-new");
const chatSaveButton = document.getElementById("chat-save");
const chatLoadButton = document.getElementById("chat-load");
const chatHistorySelect = document.getElementById("chat-history-select");
const chatAutosaveStatus = document.getElementById("chat-autosave-status");

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

let chatMessages = []; // { id, role, content, checked, image, thinking }
let nextMessageId = 1;
let lastDeleted = null; // { message, index }
let undoTimer = null;
let lastAutosaveAt = null;

function updateContextIndicator() {
  const included = chatMessages.filter((m) => m.checked);
  const approxTokens = Math.round(
    included.reduce((sum, m) => sum + m.content.length, 0) / 4
  );
  contextIndicator.textContent = `${included.length} msgs · ~${approxTokens} tokens in context`;
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
    temperature: fieldEl("temperature").value ? Number(fieldEl("temperature").value) : null,
    top_p: fieldEl("top_p").value ? Number(fieldEl("top_p").value) : null,
    num_ctx: fieldEl("num_ctx").value ? Number(fieldEl("num_ctx").value) : null,
  };
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
      const summary = document.createElement("summary");
      summary.textContent = "Thinking";
      const thinkingText = document.createElement("span");
      thinkingText.textContent = message.thinking;
      details.append(summary, thinkingText);
      row.append(details);
    }

    if (message.image) {
      const thumb = document.createElement("img");
      thumb.src = message.image;
      thumb.className = "chat-image-thumb";
      row.append(thumb);
    }

    const text = document.createElement("span");
    text.textContent = `${message.role}: ${message.content}`;

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

    row.append(text);

    if (message.extractedPrompts?.length) {
      for (const entry of message.extractedPrompts) {
        row.appendChild(renderPromptEntry(entry));
      }
    }

    if (message.role === "assistant" && index === chatMessages.length - 1) {
      const regenBtn = document.createElement("button");
      regenBtn.type = "button";
      regenBtn.textContent = "Regenerate";
      regenBtn.addEventListener("click", regenerateLast);
      row.append(regenBtn);
    }
    row.append(deleteBtn);
    chatHistoryEl.appendChild(row);
  });
  updateContextIndicator();
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
  let response;
  try {
    response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        presetId: selectedId,
        messages: historyForContext.map((m) => ({
          role: m.role,
          content: m.content,
          image: m.imageBase64 ?? null,
        })),
        ...tuningOverrides(),
      }),
    });
  } catch (err) {
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

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let failed = false;

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
      if (eventType === "thinking" && payload.delta) {
        assistantMessage.thinking += payload.delta;
        renderChat();
      } else if (payload.delta) {
        assistantMessage.content += payload.delta;
        renderChat();
      } else if (payload.detail) {
        failed = true;
        assistantMessage.failed = true;
        setChatError(payload.detail);
        renderChat();
      }
    }
  }
  renderChat();
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
  copyBtn.addEventListener("click", () => navigator.clipboard.writeText(entry.prompt));

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
    chatStatus.textContent = `Could not load prompt library: ${err}`;
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

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedId) {
    setChatError("Select a preset first.");
    return;
  }
  const text = chatInput.value;
  const imageFile = chatImageInput.files[0];
  const userMessage = { id: nextMessageId++, role: "user", content: text, checked: true };
  if (imageFile) {
    const base64 = await readFileAsBase64(imageFile);
    userMessage.imageBase64 = base64;
    userMessage.image = `data:${imageFile.type};base64,${base64}`;
  }
  chatMessages.push(userMessage);
  triggerAutosave();
  renderChat();
  chatInput.value = "";
  chatImageInput.value = "";
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
    promptType: promptTypeSelect.value,
    messages: chatMessages.map((m) => ({
      role: m.role,
      content: m.content,
      image: m.image ?? null,
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
  topicInput.value = history.topic ?? "";
  promptTypeSelect.value = history.promptType ?? "text";
  chatMessages = (history.messages ?? []).map((m) => ({
    id: nextMessageId++,
    role: m.role,
    content: m.content,
    image: m.image ?? null,
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
    chatHistorySelect.innerHTML = "";
    for (const name of data.names ?? []) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      chatHistorySelect.appendChild(option);
    }
  } catch (err) {
    chatStatus.textContent = `Could not load chat history list: ${err}`;
  }
}

chatNewButton.addEventListener("click", () => {
  // Keep the currently selected preset — only the conversation is cleared.
  chatMessages = [];
  topicInput.value = "";
  promptTypeSelect.value = "text";
  promptLibraryEl.innerHTML = "";
  renderChat();
});

chatSaveButton.addEventListener("click", async () => {
  const name = window.prompt("Save chat history as:");
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
