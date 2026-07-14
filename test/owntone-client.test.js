import assert from "node:assert/strict";
import test from "node:test";
import { OwnToneClient, selectOutputIds } from "../src/owntone-client.js";

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("selectOutputIds returns all AirPlay outputs or only configured ones", () => {
  const outputs = [
    { id: "kitchen", type: "AirPlay" },
    { id: "office", type: "AirPlay" },
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

  const previous = await client.playTrack(
    { uri: "library:track:7", length_ms: 1200 },
    ["pod"],
    65
  );
  assert.equal(previous.find((output) => output.id === "old").selected, true);
  assert.ok(calls.some((call) => call.url.endsWith("/api/outputs/set")));
  assert.ok(calls.some((call) => call.url.includes("/api/queue/items/add?") && call.url.includes("playback=start")));
});
