const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const originalFetch = global.fetch;
const originalKey = process.env.GEMINI_API_KEY;
const { handler } = require("../netlify/functions/generate-look.js");

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
});

function event(method, body = {}, extra = {}) {
  return {
    httpMethod: method,
    body: typeof body === "string" ? body : JSON.stringify(body),
    isBase64Encoded: false,
    ...extra
  };
}

test("fails closed when the server API key is absent", async () => {
  delete process.env.GEMINI_API_KEY;
  const response = await handler(event("POST", { image: "abc" }));
  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(response.body).code, "AI_NOT_CONFIGURED");
});

test("rejects unsupported methods without calling the provider", async () => {
  process.env.GEMINI_API_KEY = "test-only";
  global.fetch = async () => { throw new Error("provider must not be called"); };
  const response = await handler(event("GET"));
  assert.equal(response.statusCode, 405);
});

test("rejects requests without an image", async () => {
  process.env.GEMINI_API_KEY = "test-only";
  global.fetch = async () => { throw new Error("provider must not be called"); };
  const response = await handler(event("POST", {}));
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).ok, false);
});

test("returns the generated image from the provider response", async () => {
  process.env.GEMINI_API_KEY = "test-only";
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        steps: [{
          type: "model_output",
          content: [{ type: "image", mime_type: "image/png", data: "generated-image-base64" }]
        }]
      })
    };
  };

  const response = await handler(event("POST", {
    image: "data:image/jpeg;base64,source-image-base64",
    mimeType: "image/jpeg",
    look: { outfit: "formal" }
  }));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    mimeType: "image/png",
    image: "generated-image-base64"
  });
  assert.equal(request.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(request.options.headers["x-goog-api-key"], "test-only");
  const sent = JSON.parse(request.options.body);
  assert.equal(sent.input[0].data, "source-image-base64");
  assert.equal(sent.model, "gemini-3.1-flash-image");
});

test("surfaces provider failures as a controlled API error", async () => {
  process.env.GEMINI_API_KEY = "test-only";
  global.fetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: { message: "rate limited" } })
  });

  const response = await handler(event("POST", { image: "abc" }));
  assert.equal(response.statusCode, 429);
  assert.equal(JSON.parse(response.body).code, "AI_PROVIDER_ERROR");
});
