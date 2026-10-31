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
  assert.equal((html.match(/<script\b/gi) || []).length, (html.match(/<\/script>/gi) || []).length);
});

test("all HTML IDs are unique and the style-center section has one stable ID", () => {
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
  assert.equal(ids.filter((id) => id === "ali-style-center").length, 1);
  assert.match(html, /<style id=["']ali-style-center-styles["']/i);
});

test("every style-center navigation card points to an existing registered module", () => {
  const targets = [...html.matchAll(/data-module-open=["']([^"']+)["']/gi)].map((match) => match[1]);
  const registered = [...html.matchAll(/const moduleIds=\[([^\]]*)\]/)].flatMap((match) =>
    [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1])
  );
  const sectionIds = new Set([...html.matchAll(/<section\b[^>]*\bid=["']([^"']+)["']/gi)].map((match) => match[1]));
  assert.ok(targets.length > 0, "navigation cards must exist");
  for (const target of targets) {
    assert.ok(registered.includes(target), `navigation target ${target} must be registered`);
    assert.ok(sectionIds.has(target), `navigation target ${target} must have a section`);
  }
});
