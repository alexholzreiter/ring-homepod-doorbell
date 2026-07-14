import assert from "node:assert/strict";
import test from "node:test";
import { chooseVisibleOutputs, shouldApplyServerForm } from "../src/public/ui-state.js";

test("background refresh does not overwrite a dirty settings form", () => {
  assert.equal(shouldApplyServerForm({ dirty: true }), false);
  assert.equal(shouldApplyServerForm({ dirty: true, force: true }), true);
  assert.equal(shouldApplyServerForm({ dirty: false }), true);
});

test("last known outputs remain visible during a temporary OwnTone outage", () => {
  const remembered = [{ id: "office", name: "Arbeitszimmer" }];
  assert.deepEqual(chooseVisibleOutputs([], remembered), remembered);
  assert.deepEqual(chooseVisibleOutputs([{ id: "kitchen" }], remembered), [{ id: "kitchen" }]);
});
