// Orbit Axis :: Ask Orbit service (Update 4.0).
//
// Orchestrates one Ask turn end-to-end, store-agnostic (Supabase in production,
// in-memory in tests). Business rules:
//   - The active chart is resolved server-side from the authenticated owner —
//     never a client-supplied chart id (no second active-chart system).
//   - The deterministic astrology engine builds evidence + a plan BEFORE any
//     language generation. The answer is complete even with no model.
//   - Every message persists its evidence, question type, engine version, active
//     chart id, detail mode, and status, so an answer stays reproducible.
//   - A failed generation is saved as a failed message (the user's question is
//     never lost) and surfaced as an error — never reported as success.

import { buildAskContext, ASK_ENGINE_VERSION } from "./context-engine.js";
import { generateAskAnswer } from "./ask-provider.js";
import { presentAnswer } from "./presenter.js";

export class AskError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

export const MAX_QUESTION_CHARS = 2000;

export function validateQuestion(text) {
  const q = String(text ?? "").trim();
  if (!q) return { ok: false, error: "Enter a question.", code: "empty_question" };
  if (q.length > MAX_QUESTION_CHARS) return { ok: false, error: "That question is too long.", code: "question_too_long" };
  return { ok: true, question: q };
}

function titleFrom(question) {
  const t = question.replace(/\s+/g, " ").trim();
  return t.length <= 60 ? t : `${t.slice(0, 59)}…`;
}

// deps: { store, chartSvc, getDetail(ownerId)->level, getSky()->sky|null,
//         provider?, uuid()->string, now()->ISO string, useModel?, timeoutMs? }
export function createAskService(deps) {
  const {
    store, chartSvc, getDetail, getSky, provider = null, uuid, now, useModel, timeoutMs,
    // Injectable so the deterministic-failure safety net is testable. Defaults to
    // the real generator, which itself never throws (it falls back to the
    // deterministic presenter on any model error).
    generate = generateAskAnswer,
  } = deps;

  async function resolveDetail(ownerId) {
    try { const d = await getDetail(ownerId); return d === "Advanced" ? "Advanced" : "Simple"; }
    catch { return "Simple"; }
  }

  return {
    async listConversations(ownerId, opts = {}) {
      return store.listConversations(ownerId, opts);
    },

    async getConversation(ownerId, id) {
      const conversation = await store.getConversation(ownerId, id);
      if (!conversation) throw new AskError("not_found", "Conversation not found.");
      const messages = await store.listMessages(ownerId, id);
      return { conversation, messages };
    },

    async newConversation(ownerId) {
      const stamp = now();
      const conversation = await store.createConversation(ownerId, {
        id: uuid(), title: "New conversation", birth_profile_id: null,
        created_at: stamp, updated_at: stamp,
      });
      return conversation;
    },

    // The core turn. Always returns a structured result; on generation failure
    // it still persists the question as a failed message and throws AskError so
    // the route returns an honest error (never a false success).
    async ask(ownerId, { question, conversationId = null, signal = null } = {}) {
      const valid = validateQuestion(question);
      if (!valid.ok) throw new AskError(valid.code, valid.error);

      // Resolve the active chart from the server identity only.
      let active = null;
      try { active = await chartSvc.getActive(ownerId); }
      catch { throw new AskError("chart_load_failed", "We couldn't load your saved charts. Try again."); }
      if (!active) throw new AskError("no_active_chart", "Add a chart to ask Orbit about it.");

      const detailMode = await resolveDetail(ownerId);
      let sky = null;
      try { sky = await getSky(); } catch { sky = null; }

      const ctx = buildAskContext({ active, sky, detailMode, question: valid.question });

      // Ensure a conversation exists (ownership checked on reopen).
      let conversation = null;
      if (conversationId) {
        conversation = await store.getConversation(ownerId, conversationId);
        if (!conversation) throw new AskError("conversation_not_found", "That conversation couldn't be found.");
      } else {
        const stamp = now();
        conversation = await store.createConversation(ownerId, {
          id: uuid(), title: titleFrom(valid.question),
          birth_profile_id: ctx.activeChartId, created_at: stamp, updated_at: stamp,
        });
      }

      // Generate wording (deterministic always; optional model reword).
      let rendered;
      let status = "ok";
      try {
        rendered = await generate(ctx, active.chart, { provider, useModel, timeoutMs, signal });
      } catch (e) {
        // Persist the failed turn so the question is never lost.
        const stamp = now();
        await store.insertMessage(ownerId, {
          id: uuid(), conversation_id: conversation.id, question: valid.question,
          answer: null, evidence: presentAnswer(ctx, active.chart).evidence,
          question_type: ctx.questionType, birth_time_reliability: ctx.birthTimeReliability,
          detail_mode: detailMode, active_chart_id: ctx.activeChartId,
          engine_version: ASK_ENGINE_VERSION, status: "failed", created_at: stamp,
        });
        await store.touchConversation(ownerId, conversation.id, {}).catch(() => {});
        throw new AskError("generation_failed", "Orbit couldn't generate an answer just now. Your question was saved — try again.");
      }

      // Persist the successful message with full evidence for reproducibility.
      const stamp = now();
      const messageRow = {
        id: uuid(), conversation_id: conversation.id, question: valid.question,
        answer: rendered.wordedText || `${rendered.answer.direct}\n\n${rendered.answer.interpretation}\n\n${rendered.answer.reflection}`.trim(),
        answer_parts: rendered.answer,
        evidence: rendered.evidence, themes: rendered.themes,
        question_type: ctx.questionType, birth_time_reliability: ctx.birthTimeReliability,
        detail_mode: detailMode, active_chart_id: ctx.activeChartId,
        provider: rendered.provider, engine_version: ASK_ENGINE_VERSION,
        status, created_at: stamp,
      };
      const saved = await store.insertMessage(ownerId, messageRow);
      // Keep the conversation title fresh if it was the first message.
      await store.touchConversation(ownerId, conversation.id, {}).catch(() => {});

      return {
        conversation: { id: conversation.id, title: conversation.title },
        message: saved || messageRow,
        context: {
          questionType: ctx.questionType,
          birthTimeReliability: ctx.birthTimeReliability,
          detailMode,
          activeChartId: ctx.activeChartId,
          activeChartName: ctx.activeChartName,
        },
        rendered,
      };
    },
  };
}
