import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createTokenStore, isInvalidRefreshTokenError } from "../src/token-store.js";

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ring-token-store-"));
}

test("stored rotated token stays primary while environment token is unchanged", () => {
  const directory = temporaryDirectory();
  const initial = createTokenStore(directory, "environment-token");
  initial.save("rotated-token");
  initial.accept({ source: "stored", token: "rotated-token" }, "rotated-token");

  const restarted = createTokenStore(directory, "environment-token");
  assert.deepEqual(restarted.candidates(), [
    { source: "stored", token: "rotated-token" },
    { source: "environment", token: "environment-token" },
  ]);
});

test("changed Runtipi token is attempted before an older stored token", () => {
  const directory = temporaryDirectory();
  const initial = createTokenStore(directory, "old-environment-token");
  initial.save("old-rotated-token");
  initial.accept({ source: "stored", token: "old-rotated-token" }, "old-rotated-token");

  const updated = createTokenStore(directory, "new-environment-token");
  assert.deepEqual(updated.candidates(), [
    { source: "environment", token: "new-environment-token" },
    { source: "stored", token: "old-rotated-token" },
  ]);
});

test("successful environment fallback replaces an invalid stored token", () => {
  const directory = temporaryDirectory();
  const store = createTokenStore(directory, "new-environment-token");
  store.save("invalid-stored-token");
  const beforeAttempt = store.currentStoredToken();

  store.accept({ source: "environment", token: "new-environment-token" }, beforeAttempt);

  assert.equal(store.currentStoredToken(), "new-environment-token");
});

test("token emitted during authentication is not overwritten by the environment token", () => {
  const directory = temporaryDirectory();
  const store = createTokenStore(directory, "new-environment-token");
  store.save("invalid-stored-token");
  const beforeAttempt = store.currentStoredToken();
  store.save("freshly-rotated-token");

  store.accept({ source: "environment", token: "new-environment-token" }, beforeAttempt);

  assert.equal(store.currentStoredToken(), "freshly-rotated-token");
});

test("invalid refresh token errors are detected without matching unrelated failures", () => {
  assert.equal(
    isInvalidRefreshTokenError(new Error("Refresh token is not valid. Unable to authenticate")),
    true
  );
  assert.equal(isInvalidRefreshTokenError(new Error("fetch failed")), false);
});
