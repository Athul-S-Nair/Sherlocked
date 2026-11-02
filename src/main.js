// Wires the scene to the interview: reading cards for the evidence, typed and spoken
// questions, /api/chat, subtitles, James's voice, the transcript and the game flow.
// Subtitles always appear before the voice starts, and a voice failure never blocks the
// game (Voice.speak never rejects).
//
// Dev: add ?voice=browser (free browser voice for live lines) or ?voice=off to the URL to
// avoid spending ElevenLabs credits while working on the scene.
import { Scene } from './scene.js';
import { Voice } from './voice.js';
import { createPushToTalk } from './speech-input.js';
import { Cutscene } from './cutscene.js';
import { VIEW } from '../config/scene.js';
import fixedLines from '../data/fixed-lines.json';

const $ = (id) => document.getElementById(id);
const LINES = Object.fromEntries(fixedLines.map((l) => [l.line_id, l]));
const VOICE_MODE = new URLSearchParams(location.search).get('voice');
const CASE_SUMMARY =
  "Lady Mary Ashford's blue necklace vanished from her locked study during Saturday's dinner party. " +
  'James, her butler of twenty years, says he served dinner all evening. ' +
  'Pressure him with evidence, earn his trust, and get his confession within 8 turns.';
const ENDINGS = {
  confession: ['Case closed', (st) =>
    `James confessed in ${st.turn} turns. He took the necklace from the locked study with the spare key ` +
    'from his pantry, to pay the moneylender threatening his son, Peter. It is hidden in the wine cellar.'],
  walkout: ['The case is lost', () =>
    "James has walked out and asked for Her Ladyship's solicitor. Pressed too hard by a man he did not trust, " +
    'he closed up for good.'],
  timeout: ['The case is lost', () =>
    'Out of time. James returns to his duties, the necklace still missing. He needed both proof and a reason ' +
    'to trust you.'],
};
const SPOKEN_WORDS_PER_SECOND = 2.7; // ElevenLabs pace, until a streamed clip's length is known
const THINKING_DOTS_AFTER_MS = 1500;

const voice = new Voice();
const scene = new Scene($('scene'), {
  onPropClick: (p) => (p.id === 'watson' ? giveHint() : openCard(p)),
  onHover: showTooltip,
});
let token = null;
let lastState = null;
let busy = false;
let ended = false;
let cardProp = null;
let jamesTalking = false;
const transcript = [];
scene.mouthLevel = () => (jamesTalking ? voice.level() : 0);

// ---- layout ---------------------------------------------------------------------------

function fit() {
  const s = Math.min(innerWidth / VIEW.w, innerHeight / VIEW.h);
  const stage = $('stage');
  stage.style.width = `${Math.floor(VIEW.w * s)}px`;
  stage.style.height = `${Math.floor(VIEW.h * s)}px`;
  stage.style.setProperty('--s', s);
}
addEventListener('resize', fit);
fit();

function showTooltip(prop, pointer) {
  const tip = $('tooltip');
  tip.hidden = !prop;
  if (!prop || !pointer) return;
  tip.textContent = prop.title;
  tip.style.left = `${pointer.clientX}px`;
  tip.style.top = `${pointer.clientY}px`;
}
$('scene').addEventListener('pointermove', (e) => {
  $('tooltip').style.left = `${e.clientX}px`;
  $('tooltip').style.top = `${e.clientY}px`;
});

// ---- dialogue, voice and transcript ------------------------------------------------------

// lineGen invalidates a line that is still being revealed once anything else is shown.
let lineGen = 0;
function setDialog(speaker, text) {
  $('dialog').hidden = !text;
  $('speaker').textContent = speaker ? `${speaker}:` : '';
  $('line').textContent = text || '';
}
function subtitle(speaker, text) {
  lineGen++;
  setDialog(speaker, text);
}

function log(speaker, text) {
  transcript.push({ speaker, text });
}

// Watson's hints and in-world error messages, with his name in the speaker column.
function watson(text) {
  const line = text.replace(/^Watson:\s*/, '');
  subtitle('Watson', line);
  log('Watson', line);
}

function speakLine({ text, voiceStyle, fixedLineId, stateToken }) {
  if (VOICE_MODE === 'off' || voice.muted) return Promise.resolve();
  if (VOICE_MODE === 'browser' && !fixedLineId) {
    voice.stop();
    return voice.speakBrowser(text, voiceStyle);
  }
  return voice.speak({ text, voiceStyle, fixedLineId, ttsBody: stateToken ? { stateToken } : undefined });
}

// Phrases to reveal one at a time; very short pieces are joined to the one before.
function phrases(text) {
  const out = [];
  for (const p of text.match(/[^,.;:!?—]+[,.;:!?—]*\s*/g) || [text]) {
    if (out.length && out[out.length - 1].trim().split(/\s+/).length < 3) out[out.length - 1] += p;
    else out.push(p);
  }
  return out;
}

// Shows a spoken line phrase by phrase in time with the voice. The first phrase appears at
// once; the whole line shows when the voice ends, fails or is muted.
async function sayLine(speaker, text, speech, { james = false } = {}) {
  log(speaker, text);
  const my = ++lineGen;
  const show = (t) => { if (my === lineGen) setDialog(speaker, t); };
  if (VOICE_MODE === 'off' || voice.muted) { show(text); return; }
  const parts = phrases(text);
  const starts = [];
  let chars = 0;
  for (const p of parts) { starts.push(chars / text.length); chars += p.length; }
  let shown = 1;
  let done = false;
  show(parts[0].trim());
  const estimate = text.split(/\s+/).length / SPOKEN_WORDS_PER_SECOND;
  const tick = () => {
    if (done) return;
    const p = voice.progress();
    if (p) {
      const frac = p.elapsed / (p.duration || estimate);
      const before = shown;
      while (shown < parts.length && starts[shown] <= frac) shown++;
      if (shown !== before) show(parts.slice(0, shown).join('').trim());
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  if (james) jamesTalking = true;
  try {
    await speakLine(speech);
  } finally {
    done = true;
    if (james) jamesTalking = false;
    show(text);
  }
}

function openTranscript() {
  $('transcriptList').replaceChildren(...transcript.map(({ speaker, text }) => {
    const row = document.createElement('p');
    const who = document.createElement('b');
    who.textContent = `${speaker}: `;
    row.append(who, text);
    return row;
  }));
  if (!transcript.length) $('transcriptList').textContent = 'Nothing has been said yet.';
  $('transcript').hidden = false;
  scene.setInteractive(false);
  $('transcriptList').scrollTop = $('transcriptList').scrollHeight;
}
function closeTranscript() {
  if ($('transcript').hidden) return;
  $('transcript').hidden = true;
  if (!cardProp) scene.setInteractive(true);
}
$('transcriptBtn').addEventListener('click', openTranscript);
$('endTranscript').addEventListener('click', openTranscript);
$('closeTranscript').addEventListener('click', closeTranscript);
$('transcript').addEventListener('click', (e) => { if (e.target === $('transcript')) closeTranscript(); });

// Mute: voices only; subtitles carry on. Remembered between visits.
function setMuted(muted) {
  voice.setMuted(muted);
  $('mute').classList.toggle('muted', muted);
  $('mute').setAttribute('aria-pressed', String(muted));
  $('mute').title = muted ? 'Unmute voices' : 'Mute voices';
  try { localStorage.setItem('muted', muted ? '1' : ''); } catch { /* private mode */ }
}
$('mute').addEventListener('click', () => setMuted(!voice.muted));
try { setMuted(localStorage.getItem('muted') === '1'); } catch { setMuted(false); }

// ---- evidence cards and Watson ------------------------------------------------------------

function openCard(prop) {
  cardProp = prop;
  scene.setInteractive(false);
  $('cardTitle').textContent = prop.title;
  const line = prop.lineId && LINES[prop.lineId];
  $('cardText').textContent = line ? `Holmes: "${line.text}"` : CASE_SUMMARY;
  $('present').hidden = !prop.evidenceId;
  $('present').disabled = !token || ended || busy;
  $('card').hidden = false;
  if (line) speakLine({ text: line.text, fixedLineId: line.line_id });
}

function closeCard() {
  if (!cardProp) return;
  if (cardProp.lineId) voice.stop();
  cardProp = null;
  $('card').hidden = true;
  scene.setInteractive(true);
}

$('closeCard').addEventListener('click', closeCard);
$('card').addEventListener('click', (e) => { if (e.target === $('card')) closeCard(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCard(); closeTranscript(); } });
$('present').addEventListener('click', () => {
  const prop = cardProp;
  closeCard();
  const text = $('text').value.trim();
  ask(`Holmes presents ${prop.title.replace(/^The /, 'the ')}.`, { type: 'present', evidence_id: prop.evidenceId, text });
});

// A nudge based on what has happened so far. Free: it does not use a turn.
function giveHint() {
  if (!lastState || ended) return;
  const ev = lastState.evidence_presented;
  let hint;
  if (!ev.includes('E1') && !ev.includes('E2')) {
    hint = "A man's troubles are often written down, Holmes. Have you looked closely at that letter?";
  } else if (!ev.includes('E2')) {
    hint = 'Holmes, perhaps the matter of the key? Only two exist, you know.';
  } else if (lastState.trust < 30) {
    hint = "You have him cornered, Holmes, but he won't open up to a man he doesn't trust. A kinder word, perhaps?";
  } else {
    hint = 'The man is protecting someone, Holmes. Show him you understand why.';
  }
  watson(hint);
}

// ---- the interview ----------------------------------------------------------------------

function setInputEnabled(on) {
  $('text').disabled = !on;
  $('ask').disabled = !on;
  $('mic').disabled = !on;
}

async function send(payload) {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) {
      watson(r.watson || 'Something is amiss, Holmes. Try again.');
      return null;
    }
    return r;
  } catch {
    watson('One moment, Holmes... (try again)');
    return null;
  }
}

async function ask(holmesLine, action) {
  if (busy || ended || !token) return;
  busy = true;
  setInputEnabled(false);
  voice.stop();
  subtitle('Holmes', holmesLine);
  log('Holmes', holmesLine);
  // The thinking beat: James glances away and the lamps waver while he considers.
  scene.thinking = true;
  const dots = setTimeout(() => subtitle('James', '...'), THINKING_DOTS_AFTER_MS);
  const r = await send({ stateToken: token, action });
  clearTimeout(dots);
  scene.thinking = false;
  busy = false;
  if (r) {
    $('text').value = '';
    await show(r);
  }
  if (!ended) {
    setInputEnabled(true);
    $('text').focus();
  }
}

async function show(r) {
  if (r.stateToken) token = r.stateToken;
  if (r.expression) scene.expression = r.expression;
  if (r.state) {
    lastState = r.state;
    scene.pressure = r.state.pressure;
    updateMeters(r.state);
  }
  if (r.ended && r.ended !== 'none') {
    ended = true;
    setInputEnabled(false);
  }
  if (r.line) {
    await sayLine('James', r.line, {
      text: r.line, voiceStyle: r.voice_style, fixedLineId: r.fixedLineId,
      stateToken: r.fixedLineId ? null : r.stateToken,
    }, { james: true });
  }
  if (r.followup) {
    await sayLine('James', r.followup.line, {
      text: r.followup.line, voiceStyle: r.followup.voice_style, fixedLineId: r.followup.fixedLineId,
    }, { james: true });
  }
  if (r.hint && !ended) watson(r.hint);
  if (ended) showEnding(r.ended);
}

function updateMeters(st) {
  $('evCount').textContent = st.evidence_presented.length;
  $('turnNow').textContent = Math.min(st.turn + 1, st.max_turns);
  $('turnMax').textContent = st.max_turns;
  $('pressureBar').style.width = `${st.pressure}%`;
  $('trustBar').style.width = `${st.trust}%`;
}

function showEnding(kind) {
  const [title, text] = ENDINGS[kind] || ['The interview is over', () => ''];
  $('endTitle').textContent = title;
  $('endText').textContent = text(lastState || { turn: 0 });
  $('endTranscript').hidden = false;
  $('ending').hidden = false;
}

// ---- flow: title -> intro -> briefing -> interview ------------------------------------

function showOnly(id) {
  for (const s of ['title', 'cutscene', 'briefing', 'ending']) $(s).hidden = s !== id;
}

// The narrated intro. Skip with the button, Esc or Enter.
const cutscene = new Cutscene($('cutCanvas'), $('caption'));
async function playIntro() {
  showOnly('cutscene');
  const skip = () => { voice.stop(); cutscene.skip(); };
  const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') skip(); };
  $('skip').onclick = skip;
  addEventListener('keydown', onKey);
  await cutscene.play((line) => speakLine({ text: line.text, fixedLineId: line.line_id }));
  removeEventListener('keydown', onKey);
  voice.stop();
}

async function begin() {
  showOnly(null);
  voice.stop();
  token = null;
  lastState = null;
  ended = false;
  transcript.length = 0;
  scene.expression = 'composed';
  scene.pressure = 0;
  updateMeters({ evidence_presented: [], turn: 0, max_turns: 8, pressure: 0, trust: 20 });
  subtitle('Watson', 'James is being shown in, Holmes...');
  const r = await send({});
  if (!r) {
    $('endTitle').textContent = 'One moment, Holmes...';
    $('endText').textContent = 'Watson: The interview could not begin. Try again.';
    $('againBtn').textContent = 'Try again';
    $('endTranscript').hidden = true;
    $('ending').hidden = false;
    return;
  }
  setInputEnabled(true);
  await show(r);
}

$('beginBtn').addEventListener('click', async () => {
  voice.unlock(); // inside the click, so the browser lets audio (and the mouth meter) start
  await playIntro();
  showOnly('briefing');
});
$('startBtn').addEventListener('click', begin);
$('againBtn').addEventListener('click', () => { $('againBtn').textContent = 'Play again'; begin(); });

$('bar').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('text').value.trim();
  if (text) ask(text, { type: 'say', text });
});

// Push-to-talk (Chrome/Edge): hold the mic button, or Space outside the text box, then
// release to send. Hidden where the browser has no speech recognition; typing always works.
const mic = $('mic');
const ptt = createPushToTalk({
  onInterim: (t) => { $('text').value = t; },
  onFinal: (t) => {
    mic.classList.remove('on');
    mic.textContent = 'Hold to talk';
    if (t) ask(t, { type: 'say', text: t });
  },
  onError: (msg) => {
    mic.classList.remove('on');
    mic.textContent = 'Hold to talk';
    watson(`${msg} You can type instead, Holmes.`);
  },
});
if (ptt.supported) {
  mic.hidden = false;
  const down = () => {
    if (mic.disabled || mic.classList.contains('on')) return;
    voice.stop(); // keep James's voice out of the microphone
    mic.classList.add('on');
    mic.textContent = 'Listening...';
    ptt.start();
  };
  const up = () => { if (mic.classList.contains('on')) ptt.stop(); };
  mic.addEventListener('pointerdown', (e) => { mic.setPointerCapture(e.pointerId); down(); });
  mic.addEventListener('pointerup', up);
  mic.addEventListener('pointercancel', up);
  const typing = () => document.activeElement === $('text');
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && !typing() && $('card').hidden && $('transcript').hidden) { e.preventDefault(); down(); }
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'Space' && !typing()) { e.preventDefault(); up(); }
  });
}

// Lean in: hold the button (or the right mouse button on the scene).
const lean = $('lean');
lean.addEventListener('pointerdown', (e) => { lean.setPointerCapture(e.pointerId); scene.setLean(true); });
lean.addEventListener('pointerup', () => scene.setLean(false));
lean.addEventListener('pointercancel', () => scene.setLean(false));
