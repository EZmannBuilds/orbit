// Orbit — standalone astrology app + API.
// Zero dependencies: node server.js (Node 18+). Default port 3001 (override
// with PORT or the first CLI argument).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ORBIT_DISCLAIMER, ORBIT_SYMBOLS, ZODIAC_ORDER,
  answerPrompt, signSlugForDate, symbolBySlug, signGeometry, summarizeSign,
} from "./lib/symbols.js";
import { chartNow, sunSeason, moonPhase, mercuryStatus, symbolOfTheDay, upcomingEvents, CHAKRAS } from "./lib/sky.js";
import { orbitLlmReply, OLLAMA_MODEL } from "./lib/llm.js";
import { createLocalLLMProvider } from "./lib/local-llm/provider.js";
import { generateProjectAnswer } from "./lib/local-llm/assistant.js";
import {
  applyProposal,
  collectProjectNotes,
  getProjectNoteById,
  listProposals,
  readProposal,
  updateProposalStatus,
} from "./lib/local-llm/vault.js";
import { localLlmConfig, supabaseConfig } from "./lib/local-llm/config.js";
import { recordVaultProposalStatus, recordVaultVersion } from "./lib/local-llm/supabase.js";
import { buildActiveChartContext } from "./lib/local-llm/context.js";
import { handleChartsRoute } from "./lib/charts/api.js";
import { handleFortuneRoute } from "./lib/fortune/api.js";
import {
  authenticateRequest,
  clearSessionCookie,
  sessionCookie,
  signInWithPassword,
  signOutSupabase,
  signUpWithPassword,
} from "./lib/auth/supabase-auth.js";

function skyContext() {
  const now = new Date();
  const sun = sunSeason(now);
  const moon = moonPhase(now);
  const mercury = mercuryStatus(now);
  return `Sun in ${sun.name}, ${moon.phase} moon at ${moon.illumination_pct}% illumination, Mercury ${mercury.retrograde ? "retrograde" : "direct"}.`;
}

// When the deterministic engine has no match, let the local LLM try.
// Returns the (possibly upgraded) result plus which engine produced it.
async function resolveWithLlm(result, prompt) {
  if (result.intent !== "unresolved") {
    return { result, mode: "orbit_service", model: "orbit-engine" };
  }
  const llmReply = await orbitLlmReply(prompt, skyContext());
  if (!llmReply) {
    return { result, mode: "orbit_service", model: "orbit-engine" };
  }
  return {
    result: { ...result, reply: llmReply, intent: "llm_reflection", algorithm: "local_llm" },
    mode: "orbit_llm",
    model: OLLAMA_MODEL,
  };
}

const PORT = Number(process.env.PORT || process.argv[2] || 3001);
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function json(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", chunk => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); }
    });
  });
}

function isLocalRequest(req) {
  const address = req.socket.remoteAddress;
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
}

function requireLocal(req, res) {
  if (isLocalRequest(req)) return true;
  json(res, 403, { ok: false, error: "Local intelligence routes are localhost-only by default." });
  return false;
}

function safeAuthError(data = {}) {
  const message = String(data.error_description || data.msg || data.error || "Authentication failed.");
  if (/invalid login/i.test(message)) return "Email or password did not match.";
  if (/already registered|already exists/i.test(message)) return "An account with that email may already exist. Try signing in.";
  if (/password/i.test(message)) return message;
  return message.length > 160 ? "Authentication failed." : message;
}

function validateEmailPassword(body, { signup = false } = {}) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const confirm = String(body.confirm_password || body.confirmPassword || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (signup && password !== confirm) return { error: "Passwords do not match." };
  return { email, password };
}

function authContext(auth) {
  const cfg = supabaseConfig();
  if (!auth?.ok || !auth.session?.access_token || !auth.user?.id) return null;
  return { url: cfg.url, anonKey: cfg.anonKey, accessToken: auth.session.access_token, ownerId: auth.user.id };
}

async function requireAuth(req, res) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    json(res, 401, { ok: false, error: auth.expired ? "Session expired. Please sign in again." : "Sign-in required." },
      auth.setCookie ? { "Set-Cookie": auth.setCookie } : {});
    return null;
  }
  return auth;
}

function serveStatic(res, urlPath) {
  const clean = path.normalize(urlPath === "/" ? "/index.html" : urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, clean);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    // SPA fallback
    const index = path.join(PUBLIC_DIR, "index.html");
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    return res.end(fs.readFileSync(index));
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(filePath));
}

function stellaDaily() {
  const now = new Date();
  const sun = sunSeason(now);
  const moon = moonPhase(now);
  const mercury = mercuryStatus(now);
  const daySymbol = symbolOfTheDay(now);
  const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const reflection = [
    `${today}: the Sun is ${sun.progress_pct}% through ${sun.name} season (${sun.element} ${sun.modality}), and the Moon is a ${moon.phase.toLowerCase()} at ${moon.illumination_pct}% illumination.`,
    mercury.retrograde
      ? "Mercury is retrograde — favor review, revision, and backups over launches."
      : "Mercury is direct — clear lanes for messaging and launches.",
    `Symbol of the day: ${daySymbol.name} ${daySymbol.glyph} — ${daySymbol.interpretation}`,
    ORBIT_DISCLAIMER,
  ].join(" ");

  return { reflection, sun, moon, mercury, symbol_of_the_day: daySymbol, mode: "orbit_service" };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = url.pathname;

  if (req.method === "OPTIONS") return json(res, 204, {});

  try {
    // ── Auth/session endpoints ──────────────────────────────────────────────
    if (route === "/api/auth/session" && req.method === "GET") {
      const auth = await authenticateRequest(req);
      if (!auth.ok) {
        return json(res, 200, { ok: true, signed_in: false, expired: !!auth.expired },
          auth.setCookie ? { "Set-Cookie": auth.setCookie } : {});
      }
      return json(res, 200, { ok: true, signed_in: true, user: auth.user },
        auth.setCookie ? { "Set-Cookie": auth.setCookie } : {});
    }
    if (route === "/api/auth/signup" && req.method === "POST") {
      const body = await readBody(req);
      const input = validateEmailPassword(body, { signup: true });
      if (input.error) return json(res, 400, { ok: false, error: input.error });
      const result = await signUpWithPassword(input);
      if (!result.ok) return json(res, result.status || 400, { ok: false, error: safeAuthError(result.data) });
      if (!result.session?.access_token) {
        return json(res, 200, { ok: true, signed_in: false, message: "Account created. Check your email if confirmation is required, then sign in." });
      }
      return json(res, 200, { ok: true, signed_in: true, user: result.user, message: "Account created." },
        { "Set-Cookie": sessionCookie(result.session) });
    }
    if (route === "/api/auth/signin" && req.method === "POST") {
      const body = await readBody(req);
      const input = validateEmailPassword(body);
      if (input.error) return json(res, 400, { ok: false, error: input.error });
      const result = await signInWithPassword(input);
      if (!result.ok || !result.session?.access_token) {
        return json(res, result.status || 400, { ok: false, error: safeAuthError(result.data) });
      }
      return json(res, 200, { ok: true, signed_in: true, user: result.user, message: "Signed in." },
        { "Set-Cookie": sessionCookie(result.session) });
    }
    if (route === "/api/auth/signout" && req.method === "POST") {
      const auth = await authenticateRequest(req);
      if (auth.session?.access_token) await signOutSupabase(auth.session.access_token).catch(() => {});
      return json(res, 200, { ok: true, signed_in: false }, { "Set-Cookie": clearSessionCookie() });
    }

    // ── Chart / daily / chakra contract endpoints ─────────────────────────
    if (route === "/api/chart" || route === "/api/chart/now") {
      return json(res, 200, { ok: true, ...chartNow(), disclaimer: ORBIT_DISCLAIMER });
    }
    if (route === "/api/stella/daily") {
      return json(res, 200, stellaDaily());
    }
    if (route === "/api/stella/chat" && req.method === "POST") {
      const body = await readBody(req);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const prompt = [...messages].reverse().find(message => message?.role === "user")?.content
        ?? body.prompt ?? "daily reflection";
      const t0 = Date.now();
      const { result, mode, model } = await resolveWithLlm(answerPrompt(String(prompt)), String(prompt));
      const response = `${result.reply}\n\n${ORBIT_DISCLAIMER}`;
      return json(res, 200, {
        response,
        intent: result.intent,
        matches: result.matches,
        algorithm: result.algorithm,
        details: result.details,
        mode,
        stats: {
          latency: Date.now() - t0,
          inputTokens: String(prompt).length,
          outputTokens: response.length,
          model,
        },
      });
    }
    if (route === "/api/chakra") {
      return json(res, 200, { ok: true, chakras: CHAKRAS });
    }
    if (route.startsWith("/api/chakra/")) {
      const chakra = CHAKRAS.find(entry => entry.id === route.slice("/api/chakra/".length));
      return chakra ? json(res, 200, { ok: true, chakra }) : json(res, 404, { ok: false, error: "Unknown chakra" });
    }

    // ── Orbit's own app API ────────────────────────────────────────────────
    if (route === "/api/symbols") {
      const kind = url.searchParams.get("kind");
      const symbols = kind ? ORBIT_SYMBOLS.filter(symbol => symbol.kind === kind) : ORBIT_SYMBOLS;
      return json(res, 200, { ok: true, count: symbols.length, symbols, disclaimer: ORBIT_DISCLAIMER });
    }
    if (route === "/api/sign-for-date") {
      const month = parseInt(url.searchParams.get("month"), 10);
      const day = parseInt(url.searchParams.get("day"), 10);
      if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) {
        return json(res, 400, { ok: false, error: "Pass month=1-12 and day=1-31." });
      }
      const symbol = symbolBySlug(signSlugForDate(month, day));
      return json(res, 200, { ok: true, sign: symbol, summary: summarizeSign(symbol) });
    }
    if (route === "/api/compatibility") {
      const a = url.searchParams.get("a");
      const b = url.searchParams.get("b");
      if (!ZODIAC_ORDER.includes(a) || !ZODIAC_ORDER.includes(b)) {
        return json(res, 400, { ok: false, error: "Pass a and b as zodiac sign slugs.", signs: ZODIAC_ORDER });
      }
      const geometry = signGeometry(a, b);
      const aspect = geometry.aspect ? symbolBySlug(geometry.aspect) : null;
      return json(res, 200, {
        ok: true,
        a: symbolBySlug(a), b: symbolBySlug(b),
        steps_apart: geometry.steps, aspect,
        harmony_score: geometry.score, note: geometry.note,
        disclaimer: ORBIT_DISCLAIMER,
      });
    }
    if (route === "/api/events") {
      return json(res, 200, { ok: true, events: upcomingEvents(new Date(), Number(url.searchParams.get("count")) || 8), disclaimer: ORBIT_DISCLAIMER });
    }
    if (route === "/api/query" && req.method === "POST") {
      const body = await readBody(req);
      const prompt = String(body.prompt ?? "");
      const { result, mode, model } = await resolveWithLlm(answerPrompt(prompt), prompt);
      return json(res, 200, { ok: true, ...result, mode, model, disclaimer: ORBIT_DISCLAIMER });
    }
    if (route === "/api/local-llm/status") {
      if (!requireLocal(req, res)) return;
      const health = await createLocalLLMProvider().health();
      return json(res, 200, { ok: true, prompt_version: localLlmConfig().promptVersion, ...health });
    }
    if (route === "/api/local-llm/models") {
      if (!requireLocal(req, res)) return;
      return json(res, 200, { ok: true, models: await createLocalLLMProvider().listModels() });
    }
    if (route === "/api/local-llm/generate" && req.method === "POST") {
      if (!requireLocal(req, res)) return;
      const body = await readBody(req);
      const auth = await authenticateRequest(req);
      let context = "";
      if (auth.ok) {
        const handled = await handleChartsRoute("GET", "/api/charts", new URLSearchParams(), {}, authContext(auth));
        const active = handled?.body?.charts?.find(chart => chart.is_active);
        const detail = await handleFortuneRoute("GET", "/api/settings/detail", new URLSearchParams(), {}, authContext(auth));
        context = buildActiveChartContext({
          activeChart: active || null,
          currentSky: skyContext(),
          detailLevel: detail?.body?.astrology_detail_level || "",
        });
      }
      const result = await generateProjectAnswer({
        prompt: `${context ? `${context}\n\n` : ""}${String(body.prompt || "")}`,
        query: String(body.query || body.prompt || ""),
      });
      return json(res, result.ok ? 200 : 422, result);
    }
    if (route === "/api/vault/project-notes") {
      if (!requireLocal(req, res)) return;
      const notes = collectProjectNotes({
        query: url.searchParams.get("q") || "",
        type: url.searchParams.get("type") || "",
        folder: url.searchParams.get("folder") || "",
        limit: Number(url.searchParams.get("limit")) || 20,
      });
      return json(res, 200, { ok: true, notes });
    }
    if (route.startsWith("/api/vault/project-notes/")) {
      if (!requireLocal(req, res)) return;
      const id = decodeURIComponent(route.slice("/api/vault/project-notes/".length));
      const note = getProjectNoteById(id);
      return note ? json(res, 200, { ok: true, note }) : json(res, 404, { ok: false, error: "Project note not found" });
    }
    if (route === "/api/vault/edit-proposals" && req.method === "GET") {
      if (!requireLocal(req, res)) return;
      return json(res, 200, { ok: true, proposals: listProposals() });
    }
    if (route === "/api/vault/edit-proposals" && req.method === "POST") {
      if (!requireLocal(req, res)) return;
      const body = await readBody(req);
      const result = await generateProjectAnswer({
        prompt: String(body.prompt || body.reason || "Create a vault edit proposal."),
        query: String(body.query || body.title || body.prompt || "Orbit"),
        propose: {
          operation: body.operation || "create",
          path: body.path,
          title: body.title || "Untitled Orbit Note",
          type: body.type || "app_update",
          reason: body.reason || body.prompt || "",
          content: body.content,
          appendContent: body.appendContent,
          tags: body.tags,
        },
      });
      return json(res, result.ok ? 200 : 422, result);
    }
    if (route.startsWith("/api/vault/edit-proposals/")) {
      if (!requireLocal(req, res)) return;
      const parts = route.slice("/api/vault/edit-proposals/".length).split("/");
      const id = decodeURIComponent(parts[0]);
      const action = parts[1] || "";
      if (req.method === "GET" && !action) {
        const proposal = readProposal(id);
        return proposal ? json(res, 200, { ok: true, proposal }) : json(res, 404, { ok: false, error: "Proposal not found" });
      }
      if (req.method === "POST" && action === "approve") {
        const proposal = updateProposalStatus(id, "approved");
        return json(res, 200, { ok: true, proposal, supabase: await recordVaultProposalStatus(proposal) });
      }
      if (req.method === "POST" && action === "reject") {
        const proposal = updateProposalStatus(id, "rejected");
        return json(res, 200, { ok: true, proposal, supabase: await recordVaultProposalStatus(proposal) });
      }
      if (req.method === "POST" && action === "apply") {
        let applied;
        try {
          applied = applyProposal(id);
        } catch (error) {
          const proposal = readProposal(id);
          if (proposal?.status === "stale") {
            await recordVaultProposalStatus(proposal);
            return json(res, 409, { ok: false, error: error.message, proposal });
          }
          throw error;
        }
        const [versionRecord, proposalRecord] = await Promise.all([
          recordVaultVersion(applied),
          recordVaultProposalStatus(applied.proposal),
        ]);
        return json(res, 200, { ok: true, ...applied, supabase: { version: versionRecord, proposal: proposalRecord } });
      }
    }
    if (route === "/api/health") {
      return json(res, 200, { ok: true, service: "orbit", port: PORT });
    }

    // Saved charts, current sky, and Moon. User-owned chart data requires a
    // Supabase Auth session; current-sky/Moon are public astronomy.
    if (route === "/api/charts" || route.startsWith("/api/charts/")
      || route === "/api/chart/preview"
      || route === "/api/sky/current" || route === "/api/moon/current") {
      let auth = null;
      if (route.startsWith("/api/charts")) {
        auth = await requireAuth(req, res);
        if (!auth) return;
      }
      const body = (req.method === "POST" || req.method === "PATCH" || req.method === "DELETE")
        ? await readBody(req) : {};
      const handled = await handleChartsRoute(req.method, route, url.searchParams, body, authContext(auth));
      if (handled) return json(res, handled.status, handled.body, auth?.setCookie ? { "Set-Cookie": auth.setCookie } : {});
    }

    // Daily fortune + astrology detail-level setting. Owner-scoped user data
    // requires a Supabase Auth session; the stateless preview needs no owner.
    if (route.startsWith("/api/fortune") || route === "/api/settings/detail") {
      const publicPreview = route === "/api/fortune/preview";
      let auth = null;
      if (!publicPreview) {
        auth = await requireAuth(req, res);
        if (!auth) return;
      }
      const body = (req.method === "POST" || req.method === "PUT")
        ? await readBody(req) : {};
      const handled = await handleFortuneRoute(req.method, route, url.searchParams, body, authContext(auth));
      if (handled) return json(res, handled.status, handled.body, auth?.setCookie ? { "Set-Cookie": auth.setCookie } : {});
    }

    if (route.startsWith("/api/")) return json(res, 404, { ok: false, error: "Unknown Orbit endpoint" });

    return serveStatic(res, route);
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Orbit astrology app listening at http://localhost:${PORT}`);
});
