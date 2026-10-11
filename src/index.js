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
import { PushNotificationAction, RingApi } from "ring-client-api";
import { enableDebug, useLogger } from "ring-client-api/util";
import { isAirPlayOutput, OwnToneClient, selectOutputIds } from "./owntone-client.js";
import { createSettingsStore, normalizeSettings } from "./settings.js";
import { createDingDeduplicator, createDingPoller } from "./ding-poller.js";
import { ensureSilenceFile } from "./silence.js";
import { createTokenStore, isInvalidRefreshTokenError } from "./token-store.js";

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
const RING_POLL_INTERVAL_MS = Number(process.env.RING_POLL_INTERVAL_MS || 4000);
const LEAD_IN_FILENAME = "doorbell-lead-in.wav";
const TAIL_FILENAME = "doorbell-tail.wav";
const LEAD_IN_MS = Number(process.env.PLAYBACK_LEAD_IN_MS || 1500);
const TAIL_MS = Number(process.env.PLAYBACK_TAIL_MS || 5000);
const ALLOWED_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"]);

fs.mkdirSync(MEDIA_DIR, { recursive: true });
const settingsStore = createSettingsStore(DATA_DIR);
const tokenStore = createTokenStore(DATA_DIR, process.env.RING_REFRESH_TOKEN);
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
let dingPoller;
const dingDeduplicator = createDingDeduplicator();
let refreshTokenSubscription;
let accessory;
let doorbellService;
let lastAcceptedRing = 0;
let lastKnownAirPlayOutputs = [];
let lastOwnToneError = null;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function saveRefreshToken(token) {
  tokenStore.save(token);
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

async function ensurePadding() {
  const leadInWritten = ensureSilenceFile(path.join(MEDIA_DIR, LEAD_IN_FILENAME), LEAD_IN_MS);
  const tailWritten = ensureSilenceFile(path.join(MEDIA_DIR, TAIL_FILENAME), TAIL_MS);
  if (leadInWritten || tailWritten) await ownTone.rescan();
  return {
    leadIn: await ownTone.findTrack(LEAD_IN_FILENAME),
    tail: await ownTone.findTrack(TAIL_FILENAME),
  };
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
  try {
    const outputs = await getOwnToneOutputs();
    const outputIds = selectOutputIds(outputs, settings);
    if (!outputIds.length) {
      throw new Error("Keine ausgewählten, erreichbaren AirPlay-Lautsprecher gefunden.");
    }
    const paddingTracks = await ensurePadding();
    const track = await ownTone.findTrack(settings.chimeFilename);
    // AirPlay 2 receivers buffer several seconds before they output audio, and
    // OwnTone tears the session down once the queue runs out. Surrounding the
    // chime with silence keeps the session alive until it has been heard.
    await ownTone.playTracks(
      [paddingTracks.leadIn, track, paddingTracks.tail],
      outputIds,
      settings.volume
    );
    state.lastPlaybackAt = new Date().toISOString();
    console.log(`Klingelton auf ${outputIds.length} AirPlay-Ausgang/Ausgängen gestartet.`);

    const playbackTime = Math.min(Math.max(Number(track.length_ms) || 5000, 1000), 60000);
    await new Promise((resolve) =>
      setTimeout(resolve, LEAD_IN_MS + playbackTime + TAIL_MS + 1500)
    );
  } finally {
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

// Without DEBUG_RING, still surface ring-client-api's push-notification
// diagnostics (e.g. notifications in an unknown format) so missing doorbell
// events can be traced from the container log.
if (process.env.DEBUG_RING !== "true") {
  enableDebug();
  useLogger({
    logInfo: (...message) => {
      const text = message.join(" ");
      if (/push notification/i.test(text)) console.log(`[ring] ${text.slice(0, 2000)}`);
    },
    logError: (message) => console.error("[ring]", message),
  });
}

async function connectRing(candidate) {
  const candidateApi = new RingApi({
    refreshToken: candidate.token,
    debug: process.env.DEBUG_RING === "true",
    controlCenterDisplayName: "Ring HomePod Doorbell",
  });
  const candidateRefreshSubscription = candidateApi.onRefreshTokenUpdated.subscribe(
    ({ newRefreshToken }) => {
      if (newRefreshToken) saveRefreshToken(newRefreshToken);
    }
  );

  try {
    const cameras = await candidateApi.getCameras();
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
    return { api: candidateApi, camera, refreshSubscription: candidateRefreshSubscription };
  } catch (error) {
    candidateRefreshSubscription.unsubscribe();
    candidateApi.disconnect();
    throw error;
  }
}

async function startRing() {
  try {
    const storedTokenBeforeAttempt = tokenStore.currentStoredToken();
    const candidates = tokenStore.candidates();
    let connection;
    let acceptedCandidate;
    let lastError;

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      try {
        connection = await connectRing(candidate);
        acceptedCandidate = candidate;
        break;
      } catch (error) {
        lastError = error;
        const canTryNext = isInvalidRefreshTokenError(error) && index < candidates.length - 1;
        if (!canTryNext) throw error;
        console.warn(
          candidate.source === "stored"
            ? "Gespeicherter Ring-Token ist ungültig; versuche den Token aus der Runtipi-Konfiguration."
            : "Ring-Token aus der Runtipi-Konfiguration ist ungültig; versuche den zuletzt gespeicherten Token."
        );
      }
    }

    if (!connection || !acceptedCandidate) throw lastError;
    tokenStore.accept(acceptedCandidate, storedTokenBeforeAttempt);
    ringApi = connection.api;
    refreshTokenSubscription = connection.refreshSubscription;
    const { camera } = connection;
    state.ringCamera = camera.name;
    state.ringConnected = true;
    state.lastError = null;
    ringSubscription = camera.onNewNotification.subscribe((notification) => {
      const category = notification?.android_config?.category ?? "unbekannt";
      console.log(`Ring-Benachrichtigung für "${camera.name}" empfangen: ${category}`);
      if (category !== PushNotificationAction.Ding) return;
      if (!dingDeduplicator.accept(notification?.data?.event?.ding?.id, "push")) return;
      void handleDoorbellPress("ring");
    });
    dingPoller = createDingPoller({
      fetchLatestDing: async () =>
        (await camera.getEvents({ limit: 1, kind: "ding" }))?.events?.[0] ?? null,
      onDing: (event) => {
        if (!dingDeduplicator.accept(event.ding_id_str ?? event.ding_id, "history")) return;
        console.log(`Klingeln von "${camera.name}" über den Ring-Verlauf erkannt.`);
        void handleDoorbellPress("ring");
      },
      intervalMs: RING_POLL_INTERVAL_MS,
    });
    dingPoller.start();
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

app.put("/api/settings", async (req, res) => {
  const candidate = normalizeSettings({ ...settings, ...req.body, chimeFilename: settings.chimeFilename });
  if (!candidate.useAllOutputs && !candidate.selectedOutputIds.length) {
    return res.status(400).json({ error: "Wähle mindestens einen HomePod aus." });
  }
  settings = settingsStore.write(candidate);
  try {
    const outputs = await getOwnToneOutputs();
    const outputIds = selectOutputIds(outputs, settings);
    await ownTone.prepareOutputs(outputIds, settings.volume);
    return res.json({ ok: true, settings });
  } catch (error) {
    state.lastError = errorMessage(error);
    return res.json({
      ok: true,
      settings,
      warning: "Einstellungen gespeichert, aber OwnTone ist gerade nicht erreichbar.",
    });
  }
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
  dingPoller?.stop();
  refreshTokenSubscription?.unsubscribe?.();
  ringApi?.disconnect?.();
  accessory?.unpublish();
  webServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
