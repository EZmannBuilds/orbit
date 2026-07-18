// Resolve the Ollama `format` field. Omitted entirely for prose callers so the
// model returns natural language; defaults to JSON for structured callers.
function formatFor(request = {}) {
  if (request.format === undefined) return "json";      // legacy default
  const f = request.format;
  if (!f || f === "text" || f === "prose") return null;  // plain prose
  return f;
}

export class OllamaProvider {
  constructor({ enabled = true, baseUrl, model, embeddingModel, timeoutMs = 180000, contextLength = 8192, temperature = 0.2, maxOutputTokens = 3000, maxResponseChars = 120000, keepAlive = "10m", chatTimeoutMs = 60000 } = {}) {
    this.enabled = enabled;
    this.baseUrl = (baseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
    this.model = model || "";
    this.embeddingModel = embeddingModel || "";
    this.timeoutMs = timeoutMs;
    this.contextLength = contextLength;
    this.temperature = temperature;
    this.maxOutputTokens = maxOutputTokens;
    this.maxResponseChars = maxResponseChars;
    this.keepAlive = keepAlive;
    this.chatTimeoutMs = chatTimeoutMs;
  }

  async health() {
    const started = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(Math.min(this.timeoutMs, 5000)),
      });
      if (!response.ok) {
        return { ok: false, provider: "ollama", base_url: this.baseUrl, status: response.status, models: [], latency_ms: Date.now() - started };
      }
      const models = normalizeModels(await response.json());
      const selected = selectModel(models, this.model);
      const installed = Boolean(selected);
      return {
        ok: installed,
        provider: "ollama",
        enabled: this.enabled,
        reachable: true,
        base_url: this.baseUrl,
        configured_model: this.model || null,
        selected_model: selected?.name || null,
        installed_model: installed,
        model_available: installed,
        fallback_available: true,
        fallback_active: !installed,
        context_length: this.contextLength,
        models,
        ...(installed ? {} : {
          error: "missing_model",
          message: this.model
            ? `Configured Ollama model "${this.model}" is not installed.`
            : "No Ollama model is configured or installed.",
        }),
        latency_ms: Date.now() - started,
      };
    } catch (error) {
      return {
        ok: false,
        provider: "ollama",
        enabled: this.enabled,
        reachable: false,
        base_url: this.baseUrl,
        configured_model: this.model || null,
        selected_model: null,
        model_available: false,
        installed_model: false,
        fallback_available: true,
        fallback_active: true,
        context_length: this.contextLength,
        models: [],
        error: "ollama_unavailable",
        message: "Ollama is not reachable. Start Ollama locally or disable local LLM features.",
        detail: error.message,
        latency_ms: Date.now() - started,
      };
    }
  }

  async listModels() {
    const health = await this.health();
    return health.models || [];
  }

  async generate(request = {}) {
    const models = await this.listModels();
    const selected = request.model || selectModel(models, this.model)?.name;
    if (!selected) {
      return {
        ok: false,
        status: "missing_model",
        message: this.model
          ? `Configured Ollama model "${this.model}" is not installed.`
          : "No Ollama model is configured or installed.",
        text: "",
        model: this.model || null,
      };
    }

    const body = {
      model: selected,
      stream: false,
      think: false,
      // Structured callers (the vault assistant) rely on JSON and get it by
      // default. Prose callers (Ask Orbit) opt out explicitly with
      // `format: "text"` / `null`, which omits the field so Ollama returns
      // natural language instead of a JSON object.
      ...(formatFor(request) ? { format: formatFor(request) } : {}),
      keep_alive: request.keepAlive ?? this.keepAlive,
      options: {
        temperature: request.temperature ?? this.temperature,
        num_ctx: request.contextLength ?? this.contextLength,
        num_predict: request.numPredict ?? this.maxOutputTokens,
      },
      messages: [
        ...(request.system ? [{ role: "system", content: request.system }] : []),
        { role: "user", content: request.prompt || "" },
      ],
    };

    const started = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(request.timeoutMs || this.timeoutMs),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        return { ok: false, status: "http_error", http_status: response.status, text: "", model: selected, duration_ms: Date.now() - started };
      }
      const data = await response.json();
      const text = String(data?.message?.content || "").trim();
      if (text.length > this.maxResponseChars) {
        return { ok: false, status: "oversized_response", text: "", model: selected, duration_ms: Date.now() - started };
      }
      return {
        ok: true,
        status: "ok",
        text,
        model: selected,
        duration_ms: Date.now() - started,
        input_tokens: data.prompt_eval_count || null,
        output_tokens: data.eval_count || null,
      };
    } catch (error) {
      return { ok: false, status: error.name === "TimeoutError" ? "timeout" : "request_failed", error: error.message, text: "", model: selected, duration_ms: Date.now() - started };
    }
  }

  // Stream a conversational reply as plain-text deltas. Yields
  // { type: "delta", text } as chunks arrive and finally { type: "done", stats }
  // or { type: "error", status, message }. `think: false` keeps qwen3-style
  // reasoning out of the stream. Cancellation: pass `signal` (client disconnect
  // or Stop button) and the upstream Ollama generation is aborted too. This
  // NEVER throws — callers get a terminal event and can fall back cleanly.
  async *streamChat(request = {}) {
    const models = await this.listModels();
    const selected = request.model || selectModel(models, this.model)?.name;
    if (!selected) {
      yield { type: "error", status: "missing_model", message: this.model
        ? `Configured Ollama model "${this.model}" is not installed.`
        : "No Ollama model is configured or installed." };
      return;
    }

    // Combine caller cancellation with a request timeout without depending on
    // AbortSignal.any (not on every supported Node). The timer aborts on stall;
    // the caller's signal aborts on client disconnect / Stop.
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs || this.chatTimeoutMs;
    const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
    const onCallerAbort = () => controller.abort(new Error("client_abort"));
    if (request.signal) {
      if (request.signal.aborted) onCallerAbort();
      else request.signal.addEventListener("abort", onCallerAbort, { once: true });
    }

    const body = {
      model: selected,
      stream: true,
      think: false,
      keep_alive: request.keepAlive ?? this.keepAlive,
      options: {
        temperature: request.temperature ?? this.temperature,
        num_ctx: request.contextLength ?? this.contextLength,
        num_predict: request.numPredict ?? this.maxOutputTokens,
      },
      messages: request.messages || [],
    };

    const started = Date.now();
    let firstTokenMs = null;
    let charCount = 0;
    let response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
    } catch (error) {
      clearTimeout(timer);
      const aborted = controller.signal.aborted;
      yield { type: "error", status: request.signal?.aborted ? "cancelled" : aborted ? "timeout" : "request_failed", message: error.message };
      return;
    }
    if (!response.ok || !response.body) {
      clearTimeout(timer);
      yield { type: "error", status: "http_error", http_status: response.status, message: `Ollama responded ${response.status}` };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let obj;
          try { obj = JSON.parse(line); }
          catch { continue; } // malformed chunk: skip it, never corrupt the stream
          const piece = obj?.message?.content;
          if (piece) {
            if (firstTokenMs === null) firstTokenMs = Date.now() - started;
            charCount += piece.length;
            if (charCount > this.maxResponseChars) {
              yield { type: "error", status: "oversized_response", message: "Response exceeded the maximum size." };
              controller.abort();
              clearTimeout(timer);
              return;
            }
            yield { type: "delta", text: piece };
          }
          if (obj?.done) {
            clearTimeout(timer);
            yield { type: "done", stats: {
              model: selected,
              time_to_first_token_ms: firstTokenMs,
              total_ms: Date.now() - started,
              output_chars: charCount,
              input_tokens: obj.prompt_eval_count || null,
              output_tokens: obj.eval_count || null,
            } };
            return;
          }
        }
      }
      // Stream ended without a done marker.
      clearTimeout(timer);
      yield { type: "done", stats: { model: selected, time_to_first_token_ms: firstTokenMs, total_ms: Date.now() - started, output_chars: charCount, truncated: true } };
    } catch (error) {
      clearTimeout(timer);
      const cancelled = request.signal?.aborted;
      yield { type: "error", status: cancelled ? "cancelled" : "stream_failed", message: error.message, partial_chars: charCount };
    } finally {
      clearTimeout(timer);
      if (request.signal) request.signal.removeEventListener?.("abort", onCallerAbort);
    }
  }

  // Tiny non-user-facing request that asks Ollama to load the model into memory
  // (num_predict: 0) and hold it per keep_alive. Best-effort: returns a small
  // status object and never throws, so a failed warmup can't break startup.
  async warmup() {
    const started = Date.now();
    try {
      const selected = selectModel(await this.listModels(), this.model)?.name;
      if (!selected) return { ok: false, status: "missing_model" };
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(Math.min(this.timeoutMs, 20000)),
        body: JSON.stringify({
          model: selected, stream: false, think: false, keep_alive: this.keepAlive,
          options: { num_predict: 0 },
          messages: [{ role: "user", content: "ok" }],
        }),
      });
      return { ok: response.ok, status: response.ok ? "warm" : "http_error", model: selected, duration_ms: Date.now() - started };
    } catch (error) {
      return { ok: false, status: error.name === "TimeoutError" ? "timeout" : "request_failed", error: error.message, duration_ms: Date.now() - started };
    }
  }

  async embed(texts = []) {
    if (!this.embeddingModel) return null;
    const vectors = [];
    for (const text of texts) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({ model: this.embeddingModel, prompt: String(text) }),
      });
      if (!response.ok) throw new Error(`Ollama embeddings failed: ${response.status}`);
      const data = await response.json();
      vectors.push(data.embedding);
    }
    return vectors;
  }
}

export function normalizeModels(data) {
  return (data?.models || []).map((model) => ({
    name: model.name,
    modified_at: model.modified_at || null,
    size: model.size || null,
    digest: model.digest || null,
  })).filter((model) => model.name);
}

export function selectModel(models, configuredModel) {
  if (!models.length) return null;
  if (configuredModel) return models.find((model) => model.name === configuredModel) || null;
  return models[0];
}
