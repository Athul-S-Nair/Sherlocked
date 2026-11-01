export const EXPRESSIONS = ['composed', 'uneasy', 'irritated', 'flustered', 'pained', 'broken'];
export const VOICE_STYLES = ['formal_steady', 'stiff', 'indignant', 'uneasy', 'strained', 'trembling', 'broken_quiet'];
export const TELLS = ['none', 'gloves', 'assure'];
export const TONES = ['empathetic', 'neutral', 'hostile', 'thief_insult', 'emma_stakes', 'off_topic'];
export const ENDINGS = ['none', 'confession', 'walkout'];
export const LIES = ['L1'];

export const MAX_LINE_WORDS = 40;

// Section C9: phrases that would leak the truth before the confession is unlocked.
const BANNED = /\bI took\b|\bI stole\b|\bI confess|the necklace is in|wine cellar/i;

function toInt(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return Number.isInteger(n) ? n : null;
}

/**
 * Validates and normalizes a raw model reply (string).
 * Returns { ok: true, reply } or { ok: false, reason }.
 * Out-of-range deltas are clamped (Section C1) rather than rejected.
 */
export function validateReply(raw, { confessionUnlocked }) {
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid JSON' };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'not an object' };

  const line = typeof obj.line === 'string' ? obj.line.trim() : '';
  if (!line) return { ok: false, reason: 'empty line' };
  if (line.split(/\s+/).length > MAX_LINE_WORDS) return { ok: false, reason: 'line too long' };
  if (!confessionUnlocked && BANNED.test(line)) return { ok: false, reason: 'banned content' };

  if (!EXPRESSIONS.includes(obj.expression)) return { ok: false, reason: 'bad expression' };
  if (!VOICE_STYLES.includes(obj.voice_style)) return { ok: false, reason: 'bad voice_style' };
  if (!TONES.includes(obj.player_tone)) return { ok: false, reason: 'bad player_tone' };

  const pressureDelta = toInt(obj.pressure_delta);
  const trustDelta = toInt(obj.trust_delta);
  if (pressureDelta === null || trustDelta === null) return { ok: false, reason: 'bad delta' };

  return {
    ok: true,
    reply: {
      line,
      expression: obj.expression,
      voice_style: obj.voice_style,
      tell: TELLS.includes(obj.tell) ? obj.tell : 'none',
      player_tone: obj.player_tone,
      pressure_delta: clamp(pressureDelta, -10, 35),
      trust_delta: clamp(trustDelta, -30, 15),
      new_committed_lies: Array.isArray(obj.new_committed_lies)
        ? obj.new_committed_lies.filter((l) => LIES.includes(l))
        : [],
      ended: ENDINGS.includes(obj.ended) ? obj.ended : 'none',
    },
  };
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
