const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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

test("the remaining page script parses and section markup is balanced", () => {
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, "the page script must exist");
  assert.doesNotThrow(() => new vm.Script(match[1]));
  assert.equal((html.match(/<section\b/g) || []).length, (html.match(/<\/section>/g) || []).length);
});

test("Style Center navigation ID belongs only to its section", () => {
  assert.equal((html.match(/<style\b[^>]*\bid=["']ali-style-center-styles["']/gi) || []).length, 1);
  assert.equal((html.match(/<section\b(?=[^>]*\bid=["']ali-style-center["'])[^>]*>/gi) || []).length, 1);
  assert.equal((html.match(/\bid=["']ali-style-center["']/gi) || []).length, 1);
});

test("HTML script opening and closing tags are balanced", () => {
  assert.equal((html.match(/<script\b/gi) || []).length, (html.match(/<\/script>/gi) || []).length);
});

test("multi-element controls use querySelectorAll before iteration", () => {
  const script = html.match(/<script>([\\s\\S]*?)<\\/script>/i)?.[1] || "";
  assert.doesNotMatch(script, /(^|[^$])\\$\\([^)]*\\)\\.forEach/m);
  assert.match(script, /\\$\\$\\('#vault-search,#vault-category,#vault-color,#vault-size'\\)\\.forEach/);
  assert.match(script, /\\$\\$\\('\\[data-tailor-key\\]'\\)\\.forEach/);
});

test("user-controlled saved content is escaped before HTML rendering", () => {
  const script = html.match(/<script>([\\s\\S]*?)<\\/script>/i)?.[1] || "";
  assert.match(script, /function renderCloset\\(\\)[\\s\\S]*?escapeVault\\(x\\?\\.name\\)/);
  assert.match(script, /function renderSaved\\(\\)[\\s\\S]*?escapeVault\\(x\\?\\.style\\)/);
  assert.match(script, /function renderResult\\(l\\)[\\s\\S]*?escapeVault\\(l\\.style\\)/);
  assert.match(script, /function renderDNA\\(\\)[\\s\\S]*?escapeVault\\(k\\)/);
});

test("clear-local-data removes every app-owned local storage key", () => {
  const script = html.match(/<script>([\\s\\S]*?)<\\/script>/i)?.[1] || "";
  const clearHandler = script.match(/#clear-local-data[\\s\\S]*?location\\.reload\\(\\)/)?.[0] || "";
  for (const key of [
    "aliStyleLang", "aliStyleLooks", "aliHairChoice", "aliNailChoice",
    "aliIdentityMode", "aliStyleCloset", "aliStyleNextGen", "aliSavedLooks",
    "aliCustomDesigns", "aliFashionVault", "aliTailorDesigns"
  ]) assert.match(clearHandler, new RegExp(key));
});
