// Game state travels through the client as an HMAC-signed token, so the client
// can hold it but cannot change pressure, trust, tone history or dialogue.
import { createHmac, timingSafeEqual } from 'node:crypto';

function secret() {
  const s = process.env.STATE_SECRET;
  if (!s || s.length < 16) {
    const err = new Error('STATE_SECRET is not set (or shorter than 16 characters)');
    err.config = true;
    throw err;
  }
  return s;
}

function sign(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function encodeState(state) {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Returns the state, or null if the token is missing, malformed or tampered with. */
export function decodeState(token) {
  if (typeof token !== 'string' || token.length > 20000) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
