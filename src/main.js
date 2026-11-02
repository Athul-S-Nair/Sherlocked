// Wires the scene to the interview: reading cards for the evidence, typed questions,
// /api/chat, subtitles and James's voice. Subtitles always appear before the voice starts,
// and a voice failure never blocks the game (Voice.speak never rejects).
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
  confession: ['Case closed', 'James has confessed. The necklace will be found in the wine cellar.'],
  walkout: ['The case is lost', "James has walked out and asked for Her Ladyship's solicitor."],
  timeout: ['The case is lost', 'Out of time. James returns to his duties, the necklace still missing.'],
};

const voice = new Voice();
const scene = new Scene($('scene'), { onPropClick: openCard, onHover: showTooltip });
let token = null;
let busy = false;
let ended = false;
let cardProp = null;

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

// ---- voice and subtitles ----------------------------------------------------------------

function subtitle(speaker, text) {
  $('dialog').hidden = !text;
  $('speaker').textContent = speaker ? `${speaker}:` : '';
  $('line').textContent = text || '';
}

// Watson's hints and in-world error messages, with his name in the speaker column.
function watson(text) {
  subtitle('Watson', text.replace(/^Watson:\s*/, ''));
}

function speakLine({ text, voiceStyle, fixedLineId, stateToken }) {
  if (VOICE_MODE === 'off') return Promise.resolve();
  if (VOICE_MODE === 'browser' && !fixedLineId) {
    voice.stop();
    return voice.speakBrowser(text, voiceStyle);
  }
  return voice.speak({ text, voiceStyle, fixedLineId, ttsBody: stateToken ? { stateToken } : undefined });
}

// ---- evidence cards ---------------------------------------------------------------------

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
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCard(); });
$('present').addEventListener('click', () => {
  const prop = cardProp;
  closeCard();
  const text = $('text').value.trim();
  ask(`Holmes presents ${prop.title.replace(/^The /, 'the ')}.`, { type: 'present', evidence_id: prop.evidenceId, text });
});

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
  const r = await send({ stateToken: token, action });
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
    scene.pressure = r.state.pressure;
    updateMeters(r.state);
  }
  if (r.ended && r.ended !== 'none') {
    ended = true;
    setInputEnabled(false);
  }
  if (r.line) {
    subtitle('James', r.line);
    await speakLine({
      text: r.line, voiceStyle: r.voice_style, fixedLineId: r.fixedLineId,
      stateToken: r.fixedLineId ? null : r.stateToken,
    });
  }
  if (r.followup) {
    subtitle('James', r.followup.line);
    await speakLine({ text: r.followup.line, voiceStyle: r.followup.voice_style, fixedLineId: r.followup.fixedLineId });
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
  const [title, text] = ENDINGS[kind] || ['The interview is over', ''];
  $('endTitle').textContent = title;
  $('endText').textContent = text;
  $('ending').hidden = false;
}

// ---- flow: title -> intro video -> briefing -> interview ------------------------------

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
  ended = false;
  scene.expression = 'composed';
  scene.pressure = 0;
  updateMeters({ evidence_presented: [], turn: 0, max_turns: 8, pressure: 0, trust: 20 });
  subtitle('', '');
  const r = await send({});
  if (!r) {
    $('endTitle').textContent = 'One moment, Holmes...';
    $('endText').textContent = 'Watson: The interview could not begin. Try again.';
    $('againBtn').textContent = 'Try again';
    $('ending').hidden = false;
    return;
  }
  setInputEnabled(true);
  await show(r);
}

$('beginBtn').addEventListener('click', async () => {
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
    if (e.code === 'Space' && !e.repeat && !typing() && $('card').hidden) { e.preventDefault(); down(); }
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
