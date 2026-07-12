# Orbit — Astro Signal Observatory

A small, self-contained astrology app and JSON API. Orbit shows today's sky
(sun season, moon phase, Mercury status, symbol of the day), an interactive
zodiac wheel, birth-date → sign lookup, compatibility geometry, and a symbol
atlas. Everything is **symbolic reflection for creative and brand work — never
prediction, medical, financial, or relationship advice.**

- **Zero runtime dependencies.** Pure Node.js standard library (`http`, `fs`).
- **Full-stack in one process.** The server serves both the JSON API and the
  static frontend from `public/`.
- **Optional local LLM.** Orbit supports local [Ollama](https://ollama.com)
  only. If Ollama is unavailable, the app keeps running and uses deterministic
  fallbacks. Anthropic and external astrology APIs are not required.
- **Controlled vault intelligence.** The local model can summarize approved
  project/business notes and propose vault edits, but every write requires a
  preview, approval, backup, and audit log.

## Requirements

- **Node.js 18+** to run the server.
- (Optional) [Ollama](https://ollama.com) running locally. The validated model is
  `qwen3:14b`; install it with `ollama pull qwen3:14b`.

## Setup

```bash
# No dependencies to install — but this validates package.json / lockfile.
npm install
```

## Run

```bash
# Simplest: zero config, listens on port 3001.
npm start
# → Orbit astrology app listening at http://localhost:3001
```

Then open <http://localhost:3001> in a browser.

Other ways to run:

```bash
npm run dev            # auto-restart on file changes (node --watch)
node server.js 8080    # port as the first CLI argument
PORT=8080 node server.js
```

## Configuration (optional)

Orbit runs with **no configuration**. To override defaults, copy the example
file and edit it:

```bash
cp .env.example .env.local
```

Orbit's local configuration module loads `.env.local` before it initializes the
Ollama provider. Start the app normally:

```bash
npm start
```

| Variable            | Default                   | Purpose                                             |
| ------------------- | ------------------------- | --------------------------------------------------- |
| `PORT`              | `3001`                    | HTTP port the server listens on.                    |
| `ORBIT_LOCAL_LLM_ENABLED` | `true` | Enables local LLM features; app still runs when Ollama is down. |
| `ORBIT_LOCAL_LLM_PROVIDER` | `ollama` | Only supported LLM provider. |
| `ORBIT_OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Local Ollama endpoint. |
| `ORBIT_LOCAL_MODEL` | first installed model | Optional model name. No model is downloaded automatically. |
| `ORBIT_LOCAL_LLM_CONTEXT_LENGTH` | `8192` | Ollama context window for project intelligence. |
| `ORBIT_LOCAL_LLM_TEMPERATURE` | `0.2` | Conservative structured-generation temperature. |
| `ORBIT_LOCAL_LLM_TIMEOUT_MS` | `180000` | Local generation timeout. |
| `ORBIT_LOCAL_EMBEDDING_MODEL` | unset | Optional local embedding model. Keyword retrieval works without it. |
| `ORBIT_VAULT_PATH` | `../Orbit vault` | Canonical Obsidian vault path. |

**No secrets or API keys are required.** Never commit `.env` or `.env.local`
(both are gitignored).

## API

All responses are JSON and include a `disclaimer` field where relevant.

| Method | Endpoint                          | Description                              |
| ------ | --------------------------------- | ---------------------------------------- |
| GET    | `/api/health`                     | Liveness check.                          |
| GET    | `/api/chart/now` (`/api/chart`)   | Current sky snapshot.                     |
| GET    | `/api/stella/daily`               | Daily symbolic brief.                    |
| POST   | `/api/stella/chat`                | Chat-style reflection (`{ "prompt": "" }`). |
| GET    | `/api/symbols`                    | Full symbol knowledge base.             |
| GET    | `/api/sign-for-date?month=&day=`  | Zodiac sign for a date.                 |
| GET    | `/api/compatibility?a=&b=`        | Symbolic compatibility between two signs. |
| GET    | `/api/events?count=`              | Upcoming sky events.                    |
| POST   | `/api/query`                      | Free-text query (`{ "prompt": "" }`).   |
| GET    | `/api/chakra`, `/api/chakra/:id`  | Chakra reference data.                  |
| GET    | `/api/local-llm/status`           | Local Ollama status.                    |
| GET    | `/api/local-llm/models`           | Installed Ollama models.                |
| POST   | `/api/local-llm/generate`         | Grounded local project answer.          |
| GET    | `/api/vault/project-notes`        | Approved project-note retrieval.        |
| POST   | `/api/vault/edit-proposals`       | Create a preview-only vault proposal.   |

Quick check:

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/chart/now
```

## Tests

Run the built-in checks:

```bash
npm run lint
npm test
```

Useful local intelligence commands:

```bash
npm run orbit:llm:status
npm run orbit:llm:models
npm run orbit:llm:test
npm run orbit:vault:search -- "Orbit Axis roadmap"
npm run orbit:vault:propose -- --type app_update --title "Local LLM Integration"
npm run orbit:vault:proposals
```

`orbit:llm:test` is a strict real-model check: it rejects fallback output. The
Local Intelligence panel always labels whether content came from the selected
Ollama model or deterministic retrieval. Vault changes remain proposals until
reviewed, approved, hash-checked, backed up, and applied. See
[`docs/local-llm.md`](docs/local-llm.md) and
[`docs/vault-editing.md`](docs/vault-editing.md).

## Project layout

```
orbit/
├── server.js          # Zero-dependency HTTP server: JSON API + static host
├── package.json
├── lib/
│   ├── symbols.js     # Knowledge base + deterministic query algorithms
│   ├── sky.js         # Sun season / moon phase / Mercury / events math
│   ├── llm.js         # Optional local Ollama symbolic fallback
│   └── local-llm/     # Ollama provider, vault retrieval, proposal workflow
└── public/            # Static frontend (vanilla JS, no build step)
    ├── index.html     # App shell + workspace panels
    ├── app.js         # Router, data loading, renderers, command palette
    └── styles/        # Orbit Design System
        ├── tokens.css     # Design tokens (colors, type, spacing, motion…)
        ├── base.css       # Reset, typography helpers, accessibility
        ├── components.css # Reusable UI primitives (o-* component library)
        └── app.css        # App shell layout + app-specific views
```

The frontend is built on the **Orbit Design System** — a token-driven set of
reusable UI primitives with dark/light themes, density/contrast/motion/text
modes, a workspace navigation model, and a ⌘K command palette. See
[`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) for the full component reference.

## License

Private / unpublished. Add a license before distributing.
