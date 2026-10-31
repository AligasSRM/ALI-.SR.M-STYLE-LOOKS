const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const netlify = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");

test("the public page has no user-photo upload or generated-video interface", () => {
  assert.doesNotMatch(html, /type=["']file["']/i);
  assert.doesNotMatch(html, /<video\b/i);
  assert.doesNotMatch(html, /data-module-open=["'][^"']*motion/i);
});

test("the local server exposes no image or video generation API", () => {
  assert.doesNotMatch(server, /\/api\/(?:generate-look|look-motion)/i);
  assert.doesNotMatch(server, /generativelanguage\.googleapis\.com/i);
});

test("Netlify has no AI image or video function redirects", () => {
  assert.doesNotMatch(netlify, /generate-look|look-motion/i);
});
