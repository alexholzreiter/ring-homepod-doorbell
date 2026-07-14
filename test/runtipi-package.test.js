import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, "runtipi");
const storeApp = path.join(root, "apps", "ring-homepod-doorbell");
const packagedFiles = [
  "config.json",
  "docker-compose.yml",
  "owntone.conf",
  "metadata/description.md",
  "metadata/logo.jpg",
  "metadata/logo.svg",
];

test("Runtipi standalone package and app-store package stay identical", () => {
  for (const filename of packagedFiles) {
    assert.deepEqual(
      fs.readFileSync(path.join(storeApp, filename)),
      fs.readFileSync(path.join(standalone, filename)),
      `${filename} differs between Runtipi packages`
    );
  }
});
