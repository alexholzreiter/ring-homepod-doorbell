import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import {
  Accessory,
  Categories,
  Characteristic,
  HAPStorage,
  Service,
  uuid,
} from "@homebridge/hap-nodejs";
import { RingApi } from "ring-client-api";
import { isAirPlayOutput, OwnToneClient, selectOutputIds } from "./owntone-client.js";
import { createSettingsStore, normalizeSettings } from "./settings.js";

const DATA_DIR = process.env.DATA_DIR || "/data";
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(DATA_DIR, "media");
const WEB_PORT = Number(process.env.WEB_PORT || 8585);
const OWNTONE_URL = process.env.OWNTONE_URL || "http://127.0.0.1:3689";
const OWNTONE_MEDIA_PATH = process.env.OWNTONE_MEDIA_PATH || "/srv/media";
const HOMEKIT_ENABLED = process.env.HOMEKIT_ENABLED === "true";
const HOMEKIT_PORT = Number(process.env.HOMEKIT_PORT || 47129);
const HOMEKIT_PIN = process.env.HOMEKIT_PIN || "031-45-154";
const HOMEKIT_USERNAME = process.env.HOMEKIT_USERNAME || "12:34:56:78:90:AB";
const DEVICE_NAME = process.env.DEVICE_NAME || "Ring Haustür";
const RING_CAMERA_NAME = (process.env.RING_CAMERA_NAME || "").trim();
const TOKEN_FILE = path.join(DATA_DIR, "ring-refresh-token.txt");
const ALLOWED_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"]);

fs.mkdirSync(MEDIA_DIR, { recursive: true });
const settingsStore = createSettingsStore(DATA_DIR);
let settings = settingsStore.read();
const ownTone = new OwnToneClient(OWNTONE_URL, { mediaPath: OWNTONE_MEDIA_PATH });

const state = {
  startedAt: new Date().toISOString(),
  ringConnected: false,
  ringCamera: null,
  lastRingAt: null,
  lastPlaybackAt: null,
  lastError: null,
  homekitPublished: false,
  ownToneConnected: false,
  playbackActive: false,
};

let ringApi;
let ringSubscription;
let accessory;
let doorbellService;
let lastAcceptedRing = 0;
let lastKnownAirPlayOutputs = [];
let lastOwnToneError = null;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function readRefreshToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    const stored = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (stored) return stored;
  }
  const envToken = (process.env.RING_REFRESH_TOKEN || "").trim();
  if (!envToken) throw new Error("Kein Ring Refresh-Token vorhanden.");
  fs.writeFileSync(TOKEN_FILE, envToken, { mode: 0o600 });
  return envToken;
}

function saveRefreshToken(token) {
  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  console.log("Ring Refresh-Token wurde aktualisiert und gespeichert.");
}

function publishHomeKit() {
  if (!HOMEKIT_ENABLED) return;
  HAPStorage.setCustomStoragePath(path.join(DATA_DIR, "hap"));
  accessory = new Accessory(
    DEVICE_NAME,
    uuid.generate(`ring-homepod-doorbell:${HOMEKIT_USERNAME}`)
  );
  accessory.category = Categories.VIDEO_DOORBELL;
  accessory
    .getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, "Local")
    .setCharacteristic(Characteristic.Model, "Ring HomePod Doorbell Bridge")
    .setCharacteristic(Characteristic.SerialNumber, HOMEKIT_USERNAME)
    .setCharacteristic(Characteristic.FirmwareRevision, "0.2.0");
  doorbellService = new Service.Doorbell(DEVICE_NAME);
  accessory.addService(doorbellService);
  accessory.publish({
    username: HOMEKIT_USERNAME,
    pincode: HOMEKIT_PIN,
    port: HOMEKIT_PORT,
    category: Categories.VIDEO_DOORBELL,
  });
  state.homekitPublished = true;
  console.log(`Optionaler HomeKit-Gong veröffentlicht: "${DEVICE_NAME}".`);
}

function triggerHomeKit() {
  doorbellService?.updateCharacteristic(
    Characteristic.ProgrammableSwitchEvent,
    Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS
  );
}

async function getOwnToneOutputs() {
  try {
    const outputs = await ownTone.getOutputs();
    state.ownToneConnected = true;
    if (lastOwnToneError && state.lastError === lastOwnToneError) state.lastError = null;
    lastOwnToneError = null;
    const airPlayOutputs = outputs.filter(isAirPlayOutput);
    if (airPlayOutputs.length) lastKnownAirPlayOutputs = airPlayOutputs;
    return outputs;
  } catch (error) {
    state.ownToneConnected = false;
    lastOwnToneError = errorMessage(error);
    throw error;
  }
}

async function playCustomChime() {
  if (state.playbackActive) {
    console.log("Klingelton läuft bereits; erneuter Start wird übersprungen.");
    return;
  }
  if (!settings.chimeFilename) {
    throw new Error("Noch kein eigener Klingelton hochgeladen.");
  }

  state.playbackActive = true;
  let previous;
  try {
    const outputs = await getOwnToneOutputs();
    const outputIds = selectOutputIds(outputs, settings);
    if (!outputIds.length) {
      throw new Error("Keine ausgewählten, erreichbaren AirPlay-Lautsprecher gefunden.");
    }
    const track = await ownTone.findTrack(settings.chimeFilename);
    previous = await ownTone.playTrack(track, outputIds, settings.volume);
    state.lastPlaybackAt = new Date().toISOString();
    console.log(`Klingelton auf ${outputIds.length} AirPlay-Ausgang/Ausgängen gestartet.`);

    const playbackTime = Math.min(Math.max(Number(track.length_ms) || 5000, 1000), 60000);
    await new Promise((resolve) => setTimeout(resolve, playbackTime + 1500));
  } finally {
    if (previous) await ownTone.stopAndRestore(previous).catch((error) => {
      console.error("AirPlay-Zustand konnte nicht vollständig wiederhergestellt werden:", error);
    });
    state.playbackActive = false;
  }
}

async function handleDoorbellPress(source) {
  const now = Date.now();
  if (source === "ring" && now - lastAcceptedRing < settings.cooldownSeconds * 1000) {
    console.log("Doppeltes Ring-Ereignis innerhalb der Sperrzeit ignoriert.");
    return;
  }
  lastAcceptedRing = now;
  state.lastRingAt = new Date().toISOString();
  state.lastError = null;
  console.log(`Türklingel ausgelöst (${source}).`);
  triggerHomeKit();
  try {
    await playCustomChime();
    return true;
  } catch (error) {
    state.lastError = errorMessage(error);
    console.error("Klingelton konnte nicht abgespielt werden:", error);
    return false;
  }
}

async function startRing() {
  try {
    ringApi = new RingApi({
      refreshToken: readRefreshToken(),
      debug: process.env.DEBUG_RING === "true",
      controlCenterDisplayName: "Ring HomePod Doorbell",
    });
    ringApi.onRefreshTokenUpdated.subscribe(({ newRefreshToken }) => {
      if (newRefreshToken) saveRefreshToken(newRefreshToken);
    });
    const cameras = await ringApi.getCameras();
    const doorbells = cameras.filter((camera) => camera.isDoorbot);
    const candidates = doorbells.length ? doorbells : cameras;
    const camera = RING_CAMERA_NAME
      ? candidates.find((item) => item.name.toLowerCase() === RING_CAMERA_NAME.toLowerCase())
      : candidates[0];
    if (!camera) {
      throw new Error(
        RING_CAMERA_NAME
          ? `Ring-Kamera "${RING_CAMERA_NAME}" nicht gefunden. Verfügbar: ${candidates
              .map((item) => item.name)
              .join(", ")}`
          : "Im Ring-Konto wurde keine Kamera gefunden."
      );
    }
    state.ringCamera = camera.name;
    state.ringConnected = true;
    state.lastError = null;
    ringSubscription = camera.onDoorbellPressed.subscribe(() => {
      void handleDoorbellPress("ring");
    });
    console.log(`Ring-Ereignislistener für "${camera.name}" ist aktiv.`);
  } catch (error) {
    state.ringConnected = false;
    state.lastError = errorMessage(error);
    console.error("Ring konnte nicht gestartet werden:", error);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});
const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(express.static(fileURLToPath(new URL("public", import.meta.url))));

app.get("/api/status", async (_req, res) => {
  let outputs = [];
  try {
    outputs = await getOwnToneOutputs();
  } catch (error) {
    state.lastError = errorMessage(error);
  }
  const airPlayOutputs = outputs.filter(isAirPlayOutput);
  res.json({
    ...state,
    deviceName: DEVICE_NAME,
    homekitEnabled: HOMEKIT_ENABLED,
    settings,
    chimeUrl: settings.chimeFilename ? "/api/chime" : null,
    outputs: airPlayOutputs.length ? airPlayOutputs : lastKnownAirPlayOutputs,
    outputsStale: !airPlayOutputs.length && lastKnownAirPlayOutputs.length > 0,
  });
});

app.put("/api/settings", (req, res) => {
  const candidate = normalizeSettings({ ...settings, ...req.body, chimeFilename: settings.chimeFilename });
  if (!candidate.useAllOutputs && !candidate.selectedOutputIds.length) {
    return res.status(400).json({ error: "Wähle mindestens einen HomePod aus." });
  }
  settings = settingsStore.write(candidate);
  return res.json({ ok: true, settings });
});

app.post("/api/chime", upload.single("chime"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Keine Audiodatei empfangen." });
  const extension = path.extname(req.file.originalname).slice(1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return res.status(415).json({ error: "Erlaubt sind MP3, WAV, M4A, AAC, FLAC und OGG." });
  }

  const filename = `doorbell-${Date.now()}.${extension}`;
  const destination = path.join(MEDIA_DIR, filename);
  const temporary = `${destination}.tmp`;
  try {
    fs.writeFileSync(temporary, req.file.buffer, { mode: 0o644 });
    fs.renameSync(temporary, destination);
    const previousFilename = settings.chimeFilename;
    settings = settingsStore.write({ ...settings, chimeFilename: filename });
    await ownTone.rescan();
    await ownTone.findTrack(filename);
    if (previousFilename && previousFilename !== filename) {
      fs.rmSync(path.join(MEDIA_DIR, path.basename(previousFilename)), { force: true });
      void ownTone.rescan().catch(() => null);
    }
    state.ownToneConnected = true;
    return res.json({ ok: true, filename, originalName: req.file.originalname });
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    state.lastError = errorMessage(error);
    return res.status(502).json({ error: state.lastError });
  }
});

app.get("/api/chime", (_req, res) => {
  if (!settings.chimeFilename) return res.sendStatus(404);
  const filename = path.join(MEDIA_DIR, path.basename(settings.chimeFilename));
  if (!fs.existsSync(filename)) return res.sendStatus(404);
  return res.sendFile(filename);
});

app.post("/api/outputs/:id/pair", async (req, res) => {
  const pin = String(req.body?.pin ?? "").trim();
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: "Die PIN muss vierstellig sein." });
  try {
    await ownTone.pairOutput(req.params.id, pin);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(502).json({ error: errorMessage(error) });
  }
});

app.post("/api/test-ring", async (_req, res) => {
  const ok = await handleDoorbellPress("web-test");
  if (!ok) return res.status(502).json({ error: state.lastError || "Testklingeln fehlgeschlagen." });
  return res.json({ ok: true, completedAt: new Date().toISOString() });
});

app.get("/health", (_req, res) => {
  const ready = state.ringConnected && state.ownToneConnected;
  res.status(ready ? 200 : 503).json({ ok: ready, ...state });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Die Audiodatei darf höchstens 15 MB groß sein." });
  }
  console.error("Unbehandelter Webfehler:", error);
  return res.status(500).json({ error: errorMessage(error) });
});

publishHomeKit();
const webServer = app.listen(WEB_PORT, "0.0.0.0", (error) => {
  if (error) {
    state.lastError = `Webserver konnte nicht gestartet werden: ${errorMessage(error)}`;
    console.error(state.lastError);
    process.exitCode = 1;
    return;
  }
  console.log(`Weboberfläche läuft auf Port ${WEB_PORT}.`);
});
void startRing();

function shutdown(signal) {
  console.log(`${signal} empfangen, App wird beendet.`);
  ringSubscription?.unsubscribe?.();
  accessory?.unpublish();
  webServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
