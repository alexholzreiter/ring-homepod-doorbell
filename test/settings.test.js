import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSettingsStore, normalizeSettings } from "../src/settings.js";

test("normalizeSettings clamps values and removes duplicate output ids", () => {
  assert.deepEqual(
    normalizeSettings({
      chimeFilename: "../../tone.mp3",
      cooldownSeconds: 200,
      selectedOutputIds: ["a", "a", "", 4],
      useAllOutputs: false,
      volume: -10,
    }),
    {
      chimeFilename: "tone.mp3",
      cooldownSeconds: 60,
      selectedOutputIds: ["a"],
      useAllOutputs: false,
      volume: 1,
    }
  );
});

test("settings store persists normalized settings atomically", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "doorbell-settings-"));
  const store = createSettingsStore(directory);
  assert.equal(store.read().volume, 60);
  store.write({ volume: 77, cooldownSeconds: 3, selectedOutputIds: ["pod"] });
  assert.equal(store.read().volume, 77);
  assert.equal(store.read().cooldownSeconds, 3);
  fs.rmSync(directory, { recursive: true, force: true });
});
