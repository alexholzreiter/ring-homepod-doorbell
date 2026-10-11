// Fallback for doorbell presses when Ring stops delivering push notifications
// to this client: periodically read the camera's event history and report
// dings that have not been seen before.
export function createDingPoller({
  fetchLatestDing,
  onDing,
  intervalMs = 4000,
  maxAgeMs = 60000,
  now = () => Date.now(),
  log = console,
}) {
  let lastDingId = null;
  let initialized = false;
  let timer = null;
  let failing = false;

  async function poll() {
    let event;
    try {
      event = await fetchLatestDing();
    } catch (error) {
      if (!failing) log.warn("Ring-Verlauf konnte nicht abgefragt werden:", error?.message ?? error);
      failing = true;
      return;
    }
    if (failing) log.log("Ring-Verlauf wird wieder abgefragt.");
    failing = false;

    const id = event ? String(event.ding_id_str ?? event.ding_id) : null;
    if (!initialized) {
      initialized = true;
      lastDingId = id;
      return;
    }
    if (!id || id === lastDingId) return;
    lastDingId = id;

    const age = now() - Date.parse(event.created_at);
    if (Number.isFinite(age) && age > maxAgeMs) return;
    onDing(event);
  }

  return {
    poll,
    start() {
      if (timer) return;
      const tick = async () => {
        await poll();
        if (timer) timer = setTimeout(tick, intervalMs);
      };
      timer = setTimeout(tick, 0);
    },
    stop() {
      clearTimeout(timer);
      timer = null;
    },
  };
}

// A press can arrive both as a push notification and through the event
// history. Accept it once: by Ring ding id, and — in case the two paths report
// different ids — by ignoring the other path for a short window.
export function createDingDeduplicator({ windowMs = 30000, now = () => Date.now() } = {}) {
  const seenIds = new Set();
  let last = null;

  return {
    accept(id, source) {
      const key = id == null ? null : String(id);
      if (key && seenIds.has(key)) return false;
      const time = now();
      if (last && last.source !== source && time - last.time < windowMs) {
        if (key) seenIds.add(key);
        return false;
      }
      if (key) {
        seenIds.add(key);
        if (seenIds.size > 50) seenIds.delete(seenIds.values().next().value);
      }
      last = { source, time };
      return true;
    },
  };
}
