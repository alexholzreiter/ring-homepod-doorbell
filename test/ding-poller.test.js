import assert from "node:assert/strict";
import test from "node:test";
import { createDingDeduplicator, createDingPoller } from "../src/ding-poller.js";

const quiet = { log() {}, warn() {} };

test("the first poll only records the latest ding without triggering", async () => {
  const dings = [];
  const poller = createDingPoller({
    fetchLatestDing: async () => ({ ding_id_str: "1", created_at: new Date().toISOString() }),
    onDing: (event) => dings.push(event),
    log: quiet,
  });
  await poller.poll();
  await poller.poll();
  assert.equal(dings.length, 0);
});

test("a new recent ding triggers exactly once", async () => {
  let latest = { ding_id_str: "1", created_at: "2026-10-11T11:00:00Z" };
  const dings = [];
  const poller = createDingPoller({
    fetchLatestDing: async () => latest,
    onDing: (event) => dings.push(event.ding_id_str),
    now: () => Date.parse("2026-10-11T11:00:05Z"),
    log: quiet,
  });
  await poller.poll();
  latest = { ding_id_str: "2", created_at: "2026-10-11T11:00:03Z" };
  await poller.poll();
  await poller.poll();
  assert.deepEqual(dings, ["2"]);
});

test("stale dings and fetch errors do not trigger", async () => {
  let latest = null;
  let fail = false;
  const dings = [];
  const poller = createDingPoller({
    fetchLatestDing: async () => {
      if (fail) throw new Error("rate limited");
      return latest;
    },
    onDing: (event) => dings.push(event.ding_id_str),
    now: () => Date.parse("2026-10-11T12:00:00Z"),
    maxAgeMs: 60000,
    log: quiet,
  });
  await poller.poll();
  latest = { ding_id_str: "old", created_at: "2026-10-11T11:00:00Z" };
  await poller.poll();
  fail = true;
  await poller.poll();
  assert.deepEqual(dings, []);
});

test("a press reported by push and history is accepted once", () => {
  let time = 0;
  const dedupe = createDingDeduplicator({ now: () => time });
  assert.equal(dedupe.accept("42", "push"), true);
  time = 6000;
  assert.equal(dedupe.accept("42", "history"), false);
  assert.equal(dedupe.accept("42", "push"), false);
});

test("differing ids from the other path within the window are treated as the same press", () => {
  let time = 0;
  const dedupe = createDingDeduplicator({ now: () => time });
  assert.equal(dedupe.accept("push-id", "push"), true);
  time = 8000;
  assert.equal(dedupe.accept("history-id", "history"), false);
});

test("later presses are accepted again", () => {
  let time = 0;
  const dedupe = createDingDeduplicator({ now: () => time });
  assert.equal(dedupe.accept("1", "push"), true);
  time = 10000;
  assert.equal(dedupe.accept("2", "push"), true);
  time = 60000;
  assert.equal(dedupe.accept("3", "history"), true);
});
