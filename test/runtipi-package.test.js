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

test("Runtipi text fields define valid length limits", () => {
  const config = JSON.parse(fs.readFileSync(path.join(storeApp, "config.json"), "utf8"));
  const stringFields = config.form_fields.filter(({ type }) => type === "text" || type === "password");

  for (const field of stringFields) {
    assert.equal(Number.isInteger(field.min), true, `${field.env_variable} has no integer min`);
    assert.equal(Number.isInteger(field.max), true, `${field.env_variable} has no integer max`);
    assert.equal(field.min <= field.max, true, `${field.env_variable} has invalid length limits`);
  }
});
