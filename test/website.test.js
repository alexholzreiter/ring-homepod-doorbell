import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("marketing website has the expected domain and deployment workflow", async () => {
  const [html, cname, workflow, sitemap] = await Promise.all([
    read("website/index.html"),
    read("website/CNAME"),
    read(".github/workflows/pages.yml"),
    read("website/sitemap.xml"),
  ]);

  assert.equal(cname.trim(), "doorbell.klickwerk.digital");
  assert.match(html, /<link rel="canonical" href="https:\/\/doorbell\.klickwerk\.digital\/">/);
  assert.match(sitemap, /https:\/\/doorbell\.klickwerk\.digital\//);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /path: website/);
});

test("marketing website exposes clear GitHub, Runtipi, Docker, and support calls to action", async () => {
  const html = await read("website/index.html");

  assert.match(html, /https:\/\/github\.com\/alexholzreiter\/ring-homepod-doorbell/);
  assert.match(html, /data-install-tab="runtipi"/);
  assert.match(html, /data-install-tab="docker"/);
  assert.match(html, /https:\/\/buy\.stripe\.com\/00w8wOcsV8WHdr7apqaZi04/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test("every translated marketing string includes English and German", async () => {
  const html = await read("website/index.html");
  const translatedElements = html.match(/<[^>]+data-en="[^"]*"[^>]*>/g) || [];

  assert.ok(translatedElements.length > 60);
  for (const element of translatedElements) {
    assert.match(element, /data-de="[^"]*"/, element);
  }

  const englishAriaElements = html.match(/<[^>]+data-en-aria="[^"]*"[^>]*>/g) || [];
  for (const element of englishAriaElements) {
    assert.match(element, /data-de-aria="[^"]*"/, element);
  }
});

test("website references only local visual assets", async () => {
  const html = await read("website/index.html");
  const assetPaths = [...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map((match) => match[1]);

  assert.ok(assetPaths.length >= 6);
  for (const path of new Set(assetPaths)) {
    await assert.doesNotReject(readFile(new URL(`../website/${path}`, import.meta.url)));
  }
});
