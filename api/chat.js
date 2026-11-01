// POST /api/chat: LLM proxy and authoritative game logic.
// Body: { stateToken?: string, action?: { type: "say"|"present", text?: string, evidence_id?: "E1"|"E2"|"E3" } }
// No stateToken starts a new game and returns James's opening line.
import { SYSTEM_PROMPT, buildUserMessage } from './_lib/prompt.js';
import { validateReply } from './_lib/validate.js';
import {
  newState, isConfessionUnlocked, promptState, applyTurn, hintFor, trimHistory,
  stressFromPressure, EVIDENCE_IDS, MAX_TURNS, FALLBACK_LINE, FIXED,
} from './_lib/game.js';
import { encodeState, decodeState } from './_lib/state-token.js';
import { chatJson, LlmError } from './_lib/llm.js';
import { clientIp, rateLimited } from './_lib/ratelimit.js';
import { sendJson, WATSON_WAIT } from './_lib/http.js';

const MAX_TEXT = 400;

function publicState(s) {
  return {
    turn: s.turn,
    max_turns: MAX_TURNS,
    pressure: s.pressure,
    trust: s.trust,
    stress_state: s.ended === 'confession' ? 'breaking' : stressFromPressure(s.pressure),
    evidence_presented: s.evidence_presented,
    ended: s.ended,
  };
}

function parseAction(a) {
  if (!a || typeof a !== 'object') return null;
  const text = typeof a.text === 'string' ? a.text.trim().slice(0, MAX_TEXT) : '';
  if (a.type === 'say') return text ? { type: 'say', text } : null;
  if (a.type === 'present') {
    return EVIDENCE_IDS.includes(a.evidence_id) ? { type: 'present', evidence_id: a.evidence_id, text } : null;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });

  try {
    if (rateLimited(`chat:${clientIp(req)}`, Number(process.env.CHAT_RATE_LIMIT_PER_MIN) || 20)) {
      return sendJson(res, 429, { error: 'rate_limited', watson: WATSON_WAIT });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};

    // New game.
    if (!body.stateToken) {
      const s = newState();
      return sendJson(res, 200, {
        line: FIXED.james_opening,
        fixedLineId: 'james_opening',
        expression: 'composed',
        voice_style: 'formal_steady',
        tell: 'none',
        ended: 'none',
        followup: null,
        hint: null,
        state: publicState(s),
        stateToken: encodeState(s),
      });
    }

    const s = decodeState(body.stateToken);
    if (!s) return sendJson(res, 400, { error: 'invalid_state' });
    if (s.ended !== 'none') return sendJson(res, 409, { error: 'game_over', state: publicState(s) });

    const action = parseAction(body.action);
    if (!action) return sendJson(res, 400, { error: 'invalid_action' });

    // C4: the gate is decided from the previous turn's state, before the model is called.
    const unlocked = isConfessionUnlocked(s);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(promptState(s, s.turn + 1, unlocked), s.history, action) },
    ];

    // C8/C9: validate, retry once, then fall back with no state change.
    let reply = null;
    const failures = [];
    for (let attempt = 0; attempt < 2 && !reply; attempt++) {
      const raw = await chatJson(messages);
      const result = validateReply(raw, { confessionUnlocked: unlocked });
      if (result.ok) reply = result.reply;
      else failures.push(result.reason);
    }

    if (!reply) {
      console.warn('[chat] fallback line used:', failures.join(', '));
      return sendJson(res, 200, {
        line: FALLBACK_LINE,
        fixedLineId: 'james_fallback',
        expression: 'uneasy',
        voice_style: 'stiff',
        tell: 'assure',
        ended: 'none',
        followup: null,
        hint: hintFor(s),
        state: publicState(s),
        stateToken: body.stateToken,
        debug: { fallback: true, failures, confession_unlocked: unlocked },
      });
    }

    const { state, out } = applyTurn(s, action, reply, unlocked);
    return sendJson(res, 200, {
      line: out.line,
      fixedLineId: out.fixedLineId || null,
      expression: out.expression,
      voice_style: out.voice_style,
      tell: out.tell,
      ended: out.ended,
      followup: out.followup || null,
      hint: hintFor(state),
      state: publicState(state),
      stateToken: encodeState(trimHistory(state)),
      debug: {
        confession_unlocked: unlocked,
        retries: failures.length,
        failures,
        model: {
          player_tone: reply.player_tone,
          pressure_delta: reply.pressure_delta,
          trust_delta: reply.trust_delta,
          ended: reply.ended,
        },
        applied: out.applied,
      },
    });
  } catch (err) {
    if (err.config || (err instanceof LlmError && err.config)) {
      console.error('[chat] configuration error:', err.message);
      return sendJson(res, 500, { error: 'server_misconfigured', detail: err.message, watson: WATSON_WAIT });
    }
    console.error('[chat]', err.message);
    const rate = err instanceof LlmError && err.rateLimited;
    return sendJson(res, rate ? 429 : 503, { error: rate ? 'llm_rate_limited' : 'llm_unavailable', watson: WATSON_WAIT });
  }
}
