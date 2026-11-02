# Baker Street: The Blue Necklace

A conversational-AI interrogation game. You are Sherlock Holmes questioning James the butler. Voices by ElevenLabs.

**Status:** Milestones 1 (text engine) and 2 (voice) are done. Milestone 3 (scene) is in progress with placeholder art.

## Run locally
```
npm install
copy .env.example .env.local     # then fill in the values below
npm run dev
```
- http://localhost:5173/: the game scene. Add `?voice=browser` (free browser voice for live lines) or `?voice=off` to avoid spending ElevenLabs credits while working on visuals.
- http://localhost:5173/test/chat.html: play the interview by typing or push-to-talk (Chrome/Edge), with James's voice.
- http://localhost:5173/tools/voice.html: hear each `voice_style` and tune `config/voice-styles.js` (dev only).
- `npm run audio:fixed`: pre-generate the fixed lines into `public/assets/audio/` (skips existing files).
- `npm test`: unit tests.

## Environment variables
| Name | Required | Default | Purpose |
|---|---|---|---|
| `LLM_API_KEY` | yes | | Groq API key (or another OpenAI-compatible provider) |
| `STATE_SECRET` | yes | | Long random string (16+ chars) used to sign game state |
| `LLM_BASE_URL` | no | `https://api.groq.com/openai/v1` | Provider base URL |
| `LLM_MODEL` | no | `llama-3.3-70b-versatile` | Model name |
| `LLM_MAX_TOKENS` | no | `150` | Max output tokens per reply |
| `CHAT_RATE_LIMIT_PER_MIN` | no | `20` | Per-IP requests per minute on `/api/chat` |
| `ELEVENLABS_API_KEY` | for voice | | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | for voice | | James's voice |
| `ELEVENLABS_HOLMES_VOICE_ID` | for fixed lines | | Holmes's voice (evidence observations only) |
| `ELEVENLABS_MODEL` | no | `eleven_multilingual_v2` | `eleven_flash_v2_5` costs about half |
| `TTS_DAILY_CAP` | no | `60` | Max live TTS calls per day |

Without ElevenLabs configured, the game still works with the browser voice.

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

- `api/tts.js`: `POST /api/tts`. Voices only the last line in a signed game state (so it can't be used as a general TTS proxy), streams ElevenLabs audio, caches by hash of voice/model/settings/text, caps 9 calls per session and `TTS_DAILY_CAP` per day, and logs estimated credits.
- `config/voice-styles.js`: the one file mapping each `voice_style` to ElevenLabs settings (or audio tags on v3/v4) and browser pitch/rate.
- `src/voice.js`: client voice chain (fixed mp3, then ElevenLabs stream, then browser SpeechSynthesis, sticky for the session after a failure or 4 s with no audio).
- `config/scene.js`: every scene tunable (resolution, pan/lean, parallax speeds, palette, layout, art filenames, effects).
- `src/scene.js`: the 480x270 canvas: parallax layers, head-turn pan (screen edges or drag), lean-in zoom, prop hit-testing that follows the parallax, lamp light, vignette and grain. Art loads by filename from `public/assets/`; anything missing is replaced by a generated placeholder from `src/scene-art.js` (painted once at startup; only rain, fire, candle and clock animate per frame).
- `src/main.js`: the flow (title, intro video, briefing, interview, ending) and the wiring of the scene to `/api/chat`, reading cards, dialogue, meters, voice and push-to-talk.
- `src/cutscene.js`: the narrated pixel-art intro (six shots). Its narration is the `intro_*` lines in `data/fixed-lines.json`; `npm run audio:fixed` records them in Holmes's voice (browser voice until then).
- `src/speech-input.js`: push-to-talk via browser SpeechRecognition (free, Chrome/Edge).

The rate limiter, TTS caps and TTS cache are in memory, so on serverless they're best-effort for each instance.

Voices by ElevenLabs.
