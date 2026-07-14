import fs from "node:fs";
import path from "node:path";
import express from "express";
import {
  Accessory,
  Categories,
  Characteristic,
  HAPStorage,
  Service,
  uuid,
} from "hap-nodejs";
import {
  PushNotificationAction,
  RingApi,
} from "ring-client-api";

const DATA_DIR = process.env.DATA_DIR || "/data";
const WEB_PORT = Number(process.env.WEB_PORT || 8585);
const HOMEKIT_PORT = Number(process.env.HOMEKIT_PORT || 47129);
const HOMEKIT_PIN = process.env.HOMEKIT_PIN || "031-45-154";
const HOMEKIT_USERNAME =
  process.env.HOMEKIT_USERNAME || "12:34:56:78:90:AB";
const DEVICE_NAME = process.env.DEVICE_NAME || "Ring Haustür";
const RING_CAMERA_NAME = (process.env.RING_CAMERA_NAME || "").trim();
const TOKEN_FILE = path.join(DATA_DIR, "ring-refresh-token.txt");

fs.mkdirSync(DATA_DIR, { recursive: true });
HAPStorage.setCustomStoragePath(path.join(DATA_DIR, "hap"));

const state = {
  startedAt: new Date().toISOString(),
  ringConnected: false,
  ringCamera: null,
  lastRingAt: null,
  lastError: null,
  homekitPublished: false,
};

function readRefreshToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    const stored = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (stored) return stored;
  }

  const envToken = (process.env.RING_REFRESH_TOKEN || "").trim();
  if (!envToken) {
    throw new Error(
      "Kein Ring Refresh-Token vorhanden. Setze RING_REFRESH_TOKEN."
    );
  }

  fs.writeFileSync(TOKEN_FILE, envToken, { mode: 0o600 });
  return envToken;
}

function saveRefreshToken(token) {
  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  console.log("Ring Refresh-Token wurde aktualisiert und gespeichert.");
}

const accessory = new Accessory(
  DEVICE_NAME,
  uuid.generate("ring-homepod-doorbell:front-door")
);

accessory.category = Categories.VIDEO_DOORBELL;

accessory
  .getService(Service.AccessoryInformation)
  .setCharacteristic(Characteristic.Manufacturer, "Local")
  .setCharacteristic(Characteristic.Model, "Ring HomePod Doorbell Bridge")
  .setCharacteristic(Characteristic.SerialNumber, HOMEKIT_USERNAME)
  .setCharacteristic(Characteristic.FirmwareRevision, "0.1.0");

const doorbellService = new Service.Doorbell(DEVICE_NAME);
accessory.addService(doorbellService);

function triggerDoorbell(source = "manual") {
  doorbellService.updateCharacteristic(
    Characteristic.ProgrammableSwitchEvent,
    Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS
  );

  state.lastRingAt = new Date().toISOString();
  console.log(`HomeKit-Türklingel ausgelöst (${source}).`);
}

accessory.publish({
  username: HOMEKIT_USERNAME,
  pincode: HOMEKIT_PIN,
  port: HOMEKIT_PORT,
  category: Categories.VIDEO_DOORBELL,
});

state.homekitPublished = true;
console.log(
  `HomeKit veröffentlicht: "${DEVICE_NAME}", PIN ${HOMEKIT_PIN}, Port ${HOMEKIT_PORT}`
);

async function startRing() {
  try {
    const ringApi = new RingApi({
      refreshToken: readRefreshToken(),
      debug: process.env.DEBUG_RING === "true",
    });

    ringApi.onRefreshTokenUpdated.subscribe(({ newRefreshToken }) => {
      if (newRefreshToken) saveRefreshToken(newRefreshToken);
    });

    const cameras = await ringApi.getCameras();

    if (!cameras.length) {
      throw new Error("Im Ring-Konto wurde keine Kamera gefunden.");
    }

    const camera = RING_CAMERA_NAME
      ? cameras.find(
          (item) =>
            item.name.toLowerCase() === RING_CAMERA_NAME.toLowerCase()
        )
      : cameras[0];

    if (!camera) {
      throw new Error(
        `Ring-Kamera "${RING_CAMERA_NAME}" wurde nicht gefunden. Verfügbar: ${cameras
          .map((item) => item.name)
          .join(", ")}`
      );
    }

    state.ringCamera = camera.name;
    state.ringConnected = true;
    state.lastError = null;

    console.log(`Ring-Kamera ausgewählt: ${camera.name}`);

    camera.onNewNotification.subscribe((notification) => {
      try {
        const action = notification?.android_config?.category;

        if (action === PushNotificationAction.Ding) {
          console.log(`Ring-Klingeln von "${camera.name}" empfangen.`);
          triggerDoorbell("ring");
        }
      } catch (error) {
        state.lastError = error instanceof Error ? error.message : String(error);
        console.error("Fehler beim Verarbeiten des Ring-Events:", error);
      }
    });

    console.log("Ring-Ereignislistener ist aktiv.");
  } catch (error) {
    state.ringConnected = false;
    state.lastError = error instanceof Error ? error.message : String(error);
    console.error("Ring konnte nicht gestartet werden:", error);
  }
}

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ring HomePod Doorbell</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 18px;background:#111;color:#eee}
    .card{background:#1d1d1f;border-radius:16px;padding:22px;margin:16px 0}
    button{font:inherit;padding:12px 18px;border:0;border-radius:10px;cursor:pointer}
    code{background:#333;padding:3px 6px;border-radius:5px}
    .ok{color:#71d17b}.bad{color:#ff7777}
  </style>
</head>
<body>
  <h1>Ring HomePod Doorbell</h1>
  <div class="card">
    <p>Ring: <strong class="${state.ringConnected ? "ok" : "bad"}">${state.ringConnected ? "verbunden" : "nicht verbunden"}</strong></p>
    <p>Kamera: <strong>${state.ringCamera || "–"}</strong></p>
    <p>HomeKit: <strong class="${state.homekitPublished ? "ok" : "bad"}">${state.homekitPublished ? "veröffentlicht" : "nicht veröffentlicht"}</strong></p>
    <p>HomeKit-PIN: <code>${HOMEKIT_PIN}</code></p>
    <p>Letztes Klingeln: <strong>${state.lastRingAt || "–"}</strong></p>
    <p>Letzter Fehler: <strong>${state.lastError || "–"}</strong></p>
  </div>
  <div class="card">
    <button onclick="fetch('/api/test-ring',{method:'POST'}).then(()=>location.reload())">Test-Klingeln auslösen</button>
  </div>
</body>
</html>`);
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    ...state,
  });
});

app.post("/api/test-ring", (_req, res) => {
  triggerDoorbell("web-test");
  res.json({ ok: true, triggeredAt: state.lastRingAt });
});

app.listen(WEB_PORT, "0.0.0.0", () => {
  console.log(`Weboberfläche läuft auf Port ${WEB_PORT}.`);
});

startRing();

function shutdown(signal) {
  console.log(`${signal} empfangen, App wird beendet.`);
  accessory.unpublish();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
