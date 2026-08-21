import { test, before, after } from "node:test";
import assert from "node:assert";
import os from "node:os";
import { createApp } from "../src/app.js";
import { createLogger } from "../src/logger.js";

function captureStream() {
  const lines = [];
  return {
    lines,
    stream: {
      write: (chunk) => {
        lines.push(chunk.toString());
        return true;
      },
    },
  };
}

async function waitFor(fn, timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition not met within timeout");
}

const captured = captureStream();
let server;
let baseUrl;

before(async () => {
  const logger = createLogger({ name: "test-app", stream: captured.stream });
  const app = createApp({
    appName: "test-app",
    version: "test-version",
    greeting: "test greeting",
    logger,
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test("GET / returns greeting, hostname, and version", async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/json/);

  const body = await res.json();
  assert.strictEqual(body.message, "test greeting");
  assert.strictEqual(body.hostname, os.hostname());
  assert.strictEqual(body.version, "test-version");
});

test("GET /health returns status ok", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/json/);
  assert.deepStrictEqual(await res.json(), { status: "ok" });
});

test("unknown route returns 404", async () => {
  const res = await fetch(`${baseUrl}/does-not-exist`);
  assert.strictEqual(res.status, 404);
});

test("GET /metrics returns Prometheus text format", async () => {
  await fetch(`${baseUrl}/`);
  const res = await fetch(`${baseUrl}/metrics`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/plain/);

  const body = await res.text();
  assert.match(body, /# TYPE [\w-]+_http_requests_total counter/);
  assert.match(body, /# TYPE [\w-]+_uptime_seconds gauge/);
  assert.match(body, /[\w-]+_http_requests_total\{/);
});

test("logger emits a single line of valid JSON with extra fields", () => {
  const { stream, lines } = captureStream();
  const logger = createLogger({ name: "test-logger", level: "INFO", stream });

  logger.info("health check ok", { endpoint: "/health" });
  logger.debug("should be filtered by log level", {});

  assert.strictEqual(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.strictEqual(entry.level, "INFO");
  assert.strictEqual(entry.logger, "test-logger");
  assert.strictEqual(entry.message, "health check ok");
  assert.strictEqual(entry.endpoint, "/health");
  assert.ok(entry.timestamp);
});

test("access log middleware logs each request as JSON", async () => {
  captured.lines.length = 0;

  const res = await fetch(`${baseUrl}/health`);
  assert.strictEqual(res.status, 200);

  await waitFor(() => captured.lines.some((l) => JSON.parse(l).message === "request completed"));

  const entries = captured.lines.map((line) => JSON.parse(line));
  const access = entries.find((e) => e.message === "request completed");
  assert.ok(access, "expected a request completed log entry");
  assert.strictEqual(access.method, "GET");
  assert.strictEqual(access.path, "/health");
  assert.strictEqual(access.status, 200);
  assert.ok(access.duration_ms >= 0);
});
