export function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

// In-world message shown when something fails; the player can simply retry.
export const WATSON_WAIT = 'Watson: One moment, Holmes...';
