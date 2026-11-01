// Section C of james_system_prompt.md. The server owns the truth; the model only
// suggests deltas and writes dialogue. Everything here is pure so it can be unit tested.
import { randomUUID } from 'node:crypto';
import { clamp } from './validate.js';
import { describeHolmes } from './prompt.js';

export const MAX_TURNS = 8;
export const EVIDENCE_IDS = ['E1', 'E2', 'E3'];

export const FALLBACK_LINE = 'I assure you, sir, I would rather not say.';

// Must match data/fixed-lines.json (the pre-generated audio); a unit test checks this.
export const FIXED = {
  james_opening: "Mr. Holmes, sir. A dreadful business. Her Ladyship is quite beside herself. I shall help in any way I can.",
  james_walkout: "I must decline to say anything further, sir. I should like to speak to Her Ladyship's solicitor.",
  james_timeout: 'If that is all, sir, I have duties to attend to.',
};

export const HINTS = {
  key: 'Holmes, perhaps the matter of the key?',
  protecting: 'Holmes, the man is clearly protecting someone.',
};

export function newState() {
  return {
    v: 1,
    sid: randomUUID(),
    turn: 0,
    pressure: 0,
    trust: 20,
    evidence_presented: [],
    committed_lies: [],
    last_tone: null,
    insult_streak: 0,
    e2_turn: null,
    ended: 'none',
    history: [{ holmes: null, james: FIXED.james_opening }],
  };
}

// C2. "breaking" is reserved for the confession turn (Section A), so pressure alone tops out at cracking.
export function stressFromPressure(p) {
  if (p <= 15) return 'composed';
  if (p <= 30) return 'guarded';
  if (p <= 50) return 'defensive';
  if (p <= 65) return 'rattled';
  return 'cracking';
}

// C4. Evaluated at the START of a turn, from the state left by the previous turn.
export function isConfessionUnlocked(s) {
  return s.pressure >= 70 && s.trust >= 30 &&
    (s.last_tone === 'empathetic' || s.last_tone === 'emma_stakes');
}

// The STATE block shown to the model (Section B).
export function promptState(s, turn, confessionUnlocked) {
  return {
    turn,
    max_turns: MAX_TURNS,
    pressure: s.pressure,
    trust: s.trust,
    stress_state: confessionUnlocked ? 'breaking' : stressFromPressure(s.pressure),
    evidence_presented: s.evidence_presented,
    committed_lies: s.committed_lies,
    confession_unlocked: confessionUnlocked,
    walkout_triggered: false, // walkouts end the game immediately on the server (see applyTurn)
  };
}

/**
 * C3: the code's pressure/trust rules, which override the model's deltas.
 * Returns the deltas actually applied and the tone actually counted.
 */
export function computeDeltas(s, action, reply) {
  let pd = reply.pressure_delta;
  let td = reply.trust_delta;
  let tone = reply.player_tone;
  const before = s.evidence_presented;
  const isPresent = action.type === 'present';
  const isNewEvidence = isPresent && !before.includes(action.evidence_id);

  // "emma_stakes" only means something once E3 has been presented.
  if (tone === 'emma_stakes' && !before.includes('E3')) tone = 'neutral';

  if (isPresent && !isNewEvidence) {
    pd = 0; // same evidence twice
  } else if (isNewEvidence) {
    if (action.evidence_id === 'E1') pd = 25;
    if (action.evidence_id === 'E2') pd = before.includes('E1') ? 35 : 15;
    if (action.evidence_id === 'E3') { pd = Math.min(pd, 3); td = 0; }
  } else if (tone === 'off_topic') {
    pd = 0; td = 0; // bluffs, unrelated questions, prompt injection: no state change
  }

  // Presenting evidence is the player's job, not an insult: it never costs trust unless
  // the accompanying message is itself hostile. Otherwise the main route (E1, E2, empathy)
  // can fall short of the trust >= 30 gate on the model's whim.
  if (isPresent && tone !== 'hostile' && tone !== 'thief_insult') td = Math.max(td, 0);

  if (tone === 'emma_stakes') pd = Math.max(pd, 20);

  const after = isNewEvidence ? [...before, action.evidence_id] : before;
  if (tone === 'empathetic' && (after.includes('E1') || after.includes('E2'))) {
    pd = Math.max(pd, 10);
    td = Math.max(td, 12);
  }

  return { pd: clamp(pd, -10, 35), td: clamp(td, -30, 15), tone };
}

/**
 * Applies one validated model reply to the state and returns { state, out },
 * where `out` is what James actually says and how the turn ended.
 */
export function applyTurn(s, action, reply, confessionUnlocked) {
  const turn = s.turn + 1;
  const holmes = describeHolmes(action);

  if (confessionUnlocked) {
    // C4/C6: the confession turn. Any message triggers it; delivery is forced to the broken state.
    const state = {
      ...s,
      turn,
      ended: 'confession',
      history: [...s.history, { holmes, james: reply.line }],
    };
    return {
      state,
      out: {
        line: reply.line,
        expression: 'broken',
        voice_style: 'broken_quiet',
        tell: 'none',
        stress_state: 'breaking',
        ended: 'confession',
        applied: { pressure_delta: 0, trust_delta: 0, player_tone: reply.player_tone },
      },
    };
  }

  const { pd, td, tone } = computeDeltas(s, action, reply);
  const evidence = action.type === 'present' && !s.evidence_presented.includes(action.evidence_id)
    ? [...s.evidence_presented, action.evidence_id]
    : s.evidence_presented;

  const state = {
    ...s,
    turn,
    pressure: clamp(s.pressure + pd, 0, 100),
    trust: clamp(s.trust + td, 0, 100),
    evidence_presented: evidence,
    committed_lies: [...new Set([...s.committed_lies, ...reply.new_committed_lies])],
    last_tone: tone,
    insult_streak: tone === 'thief_insult' ? s.insult_streak + 1 : 0,
    e2_turn: s.e2_turn ?? (evidence.includes('E2') ? turn : null),
    history: [...s.history, { holmes, james: reply.line }],
  };

  // Keep the model's delivery from jumping to the confession look before it is earned.
  let expression = reply.expression === 'broken' ? 'pained' : reply.expression;
  let voice_style = reply.voice_style === 'broken_quiet' ? 'trembling' : reply.voice_style;
  let line = reply.line;
  let fixedLineId = null;
  let followup = null;

  // C5: walkout ends the game this turn with the fixed line. Model "ended" values are ignored (C6).
  if (state.trust <= 5 || state.insult_streak >= 2) {
    state.ended = 'walkout';
    line = FIXED.james_walkout;
    fixedLineId = 'james_walkout';
    expression = 'irritated';
    voice_style = 'indignant';
    state.history[state.history.length - 1].james = line;
  } else if (turn >= MAX_TURNS) {
    // Out of turns: James answers this last question, then leaves with the fixed timeout line.
    state.ended = 'timeout';
    followup = { line: FIXED.james_timeout, fixedLineId: 'james_timeout', voice_style: 'stiff', expression: 'composed' };
  }

  return {
    state,
    out: {
      line,
      expression,
      voice_style,
      tell: reply.tell,
      stress_state: stressFromPressure(state.pressure),
      ended: state.ended,
      fixedLineId,
      followup,
      applied: { pressure_delta: pd, trust_delta: td, player_tone: tone },
    },
  };
}

// C11: Watson's hint, shown by the client if non-null.
export function hintFor(s) {
  if (s.ended !== 'none') return null;
  const hasE2 = s.evidence_presented.includes('E2');
  if (!hasE2 && s.turn >= 3) return HINTS.key;
  if (hasE2 && s.e2_turn !== null && s.turn - s.e2_turn >= 2 && s.last_tone !== 'empathetic') {
    return HINTS.protecting;
  }
  return null;
}

// Trim history kept in the token: the prompt only ever needs the last 6 exchanges.
export function trimHistory(s) {
  return { ...s, history: s.history.slice(-6) };
}
