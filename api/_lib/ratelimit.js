// Per-IP sliding-window limit, kept in memory. On serverless each instance counts
// separately and a cold start resets it, so this is a best-effort brake, not a hard cap.
const hits = new Map();
const WINDOW_MS = 60000;

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket?.remoteAddress || 'unknown';
}

export function rateLimited(key, limit) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now - v[v.length - 1] >= WINDOW_MS) hits.delete(k);
  }
  return recent.length > limit;
}
