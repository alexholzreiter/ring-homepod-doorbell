const DEFAULT_TIMEOUT_MS = 5000;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class OwnToneClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = options.fetch ?? globalThis.fetch;
    this.mediaPath = options.mediaPath ?? "/srv/media";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async request(endpoint, options = {}) {
    const response = await this.fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(
        `OwnTone ${options.method ?? "GET"} ${endpoint}: HTTP ${response.status}${
          details ? ` – ${details.slice(0, 180)}` : ""
        }`
      );
    }

    if (response.status === 204) return null;
    const contentType = response.headers.get("content-type") ?? "";
    return contentType.includes("json") ? response.json() : response.text();
  }

  async getOutputs() {
    const data = await this.request("/api/outputs");
    return Array.isArray(data?.outputs) ? data.outputs : [];
  }

  async getPlayer() {
    return this.request("/api/player");
  }

  async rescan() {
    await this.request("/api/update", { method: "PUT" });
  }

  async findTrack(filename, attempts = 24) {
    const wantedPath = `${this.mediaPath}/${filename}`;
    const query = new URLSearchParams({ directory: this.mediaPath });

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const data = await this.request(`/api/library/files?${query}`);
      const track = data?.tracks?.items?.find((item) => item.path === wantedPath);
      if (track) return track;
      if (attempt < attempts - 1) await sleep(250);
    }

    throw new Error(`OwnTone hat die Audiodatei "${filename}" noch nicht indexiert.`);
  }

  async setOutputs(outputIds) {
    await this.request("/api/outputs/set", {
      body: JSON.stringify({ outputs: outputIds }),
      method: "PUT",
    });
  }

  async configureOutput(outputId, values) {
    await this.request(`/api/outputs/${encodeURIComponent(outputId)}`, {
      body: JSON.stringify(values),
      method: "PUT",
    });
  }

  async pairOutput(outputId, pin) {
    return this.configureOutput(outputId, { pin });
  }

  async playTrack(track, outputIds, volume) {
    const outputs = await this.getOutputs();
    const availableIds = new Set(outputs.map((output) => String(output.id)));
    const missingIds = outputIds.filter((id) => !availableIds.has(String(id)));
    if (missingIds.length) {
      throw new Error(`Nicht erreichbare AirPlay-Ausgänge: ${missingIds.join(", ")}`);
    }

    const previous = outputs.map((output) => ({
      id: String(output.id),
      selected: Boolean(output.selected),
      volume: Number(output.volume),
    }));

    try {
      await this.setOutputs(outputIds);
      for (const id of outputIds) {
        await this.configureOutput(id, { selected: true, volume });
      }

      await this.request("/api/queue/clear", { method: "PUT" });

      const query = new URLSearchParams({
        playback: "start",
        shuffle: "false",
        uris: track.uri,
      });
      await this.request(`/api/queue/items/add?${query}`, { method: "POST" });
      return previous;
    } catch (error) {
      await this.stopAndRestore(previous).catch(() => null);
      throw error;
    }
  }

  async stopAndRestore(previous) {
    await this.request("/api/player/stop", { method: "PUT" });
    await sleep(250);
    for (const output of previous.filter((item) => Number.isFinite(item.volume))) {
      await this.configureOutput(output.id, { volume: output.volume }).catch(() => null);
    }
    await this.setOutputs(previous.filter((output) => output.selected).map((output) => output.id));
  }
}

export function isAirPlayOutput(output) {
  return /^airplay(?:\s+\d+)?$/i.test(String(output?.type ?? "").trim());
}

export function selectOutputIds(outputs, settings) {
  const airPlayOutputs = outputs.filter(isAirPlayOutput);
  const requested = settings.useAllOutputs
    ? airPlayOutputs.map((output) => String(output.id))
    : settings.selectedOutputIds.map(String);
  const available = new Set(airPlayOutputs.map((output) => String(output.id)));
  return requested.filter((id) => available.has(id));
}
