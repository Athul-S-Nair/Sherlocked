// POST /api/tts: ElevenLabs proxy for James's live lines. Streams audio/mpeg back.
//
// Game mode:  { stateToken }  synthesizes the last line James spoke in that signed state,
//             with its voice_style, so the proxy can't be used as a free TTS for any text.
// Dev mode:   { text, voice_style, model? }  free text for the voice test page. Only
//             accepted by the local dev server (vite.config.js sets APP_DEV_SERVER).
//
// Any error returns JSON immediately so the client can switch to the browser voice.
import { createHash } from 'node:crypto';
import { decodeState } from './_lib/state-token.js';
import { clientIp, rateLimited } from './_lib/ratelimit.js';
import { sendJson } from './_lib/http.js';
import {
  buildTtsBody, requestSpeech, describeFailure, ttsModel, creditRate,
} from './_lib/elevenlabs.js';
import { VOICE_STYLES } from '../config/voice-styles.js';

const SESSION_CAP = 9;
const MAX_DEV_TEXT = 300;
const CONNECT_TIMEOUT_MS = 8000;
const CACHE_MAX_BYTES = 25 * 1024 * 1024;

// In-memory, per server instance (see README).
const cache = new Map(); // key -> Buffer, insertion order = LRU order
let cacheBytes = 0;
const sessionCalls = new Map(); // sid -> count
let day = '';
let dayCalls = 0;

function cacheGet(key) {
  const buf = cache.get(key);
  if (buf) { cache.delete(key); cache.set(key, buf); }
  return buf;
}

function cachePut(key, buf) {
  cache.set(key, buf);
  cacheBytes += buf.length;
  for (const [k, v] of cache) {
    if (cacheBytes <= CACHE_MAX_BYTES) break;
    cache.delete(k);
    cacheBytes -= v.length;
  }
}

function dailyCount() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCalls = 0; }
  return dayCalls;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
  if (rateLimited(`tts:${clientIp(req)}`, 30)) return sendJson(res, 429, { error: 'rate_limited' });

  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!process.env.ELEVENLABS_API_KEY || !voiceId) {
    return sendJson(res, 503, { error: 'not_configured', detail: 'ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID is not set' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const devMode = process.env.APP_DEV_SERVER === '1' && typeof body.text === 'string';
  let text, voiceStyle, sid, model = ttsModel();

  if (devMode) {
    text = body.text.trim().slice(0, MAX_DEV_TEXT);
    voiceStyle = body.voice_style;
    if (typeof body.model === 'string' && /^eleven_[a-z0-9_]+$/.test(body.model)) model = body.model;
    sid = 'dev';
  } else {
    let s;
    try { s = decodeState(body.stateToken); } catch (err) {
      return sendJson(res, 503, { error: 'not_configured', detail: err.message });
    }
    if (!s?.last_spoken || s.last_spoken.fixed) return sendJson(res, 400, { error: 'no_live_line' });
    text = s.last_spoken.line;
    voiceStyle = s.last_spoken.voice_style;
    sid = s.sid;
  }
  if (!text || !VOICE_STYLES[voiceStyle]) return sendJson(res, 400, { error: 'invalid_request' });

  const ttsBody = buildTtsBody(text, voiceStyle, model);
  const key = createHash('sha256')
    .update(JSON.stringify([voiceId, model, ttsBody.voice_settings, ttsBody.text]))
    .digest('hex');

  const used = sessionCalls.get(sid) || 0;
  const cached = cacheGet(key);
  if (cached) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('X-TTS-Cache', 'hit');
    res.setHeader('X-TTS-Session-Used', String(used));
    return res.end(cached);
  }

  // Credit protection: refuse immediately past either cap so the client falls back.
  const dailyCap = Number(process.env.TTS_DAILY_CAP) || 60;
  if (!devMode && used >= SESSION_CAP) return sendJson(res, 429, { error: 'session_cap' });
  if (dailyCount() >= dailyCap) return sendJson(res, 429, { error: 'daily_cap' });

  const ctrl = new AbortController();
  const connectTimer = setTimeout(() => ctrl.abort(), CONNECT_TIMEOUT_MS);
  res.on('close', () => ctrl.abort()); // client gave up (e.g. its 4 s fallback timer)

  let upstream;
  try {
    upstream = await requestSpeech({ voiceId, body: ttsBody, stream: true, signal: ctrl.signal });
  } catch (err) {
    clearTimeout(connectTimer);
    console.error('[tts] request failed:', err.name === 'AbortError' ? 'timeout' : err.message);
    return sendJson(res, 504, { error: 'timeout' });
  }
  clearTimeout(connectTimer);

  if (!upstream.ok) {
    const fail = await describeFailure(upstream);
    console.error('[tts]', fail.message);
    return sendJson(res, fail.code === 'quota_exceeded' ? 429 : 502, { error: fail.code });
  }

  sessionCalls.set(sid, used + 1);
  dayCalls += 1;
  const chars = Number(upstream.headers.get('x-character-count')) || ttsBody.text.length;
  console.log(
    `[tts] ${model} style=${voiceStyle} chars=${chars} ~credits=${Math.round(chars * creditRate(model))}` +
    ` session=${used + 1}/${devMode ? '∞' : SESSION_CAP} today=${dayCalls}/${dailyCap}`,
  );

  res.statusCode = 200;
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-TTS-Cache', 'miss');
  res.setHeader('X-TTS-Chars', String(chars));
  res.setHeader('X-TTS-Session-Used', String(used + 1));

  const chunks = [];
  try {
    for await (const chunk of upstream.body) {
      chunks.push(chunk);
      res.write(chunk);
    }
    res.end();
    cachePut(key, Buffer.concat(chunks));
  } catch (err) {
    console.error('[tts] stream interrupted:', err.message);
    res.end();
  }
}
