// Minimal OpenAI-compatible chat client. Provider is swappable via env vars (defaults: Groq).
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 10000;

export class LlmError extends Error {
  constructor(message, { rateLimited = false, config = false } = {}) {
    super(message);
    this.rateLimited = rateLimited;
    this.config = config;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(body) {
  const key = process.env.LLM_API_KEY;
  if (!key) throw new LlmError('LLM_API_KEY is not set', { config: true });
  const base = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Sends one chat request in JSON mode and returns the raw content string. Retries a 429 once. */
export async function chatJson(messages) {
  const body = {
    model: process.env.LLM_MODEL || DEFAULT_MODEL,
    messages,
    temperature: 0.6,
    max_tokens: Number(process.env.LLM_MAX_TOKENS) || 150,
    response_format: { type: 'json_object' },
  };

  let res;
  try {
    res = await post(body);
    if (res.status === 429) {
      const wait = Math.min(Number(res.headers.get('retry-after')) * 1000 || 1500, 3000);
      await sleep(wait);
      res = await post(body);
    }
  } catch (err) {
    if (err instanceof LlmError) throw err;
    throw new LlmError(`LLM request failed: ${err.name === 'AbortError' ? 'timeout' : err.message}`);
  }

  if (res.status === 429) throw new LlmError('LLM rate limited', { rateLimited: true });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Groq returns 400 json_validate_failed when the model emits broken JSON; treat it as a bad reply, not an outage.
    if (res.status === 400 && /json_validate_failed/.test(text)) return '';
    throw new LlmError(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`, { config: res.status === 401 || res.status === 404 });
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}
