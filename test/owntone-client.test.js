import assert from "node:assert/strict";
import test from "node:test";
import {
  isAirPlayOutput,
  isReadyAirPlayOutput,
  OwnToneClient,
  selectOutputIds,
} from "../src/owntone-client.js";

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

test("authorization-required AirPlay outputs cannot block ready speakers", () => {
  const outputs = [
    { id: "office", type: "AirPlay 2", requires_auth: false, needs_auth_key: false },
    { id: "locked-mac", type: "AirPlay 2", requires_auth: true, needs_auth_key: true },
  ];

  assert.equal(isReadyAirPlayOutput(outputs[0]), true);
  assert.equal(isReadyAirPlayOutput(outputs[1]), false);
  assert.deepEqual(
    selectOutputIds(outputs, {
      useAllOutputs: false,
      selectedOutputIds: ["office", "locked-mac"],
    }),
    ["office"]
  );
  assert.deepEqual(
    selectOutputIds(outputs, { useAllOutputs: true, selectedOutputIds: [] }),
    ["office"]
  );
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

test("playTracks selects outputs, sets volume and starts a clean queue", async () => {
  const calls = [];
  let outputReads = 0;
  const client = new OwnToneClient("http://owntone", {
    activationPollDelayMs: 0,
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/api/outputs")) {
        outputReads += 1;
        return jsonResponse({
          outputs: [
            { id: "pod", selected: outputReads > 1, volume: 21, type: "AirPlay" },
            { id: "old", selected: true, volume: 44, type: "AirPlay" },
          ],
        });
      }
      if (url.includes("/api/queue/items/add")) return jsonResponse({ count: 1 });
      return new Response(null, { status: 204 });
    },
  });

  await client.playTracks(
    [{ uri: "library:track:7", length_ms: 1200 }],
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
      if (url.endsWith("/api/outputs")) {
        return jsonResponse({
          outputs: [
            { id: "one", selected: true },
            { id: "two", selected: true },
          ],
        });
      }
      return new Response(null, { status: 204 });
    },
  });

  await client.prepareOutputs(["one", "two"], 86);

  assert.match(calls[0].url, /\/api\/outputs\/set$/);
  assert.match(calls[1].url, /\/api\/outputs$/);
  assert.match(calls[2].url, /\/api\/outputs$/);
  assert.match(calls[3].url, /\/api\/player\/volume\?/);
  assert.match(calls[4].url, /\/api\/player\/volume\?/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { outputs: ["one", "two"] });
  assert.match(calls[3].url, /output_id=one/);
  assert.match(calls[3].url, /volume=86/);
});

test("prepareOutputs toggles receivers that remain inactive after the bulk request", async () => {
  const calls = [];
  let outputReads = 0;
  const client = new OwnToneClient("http://owntone", {
    activationPollDelayMs: 0,
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/api/outputs")) {
        outputReads += 1;
        return jsonResponse({
          outputs: [{ id: "pod", selected: outputReads > 1 }],
        });
      }
      return new Response(null, { status: 204 });
    },
  });

  await client.prepareOutputs(["pod"], 64);

  assert.ok(calls.some((call) => call.url.endsWith("/api/outputs/pod/toggle")));
  assert.ok(calls.some((call) => call.url.includes("/api/player/volume?") && call.url.includes("volume=64")));
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


test("several tracks are queued in order with a single request", async () => {
  const requests = [];
  const client = new OwnToneClient("http://owntone.test", {
    fetch: async (url, options) => {
      requests.push({ method: options.method, url });
      if (url.endsWith("/api/outputs")) {
        return {
          headers: { get: () => "application/json" },
          ok: true,
          status: 200,
          json: async () => ({ outputs: [{ id: "kitchen", selected: true }] }),
        };
      }
      if (url.includes("/api/queue/items/add")) {
        return {
          headers: { get: () => "application/json" },
          ok: true,
          status: 200,
          json: async () => ({ count: 3 }),
        };
      }
      return { headers: { get: () => "" }, ok: true, status: 204, text: async () => "" };
    },
  });

  await client.playTracks(
    [{ uri: "library:track:1" }, { uri: "library:track:2" }, { uri: "library:track:3" }],
    ["kitchen"],
    50
  );

  const added = new URL(requests.find((request) => request.url.includes("/api/queue/items/add")).url);
  assert.equal(added.searchParams.get("uris"), "library:track:1,library:track:2,library:track:3");
  assert.equal(added.searchParams.get("playback"), "start");
});
