// Orbit Axis :: Update Two — Ollama streaming provider (mock HTTP, no real Ollama).
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { OllamaProvider } from "../lib/local-llm/ollama.js";

// Minimal mock Ollama. `chat` is a handler(res, body, req) that writes the
// /api/chat response. Captures the last request body for assertions.
function mockOllama(chat) {
  const state = { lastBody: null };
  const server = http.createServer((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ models: [{ name: "qwen3:14b", size: 1 }] }));
    }
    if (req.url === "/api/chat") {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => { state.lastBody = JSON.parse(data || "{}"); chat(res, state.lastBody, req); });
      return;
    }
    res.writeHead(404); res.end();
  });
  return { server, state };
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

async function collect(gen) {
  const events = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

function ndjson(res, lines, { delayMs = 0 } = {}) {
  res.writeHead(200, { "content-type": "application/x-ndjson" });
  let i = 0;
  const write = () => {
    if (i >= lines.length) return res.end();
    res.write(lines[i] + "\n");
    i += 1;
    setTimeout(write, delayMs);
  };
  write();
}

test("reachable model streams deltas then done", async () => {
  const { server } = mockOllama((res) => ndjson(res, [
    JSON.stringify({ message: { content: "The " }, done: false }),
    JSON.stringify({ message: { content: "Moon " }, done: false }),
    JSON.stringify({ message: { content: "rises." }, done: false }),
    JSON.stringify({ done: true, prompt_eval_count: 20, eval_count: 9 }),
  ]));
  const port = await listen(server);
  try {
    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${port}`, model: "qwen3:14b" });
    const events = await collect(provider.streamChat({ messages: [{ role: "user", content: "hi" }] }));
    const deltas = events.filter((e) => e.type === "delta").map((e) => e.text).join("");
    const done = events.find((e) => e.type === "done");
    assert.equal(deltas, "The Moon rises.");
    assert.equal(done.stats.output_tokens, 9);
    assert.ok(done.stats.time_to_first_token_ms != null);
  } finally { server.close(); }
});

test("malformed chunk is skipped without corrupting the stream", async () => {
  const { server } = mockOllama((res) => ndjson(res, [
    JSON.stringify({ message: { content: "Hello" }, done: false }),
    "{ this is not valid json",              // malformed → skipped
    JSON.stringify({ message: { content: " world" }, done: false }),
    JSON.stringify({ done: true }),
  ]));
  const port = await listen(server);
  try {
    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${port}`, model: "qwen3:14b" });
    const events = await collect(provider.streamChat({ messages: [{ role: "user", content: "hi" }] }));
    const text = events.filter((e) => e.type === "delta").map((e) => e.text).join("");
    assert.equal(text, "Hello world");
    assert.ok(events.some((e) => e.type === "done"));
  } finally { server.close(); }
});

test("keep_alive and think:false are sent to Ollama", async () => {
  const { server, state } = mockOllama((res) => ndjson(res, [JSON.stringify({ done: true })]));
  const port = await listen(server);
  try {
    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${port}`, model: "qwen3:14b", keepAlive: "10m" });
    await collect(provider.streamChat({ messages: [{ role: "user", content: "hi" }] }));
    assert.equal(state.lastBody.keep_alive, "10m");
    assert.equal(state.lastBody.think, false);
    assert.equal(state.lastBody.stream, true);
  } finally { server.close(); }
});

test("output never contains the system prompt", async () => {
  const secret = "SYSTEM-PROMPT-DO-NOT-LEAK";
  const { server } = mockOllama((res) => ndjson(res, [
    JSON.stringify({ message: { content: "A calm answer." }, done: false }),
    JSON.stringify({ done: true }),
  ]));
  const port = await listen(server);
  try {
    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${port}`, model: "qwen3:14b" });
    const events = await collect(provider.streamChat({ messages: [
      { role: "system", content: secret },
      { role: "user", content: "hi" },
    ] }));
    const text = events.filter((e) => e.type === "delta").map((e) => e.text).join("");
    assert.doesNotMatch(text, new RegExp(secret));
  } finally { server.close(); }
});

test("timeout yields a terminal error event (never throws)", async () => {
  const { server } = mockOllama((res) => ndjson(res, [
    JSON.stringify({ message: { content: "slow" }, done: false }),
    JSON.stringify({ done: true }),
  ], { delayMs: 200 }));
  const port = await listen(server);
  try {
    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${port}`, model: "qwen3:14b" });
    const events = await collect(provider.streamChat({ messages: [{ role: "user", content: "hi" }], timeoutMs: 50 }));
    const err = events.find((e) => e.type === "error");
    assert.ok(err, "a terminal error event is emitted");
    assert.match(err.status, /timeout|stream_failed|cancelled/);
  } finally { server.close(); }
});

test("client abort cancels the stream cleanly", async () => {
  const { server } = mockOllama((res) => ndjson(res, [
    JSON.stringify({ message: { content: "one" }, done: false }),
    JSON.stringify({ message: { content: "two" }, done: false }),
    JSON.stringify({ message: { content: "three" }, done: false }),
    JSON.stringify({ done: true }),
  ], { delayMs: 60 }));
  const port = await listen(server);
  try {
    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${port}`, model: "qwen3:14b" });
    const controller = new AbortController();
    const events = [];
    for await (const ev of provider.streamChat({ messages: [{ role: "user", content: "hi" }], signal: controller.signal })) {
      events.push(ev);
      if (ev.type === "delta") controller.abort(); // stop after the first token
    }
    const err = events.find((e) => e.type === "error");
    assert.ok(events.some((e) => e.type === "delta"), "kept the already-streamed text");
    assert.ok(err && err.status === "cancelled");
  } finally { server.close(); }
});

test("missing model yields a terminal error, no throw", async () => {
  const { server } = mockOllama((res) => ndjson(res, [JSON.stringify({ done: true })]));
  const port = await listen(server);
  try {
    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${port}`, model: "not-installed:latest" });
    const events = await collect(provider.streamChat({ messages: [{ role: "user", content: "hi" }] }));
    assert.equal(events[0].type, "error");
    assert.equal(events[0].status, "missing_model");
  } finally { server.close(); }
});

test("unreachable Ollama yields a terminal error (fallback trigger)", async () => {
  const provider = new OllamaProvider({ baseUrl: "http://127.0.0.1:9", model: "qwen3:14b", timeoutMs: 60 });
  const events = await collect(provider.streamChat({ messages: [{ role: "user", content: "hi" }] }));
  assert.equal(events.at(-1).type, "error");
});

test("warmup returns a status object and never throws on failure", async () => {
  const down = new OllamaProvider({ baseUrl: "http://127.0.0.1:9", model: "qwen3:14b", timeoutMs: 60 });
  const result = await down.warmup();
  assert.equal(result.ok, false); // failed, but did not throw

  const { server, state } = mockOllama((res) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ message: { content: "" }, done: true })); });
  const port = await listen(server);
  try {
    const up = new OllamaProvider({ baseUrl: `http://127.0.0.1:${port}`, model: "qwen3:14b", keepAlive: "10m" });
    const ok = await up.warmup();
    assert.equal(ok.ok, true);
    assert.equal(state.lastBody.keep_alive, "10m");
    assert.equal(state.lastBody.options.num_predict, 0); // tiny warmup
  } finally { server.close(); }
});
