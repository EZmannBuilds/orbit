export class OllamaProvider {
  constructor({ enabled = true, baseUrl, model, embeddingModel, timeoutMs = 180000, contextLength = 8192, temperature = 0.2, maxOutputTokens = 3000, maxResponseChars = 120000 } = {}) {
    this.enabled = enabled;
    this.baseUrl = (baseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
    this.model = model || "";
    this.embeddingModel = embeddingModel || "";
    this.timeoutMs = timeoutMs;
    this.contextLength = contextLength;
    this.temperature = temperature;
    this.maxOutputTokens = maxOutputTokens;
    this.maxResponseChars = maxResponseChars;
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
      format: request.format || "json",
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
