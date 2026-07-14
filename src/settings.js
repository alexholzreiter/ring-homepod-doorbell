import fs from "node:fs";
import path from "node:path";

export const DEFAULT_SETTINGS = Object.freeze({
  chimeFilename: null,
  cooldownSeconds: 5,
  selectedOutputIds: [],
  useAllOutputs: true,
  volume: 60,
});

function numberInRange(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.round(parsed)))
    : fallback;
}

export function normalizeSettings(value = {}) {
  return {
    chimeFilename:
      typeof value.chimeFilename === "string" && value.chimeFilename
        ? path.basename(value.chimeFilename)
        : null,
    cooldownSeconds: numberInRange(
      value.cooldownSeconds,
      DEFAULT_SETTINGS.cooldownSeconds,
      1,
      60
    ),
    selectedOutputIds: Array.isArray(value.selectedOutputIds)
      ? [...new Set(value.selectedOutputIds.filter((id) => typeof id === "string" && id))]
      : [],
    useAllOutputs:
      typeof value.useAllOutputs === "boolean"
        ? value.useAllOutputs
        : DEFAULT_SETTINGS.useAllOutputs,
    volume: numberInRange(value.volume, DEFAULT_SETTINGS.volume, 1, 100),
  };
}

export function createSettingsStore(dataDirectory) {
  const filename = path.join(dataDirectory, "settings.json");
  fs.mkdirSync(dataDirectory, { recursive: true });

  function read() {
    try {
      return normalizeSettings(JSON.parse(fs.readFileSync(filename, "utf8")));
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) {
        throw error;
      }
      return { ...DEFAULT_SETTINGS, selectedOutputIds: [] };
    }
  }

  function write(value) {
    const normalized = normalizeSettings(value);
    const temporary = `${filename}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, {
      mode: 0o600,
    });
    fs.renameSync(temporary, filename);
    return normalized;
  }

  return { read, write };
}
