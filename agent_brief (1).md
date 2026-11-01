# Project Brief: "Baker Street: The Blue Necklace"

Give this to the coding agent first, along with `james_system_prompt.md`. Read both fully before writing any code.

## What this is
A first-person conversational-AI interrogation game for a college project titled "project using voice ai / conversational ai". The player is Sherlock Holmes questioning a suspect (James, a butler) in the sitting room at 221B Baker Street, 1890s London. The player talks (typed, optionally voice) and presents evidence from the desk. The AI suspect replies in character, and his emotional state and tone of voice change as the player pressures him. The goal is to get a confession.

Judges will open a public link on their own laptops (no one will be there to explain), and a demo video accompanies it. So it must work on first load, in Chrome/Edge on Windows or Mac, with no setup.

Time budget: about 2 days. Prefer simple and robust over ambitious.

## Game length and priorities
- **A full game lasts 3 to 4 minutes.** Maximum 8 turns, winnable in about 5. One case, one suspect, three pieces of evidence.
- **Priority 1: the voice.** James's voice quality and how convincingly it changes with stress is what the project is judged on. When there is a tradeoff between a visual feature and voice quality, voice wins.
- Priority 2: the conversation holds up (stays in character, never confesses early, never breaks the story).
- Priority 3: the visuals.

## Visual approach (IMPORTANT: this is a 2D pixel-art game, NOT 3D)
Do NOT use three.js or any 3D engine. The game is a layered 2D scene drawn on an HTML canvas in a pixel-art style, with a first-person feel created by a wide panorama and parallax.

- **Internal resolution:** render to a low-res canvas (default 480x270) and scale it up to fit the window with `image-rendering: pixelated` (nearest-neighbor). Keep a 16:9 aspect ratio, letterboxed.
- **Panorama:** the room is a scene about 2x the screen width. The player pans left and right by moving the mouse toward the screen edges (or dragging), clamped to about 30 to 40 degrees of "head turn" each way, with smooth easing.
- **Parallax layers** (far to near, moving at different speeds): 1) back wall, window and rain, 2) James and his chair, 3) the desk and evidence props, 4) overlays (lamp glow, fog, film grain, vignette).
- **Lean in:** a "lean in" control zooms toward James's face for a closer read of his tells, and returns on release.
- **Side areas** (atmosphere and small rewards): left is the rainy window; right is the gas lamp and Watson's chair (the hint button lives there). James, the desk, and all core gameplay stay in the center view.
- **Suspect:** a flat pixel-art portrait of James with swappable expression sprites. Expression names match the JSON schema: `composed`, `uneasy`, `irritated`, `flustered`, `pained`, `broken`. Asset naming: `assets/james_composed.png`, `assets/james_uneasy.png`, etc. Same canvas size and head position in every file, so swapping does not jump. Add a subtle idle sway, a jitter at high stress, and a mouth flap synced to audio volume.
- **Placeholders first:** until the real art is dropped in, use plain colored rectangles and labeled placeholder sprites. The code must load assets by filename so that dropping in real images "just works."
- **Lighting and mood:** warm amber lamp against deep blue-green shadows. The lamp flicker intensity and the vignette/shadow harshness scale with Pressure. A detailed aesthetic spec (palette hex codes, layer dimensions, effect values) will follow as a separate file.

## Core loop
1. **Start screen:** title, a short briefing (case summary, how to play, "typing works, voice is optional", "about 3 minutes"), a credits line "Voices by ElevenLabs", and a "Begin" button (this also unlocks browser audio).
2. **Scene:** the panorama view at the desk. James sits opposite. Three evidence props sit on the desk: the moneylender's letter, the study key, and the staff statement. A framed photo of Lady Mary opens the case summary.
3. **Evidence:** the player clicks a prop, a reading card opens with Holmes's one-line observation (spoken from a pre-generated file, text in `james_system_prompt.md` Section D) and a "Present to James" button.
4. **Dialogue:** the player types (or speaks) a question, or presents evidence. This goes to `/api/chat`.
5. **Server:** builds the state block, calls the LLM with the system prompt, validates the JSON, applies the game logic from Section C of `james_system_prompt.md`, and returns the result.
6. **Client:** updates James's expression, lamp/lighting intensity, voice, subtitles, and the Pressure/Trust meters. A turn counter ("Turn 3 of 8") is visible.
7. **End state:** confession (win screen with a short case-closed summary) or walkout/out of turns (lose screen with a "try again" button).

## Tech stack
- Vite + vanilla JS or TypeScript, HTML canvas 2D. Deployed on Vercel (or Netlify).
- Serverless functions: `/api/chat` (LLM proxy and game logic) and `/api/tts` (TTS proxy). API keys live ONLY in environment variables, never in the frontend. Add a simple per-IP rate limit.
- LLM: use Groq through its OpenAI-compatible API (free tier), with the base URL, model name, and API key all in env vars so the provider can be swapped. Start with a 70B-class Llama model. Temperature 0.6, JSON mode, validate and retry once. On a rate-limit error (429), wait briefly and retry once, then show the in-world Watson message. Keep prompts short and replies capped (max about 150 output tokens).
- **TTS: ElevenLabs, with the voice quality as the top priority.** The game is short (about 8 live lines of 1 to 2 sentences, roughly 1,000 characters per game), so every spoken line can use ElevenLabs. Voice chain, in order:
  1. **Fixed lines** (James's opening, walkout, and timeout lines; Holmes's three evidence observations): pre-generated ONCE and shipped as static files at `assets/audio/<line_id>.mp3`. The text is in `james_system_prompt.md` Section D. Write a one-off script (`scripts/generate-fixed-audio.js`) that reads these lines from a JSON file and writes the mp3s, skipping files that already exist so credits are never spent twice.
  2. **Live lines** (James's replies and his confession): call `/api/tts`, a serverless proxy that calls ElevenLabs with the key in env vars. The model and voice ID come from env vars (`ELEVENLABS_MODEL`, `ELEVENLABS_VOICE_ID`) so they can be swapped without code changes. Default to a higher-quality model for live lines; a Flash/Turbo model uses roughly half the credits and is the documented switch if credits run low. Use ElevenLabs' streaming endpoint if available so audio starts playing before the whole clip is ready (check the current docs). Do not synthesize anything on page load.
  3. **Fallback:** if `/api/tts` errors, takes more than about 4 seconds, or returns a quota error, use the browser's SpeechSynthesis for that line and stay on it for the rest of the session. The browser voice is a LAST RESORT only. Its order of preference: "Google UK English Male", then any en-GB voice, then "Microsoft Mark" or "Microsoft David", then the default voice. Handle voices loading late (the `voiceschanged` event).
  - **Stress delivery:** `voice_style` is an enum in the JSON (`formal_steady`, `stiff`, `indignant`, `uneasy`, `strained`, `trembling`, `broken_quiet`). Map each value to ElevenLabs voice settings in one config file (stability, style, similarity), with lower stability and higher style for the shaky states and higher stability for composed. See the table in `james_system_prompt.md` Section E. Keep the mapping in a single file so it is easy to tune by ear. For the browser fallback, map to pitch and rate (formal_steady: rate 0.95, pitch 0.9; uneasy/strained: rate 1.15, pitch 1.1; trembling: slower and quieter).
  - **Protect credits (free plan is about 10,000 credits a month, which is only on the order of ten full games with a quality model):** the server caps live TTS at 9 calls per session and a global daily cap set by an env var (default 60 calls); past either cap, `/api/tts` returns an error immediately so the client falls back to the browser voice. Cache by a hash of (voice, model, settings, text) so a repeated line is never generated twice. Log credits used per call to the console so they can be tracked.
  - **Attribution:** the free plan requires attribution. Show "Voices by ElevenLabs" on the start screen and in the README.
  - **Mouth sync:** drive the mouth flap from the audio element's volume (an AnalyserNode) for ElevenLabs audio and fixed files. For browser fallback, use a simple timed flap.
  - **Latency:** target under about 3 seconds from sending a message to James's first audio. Cover the wait with a "thinking" beat (glance away, lamp flicker).
- Speech input: browser SpeechRecognition (Chrome/Edge) as push-to-talk, with typed input as the default. Detect support and hide the mic button if unavailable.
- Game state: the client sends the state back and forth, and the server recomputes everything critical. Do not trust client-side values for the confession gate.

## Build order (do not skip ahead)
1. **Text-only engine.** `/api/chat`, JSON validation, state logic (Section C of `james_system_prompt.md`), and a plain HTML test page. Verify the whole path to a confession works by typing, in about 5 turns. Stop here and wait for my review.
2. **Voice.** Do this EARLY, before the scene. `/api/tts`, the `voice_style` mapping config, fixed-audio generation script, browser fallback, and a test page where I can click each `voice_style` and hear it. Stop here so I can tune the voices by ear.
3. **Scene.** Canvas pipeline at low resolution, panorama with parallax and pan limits, desk, clickable evidence (placeholders), reading card, present button, lean-in.
4. **Suspect.** Expression sprites mapped to stress states, idle sway, mouth flap, thinking beat, subtitles revealed in chunks in sync with the audio, transcript log button, optional push-to-talk.
5. **Polish.** Start screen, meters, turn counter, hint ("Watson") button, error handling, mute toggle, win/lose screens, loading state, lamp/rain/fog effects. Deploy and test on a different laptop.

## Requirements that must not be skipped
- Typed input works with no mic. Subtitles are on by default. A mute toggle exists.
- If the LLM or TTS fails, show an in-world message ("Watson: One moment, Holmes...") and let the player retry. Never freeze. A failed TTS must never block the subtitles or the game.
- Meters are visible in a corner (Pressure and Trust), so the AI's behavior is legible in the demo video.
- Mobile layout is not required, but the page must not break at laptop sizes (1280x720 up).
- Evidence props must be clickable at every pan position where they are visible. Hit areas must follow the parallax offsets.

## How to work
- Before writing code, give me a short plan: file structure, how `/api/chat` works, and how game state stays authoritative on the server. Wait for my approval.
- Do each build step, run it, and verify it before the next. After the scene is up, take screenshots and compare against the aesthetic notes before moving on.
- Make one change at a time and commit after each milestone.
- Keep a short README with the run instructions, env vars needed, and the architecture.
- Ask me before adding anything not in this brief.
