// Orbit Axis :: Ask Orbit HTTP dispatch (Update 4.0).
//
// Returns { status, body } so server.js stays thin. Owner comes from the
// authenticated server identity (never the client). Chart and conversation
// ownership are enforced by the service + RLS. Routes:
//   GET  /api/ask/suggestions            → empty-state context + suggestion chips
//   GET  /api/ask/conversations          → list (owner-scoped)
//   POST /api/ask/conversations          → start a new conversation
//   GET  /api/ask/conversations/:id      → one conversation + its messages
//   POST /api/ask                        → ask a question (persisted, evidence-backed)

import { randomUUID } from "node:crypto";
import { createAskService, AskError, validateQuestion } from "./service.js";
import {
  createSupabaseAskStore, memoryAskStore, currentOwnerId, isConfigured,
} from "./store.js";
import { suggestedQuestions } from "./suggestions.js";
import { createChartService } from "../charts/service.js";
import { createSupabaseChartStore, supabaseChartStore } from "../charts/store.js";
import { createFortuneService, DEFAULT_DETAIL } from "../fortune/service.js";
import { createSupabaseFortuneStore, supabaseFortuneStore } from "../fortune/store.js";
import { currentSky } from "../astro/current-sky.js";
import { createLocalLLMProvider } from "../local-llm/provider.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function err(status, error, extra = {}) { return { status, body: { ok: false, error, ...extra } }; }
function ok(body) { return { status: 200, body: { ok: true, ...body } }; }

function requireOwner(auth = null) {
  if (auth?.ownerId && auth?.accessToken && auth?.anonKey && auth?.url) {
    return { owner: auth.ownerId, guard: null, configured: true };
  }
  const owner = currentOwnerId();
  if (!owner || !isConfigured()) {
    return { owner: null, guard: err(401, "Sign-in required."), configured: false };
  }
  return { owner, guard: null, configured: true };
}

// Brief in-memory cache so repeated asks don't shell out to Swiss Ephemeris more
// than needed; identical to the charts module's approach.
const SKY_CACHE_MS = 60_000;
let skyCache = { at: 0, sky: null };
function cachedSky() {
  const now = Date.now();
  if (!skyCache.sky || now - skyCache.at > SKY_CACHE_MS) {
    try { skyCache = { at: now, sky: currentSky(new Date(now)) }; }
    catch { skyCache = { at: now, sky: null }; }
  }
  return skyCache.sky;
}

function storeFor(auth) {
  return (auth?.ownerId && auth?.accessToken) ? createSupabaseAskStore(auth) : memoryAskStore;
}

function serviceFor(auth) {
  const chartSvc = createChartService(auth ? createSupabaseChartStore(auth) : supabaseChartStore);
  const fortuneSvc = createFortuneService(auth ? createSupabaseFortuneStore(auth) : supabaseFortuneStore);
  const useModel = process.env.ORBIT_ASK_USE_MODEL !== "false";
  return createAskService({
    store: storeFor(auth),
    chartSvc,
    getDetail: (ownerId) => fortuneSvc.getDetail(ownerId).catch(() => DEFAULT_DETAIL),
    getSky: () => cachedSky(),
    provider: useModel ? createLocalLLMProvider() : null,
    useModel,
    uuid: () => randomUUID(),
    now: () => new Date().toISOString(),
  });
}

function mapAskError(e) {
  if (e instanceof AskError) {
    const status = {
      empty_question: 400, question_too_long: 400, invalid_input: 400,
      no_active_chart: 409, chart_load_failed: 502,
      conversation_not_found: 404, not_found: 404,
      generation_failed: 502,
    }[e.code] || 400;
    return err(status, e.message, { code: e.code });
  }
  return err(500, "Ask Orbit request failed");
}

// route: pathname (server passes routes starting with /api/ask)
export async function handleAskRoute(method, route, query, body, auth = null) {
  if (!route.startsWith("/api/ask")) return null;

  const { owner, guard } = requireOwner(auth);
  if (guard) return guard;
  const svc = serviceFor(auth);

  // ── empty-state context + adaptive suggestions ──
  if (route === "/api/ask/suggestions" && method === "GET") {
    const chartSvc = createChartService(auth ? createSupabaseChartStore(auth) : supabaseChartStore);
    let active = null;
    try { active = await chartSvc.getActive(owner); } catch { active = null; }
    const sky = cachedSky();
    const suggestions = suggestedQuestions({ active, sky });
    return ok({
      active_chart: active ? { id: active.profile.id, nickname: active.profile.nickname } : null,
      birth_time_reliability: active?.chart?.time_accuracy || null,
      sky_available: !!sky,
      suggestions,
    });
  }

  // ── conversations ──
  if (route === "/api/ask/conversations") {
    if (method === "GET") {
      const conversations = await svc.listConversations(owner, { limit: Math.min(Number(query.get("limit")) || 20, 50) });
      return ok({ conversations });
    }
    if (method === "POST") {
      const conversation = await svc.newConversation(owner);
      return ok({ conversation });
    }
    return err(405, "Method not allowed");
  }

  const convMatch = route.match(/^\/api\/ask\/conversations\/([^/]+)$/);
  if (convMatch && method === "GET") {
    const id = convMatch[1];
    if (!UUID_RE.test(id)) return err(400, "Invalid conversation id");
    try {
      const { conversation, messages } = await svc.getConversation(owner, id);
      return ok({ conversation, messages });
    } catch (e) { return mapAskError(e); }
  }

  // ── ask a question ──
  if (route === "/api/ask" && method === "POST") {
    const pre = validateQuestion(body?.question);
    if (!pre.ok) return err(400, pre.error, { code: pre.code });
    const conversationId = body?.conversation_id || null;
    if (conversationId && !UUID_RE.test(conversationId)) return err(400, "Invalid conversation id");
    try {
      const result = await svc.ask(owner, { question: pre.question, conversationId });
      const r = result.rendered;
      return ok({
        conversation: result.conversation,
        message_id: result.message.id,
        question: pre.question,
        answer: r.wordedText ? { direct: r.wordedText, interpretation: "", reflection: "" } : r.answer,
        evidence: r.evidence,
        themes: r.themes,
        provider: r.provider,
        provider_note: r.providerNote || null,
        detail_mode: result.context.detailMode,
        birth_time_reliability: result.context.birthTimeReliability,
        question_type: result.context.questionType,
        active_chart: { id: result.context.activeChartId, nickname: result.context.activeChartName },
        disclaimer: r.disclaimer,
      });
    } catch (e) { return mapAskError(e); }
  }

  return err(404, "Unknown Ask Orbit route");
}
