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
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /path: website/);
  assert.match(workflow, /include-hidden-files: true/);
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
  const pages = await Promise.all([read("website/index.html"), read("website/about/index.html")]);
  const translatedElements = pages.flatMap((html) => html.match(/<[^>]+data-en="[^"]*"[^>]*>/g) || []);

  assert.ok(translatedElements.length > 60);
  for (const element of translatedElements) {
    assert.match(element, /data-de="[^"]*"/, element);
  }

  const englishAriaElements = pages.flatMap((html) => html.match(/<[^>]+data-en-aria="[^"]*"[^>]*>/g) || []);
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

test("project and marketing website declare the MIT license", async () => {
  const [license, packageJson, html, readme] = await Promise.all([
    read("LICENSE"),
    read("package.json"),
    read("website/index.html"),
    read("README.md"),
  ]);

  assert.match(license, /^MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Alexander Holzreiter/);
  assert.equal(JSON.parse(packageJson).license, "MIT");
  assert.match(html, /https:\/\/opensource\.org\/license\/mit/);
  assert.match(readme, /\[MIT License\]\(LICENSE\)/);
});

test("structured data describes the website, publisher, software, brand, and visible FAQs", async () => {
  const [html, faqData] = await Promise.all([read("website/index.html"), read("website/ai/faq.json")]);
  const jsonLdSource = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)?.[1];
  assert.ok(jsonLdSource);

  const graph = JSON.parse(jsonLdSource)["@graph"];
  const byType = (type) => graph.find((item) => item["@type"] === type);
  assert.equal(byType("WebSite").name, "Ring HomePod Doorbell");
  assert.equal(byType("SoftwareApplication").name, "Ring HomePod Doorbell");
  assert.equal(byType("Brand").name, "Ring HomePod Doorbell");
  assert.equal(byType("Organization").name, "klickwerk");
  assert.equal(byType("Organization").contactPoint.email, "laura@klickwerk.digital");
  assert.equal(byType("FAQPage").mainEntity.length, 5);
  assert.deepEqual(
    byType("FAQPage").mainEntity.map((item) => item.name),
    JSON.parse(faqData).items.map((item) => item.question),
  );
  assert.match(html, /<title>Ring HomePod Doorbell —/);
  assert.match(html, /property="og:title" content="Ring HomePod Doorbell —/);
  assert.match(html, /<h1><span>Ring HomePod Doorbell\.<\/span>/);
  assert.match(html, /type="application\/rss\+xml"/);
  assert.doesNotMatch(html, /"@type": "SearchAction"/);
});

test("AI discovery files, project feed, and about page remain internally consistent", async () => {
  const [llms, aiPolicy, summary, service, feed, about, sitemap, packageJson] = await Promise.all([
    read("website/llms.txt"),
    read("website/.well-known/ai.txt"),
    read("website/ai/summary.json"),
    read("website/ai/service.json"),
    read("website/feed.xml"),
    read("website/about/index.html"),
    read("website/sitemap.xml"),
    read("package.json"),
  ]);

  assert.match(llms, /^# Ring HomePod Doorbell/);
  assert.match(llms, /\/ai\/summary\.json/);
  assert.match(aiPolicy, /robots\.txt remains the authoritative crawler policy/);
  assert.equal(JSON.parse(summary).name, "Ring HomePod Doorbell");
  assert.equal(JSON.parse(service).capabilities.audioFormats.count, 6);
  assert.match(feed, new RegExp(`Ring HomePod Doorbell ${JSON.parse(packageJson).version}`));
  assert.match(about, /Created and maintained by Alexander Holzreiter/);
  assert.match(sitemap, /https:\/\/doorbell\.klickwerk\.digital\/about\//);
});

test("English marketing copy avoids excessive repetition of the word your", async () => {
  const html = await read("website/index.html");
  const copy = [...html.matchAll(/data-en="([^"]+)"/g)].map((match) => match[1]).join(" ").toLowerCase();
  const words = copy.match(/[a-z]+/g) || [];
  const yourCount = words.filter((word) => word === "your").length;

  assert.ok(yourCount / words.length < 0.035, `${yourCount} uses in ${words.length} words`);
});
