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
  "owntone-supervise.conf",
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

test("Runtipi compose does not depend on unavailable UID variables", () => {
  const compose = fs.readFileSync(path.join(storeApp, "docker-compose.yml"), "utf8");

  assert.doesNotMatch(compose, /\$\{(?:UID|GID)\}/);
});

test("OwnTone receives a configuration directory instead of a file mount", () => {
  const compose = fs.readFileSync(path.join(storeApp, "docker-compose.yml"), "utf8");
  const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");

  assert.match(dockerfile, /COPY owntone\.conf \.\/owntone\.conf/);
  assert.match(compose, /owntone-config:\/etc\/owntone:ro/);
  assert.doesNotMatch(compose, /:\/etc\/owntone\/owntone\.conf/);
});

test("OwnTone process is supervised and automatically respawned", () => {
  const compose = fs.readFileSync(path.join(storeApp, "docker-compose.yml"), "utf8");
  const supervision = fs.readFileSync(path.join(storeApp, "owntone-supervise.conf"), "utf8");

  assert.match(compose, /owntone-supervise\.conf:\/etc\/conf\.d\/owntone:ro/);
  assert.match(supervision, /supervisor="supervise-daemon"/);
  assert.match(supervision, /respawn_max=0/);
});
