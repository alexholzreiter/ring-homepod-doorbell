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

test("authorization-required AirPlay outputs are disabled in the setup form", () => {
  const app = fs.readFileSync(path.join(root, "src", "public", "app.js"), "utf8");

  assert.match(app, /output\.needs_auth_key \|\| output\.requires_auth/);
  assert.match(app, /checkbox\.disabled = requiresApproval \|\| settings\.useAllOutputs/);
  assert.match(app, /checkbox\.checked = !requiresApproval/);
});
