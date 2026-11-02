// The intro: six short pixel-art shots narrated by Holmes, drawn on their own canvas.
// Each shot holds until its narration ends (or for a reading time when the voice is off),
// then fades through black. The narration is in data/fixed-lines.json (intro_*), so
// `npm run audio:fixed` records it in Holmes's voice along with the other fixed lines.
// Each shot is painted once into a canvas; only lights, flames and rain animate.
import { VIEW, PALETTE as P, LAYOUT as L } from '../config/scene.js';
import { R, disc, rng, makeJames, makeChair } from './scene-art.js';
import fixedLines from '../data/fixed-lines.json';

const W = VIEW.w, H = VIEW.h;
const FADE = 0.8;              // seconds of fade in and out per shot
const PAN_SPEED = 9;           // px per second across shots wider than the screen
const MIN_SHOT = 4.5;          // seconds
const SECONDS_PER_WORD = 0.36; // reading time when there is no voice to wait for

const LINES = Object.fromEntries(fixedLines.map((l) => [l.line_id, l]));

const SHOTS = [
  { id: 'intro_london', w: 600, make: london, anim: londonAnim, rain: true },
  { id: 'intro_dinner', w: 540, make: dinner, anim: dinnerAnim },
  { id: 'intro_study', w: 520, make: study, anim: studyAnim },
  { id: 'intro_james', w: 480, make: portrait, anim: portraitAnim },
  { id: 'intro_peter', w: 560, make: peter, anim: peterAnim, rain: true },
  { id: 'intro_baker', w: 540, make: bakerStreet, anim: bakerAnim, rain: true },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now() / 1000;

export class Cutscene {
  constructor(canvas, caption) {
    canvas.width = W;
    canvas.height = H;
    this.g = canvas.getContext('2d');
    this.caption = caption;
    this.cache = {};
    this.rain = Array.from({ length: 130 }, () => ({
      x: Math.random() * (W + 60), y: Math.random() * H,
      v: 220 + Math.random() * 120, len: 4 + Math.floor(Math.random() * 5), a: 0.12 + Math.random() * 0.3,
    }));
    this.vignette = makeVignette();
  }

  skip() {
    this.skipped = true;
    this.onSkip?.();
  }

  /** speak(line) resolves when the narration ends. Resolves when the intro ends or is skipped. */
  async play(speak) {
    this.skipped = false;
    const skipped = new Promise((r) => { this.onSkip = r; });
    this.running = true;
    this.last = now();
    const loop = () => {
      if (!this.running) return;
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    for (const shot of SHOTS) {
      if (this.skipped) break;
      const line = LINES[shot.id];
      this.shot = shot;
      this.start = now();
      this.fadeOutAt = null;
      this.caption.textContent = line.text;
      this.caption.classList.add('on');
      const words = line.text.split(/\s+/).length;
      const spoken = (async () => {
        const t0 = now();
        await speak(line);
        // No voice (muted, off, or blocked): give the caption time to be read.
        if (now() - t0 < 0.5) await sleep((words * SECONDS_PER_WORD + 1 - (now() - t0)) * 1000);
      })();
      await Promise.race([skipped, Promise.all([spoken, sleep(MIN_SHOT * 1000)])]);
      if (this.skipped) break;
      this.fadeOutAt = now();
      this.caption.classList.remove('on');
      await Promise.race([skipped, sleep(FADE * 1000)]);
    }
    this.running = false;
    this.caption.classList.remove('on');
  }

  render() {
    const g = this.g;
    const s = this.shot;
    const t = now() - this.start;
    const dt = Math.min(0.05, now() - this.last);
    this.last = now();
    g.imageSmoothingEnabled = false;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.cache[s.id]) this.cache[s.id] = paint(s.w, s.make);
    const panX = Math.min(s.w - W, Math.round(t * PAN_SPEED));
    g.drawImage(this.cache[s.id], -panX, 0);
    g.save();
    g.translate(-panX, 0);
    s.anim(g, t);
    g.restore();
    if (s.rain) {
      g.fillStyle = '#9fb6c4';
      for (const d of this.rain) {
        d.y += d.v * dt;
        d.x -= d.v * dt * 0.12;
        if (d.y > H) { d.y -= H + 10; d.x = Math.random() * (W + 60); }
        g.globalAlpha = d.a;
        g.fillRect(Math.round(d.x), Math.round(d.y), 1, d.len);
      }
      g.globalAlpha = 1;
    }
    g.drawImage(this.vignette, 0, 0);
    let black = 1 - clamp(t / FADE, 0, 1);
    if (this.fadeOutAt !== null) black = Math.max(black, clamp((now() - this.fadeOutAt) / FADE, 0, 1));
    if (black > 0) {
      g.fillStyle = `rgba(0, 0, 0, ${black})`;
      g.fillRect(0, 0, W, H);
    }
  }
}

function paint(w, make) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  make(g, w);
  return c;
}

function makeVignette() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  return c;
}

// ---- shared bits ----------------------------------------------------------------------

function glow(g, x, y, r, a, rgb) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(${rgb}, ${a})`);
  grad.addColorStop(0.4, `rgba(${rgb}, ${a * 0.4})`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}

const flick = (t, seed = 0) => 1 + 0.07 * Math.sin(t * 7.3 + seed) + 0.04 * Math.sin(t * 13.1 + seed * 2.3);

function flame(g, x, y, t, seed) {
  const h = 3 + Math.round(1.2 * Math.sin(t * 9 + seed) + 0.8 * Math.sin(t * 17 + seed * 3));
  R(g, P.fireOrange, x, y - h, 1, h);
  R(g, P.fireYellow, x, y - h, 1, Math.max(1, h - 2));
  if (h > 3) R(g, P.glowHot, x, y - h + 1, 1, 1);
}

function streetLamp(g, x, groundY, top) {
  const post = '#050709';
  R(g, post, x - 2, top + 22, 4, groundY - top - 22);
  R(g, post, x - 7, groundY - 18, 14, 18);
  R(g, post, x - 7, top + 2, 14, 3);
  R(g, post, x - 5, top + 5, 10, 14);
  R(g, '#f2c46d', x - 4, top + 6, 8, 12);
  R(g, '#fff3d0', x - 2, top + 9, 4, 6);
  R(g, post, x - 1, top + 5, 2, 14);
  R(g, post, x - 4, top - 2, 8, 4);
  R(g, post, x - 12, top + 22, 24, 2);
}

// "221B" and nothing else, in a 3x5 pixel font.
const GLYPHS = { 2: ['111', '001', '111', '100', '111'], 1: ['010', '110', '010', '010', '111'], B: ['110', '101', '110', '101', '110'] };
function pixelText(g, color, text, x, y) {
  for (const ch of text) {
    GLYPHS[ch].forEach((row, j) => [...row].forEach((b, i) => { if (b === '1') R(g, color, x + i, y + j); }));
    x += 4;
  }
}

// ---- 1. London at night -------------------------------------------------------------------

function london(g, w) {
  const r = rng(21);
  const sky = g.createLinearGradient(0, 0, 0, 200);
  sky.addColorStop(0, '#0a121c');
  sky.addColorStop(1, '#24363f');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, H);
  glow(g, 400, 52, 80, 0.22, '200, 215, 220');
  disc(g, '#d8dccb', 400, 52, 11);
  disc(g, '#c4c8b6', 403, 55, 5);
  R(g, '#eef0e0', 394, 45, 3, 2);
  for (const [x, y, cw] of [[30, 40, 120], [330, 60, 150], [160, 24, 90], [470, 30, 110]]) {
    R(g, '#1b2833', x, y, cw, 5);
    R(g, '#1b2833', x + 10, y - 3, cw - 30, 3);
    R(g, '#26363f', x + 14, y - 3, cw - 50, 1);
  }
  const far = '#152331';
  for (let x = 0; x < w;) {
    const bw = 14 + Math.floor(r() * 30), bh = 24 + Math.floor(r() * 36);
    R(g, far, x, 200 - bh, bw, bh + 80);
    x += bw;
  }
  // A clock tower and a dome on the skyline.
  R(g, far, 228, 100, 16, 110); R(g, far, 230, 90, 12, 10); R(g, far, 233, 80, 6, 10); R(g, far, 235, 70, 2, 10);
  disc(g, '#e0cf8f', 236, 110, 4);
  R(g, '#5a4a2a', 236, 107, 1, 3); R(g, '#5a4a2a', 236, 110, 3, 1);
  disc(g, far, 490, 168, 22, 18); R(g, far, 468, 168, 45, 40); R(g, far, 487, 142, 6, 8); R(g, far, 489, 134, 2, 8);
  R(g, 'rgba(150, 170, 180, 0.07)', 0, 182, w, 28);
  // Near rooftops with chimneys and lit windows.
  const near = '#0a1118';
  for (let x = -10; x < w;) {
    const bw = 40 + Math.floor(r() * 40), top = 178 + Math.floor(r() * 30);
    R(g, near, x, top, bw, H - top);
    if (r() < 0.6) for (let i = 0; i < 14; i++) R(g, near, x + 14 - i, top - 14 + i, bw - 2 * (14 - i), 1);
    const cx = x + 6 + Math.floor(r() * (bw - 16));
    R(g, near, cx, top - 26, 8, 26); R(g, near, cx + 1, top - 30, 2, 4); R(g, near, cx + 5, top - 29, 2, 3);
    for (let wy = top + 10; wy < H - 6; wy += 12) {
      for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
        if (r() < 0.22) { R(g, '#e8b860', wx, wy, 3, 5); R(g, '#fff0b8', wx + 1, wy + 1, 1, 2); } else R(g, '#121d27', wx, wy, 3, 5);
      }
    }
    x += bw + 2;
  }
  streetLamp(g, 88, H, 108);
}

function londonAnim(g, t) {
  glow(g, 88, 120, 70, 0.3 * flick(t), '255, 190, 100');
}

// ---- 2. The dinner party ------------------------------------------------------------------

const CHANDELIER_X = 270;
const CANDELABRAS = [150, 350];

function dinner(g, w) {
  const tableEnd = w - 110;
  R(g, '#3a1416', 0, 0, w, H);
  for (let x = 0; x < w; x += 14) { R(g, '#44181a', x, 0, 5, 150); R(g, '#2e0f11', x + 5, 0, 1, 150); }
  R(g, '#1a0a08', 0, 0, w, 10);
  R(g, '#2a140c', 0, 150, w, 120);
  R(g, '#4a2a18', 0, 150, w, 2);
  R(g, '#1a0c08', 0, 236, w, 34);
  for (const px of [60, 380]) {
    R(g, P.brassDark, px, 34, 52, 42); R(g, P.brass, px + 2, 36, 48, 38); R(g, '#2a1c14', px + 4, 38, 44, 34);
    disc(g, '#4a3428', px + 26, 50, 6, 7); R(g, '#3a2a20', px + 16, 58, 20, 14);
  }
  const cx = CHANDELIER_X;
  R(g, P.brassDark, cx, 0, 2, 30);
  disc(g, P.brass, cx + 1, 34, 6, 4);
  R(g, P.brass, cx - 40, 36, 82, 2);
  for (let i = -2; i <= 2; i++) { const x = cx + 1 + i * 20; R(g, P.brass, x - 2, 30, 5, 2); R(g, '#e8e0c8', x - 1, 24, 3, 6); }
  // Guests, in silhouette behind the table.
  const r = rng(9);
  for (let i = 0; i < 8; i++) {
    const gx = 60 + i * 46 + Math.floor(r() * 8);
    if (gx > tableEnd - 20) break;
    const hy = 112 + Math.floor(r() * 6);
    for (let y = hy + 14; y < 160; y++) { const hw = Math.min(18, 7 + Math.round((y - hy - 14) * 1.5)); R(g, '#140808', gx - hw, y, hw * 2, 1); }
    disc(g, '#140808', gx, hy + 5, 7, 9);
    if (r() < 0.5) disc(g, '#140808', gx, hy - 5, 5, 4);
    R(g, '#6a3420', gx - 7, hy + 2, 1, 7);
    if (r() < 0.35) { R(g, '#c0ccd2', gx + 13, hy + 12, 2, 8); R(g, '#140808', gx + 10, hy + 18, 4, 3); }
  }
  // The table.
  R(g, '#e6dfd0', 0, 150, tableEnd, 58);
  R(g, '#fff8ea', 0, 150, tableEnd, 2);
  R(g, '#b8b0a0', 0, 200, tableEnd, 8);
  for (let x = 10; x < tableEnd; x += 28) R(g, '#cfc6b4', x, 170, 2, 38);
  R(g, '#cfc6b4', tableEnd - 2, 150, 2, 58);
  for (let x = 50; x < tableEnd - 20; x += 44) {
    disc(g, '#f6f2e8', x, 162, 9, 3); disc(g, '#d8d2c4', x, 162, 5, 1);
    R(g, '#c0ccd2', x + 12, 152, 3, 8); R(g, '#e8f0f4', x + 12, 152, 1, 3);
  }
  for (const x of CANDELABRAS) {
    R(g, P.brassDark, x - 1, 120, 3, 34); disc(g, P.brass, x, 154, 7, 2); R(g, P.brass, x - 12, 124, 25, 2);
    for (const dx of [-12, 0, 12]) { R(g, P.brass, x + dx - 2, 122, 5, 2); R(g, '#efe6d0', x + dx - 1, 110, 3, 12); }
  }
  jamesStanding(g, w - 64, 96);
}

function jamesStanding(g, x, y) {
  // Legs and shoes.
  R(g, P.coatDark, x - 9, y + 96, 8, 64); R(g, P.coatDark, x + 1, y + 96, 8, 64);
  R(g, '#050505', x - 10, y + 158, 10, 3); R(g, '#050505', x + 1, y + 158, 10, 3);
  // Tailcoat, shirt front, white tie.
  R(g, P.coat, x - 13, y + 20, 26, 80);
  R(g, P.coat, x - 13, y + 96, 6, 20); R(g, P.coat, x + 7, y + 96, 6, 20);
  R(g, P.coatLight, x - 13, y + 20, 2, 80);
  for (let i = 0; i < 22; i++) { const sw = Math.max(0, 6 - Math.round(i * 0.28)); R(g, P.shirt, x - sw, y + 20 + i, sw * 2, 1); }
  R(g, P.shirt, x - 3, y + 19, 6, 2);
  // One arm at his side; the other carries a silver tray with a decanter toward the table.
  R(g, P.coat, x + 12, y + 24, 5, 44); R(g, P.shirt, x + 12, y + 66, 5, 4);
  R(g, P.coat, x - 17, y + 24, 5, 20); R(g, P.coat, x - 30, y + 40, 16, 5); R(g, P.shirt, x - 34, y + 39, 5, 5);
  R(g, '#c8ccd0', x - 48, y + 37, 32, 2); R(g, '#eef0f2', x - 48, y + 37, 32, 1);
  R(g, '#5a1424', x - 38, y + 23, 8, 14); R(g, '#7a2434', x - 37, y + 24, 2, 10); R(g, '#c0ccd2', x - 36, y + 17, 4, 6);
  // Head.
  R(g, P.skinShade, x - 3, y + 15, 6, 5);
  disc(g, P.skin, x, y + 8, 6, 8);
  R(g, P.skinShade, x + 4, y + 2, 2, 12);
  R(g, P.hair, x - 6, y, 12, 4); R(g, P.hair, x - 7, y + 2, 2, 6); R(g, P.hair, x + 5, y + 2, 2, 6);
  R(g, P.eye, x - 4, y + 7, 2, 1); R(g, P.eye, x + 2, y + 7, 2, 1);
  R(g, P.lip, x - 2, y + 12, 4, 1);
}

function dinnerAnim(g, t) {
  for (let i = -2; i <= 2; i++) flame(g, CHANDELIER_X + 1 + i * 20, 24, t, i);
  for (const x of CANDELABRAS) for (const dx of [-12, 0, 12]) flame(g, x + dx, 110, t, x + dx);
  glow(g, CHANDELIER_X, 40, 150, 0.22 * flick(t), '255, 190, 100');
  for (const x of CANDELABRAS) glow(g, x, 112, 90, 0.26 * flick(t, x), '255, 180, 80');
}

// ---- 3. The locked study and the empty case ---------------------------------------------

function study(g, w) {
  R(g, '#121a26', 0, 0, w, H);
  for (let x = 0; x < w; x += 40) { R(g, '#0e1520', x, 20, 1, 150); R(g, '#18222f', x + 1, 20, 1, 150); }
  R(g, '#0c121a', 0, 170, w, 100);
  // The door, with its keyhole.
  R(g, '#1a120c', 50, 40, 84, 180);
  R(g, '#2a1c12', 54, 44, 76, 176);
  for (const [px, py, pw, ph] of [[60, 52, 28, 70], [96, 52, 28, 70], [60, 132, 28, 80], [96, 132, 28, 80]]) {
    R(g, '#1e140c', px, py, pw, ph); R(g, '#3a2818', px, py, pw, 1);
  }
  R(g, P.brassDark, 118, 128, 8, 14); R(g, '#000', 121, 133, 2, 4); disc(g, P.brass, 112, 128, 3);
  // Moonlit window.
  R(g, '#1a2230', 380, 36, 80, 120); R(g, '#2c4058', 386, 42, 68, 108);
  disc(g, '#d8dccb', 430, 70, 9);
  R(g, '#1a2230', 419, 42, 3, 108); R(g, '#1a2230', 386, 94, 68, 3);
  g.fillStyle = 'rgba(170, 195, 220, 0.1)';
  g.beginPath(); g.moveTo(386, 42); g.lineTo(454, 42); g.lineTo(340, 270); g.lineTo(170, 270); g.fill();
  // Desk and the open jewellery case, with only the hollow where the necklace lay.
  R(g, '#1e140c', 0, 198, w, 72); R(g, '#3a2616', 0, 198, w, 2);
  const cx = 262;
  for (let i = 0; i < 34; i++) { const inset = Math.round((34 - i) * 0.2); R(g, '#16204a', cx - 38 + inset, 150 + i, 76 - 2 * inset, 1); }
  R(g, '#2a3a7a', cx - 32, 155, 64, 26);
  R(g, P.brass, cx - 38, 183, 76, 1);
  R(g, '#16204a', cx - 40, 184, 80, 20);
  R(g, P.brass, cx - 40, 184, 80, 1); R(g, P.brass, cx - 40, 203, 80, 1);
  R(g, '#2a3a7a', cx - 36, 186, 72, 12);
  for (let i = -24; i <= 24; i++) R(g, '#111838', cx + i, 187 + Math.round((1 - (i / 24) ** 2) * 6), 1, 2);
  disc(g, '#111838', cx, 196, 2, 2);
  R(g, P.brass, cx - 2, 204, 4, 2);
}

function studyAnim(g, t) {
  if ((t % 3) < 0.25) { R(g, P.glowHot, 121, 131, 1, 1); R(g, P.brassLight, 120, 132, 3, 1); }
  for (let i = 0; i < 14; i++) {
    const x = 200 + ((i * 37 + t * (4 + (i % 3))) % 150);
    const y = 60 + ((i * 53 + t * 3) % 150);
    R(g, 'rgba(220, 230, 240, 0.35)', Math.round(x), Math.round(y), 1, 1);
  }
}

// ---- 4. James, in close-up ----------------------------------------------------------------

function portrait(g, w) {
  R(g, P.wall, 0, 0, w, H);
  for (let x = 0; x < w; x += 12) { R(g, P.wallStripe, x, 0, 4, H); R(g, P.wallDark, x + 4, 0, 1, H); }
  const S = 2, fx = W / 2, fy = 112;
  const j = L.james, ch = L.chair;
  g.drawImage(makeChair(), fx + (ch.x - j.face.x) * S, fy + (ch.y - j.face.y) * S, ch.w * S, ch.h * S);
  g.drawImage(makeJames('composed'), fx + (j.x - j.face.x) * S, fy + (j.y - j.face.y) * S, j.w * S, j.h * S);
  R(g, 'rgba(4, 10, 8, 0.35)', 0, 0, w, H);
}

function portraitAnim(g, t) {
  glow(g, 90, 140, 260, 0.28 * flick(t), '255, 180, 90');
}

// ---- 5. Peter, and the company he keeps -----------------------------------------------------

function peter(g, w) {
  const r = rng(33);
  R(g, '#160e0e', 0, 0, w, H);
  for (let row = 0, y = 0; y < 210; row++, y += 7) {
    R(g, '#0e0808', 0, y + 6, w, 1);
    for (let x = (row & 1) * 8; x < w; x += 16) { R(g, '#0e0808', x, y, 1, 6); if (r() < 0.25) R(g, '#1f1413', x + 2, y + 1, 11, 4); }
  }
  // A dark archway where someone waits.
  disc(g, '#050304', 452, 84, 32, 18);
  R(g, '#050304', 420, 84, 65, 126);
  // Wet cobbles, with the lamp reflected in a puddle.
  R(g, '#0c0a0c', 0, 210, w, 60);
  for (let row = 0, y = 212; y < H; row++, y += 6) {
    for (let x = (row & 1) * 5; x < w; x += 10) { R(g, '#18151a', x, y, 8, 4); R(g, '#221e24', x, y, 8, 1); }
  }
  R(g, 'rgba(242, 196, 109, 0.35)', 238, 236, 24, 2);
  R(g, 'rgba(242, 196, 109, 0.22)', 242, 244, 16, 2);
  R(g, 'rgba(242, 196, 109, 0.12)', 245, 252, 10, 2);
  // Wall lamp.
  R(g, '#050304', 250, 64, 14, 3); R(g, '#050304', 262, 60, 3, 10);
  R(g, '#050304', 242, 66, 14, 15); R(g, '#f2c46d', 244, 68, 10, 11); R(g, '#fff3d0', 247, 70, 4, 6);
  // Peter: young, under the lamp, collar up, hands in pockets, head bowed.
  const x = 250, y = 120;
  R(g, '#1a1410', x - 9, y + 88, 8, 36); R(g, '#1a1410', x + 1, y + 88, 8, 36);
  R(g, '#050505', x - 10, y + 122, 10, 3); R(g, '#050505', x + 1, y + 122, 10, 3);
  R(g, '#4a3020', x - 13, y + 20, 26, 72);
  R(g, '#5e3e2a', x - 13, y + 20, 3, 72);
  R(g, '#2e1e14', x + 9, y + 20, 4, 72);
  R(g, '#5e3e2a', x - 9, y + 14, 6, 9); R(g, '#5e3e2a', x + 3, y + 14, 6, 9);  // turned-up collar
  R(g, '#3a2418', x - 12, y + 52, 6, 2); R(g, '#3a2418', x + 6, y + 52, 6, 2);  // pocket flaps
  disc(g, P.skin, x, y + 9, 6, 7);
  R(g, P.skinShade, x + 3, y + 4, 3, 11);
  R(g, '#2a1a10', x - 7, y - 1, 14, 6); R(g, '#2a1a10', x - 7, y + 4, 2, 4); R(g, '#3a2414', x - 4, y, 6, 1);
  R(g, P.eye, x - 4, y + 9, 2, 1); R(g, P.eye, x + 1, y + 9, 2, 1);
  R(g, P.lip, x - 1, y + 13, 3, 1);
  // The stranger in the arch: tall, a top hat, only a cigar's glow to see by.
  const sx = 452, sy = 98;
  R(g, '#020203', sx - 7, sy, 14, 14); R(g, '#020203', sx - 11, sy + 13, 22, 2);
  disc(g, '#020203', sx, sy + 22, 6, 7);
  R(g, '#020203', sx - 14, sy + 30, 28, 82);
  R(g, '#3a3240', sx - 14, sy + 30, 1, 82); R(g, '#3a3240', sx - 7, sy + 1, 1, 12);
  R(g, '#3a3240', sx - 11, sy + 13, 10, 1); R(g, '#2a2430', sx - 6, sy + 16, 1, 10);
}

function peterAnim(g, t) {
  glow(g, 249, 74, 90, 0.34 * flick(t), '255, 190, 100');
  const ember = 0.5 + 0.5 * Math.max(0, Math.sin(t * 1.3));
  R(g, `rgba(255, 120, 40, ${0.4 + 0.6 * ember})`, 458, 124, 2, 1);
  glow(g, 459, 124, 10, 0.25 * ember, '255, 110, 40');
}

// ---- 6. 221B Baker Street -------------------------------------------------------------------

function bakerStreet(g, w) {
  const r = rng(44);
  R(g, '#3a2418', 0, 0, w, 232);
  for (let row = 0, y = 14; y < 232; row++, y += 6) {
    R(g, '#2a180e', 0, y + 5, w, 1);
    for (let x = (row & 1) * 7; x < w; x += 14) { R(g, '#2a180e', x, y, 1, 5); if (r() < 0.2) R(g, '#4a2e1e', x + 2, y + 1, 10, 3); }
  }
  R(g, '#5a5448', 0, 0, w, 14); R(g, '#6e685a', 0, 12, w, 2);
  R(g, '#6a6458', 0, 122, w, 5);
  // First-floor windows, lit. A familiar profile with a pipe in one of them.
  for (const wx of [130, 340]) {
    R(g, '#d8c8a8', wx - 4, 36, 58, 78);
    R(g, '#e0a050', wx, 40, 50, 70); R(g, '#f6d48a', wx + 6, 46, 38, 58);
    R(g, '#5a1a1e', wx, 40, 9, 70); R(g, '#5a1a1e', wx + 41, 40, 9, 70);
    R(g, '#3a2418', wx + 24, 40, 2, 70); R(g, '#3a2418', wx, 74, 50, 2);
  }
  disc(g, '#2a1408', 156, 60, 5, 6); R(g, '#2a1408', 160, 60, 3, 2); R(g, '#2a1408', 159, 63, 2, 2);
  R(g, '#2a1408', 150, 66, 13, 40);
  R(g, '#2a1408', 161, 66, 5, 1); R(g, '#2a1408', 165, 63, 2, 4);
  // Ground-floor windows, dark.
  for (const wx of [100, 380]) {
    R(g, '#d8c8a8', wx - 3, 148, 56, 64);
    R(g, '#141a20', wx, 151, 50, 58); R(g, '#3a2418', wx + 24, 151, 2, 58); R(g, '#3a2418', wx, 178, 50, 2);
    R(g, '#1e2a34', wx + 2, 153, 6, 20);
  }
  // The door: fanlight, brass knocker, and the number.
  const dx = 250;
  disc(g, '#d8c8a8', dx + 25, 140, 30, 18);
  R(g, '#d8c8a8', dx - 5, 140, 60, 92);
  disc(g, '#f2c46d', dx + 25, 140, 24, 13);
  for (let i = -20; i <= 20; i += 8) R(g, '#3a2418', dx + 25 + i, 128, 1, 12);
  R(g, '#0c0c10', dx, 140, 50, 92);
  for (const [px, py] of [[dx + 5, 160], [dx + 27, 160], [dx + 5, 196], [dx + 27, 196]]) { R(g, '#16161c', px, py, 18, 30); R(g, '#24242c', px, py, 18, 1); }
  R(g, P.brassDark, dx + 16, 146, 18, 9); R(g, P.brass, dx + 16, 146, 18, 1);
  pixelText(g, P.brassLight, '221B', dx + 18, 148);
  disc(g, P.brass, dx + 25, 180, 3); R(g, P.brassLight, dx + 24, 178, 1, 1);
  disc(g, P.brass, dx + 42, 192, 2);
  // Steps, pavement and railings.
  R(g, '#1a1a1e', 0, 232, w, 38);
  R(g, '#6a6458', dx - 14, 232, 78, 6); R(g, '#5a5448', dx - 22, 238, 94, 6);
  R(g, 'rgba(242, 196, 109, 0.18)', 145, 250, 30, 2); R(g, 'rgba(242, 196, 109, 0.18)', 355, 250, 30, 2);
  for (const [a, b] of [[0, dx - 26], [dx + 76, w]]) {
    R(g, '#08080a', a, 196, b - a, 2);
    for (let x = a; x < b; x += 6) { R(g, '#08080a', x, 196, 2, 36); R(g, '#08080a', x, 193, 2, 3); }
  }
  streetLamp(g, 500, 262, 120);
}

function bakerAnim(g, t) {
  glow(g, 155, 75, 70, 0.22 * flick(t), '255, 190, 100');
  glow(g, 365, 75, 70, 0.22 * flick(t, 2), '255, 190, 100');
  glow(g, 275, 134, 50, 0.25 * flick(t, 4), '255, 190, 100');
  glow(g, 500, 132, 80, 0.3 * flick(t, 6), '255, 190, 100');
}
