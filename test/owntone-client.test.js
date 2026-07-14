import assert from "node:assert/strict";
import test from "node:test";
import { isAirPlayOutput, OwnToneClient, selectOutputIds } from "../src/owntone-client.js";

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("selectOutputIds returns all AirPlay outputs or only configured ones", () => {
  const outputs = [
    { id: "kitchen", type: "AirPlay" },
    { id: "office", type: "AirPlay 2" },
    { id: "local", type: "ALSA" },
  ];
  assert.deepEqual(selectOutputIds(outputs, { useAllOutputs: true, selectedOutputIds: [] }), [
    "kitchen",
    "office",
  ]);
  assert.deepEqual(
    selectOutputIds(outputs, { useAllOutputs: false, selectedOutputIds: ["office", "missing"] }),
    ["office"]
  );
});

test("isAirPlayOutput accepts OwnTone AirPlay and AirPlay 2 types", () => {
  assert.equal(isAirPlayOutput({ type: "AirPlay" }), true);
  assert.equal(isAirPlayOutput({ type: "AirPlay 2" }), true);
  assert.equal(isAirPlayOutput({ type: "ALSA" }), false);
});

test("findTrack resolves the exact shared media path", async () => {
  const client = new OwnToneClient("http://owntone", {
    fetch: async () =>
      jsonResponse({
        tracks: {
          items: [
            { path: "/srv/media/other.mp3", uri: "library:track:1" },
            { path: "/srv/media/doorbell.mp3", uri: "library:track:2" },
          ],
        },
      }),
  });
  const track = await client.findTrack("doorbell.mp3", 1);
  assert.equal(track.uri, "library:track:2");
});

test("playTrack selects outputs, sets volume and starts a clean queue", async () => {
  const calls = [];
  const client = new OwnToneClient("http://owntone", {
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/api/outputs")) {
        return jsonResponse({
          outputs: [
            { id: "pod", selected: false, volume: 21, type: "AirPlay" },
            { id: "old", selected: true, volume: 44, type: "AirPlay" },
          ],
        });
      }
      return new Response(null, { status: 204 });
    },
  });

  await client.playTrack(
    { uri: "library:track:7", length_ms: 1200 },
    ["pod"],
    65
  );
  assert.ok(calls.some((call) => call.url.endsWith("/api/outputs/set")));
  assert.ok(calls.some((call) => call.url.endsWith("/api/queue/clear")));
  assert.ok(calls.some((call) => call.url.includes("/api/queue/items/add?") && call.url.includes("playback=start")));
});

test("prepareOutputs keeps the configured selection and volume", async () => {
  const calls = [];
  const client = new OwnToneClient("http://owntone", {
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      return new Response(null, { status: 204 });
    },
  });

  await client.prepareOutputs(["one", "two"], 86);

  assert.match(calls[0].url, /\/api\/outputs\/set$/);
  assert.match(calls[1].url, /\/api\/outputs\/one$/);
  assert.match(calls[2].url, /\/api\/outputs\/two$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { outputs: ["one", "two"] });
  assert.deepEqual(JSON.parse(calls[1].options.body), { selected: true, volume: 86 });
  assert.deepEqual(JSON.parse(calls[2].options.body), { selected: true, volume: 86 });
});

test("getOutputs retries while OwnTone is restarting", async () => {
  let attempts = 0;
  const client = new OwnToneClient("http://owntone", {
    retryDelayMs: 0,
    fetch: async () => {
      attempts += 1;
      if (attempts < 3) throw new TypeError("fetch failed");
      return jsonResponse({ outputs: [{ id: "office" }] });
    },
  });

  assert.deepEqual(await client.getOutputs(), [{ id: "office" }]);
  assert.equal(attempts, 3);
});
