import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const stripePaymentLink = "https://buy.stripe.com/00w8wOcsV8WHdr7apqaZi04";

test("website and README link to the configured Stripe payment page", () => {
  const html = fs.readFileSync(path.join(root, "src", "public", "index.html"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

  assert.match(html, new RegExp(`href="${stripePaymentLink}"`));
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(readme, new RegExp(`\(${stripePaymentLink}\)`));
});
