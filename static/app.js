// Minimal preset editor: list/select/create/update/delete presets, model
// dropdown auto-discovered from /api/models (see README.md sections 4/5).
console.log("AI Ollama Prompt Helper frontend loaded");

const SUPPORTED_LANGUAGES = new Set(["en", "es", "de", "it", "fr"]);
let currentLanguage = "en";
let translations = { strings: {}, html: {} };

function t(key, values = {}) {
  let translated = translations.strings?.[key] ?? key;
  return translated.replace(/\{(\w+)\}/g, (placeholder, name) =>
    values[name] === undefined ? placeholder : String(values[name])
  );
}

function applyStaticTranslations() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest("code, pre, [data-i18n-html], .markdown-content, .prompt-entry")) {
      continue;
    }
    const source = node.nodeValue.trim();
    const translated = t(source);
    if (source && translated !== source) {
      node.nodeValue = node.nodeValue.replace(source, translated);
    }
  }

  document.querySelectorAll("[data-i18n-html]").forEach((element) => {
    const key = element.dataset.i18nHtml;
    if (translations.html?.[key]) {
      element.innerHTML = translations.html[key];
    }
  });

  for (const attribute of ["placeholder", "title", "aria-label", "alt"]) {
    document.querySelectorAll(`[${attribute}]`).forEach((element) => {
      const source = element.getAttribute(attribute);
      const translated = t(source);
      if (translated !== source) {
        element.setAttribute(attribute, translated);
      }
    });
  }
}

async function initializeI18n() {
  const browserLanguage = (navigator.languages?.[0] ?? navigator.language ?? "en")
    .split(/[-_]/)[0]
    .toLowerCase();
  currentLanguage = SUPPORTED_LANGUAGES.has(browserLanguage) ? browserLanguage : "en";

  try {
    let response = await fetch(`/i18n/${currentLanguage}.json`);
    if (!response.ok && currentLanguage !== "en") {
      currentLanguage = "en";
      response = await fetch("/i18n/en.json");
    }
    if (response.ok) {
      translations = await response.json();
    }
  } catch (error) {
    currentLanguage = "en";
    console.warn("Could not load translations; using English.", error);
  }

  document.documentElement.lang = currentLanguage;
  applyStaticTranslations();
}

const i18nReady = initializeI18n();

// --- Dark mode: persisted in localStorage, defaults to the OS preference ---
const THEME_STORAGE_KEY = "theme";
const themeToggleButton = document.getElementById("theme-toggle");
const promptLibraryToggleButton = document.getElementById("prompt-library-toggle");
const promptLibrarySection = document.getElementById("prompt-library-section");
const appLayout = document.querySelector(".app-layout");
const PROMPT_LIBRARY_HIDDEN_STORAGE_KEY = "prompt-library-hidden";

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    themeToggleButton.textContent = t("☀️ Light mode");
  } else {
    document.documentElement.removeAttribute("data-theme");
    themeToggleButton.textContent = t("🌙 Dark mode");
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

function setPromptLibraryHidden(hidden) {
  promptLibrarySection.hidden = hidden;
  appLayout.classList.toggle("app-layout--library-hidden", hidden);
  promptLibraryToggleButton.textContent = t(hidden ? "Show prompt history" : "Hide prompt history");
  promptLibraryToggleButton.setAttribute("aria-expanded", String(!hidden));
}

setPromptLibraryHidden(localStorage.getItem(PROMPT_LIBRARY_HIDDEN_STORAGE_KEY) === "true");
promptLibraryToggleButton.addEventListener("click", () => {
  const hidden = !promptLibrarySection.hidden;
  localStorage.setItem(PROMPT_LIBRARY_HIDDEN_STORAGE_KEY, String(hidden));
  setPromptLibraryHidden(hidden);
});

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
  fieldEl("systemPrompt").value = t(EXAMPLE_SYSTEM_PROMPT);
  markUnsaved();
});

function setStatus(message, variant = null) {
  presetStatus.textContent = t(message);
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
  setStatus(t('⚠ Unsaved changes — click "Save preset" to keep them.'), "error");
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
      t("⚠ Model '{model}' is not available — switched to '{selectedModel}'. Unsaved changes.", {
        model: desiredModel,
        selectedModel: presetModel.value || "automatic",
      }),
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
      setStatus(t("⚠ {message}", { message: data.detail ?? t("⚠ Could not reach the Ollama instance.") }), "error");
      presetModel.innerHTML = "";
      return;
    }
    presetModel.innerHTML = "";
    // Empty value = save the preset without a fixed model.
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = t("(no model — pick the first available one)");
    presetModel.appendChild(noneOption);
    for (const model of data.models ?? []) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      presetModel.appendChild(option);
    }
    applyModelSelection();
  } catch (err) {
    setStatus(t("⚠ Could not load models: {error}", { error: err }), "error");
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
    setStatus(t("⚠ {message}", { message: error.detail ?? response.statusText }), "error");
    return;
  }

  const saved = await response.json();
  setStatus(t("✅ Saved preset '{name}'.", { name: saved.name }), "success");
  await loadPresets(saved.id);
});

document.getElementById("preset-delete").addEventListener("click", async () => {
  if (!selectedId) {
    return;
  }
  const response = await fetch(`/api/presets/${selectedId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const error = await response.json().catch(() => ({}));
    setStatus(t("⚠ {message}", { message: error.detail ?? response.statusText }), "error");
    return;
  }
  setStatus(t("Preset deleted."), "success");
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
  await i18nReady;
  initTheme();
  setPromptLibraryHidden(localStorage.getItem(PROMPT_LIBRARY_HIDDEN_STORAGE_KEY) === "true");
  // Run in parallel: an unreachable Ollama instance can take several
  // seconds to time out, and must not block the preset list from loading.
  await Promise.all([loadModels(), loadPresets(), applyServerFeatureFlags(), loadTopicSuggestions()]);
})();

// --- Chat (Phase 5/6: streaming, checkboxes, undo, regenerate, images, thinking, tuning) ---
const chatHistoryEl = document.getElementById("chat-history");
const nextBookmarkButton = document.getElementById("chat-next-bookmark");
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
const chatEditDialog = document.getElementById("chat-edit-dialog");
const chatEditTitle = document.getElementById("chat-edit-title");
const chatEditLabel = document.querySelector(".chat-edit-dialog__label");
const chatEditContent = document.getElementById("chat-edit-content");
const chatEditAttachments = document.getElementById("chat-edit-attachments");
const chatEditAttachmentSection = document.querySelector(".chat-edit-dialog__attachments");
const chatEditAddImages = document.getElementById("chat-edit-add-images");
const chatEditSave = document.getElementById("chat-edit-save");
const chatEditSaveResend = document.getElementById("chat-edit-save-resend");
let editingMessage = null;
let editingMessageIndex = -1;
let editingField = "content";
let editingImages = [];
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
  chatStatus.textContent = `⚠ ${t(message)}`;
  chatStatus.classList.add("status-text--error");
}

function clearChatStatus(message = "") {
  chatStatus.textContent = t(message);
  chatStatus.classList.remove("status-text--error");
}

let chatMessages = []; // { id, role, content, checked, images, thinking }
let lastNavigatedBookmarkId = null;
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
  const hasSelection = included.length > 0;
  deselectAllButton.textContent = t(hasSelection ? "Deselect all" : "Select all");
  deselectAllButton.disabled = chatMessages.length === 0;
  const budget = estimateContextBudget();
  const imageCount = included.reduce((sum, m) => sum + (m.images?.length ?? 0), 0);
  const imageNote = imageCount > 0
    ? ` ${t(imageCount === 1
      ? "(incl. {count} image, rough estimate)"
      : "(incl. {count} images, rough estimate)", { count: imageCount })}`
    : "";
  contextIndicator.textContent =
    t("{count} msgs · ~{used}/{limit} tokens · ~{reserved} reserved for reply", {
      count: included.length,
      used: budget.usedTokens,
      limit: budget.limit,
      reserved: budget.reservedTokens,
    }) + (imageNote ? ` ${imageNote}` : "");
}

const IMAGE_TOKEN_ESTIMATE = 768;

function estimateTextTokens(text) {
  return Math.ceil(String(text ?? "").length / 4);
}

function estimateMessageTokens(message) {
  return estimateTextTokens(message.content) +
    (message.images?.length ?? 0) * IMAGE_TOKEN_ESTIMATE;
}

function estimateContextBudget() {
  const configuredLimit = Number(fieldEl("num_ctx").value);
  const limit = configuredLimit > 0 ? configuredLimit : DEFAULT_TUNING.num_ctx;
  const included = chatMessages.filter((message) => message.checked);
  const systemTokens = estimateTextTokens(fieldEl("systemPrompt").value);
  const messageTokens = included.reduce(
    (total, message) => total + estimateMessageTokens(message),
    0
  );
  const recentAnswers = chatMessages
    .filter((message) => message.role === "assistant" && message.content?.trim() && !message.failed)
    .slice(-3);
  const averageAnswerTokens = recentAnswers.length
    ? recentAnswers.reduce((total, message) => total + estimateTextTokens(message.content), 0) /
      recentAnswers.length
    : limit * 0.1;

  return {
    limit,
    usedTokens: systemTokens + messageTokens,
    reservedTokens: Math.ceil(averageAnswerTokens * 11 / 10),
  };
}

function fitHistoryToContextBudget() {
  const budget = estimateContextBudget();
  const targetTokens = Math.max(0, budget.limit - budget.reservedTokens);
  const latestCheckedUserMessage = [...chatMessages]
    .reverse()
    .find((message) => message.checked && message.role === "user");
  let usedTokens = budget.usedTokens;
  let deselectedCount = 0;

  for (const message of chatMessages) {
    if (usedTokens <= targetTokens) {
      break;
    }
    if (!message.checked || message === latestCheckedUserMessage) {
      continue;
    }
    message.checked = false;
    usedTokens -= estimateMessageTokens(message);
    deselectedCount += 1;
  }

  return { ...budget, usedTokens, deselectedCount };
}

fieldEl("num_ctx").addEventListener("input", updateContextIndicator);
fieldEl("systemPrompt").addEventListener("input", updateContextIndicator);

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

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function renderInlineMarkdown(text) {
  const fragments = [];
  const storeFragment = (html) => {
    fragments.push(html);
    return `\u0000${fragments.length - 1}\u0000`;
  };
  let html = String(text).replace(/`([^`\n]+)`/g, (_, code) =>
    storeFragment(`<code>${escapeHtml(code)}</code>`)
  );
  html = escapeHtml(html);
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/gi,
    (_, label, url) => storeFragment(
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
    )
  );
  html = html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/\n/g, " ");
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => fragments[Number(index)]);
}

function markdownTableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function renderMarkdown(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(`<p>${renderInlineMarkdown(paragraph.join("\n"))}</p>`);
      paragraph = [];
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = /^\s*```([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flushParagraph();
      const codeLines = [];
      while (++index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
      }
      const language = fence[1] ? ` class="language-${fence[1]}"` : "";
      blocks.push(`<pre><code${language}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\s{0,3}(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph();
      blocks.push("<hr>");
      continue;
    }

    if (/^\s*\|?.+\|.+\|?\s*$/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")) {
      flushParagraph();
      const headers = markdownTableCells(line);
      index += 1;
      const rows = [];
      while (index + 1 < lines.length && lines[index + 1].includes("|")) {
        rows.push(markdownTableCells(lines[++index]));
      }
      const headerHtml = headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("");
      const rowsHtml = rows.map((row) =>
        `<tr>${headers.map((_, cellIndex) => `<td>${renderInlineMarkdown(row[cellIndex] ?? "")}</td>`).join("")}</tr>`
      ).join("");
      blocks.push(`<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`);
      continue;
    }

    if (/^\s*>/.test(line)) {
      flushParagraph();
      const quoteLines = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoteLines.push(lines[index++].replace(/^\s*>\s?/, ""));
      }
      index -= 1;
      blocks.push(`<blockquote>${renderMarkdown(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    const listMatch = /^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/.exec(line);
    if (listMatch) {
      flushParagraph();
      const ordered = /^\d/.test(listMatch[1]);
      const items = [];
      while (index < lines.length) {
        const item = /^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/.exec(lines[index]);
        if (!item || /^\d/.test(item[1]) !== ordered) {
          break;
        }
        items.push(`<li>${renderInlineMarkdown(item[2])}</li>`);
        index += 1;
      }
      index -= 1;
      const tag = ordered ? "ol" : "ul";
      blocks.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return blocks.join("");
}

function appendMarkdown(target, text, className = "markdown-content") {
  const content = document.createElement("div");
  content.className = className;
  content.innerHTML = renderMarkdown(text);
  target.appendChild(content);
}

function renderMessageText(message) {
  const content = message.content ?? "";
  const fragment = document.createDocumentFragment();
  const rolePrefix = document.createElement("span");
  rolePrefix.textContent = `${t(message.role)}: `;
  fragment.appendChild(rolePrefix);

  const promptTagPattern = /<prompt\s+([^>]*?)>([\s\S]*?)<\/prompt>/gi;
  let lastIndex = 0;
  let match;
  let foundPrompt = false;

  while ((match = promptTagPattern.exec(content)) !== null) {
    foundPrompt = true;
    const before = content.slice(lastIndex, match.index);
    if (before) {
      appendMarkdown(fragment, before);
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
    appendMarkdown(fragment, foundPrompt ? tail : content);
  }

  return fragment;
}

function renderChat() {
  chatHistoryEl.innerHTML = "";
  chatMessages.forEach((message, index) => {
    const row = document.createElement("div");
    row.className = "chat-message";
    row.dataset.role = message.role;
    row.dataset.bookmarked = String(Boolean(message.bookmarked));
    row.dataset.messageId = String(message.id);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = message.checked;
    checkbox.addEventListener("change", () => {
      message.checked = checkbox.checked;
      updateContextIndicator();
      triggerAutosave();
    });

    row.append(checkbox);

    if (message.thinking) {
      const thinkingWrap = document.createElement("div");
      thinkingWrap.className = "chat-thinking-wrap";
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
      summary.textContent = t("Thinking");
      const thinkingContent = document.createDocumentFragment();
      appendMarkdown(thinkingContent, message.thinking, "chat-thinking-text markdown-content");
      const editThinkingBtn = document.createElement("button");
      editThinkingBtn.type = "button";
      editThinkingBtn.className = "chat-thinking-edit";
      editThinkingBtn.textContent = t("Edit thinking");
      editThinkingBtn.addEventListener("click", () => openMessageEditor(message, index, "thinking"));
      details.append(summary, thinkingContent);
      thinkingWrap.append(details, editThinkingBtn);
      row.append(thinkingWrap);
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
      failedNote.textContent = t("⚠ No response — the LLM request failed. See status below.");
      row.append(failedNote);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = t("Delete");
    deleteBtn.addEventListener("click", () => deleteMessage(index));

    const body = renderMessageText(message);
    row.append(body);

    if (message.role === "assistant" && message.content) {
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "chat-message-copy";
      copyBtn.textContent = message.copyStatus === "copied"
        ? t("Copied!")
        : message.copyStatus === "failed"
          ? t("Copy failed")
          : t("Copy answer");
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(message.content);
          message.copyStatus = "copied";
        } catch {
          message.copyStatus = "failed";
        }
        const copyStatus = message.copyStatus;
        copyBtn.textContent = t(copyStatus === "copied" ? "Copied!" : "Copy failed");
        setTimeout(() => {
          if (message.copyStatus === copyStatus) {
            message.copyStatus = "";
            const messageIndex = chatMessages.indexOf(message);
            const currentCopyBtn = chatHistoryEl.children[messageIndex]?.querySelector(".chat-message-copy");
            if (currentCopyBtn) {
              currentCopyBtn.textContent = t("Copy answer");
            }
          }
        }, 1500);
      });
      row.append(copyBtn);
    }

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = t("Edit");
    editBtn.addEventListener("click", () => openMessageEditor(message, index));
    row.append(editBtn);

    if (message.role === "assistant") {
      const deselectAboveBtn = document.createElement("button");
      deselectAboveBtn.type = "button";
      deselectAboveBtn.textContent = t("Deselect all above");
      deselectAboveBtn.disabled = !chatMessages
        .slice(0, index)
        .some((previousMessage) => previousMessage.checked);
      deselectAboveBtn.addEventListener("click", () => {
        chatMessages.slice(0, index).forEach((previousMessage) => {
          previousMessage.checked = false;
        });
        triggerAutosave();
        renderChat();
      });
      row.append(deselectAboveBtn);
    }

    const bookmarkBtn = document.createElement("button");
    bookmarkBtn.type = "button";
    bookmarkBtn.className = "chat-message-bookmark";
    const bookmarkIcon = document.createElement("span");
    bookmarkIcon.className = "chat-message-bookmark__icon";
    bookmarkIcon.setAttribute("aria-hidden", "true");
    bookmarkIcon.textContent = message.bookmarked ? "★" : "☆";
    const bookmarkLabel = document.createElement("span");
    bookmarkLabel.textContent = t(message.bookmarked ? "Bookmarked" : "Bookmark");
    bookmarkBtn.append(bookmarkIcon, bookmarkLabel);
    bookmarkBtn.setAttribute("aria-pressed", String(Boolean(message.bookmarked)));
    bookmarkBtn.addEventListener("click", () => {
      message.bookmarked = !message.bookmarked;
      triggerAutosave();
      renderChat();
    });
    row.append(bookmarkBtn);

    if (message.role === "assistant" && index === chatMessages.length - 1) {
      const regenBtn = document.createElement("button");
      regenBtn.type = "button";
      regenBtn.textContent = t("Regenerate");
      regenBtn.addEventListener("click", regenerateLast);
      row.append(regenBtn);
    }
    row.append(deleteBtn);
    chatHistoryEl.appendChild(row);
  });
  updateContextIndicator();
  updateNextBookmarkButton();
}

function updateNextBookmarkButton() {
  const hasBookmarks = chatMessages.some((message) => message.bookmarked);
  nextBookmarkButton.disabled = !hasBookmarks;
  if (!hasBookmarks) {
    lastNavigatedBookmarkId = null;
  }
}

function jumpToNextBookmark() {
  const bookmarkedMessages = chatMessages.filter((message) => message.bookmarked);
  if (bookmarkedMessages.length === 0) {
    updateNextBookmarkButton();
    return;
  }

  const currentIndex = bookmarkedMessages.findIndex(
    (message) => message.id === lastNavigatedBookmarkId
  );
  const nextMessage = bookmarkedMessages[(currentIndex + 1) % bookmarkedMessages.length];
  const targetRow = [...chatHistoryEl.children].find(
    (row) => row.dataset.messageId === String(nextMessage.id)
  );
  if (!targetRow) {
    return;
  }

  lastNavigatedBookmarkId = nextMessage.id;
  const containerTop = chatHistoryEl.getBoundingClientRect().top;
  const targetTop = targetRow.getBoundingClientRect().top;
  chatHistoryEl.scrollTop += targetTop - containerTop;
}

nextBookmarkButton.addEventListener("click", jumpToNextBookmark);

function renderEditorAttachments() {
  chatEditAttachments.innerHTML = "";
  editingImages.forEach((image, index) => {
    const item = document.createElement("div");
    item.className = "chat-edit-attachment";
    const thumbnail = document.createElement("img");
    thumbnail.src = image.dataUrl;
    thumbnail.alt = image.name;
    const name = document.createElement("span");
    name.className = "chat-edit-attachment__name";
    name.textContent = image.name;

    const replaceLabel = document.createElement("label");
    replaceLabel.className = "btn btn--secondary chat-edit-file-button";
    replaceLabel.textContent = t("Replace");
    const replaceInput = document.createElement("input");
    replaceInput.type = "file";
    replaceInput.accept = "image/*";
    replaceInput.addEventListener("change", async () => {
      const file = replaceInput.files?.[0];
      if (!file) {
        return;
      }
      try {
        const base64 = await readFileAsBase64(file);
        editingImages[index] = { name: file.name, base64, dataUrl: `data:${file.type};base64,${base64}` };
        renderEditorAttachments();
      } catch (error) {
        setChatError(t("Could not read image: {error}", { error }));
      }
    });
    replaceLabel.appendChild(replaceInput);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn btn--danger";
    removeButton.textContent = t("Remove");
    removeButton.addEventListener("click", () => {
      editingImages.splice(index, 1);
      renderEditorAttachments();
    });
    item.append(thumbnail, name, replaceLabel, removeButton);
    chatEditAttachments.appendChild(item);
  });
}

function openMessageEditor(message, index, field = "content") {
  editingMessage = message;
  editingMessageIndex = index;
  editingField = field;
  const isThinking = field === "thinking";
  chatEditContent.value = message[field] ?? "";
  editingImages = (isThinking ? [] : message.images ?? []).map((dataUrl, imageIndex) => {
    const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
    return { name: `Image ${imageIndex + 1}`, base64: match?.[2] ?? "", dataUrl };
  });
  chatEditTitle.textContent = t(isThinking
    ? "Edit thinking response"
    : message.role === "assistant" ? "Edit assistant response" : "Edit user message");
  chatEditLabel.textContent = t(isThinking ? "Thinking response" : "Message");
  chatEditAttachmentSection.hidden = isThinking;
  chatEditSaveResend.hidden = isThinking || message.role !== "user";
  chatEditSave.textContent = t(isThinking ? "Save thinking" : "Save");
  renderEditorAttachments();
  chatEditDialog.showModal();
  chatEditContent.focus();
}

chatEditAddImages.addEventListener("change", async () => {
  const imageFiles = [...(chatEditAddImages.files ?? [])].filter((file) => file.type.startsWith("image/"));
  try {
    for (const file of imageFiles) {
      const base64 = await readFileAsBase64(file);
      editingImages.push({ name: file.name, base64, dataUrl: `data:${file.type};base64,${base64}` });
    }
    renderEditorAttachments();
  } catch (error) {
    setChatError(t("Could not read image: {error}", { error }));
  }
  chatEditAddImages.value = "";
});

document.getElementById("chat-edit-cancel").addEventListener("click", () => chatEditDialog.close());
document.getElementById("chat-edit-close").addEventListener("click", () => chatEditDialog.close());
chatEditDialog.addEventListener("close", () => {
  editingMessage = null;
  editingMessageIndex = -1;
  editingField = "content";
  editingImages = [];
  chatEditContent.value = "";
  chatEditAttachments.innerHTML = "";
  chatEditAttachmentSection.hidden = false;
  chatEditLabel.textContent = t("Message");
  chatEditSave.textContent = t("Save");
});

function commitMessageEdit(resend) {
  if (!editingMessage) {
    return;
  }
  const message = editingMessage;
  const index = editingMessageIndex;
  const field = editingField;
  const content = chatEditContent.value;
  const images = editingImages.map((image) => ({ ...image }));
  chatEditDialog.close();
  if (field === "thinking") {
    message.thinking = content;
    message.thinkingManual = true;
    triggerAutosave();
    renderChat();
    return;
  }
  saveEditedMessage(message, content, index, resend, images);
}

chatEditSave.addEventListener("click", () => commitMessageEdit(false));
chatEditSaveResend.addEventListener("click", () => commitMessageEdit(true));

// Saving an edit just updates the text in place. Saving-and-resending a user
// message additionally drops every message after it (the conversation
// branches from here) and immediately asks the model for a fresh reply.
function saveEditedMessage(message, newContent, index, resend, images) {
  message.content = newContent;
  if (images.length > 0) {
    message.images = images.map((image) => image.dataUrl);
    message.imagesBase64 = images.map((image) => image.base64);
  } else {
    delete message.images;
    delete message.imagesBase64;
  }
  if (resend && message.role === "user") {
    chatMessages = chatMessages.slice(0, index + 1);
    renderChat();
    triggerAutosave();
    forceScrollChatHistoryToBottom();
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

// Whether streaming updates should keep following the chat to the bottom.
// Turned off as soon as the user scrolls away from the bottom themselves, so
// incoming tokens don't yank them back down while they're reading earlier
// messages; re-enabled once they scroll back to the bottom, or by an
// explicit user action (send/resend) via forceScrollChatHistoryToBottom().
let autoScrollToBottom = true;
const AUTO_SCROLL_THRESHOLD_PX = 40;

chatHistoryEl.addEventListener("scroll", () => {
  const distanceFromBottom =
    chatHistoryEl.scrollHeight - chatHistoryEl.scrollTop - chatHistoryEl.clientHeight;
  autoScrollToBottom = distanceFromBottom < AUTO_SCROLL_THRESHOLD_PX;
});

function scrollChatHistoryToBottom() {
  if (!autoScrollToBottom) {
    return;
  }
  requestAnimationFrame(() => {
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
  });
}

function forceScrollChatHistoryToBottom() {
  autoScrollToBottom = true;
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
  const shouldSelectAll = !chatMessages.some((message) => message.checked);
  chatMessages.forEach((message) => {
    message.checked = shouldSelectAll;
  });
  triggerAutosave();
  renderChat();
});

async function streamAssistantReply(historyForContext) {
  const budget = fitHistoryToContextBudget();
  if (budget.deselectedCount > 0) {
    renderChat();
    triggerAutosave();
    clearChatStatus(
      t("Context budget: deselected {count} oldest messages; reserved about {tokens} tokens for the reply.", {
        count: budget.deselectedCount,
        tokens: budget.reservedTokens,
      })
    );
  }
  historyForContext = chatMessages.filter((message) => message.checked);
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
  copyBtn.textContent = t("Copy");
  copyBtn.addEventListener("click", async () => {
    const originalLabel = copyBtn.textContent;
    // Visual feedback that the copy actually happened (or failed), since
    // clipboard writes are otherwise silent/invisible to the user.
    try {
      await navigator.clipboard.writeText(entry.prompt);
      copyBtn.textContent = t("✅ Copied!");
      copyBtn.classList.add("btn--copied");
    } catch (err) {
      copyBtn.textContent = t("⚠ Copy failed");
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
    chatStatus.textContent = t("Prompt extraction failed: {error}", { error: err });
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
    chatStatus.textContent = t("Could not load topic prompt history: {error}", { error: err });
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
    removeBtn.title = t("Remove {name}", { name: image.name });
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
    setChatError(t("Only image files can be attached here."));
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
    setChatError(t("Select a preset first."));
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
  forceScrollChatHistoryToBottom();
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
      thinking: m.thinking ?? null,
      images: m.images ?? null,
      checked: m.checked,
      bookmarked: Boolean(m.bookmarked),
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
    thinking: m.thinking ?? null,
    images: m.images ?? null,
    checked: m.checked ?? true,
    bookmarked: m.bookmarked ?? false,
  }));
  renderChat();
}

async function triggerAutosave(allowEmpty = false) {
  if (chatMessages.length === 0 && !allowEmpty) {
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
  chatAutosaveStatus.textContent = seconds < 5
    ? t("Autosaved just now")
    : t("Autosaved {seconds}s ago", { seconds });
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
    placeholder.textContent = t("-- select saved chat --");
    chatHistorySelect.appendChild(placeholder);
    for (const name of data.names ?? []) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      chatHistorySelect.appendChild(option);
    }
    chatHistorySelect.value = previouslySelected;
  } catch (err) {
    chatStatus.textContent = t("Could not load chat history list: {error}", { error: err });
  }
}

chatNewButton.addEventListener("click", async () => {
  const confirmed = window.confirm(
    t("Start a new chat? The current conversation and its attachments will be cleared. Saved chat histories will not be deleted.")
  );
  if (!confirmed) {
    return;
  }

  activeStreamController?.abort();
  // Keep the currently selected preset — only the conversation is cleared.
  chatMessages = [];
  chatInput.value = "";
  resetImageSelection();
  topicInput.value = "";
  promptLibraryEl.innerHTML = "";
  // Clear the load-history selection too, otherwise it still points at the
  // previously loaded/saved chat even though the conversation was reset.
  chatHistorySelect.value = "";
  // A fresh conversation is no longer tied to the previously loaded save.
  currentHistoryName = null;
  renderChat();
  await triggerAutosave(true);
});

chatSaveButton.addEventListener("click", async () => {
  const name = window.prompt(t("Save chat history as:"), currentHistoryName ?? "");
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
      chatStatus.textContent = t("Error: {message}", { message: error.detail ?? response.statusText });
      return;
    }
    const saved = await response.json();
    currentHistoryName = saved.name;
    chatStatus.textContent = t("Saved chat history as '{name}'.", { name: saved.name });
    await loadHistoryNames();
  } catch (err) {
    chatStatus.textContent = t("Save failed: {error}", { error: err });
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
      chatStatus.textContent = t("Error: {message}", { message: error.detail ?? response.statusText });
      return;
    }
    const history = await response.json();
    applyHistory(history);
    currentHistoryName = name;
    await loadPromptLibrary();
    chatStatus.textContent = t("Loaded '{name}' ({count} messages).", {
      name,
      count: history.messages?.length ?? 0,
    });
  } catch (err) {
    chatStatus.textContent = t("Load failed: {error}", { error: err });
  }
});

(async function restoreAutosaveOnLoad() {
  await i18nReady;
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
