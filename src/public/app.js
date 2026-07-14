import { chooseVisibleOutputs, shouldApplyServerForm } from "./ui-state.js";

const $ = (selector) => document.querySelector(selector);
const elements = {
  airplayDot: $("#airplay-dot"),
  airplayStatus: $("#airplay-status"),
  camera: $("#camera"),
  chimeDot: $("#chime-dot"),
  chimeFile: $("#chime-file"),
  chimePlayer: $("#chime-player"),
  chimeStatus: $("#chime-status"),
  cooldown: $("#cooldown"),
  fileLabel: $("#file-label"),
  lastError: $("#last-error"),
  lastPlayback: $("#last-playback"),
  lastRing: $("#last-ring"),
  notice: $("#notice"),
  outputs: $("#outputs"),
  refresh: $("#refresh"),
  ringDot: $("#ring-dot"),
  ringStatus: $("#ring-status"),
  save: $("#save"),
  test: $("#test-ring"),
  uploadForm: $("#upload-form"),
  useAll: $("#use-all"),
  volume: $("#volume"),
  volumeValue: $("#volume-value"),
};

let current;
let noticeTimer;
let formDirty = false;
let lastKnownOutputs = [];

function markFormDirty() {
  formDirty = true;
}

function setConnection(dot, label, connected, goodText, badText) {
  dot.className = `dot ${connected ? "ok" : "bad"}`;
  label.textContent = connected ? goodText : badText;
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value)) : "–";
}

function showNotice(message, success = false) {
  window.clearTimeout(noticeTimer);
  elements.notice.textContent = message;
  elements.notice.className = `notice${success ? " success" : ""}`;
  noticeTimer = window.setTimeout(clearNotice, success ? 4000 : 7000);
}

function clearNotice() {
  window.clearTimeout(noticeTimer);
  elements.notice.className = "notice hidden";
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function renderOutputs(outputs, settings) {
  elements.outputs.replaceChildren();
  if (!outputs.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Keine AirPlay-Lautsprecher gefunden.";
    elements.outputs.append(empty);
    return;
  }

  for (const output of outputs) {
    const row = document.createElement("div");
    row.className = "output-row";
    const label = document.createElement("label");
    const icon = document.createElement("span");
    icon.className = "speaker-icon";
    icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="5"/><path d="M10 7h4M10 17h4"/></svg>';
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = String(output.id);
    checkbox.className = "output-checkbox";
    checkbox.checked = settings.useAllOutputs || settings.selectedOutputIds.includes(String(output.id));
    checkbox.disabled = settings.useAllOutputs;
    const text = document.createElement("span");
    text.className = "output-copy";
    const name = document.createElement("strong");
    name.textContent = output.name;
    const detail = document.createElement("small");
    detail.textContent = `AirPlay · ${output.volume} % Lautstärke`;
    text.append(name, detail);
    const check = document.createElement("span");
    check.className = "output-check";
    check.append(checkbox, document.createElement("i"));
    label.append(icon, text, check);
    row.append(label);
    if (output.needs_auth_key || output.requires_auth) {
      const auth = document.createElement("small");
      auth.className = "auth-badge";
      auth.textContent = "Freigabe nötig";
      row.append(auth);
    }
    elements.outputs.append(row);
  }
}

async function loadStatus({ forceForm = false, quiet = false } = {}) {
  try {
    const data = await api("/api/status");
    current = data;
    if (data.outputs.length) lastKnownOutputs = data.outputs;
    const visibleOutputs = chooseVisibleOutputs(data.outputs, lastKnownOutputs);
    setConnection(elements.ringDot, elements.ringStatus, data.ringConnected, "Verbunden", "Nicht verbunden");
    setConnection(elements.airplayDot, elements.airplayStatus, data.ownToneConnected, `${data.outputs.length} gefunden`, "Nicht erreichbar");
    setConnection(elements.chimeDot, elements.chimeStatus, Boolean(data.settings.chimeFilename), data.settings.chimeFilename || "Bereit", "Nicht gewählt");
    elements.camera.textContent = data.ringCamera || "–";
    elements.lastRing.textContent = formatDate(data.lastRingAt);
    elements.lastPlayback.textContent = formatDate(data.lastPlaybackAt);
    elements.lastError.textContent = data.lastError || "–";
    if (shouldApplyServerForm({ dirty: formDirty, force: forceForm })) {
      elements.useAll.checked = data.settings.useAllOutputs;
      elements.volume.value = data.settings.volume;
      elements.volumeValue.textContent = `${data.settings.volume} %`;
      elements.volume.style.background = `linear-gradient(90deg, var(--blue) 0 ${data.settings.volume}%, #e2e7ec ${data.settings.volume}% 100%)`;
      elements.cooldown.value = data.settings.cooldownSeconds;
      renderOutputs(visibleOutputs, data.settings);
    }
    if (data.chimeUrl) {
      elements.chimePlayer.src = `${data.chimeUrl}?v=${encodeURIComponent(data.settings.chimeFilename)}`;
      elements.chimePlayer.classList.remove("hidden");
    }
  } catch (error) {
    showNotice(`Status konnte nicht geladen werden: ${error.message}`);
  }
}

elements.volume.addEventListener("input", () => {
  markFormDirty();
  elements.volumeValue.textContent = `${elements.volume.value} %`;
  elements.volume.style.background = `linear-gradient(90deg, var(--blue) 0 ${elements.volume.value}%, #e2e7ec ${elements.volume.value}% 100%)`;
});

elements.chimeFile.addEventListener("change", () => {
  elements.fileLabel.textContent = elements.chimeFile.files[0]?.name || "Audiodatei auswählen";
});

elements.useAll.addEventListener("change", () => {
  markFormDirty();
  document.querySelectorAll(".output-checkbox").forEach((checkbox) => {
    checkbox.disabled = elements.useAll.checked;
    if (elements.useAll.checked) checkbox.checked = true;
  });
});

elements.cooldown.addEventListener("input", markFormDirty);
elements.outputs.addEventListener("change", (event) => {
  if (event.target.matches(".output-checkbox")) markFormDirty();
});

elements.uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearNotice();
  const button = event.submitter;
  button.disabled = true;
  try {
    await api("/api/chime", { method: "POST", body: new FormData(elements.uploadForm) });
    showNotice("Klingelton wurde hochgeladen und von OwnTone erkannt.", true);
    elements.uploadForm.reset();
    elements.fileLabel.textContent = "Audiodatei auswählen";
    await loadStatus({ quiet: true });
  } catch (error) {
    showNotice(error.message);
  } finally {
    button.disabled = false;
  }
});

elements.save.addEventListener("click", async () => {
  clearNotice();
  elements.save.disabled = true;
  try {
    const selectedOutputIds = [...document.querySelectorAll(".output-checkbox:checked")].map((item) => item.value);
    const result = await api("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cooldownSeconds: Number(elements.cooldown.value),
        selectedOutputIds,
        useAllOutputs: elements.useAll.checked,
        volume: Number(elements.volume.value),
      }),
    });
    formDirty = false;
    showNotice(result.warning || "Einstellungen und Gerätelautstärke gespeichert.", !result.warning);
    await loadStatus({ forceForm: true, quiet: true });
  } catch (error) {
    showNotice(error.message);
  } finally {
    elements.save.disabled = false;
  }
});

elements.test.addEventListener("click", async () => {
  clearNotice();
  elements.test.disabled = true;
  try {
    await api("/api/test-ring", { method: "POST" });
    showNotice("Testklingeln wurde erfolgreich abgespielt.", true);
    await loadStatus({ quiet: true });
  } catch (error) {
    showNotice(error.message);
  } finally {
    elements.test.disabled = false;
  }
});

elements.refresh.addEventListener("click", () => loadStatus());
await loadStatus();
setInterval(() => loadStatus({ quiet: true }), 15000);
