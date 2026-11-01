# Baker Street: The Blue Necklace

A conversational-AI interrogation game. You are Sherlock Holmes questioning James the butler. Voices by ElevenLabs.

**Status:** Milestone 1 (text-only engine) is done. Voice, the scene, and polish come next.

## Run locally
```
npm install
copy .env.example .env.local     # then fill in the values below
npm run dev
```
Open http://localhost:5173/test/chat.html. Unit tests: `npm test`.

## Environment variables
| Name | Required | Default | Purpose |
|---|---|---|---|
| `LLM_API_KEY` | yes | | Groq API key (or another OpenAI-compatible provider) |
| `STATE_SECRET` | yes | | Long random string (16+ chars) used to sign game state |
| `LLM_BASE_URL` | no | `https://api.groq.com/openai/v1` | Provider base URL |
| `LLM_MODEL` | no | `llama-3.3-70b-versatile` | Model name |
| `LLM_MAX_TOKENS` | no | `150` | Max output tokens per reply |
| `CHAT_RATE_LIMIT_PER_MIN` | no | `20` | Per-IP requests per minute on `/api/chat` |

On Vercel, set these under Project → Settings → Environment Variables.

## Architecture
- `api/chat.js`: `POST /api/chat`. No `stateToken` starts a game and returns the opening line. Otherwise it verifies the token, applies the confession gate, calls the LLM, validates the reply (one retry, then the fallback line), applies the game rules, and returns the new signed token.
- `api/_lib/game.js`: all game rules (Section C of the spec) as pure functions.
- `api/_lib/prompt.js`: the system prompt (Section A, word for word) and the per-turn message (Section B).
- `api/_lib/validate.js`: JSON schema, ranges, word limit, banned-phrase checks.
- `api/_lib/state-token.js`: HMAC-signed state. The client holds the state but can't change it.
- `api/_lib/llm.js`: OpenAI-compatible client in JSON mode, with one retry on 429.
- `vite.config.js`: serves `api/*.js` during `npm run dev`, so no Vercel CLI is needed locally.
- `data/fixed-lines.json`: the pre-recorded lines (Section D).

The rate limiter is in memory, so on serverless it's best-effort for each instance.
