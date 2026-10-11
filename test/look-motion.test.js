const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const originalFetch = global.fetch;
const originalKey = process.env.GEMINI_API_KEY;
const start = require("../netlify/functions/look-motion.js").handler;
const status = require("../netlify/functions/look-motion-status.js").handler;
const video = require("../netlify/functions/look-motion-video.js").handler;

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
});

const validJob = "operations/job_123";
const event = (httpMethod, body, queryStringParameters) => ({
  httpMethod, body: body === undefined ? undefined : JSON.stringify(body), queryStringParameters
});

test("motion start fails closed without server key", async () => {
  delete process.env.GEMINI_API_KEY;
  const response = await start(event("POST", {image:"data:image/jpeg;base64,abc"}));
  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(response.body).code, "AI_NOT_CONFIGURED");
});

test("motion start rejects invalid image data before provider call", async () => {
  process.env.GEMINI_API_KEY = "test-only";
  global.fetch = async () => { throw new Error("provider must not be called"); };
  const response = await start(event("POST", {image:"not-an-image"}));
  assert.equal(response.statusCode, 400);
});

test("motion start returns provider operation as the job identifier", async () => {
  process.env.GEMINI_API_KEY = "test-only";
  let request;
  global.fetch = async (url, options) => {
    request = {url, options};
    return {ok:true,status:200,json:async()=>({name:validJob})};
  };
  const response = await start(event("POST", {image:"data:image/jpeg;base64,abc",mimeType:"image/jpeg"}));
  assert.equal(response.statusCode, 202);
  assert.equal(JSON.parse(response.body).jobId, validJob);
  assert.equal(request.options.headers["x-goog-api-key"], "test-only");
  const sent = JSON.parse(request.options.body);
  assert.equal(sent.instances[0].image.bytesBase64Encoded, "abc");
  assert.equal(sent.instances[0].image.mimeType, "image/jpeg");
});

test("status rejects malformed job identifiers", async () => {
  process.env.GEMINI_API_KEY = "test-only";
  global.fetch = async () => { throw new Error("provider must not be called"); };
  const response = await status(event("GET", undefined, {jobId:"../../secrets"}));
  assert.equal(response.statusCode, 400);
});

test("status accepts the provider's standard operations/id format", async () => {
  process.env.GEMINI_API_KEY = "test-only";
  global.fetch = async (url) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/operations/job_123");
    return {ok:true,status:200,json:async()=>({done:false})};
  };
  const response = await status(event("GET", undefined, {jobId:validJob}));
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).status, "processing");
});

test("status accepts a model-scoped operation format too", async () => {
  process.env.GEMINI_API_KEY = "test-only";
  global.fetch = async () => ({ok:true,status:200,json:async()=>({done:false})});
  const response = await status(event("GET", undefined, {jobId:"models/veo-3.1-generate-preview/operations/job_123"}));
  assert.equal(response.statusCode, 200);
});

test("video endpoint does not return a file before provider operation completes", async () => {
  process.env.GEMINI_API_KEY = "test-only";
  global.fetch = async () => ({ok:true,status:200,json:async()=>({done:false})});
  const response = await video(event("GET", undefined, {jobId:validJob}));
  assert.equal(response.statusCode, 409);
});
