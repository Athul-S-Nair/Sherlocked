# Baker Street: The Blue Necklace

A short voice-driven interrogation game. You play Sherlock Holmes and question James, the Ashford family's butler, about a necklace that went missing during a dinner party. James is played by a large language model and voiced live by ElevenLabs. As you put more pressure on him, his voice, face and words change. Get him to confess within 8 turns.

Built for a college project on voice AI and conversational AI. A full game takes 3 to 4 minutes.

*Voices by ElevenLabs.*

---

## The case

Lady Mary Ashford's blue necklace disappeared from her locked study during Saturday's dinner party. James says he served dinner all evening and never went near the study. Three pieces of evidence sit on Holmes's desk:

| Evidence | What it shows |
|---|---|
| **The moneylender's letter** | A debt demand addressed to Peter, James's son. This gives James a motive. |
| **The study key** | Only two keys exist. Lady Mary had hers all night. The spare hangs in the butler's pantry. |
| **The staff statement** | Emma, the new maid, was seen near the study at 9 PM. This could be a red herring. |

James won't confess just because you accuse him. You have to corner him with the evidence and then give him a reason to tell the truth.

## How to play

1. Click **Begin** (this also enables audio in the browser) and watch the short intro.
2. **Look around** by moving the mouse toward the edges of the screen, or by dragging. Hold **Lean In** (or the right mouse button) to look closely at James's face.
3. **Click an evidence prop** on the desk to read Holmes's notes, then click **Present to James**.
4. **Ask questions** by typing. In Chrome or Edge you can also hold **Hold to talk** (or the Space bar) and speak.
5. Watch the **Pressure** and **Trust** meters in the corner. If you insult him too much, James walks out. If you run out of turns, he goes back to his duties.
6. Stuck? Click **Watson's chair** on the right side of the room for a hint.

You also get a **Transcript** button, a **Mute** toggle, and subtitles, which are always on.

## How it works

```
Browser (canvas scene, voice, mic)
   │  player's line + signed game state
   ▼
/api/chat ── LLM (Groq, Llama 3.3 70B) ──► James's reply as JSON
   │  server applies the game rules, signs the new state
   ▼
Browser ── /api/tts ── ElevenLabs ──► James's voice, streamed
```

- **The model acts and the server keeps score.** Each turn the LLM returns a JSON object with James's line, his expression, a `voice_style`, how it read the player's tone, and suggested changes to pressure and trust. The server checks that reply, then applies fixed rules: which evidence adds how much pressure, when a confession is allowed, and when James walks out. The model can't confess early, even if the player tries prompt injection.
- **Tamper-proof state.** The game state goes back and forth as an HMAC-signed token. The browser holds it but can't edit it.
- **Voice that cracks under stress.** Each `voice_style` (`formal_steady` → `stiff` → `indignant` → `uneasy` → `strained` → `trembling` → `broken_quiet`) maps to its own ElevenLabs settings in [config/voice-styles.js](config/voice-styles.js). Stability drops and expressiveness rises as James comes apart.
- **Voice fallback chain.** Fixed lines (the opening, Holmes's evidence notes, the endings) are pre-recorded mp3s. Live lines stream from ElevenLabs. If ElevenLabs fails, is slow, or runs out of credits, the game switches to the browser's built-in voice so it never stalls.
- **Credit protection.** Live TTS is capped per session and per day, and repeated lines come from a cache.
- **2D pixel-art scene.** A low-resolution canvas scaled up with sharp pixels. It has a panning panorama with parallax, rain, fog, and a flickering lamp that gets harsher as pressure rises. James's mouth moves with the volume of his audio.

## Tech stack

- **Frontend:** Vite with vanilla JavaScript and HTML Canvas 2D (no game engine)
- **Backend:** Vercel serverless functions (`api/chat.js`, `api/tts.js`)
- **LLM:** any OpenAI-compatible API. The default is Groq with `llama-3.3-70b-versatile`.
- **Text-to-speech:** ElevenLabs (streaming), with browser SpeechSynthesis as a fallback
- **Speech input:** browser SpeechRecognition, push-to-talk (Chrome and Edge)

## Run it locally

Requires Node.js 18 or later.

```bash
npm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
# fill in .env.local (see below)
npm run dev
```

Then open http://localhost:5173. You don't need the Vercel CLI, because the dev server runs the `api/` functions itself.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs unit tests for the game rules |
| `npm run build` | Builds for production |
| `npm run audio:fixed` | Generates the fixed voice lines into `public/assets/audio/`. Files that already exist are skipped, so it doesn't spend credits twice. |

Dev-only pages:
- `/test/chat.html` is a plain text version of the interrogation, for testing the engine.
- `/tools/voice.html` plays each `voice_style` so you can tune James's voice by ear.

## Environment variables

| Name | Required | Default | Purpose |
|---|---|---|---|
| `LLM_API_KEY` | yes | | Groq key (or a key for another OpenAI-compatible provider) |
| `STATE_SECRET` | yes | | A long random string used to sign the game state |
| `LLM_BASE_URL` | no | `https://api.groq.com/openai/v1` | Provider base URL |
| `LLM_MODEL` | no | `llama-3.3-70b-versatile` | Model name |
| `LLM_MAX_TOKENS` | no | `150` | Maximum output tokens per reply |
| `CHAT_RATE_LIMIT_PER_MIN` | no | `20` | Requests per minute allowed from each IP on `/api/chat` |
| `ELEVENLABS_API_KEY` | for voice | | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | for voice | | James's voice |
| `ELEVENLABS_HOLMES_VOICE_ID` | for fixed lines | | Holmes's voice, used only by `npm run audio:fixed` |
| `ELEVENLABS_MODEL` | no | `eleven_multilingual_v2` | `eleven_flash_v2_5` uses about half the credits |
| `TTS_DAILY_CAP` | no | `60` | Maximum live TTS calls per day |

If you leave out the ElevenLabs settings, the game still works with the browser's voice.

**Deploying:** import the repo into Vercel, add the variables above under *Project → Settings → Environment Variables*, and deploy.

## Project layout

```
api/
  chat.js            POST /api/chat: one interrogation turn
  tts.js             POST /api/tts: streams James's voice from ElevenLabs
  _lib/
    game.js          game rules (pressure, trust, confession gate, walkout, hints)
    prompt.js        James's system prompt and the message sent each turn
    validate.js      checks the LLM's JSON and blocks early confessions
    state-token.js   signs and verifies the game state
    llm.js           OpenAI-compatible client
    elevenlabs.js    ElevenLabs client
    ratelimit.js     per-IP rate limit
config/
  voice-styles.js    voice_style → ElevenLabs and browser voice settings
  scene.js           scene layout and tuning
src/
  main.js            game flow and UI
  scene.js           canvas renderer, panning, parallax, lean-in
  scene-art.js       pixel-art drawing
  cutscene.js        intro sequence
  voice.js           voice chain (mp3 → ElevenLabs → browser) and mouth sync
  speech-input.js    push-to-talk
data/fixed-lines.json  text of the pre-recorded lines
test/game.test.js      unit tests for the game rules
```

The design documents are [agent_brief (1).md](agent_brief%20(1).md) (the project brief) and [james_system_prompt (1).md](james_system_prompt%20(1).md) (James's character, the JSON schema, the game rules and voice direction).

## Limitations

- The rate limiter, TTS caps and TTS cache are kept in memory. On serverless hosting each instance has its own copy, so these limits are approximate.
- Voice input works only in Chrome and Edge. Typing works everywhere.
- The game is built for laptop screens (1280×720 and up). There is no mobile layout.

## Credits

Voices by [ElevenLabs](https://elevenlabs.io). Language model served by [Groq](https://groq.com). Sherlock Holmes was created by Arthur Conan Doyle. The case and characters here are original.
