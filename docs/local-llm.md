# Local LLM

Orbit uses local Ollama only. It does not require Anthropic, cloud LLMs, or an
external astrology API.

The local model may explain, summarize, plan, and draft project documentation
from approved Orbit vault context. It must not calculate charts, planetary
positions, houses, transits, or chart degrees. Deterministic Orbit code owns all
astronomical facts.

## Configuration

```env
ORBIT_LOCAL_LLM_ENABLED=true
ORBIT_LOCAL_LLM_PROVIDER=ollama
ORBIT_OLLAMA_BASE_URL=http://127.0.0.1:11434
ORBIT_LOCAL_MODEL=
ORBIT_LOCAL_EMBEDDING_MODEL=
```

Orbit asks Ollama for installed models. If `ORBIT_LOCAL_MODEL` is set and not
installed, Orbit shows a setup message. It never downloads a model
automatically.

## Commands

```bash
npm run orbit:llm:status
npm run orbit:llm:models
npm run orbit:llm:test
```

If Ollama is unavailable, the app keeps running and local intelligence falls
back to deterministic retrieval.
