# Local LLM

Orbit uses local Ollama only. It does not require Anthropic, OpenAI, Gemini,
cloud inference, or an external astrology API. The model may summarize and
draft project documentation from approved vault context; deterministic Orbit
code remains the only source of chart and astronomy calculations.

## Install and Configure

Install [Ollama](https://ollama.com), then install the validated model:

```bash
ollama pull qwen3:14b
ollama list
```

Create `.env.local` from `.env.example` and configure:

```env
ORBIT_LOCAL_LLM_ENABLED=true
ORBIT_LOCAL_LLM_PROVIDER=ollama
ORBIT_OLLAMA_BASE_URL=http://127.0.0.1:11434
ORBIT_LOCAL_MODEL=qwen3:14b
ORBIT_LOCAL_LLM_CONTEXT_LENGTH=8192
ORBIT_LOCAL_LLM_TEMPERATURE=0.2
ORBIT_LOCAL_LLM_TIMEOUT_MS=180000
```

Orbit loads `.env.local` before creating the provider. Restarting Orbit reloads
the settings. Set `ORBIT_LOCAL_LLM_ENABLED=false` to disable generation.

## Validate

```bash
npm run orbit:llm:status
npm run orbit:llm:models
npm run orbit:llm:test
npm start
```

`orbit:llm:test` requires a genuine, schema-valid Ollama response and fails if
fallback is used. Normal project-answer requests may use deterministic retrieval
when Ollama is unavailable or invalid, but the response is explicitly labeled.
Vault proposal requests never turn invalid model output into an applicable
fallback proposal.

Qwen receives bounded excerpts from approved project and business paths, not the
whole vault. Ollama schema mode enforces JSON, Orbit validates it again, and
thinking output is disabled and never stored.

## Performance

`qwen3:14b` is a large local model. First generation can be slow while the model
loads and memory pressure varies by machine. Adjust context length and output
limits centrally through environment variables; longer contexts use more memory.
