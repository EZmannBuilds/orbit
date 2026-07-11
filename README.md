# Orbit — Astro Signal Observatory

A small, self-contained astrology app and JSON API. Orbit shows today's sky
(sun season, moon phase, Mercury status, symbol of the day), an interactive
zodiac wheel, birth-date → sign lookup, compatibility geometry, and a symbol
atlas. Everything is **symbolic reflection for creative and brand work — never
prediction, medical, financial, or relationship advice.**

- **Zero runtime dependencies.** Pure Node.js standard library (`http`, `fs`).
- **Full-stack in one process.** The server serves both the JSON API and the
  static frontend from `public/`.
- **Optional local LLM.** Free-text "Ask Orbit" queries the deterministic
  engine first; only unresolved ones fall back to a local
  [Ollama](https://ollama.com) model. If Ollama isn't running, Orbit returns a
  canned reply — it never fails or calls any paid/cloud service.

## Requirements

- **Node.js 18+** to run the server.
- **Node.js 20.6+** only if you want to load config from an env file with
  `--env-file` (see below). Otherwise no env file is needed at all.
- (Optional) [Ollama](https://ollama.com) running locally with a model such as
  `llama3.1:8b` for the LLM fallback.

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

Because Orbit has zero dependencies (no `dotenv`), load the file with Node's
built-in flag (Node 20.6+):

```bash
node --env-file=.env.local server.js
```

On older Node, export the variables in your shell instead:

```bash
export PORT=8080
node server.js
```

| Variable            | Default                   | Purpose                                             |
| ------------------- | ------------------------- | --------------------------------------------------- |
| `PORT`              | `3001`                    | HTTP port the server listens on.                    |
| `OLLAMA_BASE`       | `http://localhost:11434`  | Local Ollama endpoint for the LLM fallback.         |
| `OLLAMA_MODEL`      | `llama3.1:8b`             | Ollama model used for unresolved free-text queries. |
| `OLLAMA_TIMEOUT_MS` | `20000`                   | Timeout for the Ollama request.                     |

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

Quick check:

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/chart/now
```

## Tests

This project has **no automated test suite yet**. Verify manually:

```bash
npm start
# in another terminal:
curl -s http://localhost:3001/api/health
curl -s "http://localhost:3001/api/sign-for-date?month=6&day=5"
```

You can also syntax-check every source file without running it:

```bash
node --check server.js
for f in lib/*.js public/app.js; do node --check "$f"; done
```

## Project layout

```
orbit/
├── server.js          # Zero-dependency HTTP server: JSON API + static host
├── package.json
├── lib/
│   ├── symbols.js     # Knowledge base + deterministic query algorithms
│   ├── sky.js         # Sun season / moon phase / Mercury / events math
│   └── llm.js         # Optional local Ollama fallback client
└── public/            # Static frontend (vanilla JS, no build step)
    ├── index.html
    ├── app.js
    └── style.css
```

## License

Private / unpublished. Add a license before distributing.
