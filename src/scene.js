// The sitting room: a low-res canvas (VIEW.w x VIEW.h) scaled up with nearest-neighbour.
// Layers, far to near: rain outside the window, the back wall, James in his chair, the
// desk with the evidence, then screen overlays (lamp light, vignette, grain).
// The camera is a head turn (pan, -1..1) plus a lean-in zoom toward James's face.
import {
  VIEW, PAN, LEAN, SPEED, PALETTE as C, IMAGES, LAYOUT as L, PROPS, EFFECTS as FX,
} from '../config/scene.js';
import { loadImages } from './assets.js';
import {
  makeBackWall, makeChair, makeJames, makeDesk, makeProp, drawOutside, drawFire, drawClock, drawCandleFlame,
} from './scene-art.js';

const CX = VIEW.w / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const smooth = (t) => t * t * (3 - 2 * t);
const DRAG_THRESHOLD_PX = 5;

export class Scene {
  constructor(canvas, { onPropClick = () => {}, onHover = () => {} } = {}) {
    this.canvas = canvas;
    canvas.width = VIEW.w;
    canvas.height = VIEW.h;
    this.ctx = canvas.getContext('2d');
    this.images = loadImages(IMAGES);
    this.generated = {};
    this.onPropClick = onPropClick;
    this.onHover = onHover;

    this.pan = 0;
    this.panTarget = 0;
    this.edge = 0;        // -1..1, how far the pointer is into an edge zone
    this.lean = 0;        // eased 0..1
    this.leaning = false;
    this.drag = null;
    this.pointer = null;  // { ix, iy, clientX, clientY } in internal pixels while over the canvas
    this.hover = null;
    this.interactive = true; // false while a card is open
    this.expression = 'composed';
    this.pressure = 0;    // 0..100, drives flicker and vignette
    this.time = 0;
    this.zoom = { z: 1, ox: 0, oy: 0 };

    this.rain = makeRain();
    this.grain = makeGrain();
    this.bindPointer();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  setLean(on) { this.leaning = on; }

  setInteractive(on) {
    this.interactive = on;
    if (!on) { this.edge = 0; this.drag = null; this.setHover(null); }
  }

  // Screen x offset of a layer at the current pan.
  offset(speed) { return Math.round(this.pan * PAN.range * speed); }

  // ---- input -------------------------------------------------------------------------

  bindPointer() {
    const c = this.canvas;
    const toInternal = (e) => {
      const r = c.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      return { ix: nx * VIEW.w, iy: (e.clientY - r.top) / r.height * VIEW.h, nx, width: r.width, clientX: e.clientX, clientY: e.clientY };
    };

    c.addEventListener('pointermove', (e) => {
      const p = toInternal(e);
      this.pointer = p;
      const zone = PAN.edgeZone;
      const push = p.nx < zone ? -(zone - p.nx) / zone : p.nx > 1 - zone ? (p.nx - (1 - zone)) / zone : 0;
      this.edge = Math.sign(push) * smooth(clamp(Math.abs(push), 0, 1));
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        if (Math.abs(dx) > DRAG_THRESHOLD_PX) this.drag.moved = true;
        if (this.drag.moved) {
          this.panTarget = clamp(this.drag.startPan - (dx / p.width) * PAN.dragPerScreen, -1, 1);
        }
      }
    });
    c.addEventListener('pointerleave', () => {
      this.pointer = null;
      this.edge = 0;
      this.setHover(null);
    });
    c.addEventListener('pointerdown', (e) => {
      if (e.button === 2) { this.setLean(true); return; }
      if (e.button !== 0 || !this.interactive) return;
      c.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, startPan: this.panTarget, moved: false };
    });
    c.addEventListener('pointerup', (e) => {
      if (e.button === 2) { this.setLean(false); return; }
      const drag = this.drag;
      this.drag = null;
      if (!drag || drag.moved || !this.interactive) return;
      const p = toInternal(e);
      const prop = this.propAt(p.ix, p.iy);
      if (prop) this.onPropClick(prop);
    });
    c.addEventListener('pointercancel', () => { this.drag = null; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => { this.setLean(false); this.edge = 0; this.drag = null; });
  }

  // Topmost prop under an internal-pixel point, following the zoom and the desk's parallax.
  propAt(ix, iy) {
    const { z, ox, oy } = this.zoom;
    const x = (ix - ox) / z - (CX - this.offset(SPEED.desk));
    const y = (iy - oy) / z;
    for (let i = PROPS.length - 1; i >= 0; i--) {
      const p = PROPS[i];
      if (x >= p.x - 2 && x < p.x + p.w + 2 && y >= p.y - 2 && y < p.y + p.h + 2) return p;
    }
    return null;
  }

  setHover(prop) {
    if (prop === this.hover) return;
    this.hover = prop;
    this.canvas.style.cursor = prop ? 'pointer' : '';
    this.onHover(prop, this.pointer);
  }

  // ---- update --------------------------------------------------------------------------

  frame(t) {
    // Scheduled first so an error in one frame can never freeze the scene.
    requestAnimationFrame((tt) => this.frame(tt));
    // The first rAF timestamp can predate the constructor's performance.now(), hence the 0.
    const dt = clamp((t - this.last) / 1000, 0, 0.05);
    this.last = t;
    this.time += dt;

    if (this.leaning) {
      this.panTarget = approach(this.panTarget, 0, LEAN.ease, dt);
    } else if (this.interactive && !this.drag && !this.hover) { // hold still over a prop so it can be clicked
      this.panTarget = clamp(this.panTarget + this.edge * PAN.maxSpeed * dt, -1, 1);
    }
    this.pan = approach(this.pan, this.panTarget, PAN.ease, dt);
    this.lean = approach(this.lean, this.leaning ? 1 : 0, LEAN.ease, dt);
    for (const d of this.rain) {
      d.y += d.v * dt;
      if (d.y > L.window.y + L.window.h) { d.y -= L.window.h + 20; }
    }

    this.draw();
    if (this.pointer && this.interactive && !this.drag?.moved) {
      this.setHover(this.propAt(this.pointer.ix, this.pointer.iy));
    } else if (this.hover && (!this.interactive || this.drag?.moved)) {
      this.setHover(null);
    }
  }

  // ---- drawing -------------------------------------------------------------------------

  // A loaded art file if there is one, otherwise the generated placeholder (made once).
  art(name) {
    if (this.images[name]) return this.images[name];
    if (!this.generated[name]) this.generated[name] = generate(name);
    return this.generated[name];
  }

  draw() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    const f = this.flicker();

    // Lean-in: zoom about James's face while easing the face toward the upper centre.
    const t = smooth(clamp(this.lean, 0, 1));
    const z = lerp(1, LEAN.zoom, t);
    const fx = CX + L.james.face.x - this.offset(SPEED.james);
    const fy = L.james.face.y;
    const ax = lerp(fx, CX, t);
    const ay = lerp(fy, VIEW.h * 0.38, t);
    this.zoom = { z, ox: ax - fx * z, oy: ay - fy * z };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.shadow;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    ctx.setTransform(z, 0, 0, z, this.zoom.ox, this.zoom.oy);

    this.inLayer(SPEED.wall, () => {
      // Outside first: it shows through the transparent window panes, at its own parallax.
      const w = L.window;
      ctx.save();
      ctx.beginPath();
      ctx.rect(w.x, w.y, w.w, w.h);
      ctx.clip();
      ctx.translate(this.offset(SPEED.wall) - this.offset(SPEED.rain), 0);
      drawOutside(ctx, w, this.rain);
      ctx.restore();
      ctx.drawImage(this.art('back_wall'), L.wall.x, 0);
      drawFire(ctx, L.fireplace, this.time, this.fireFlicker());
      drawClock(ctx, L.clock, this.time);
    });
    this.inLayer(SPEED.james, () => {
      ctx.drawImage(this.art('james_chair'), L.chair.x, L.chair.y);
      const name = `james_${this.expression}`;
      ctx.drawImage(this.art(IMAGES[name] ? name : 'james_composed'), L.james.x, L.james.y);
    });
    this.inLayer(SPEED.desk, () => {
      ctx.drawImage(this.art('desk'), L.deskLayer.x, L.deskLayer.y);
      drawCandleFlame(ctx, L.candle, this.time, f);
      for (const p of PROPS) {
        ctx.drawImage(this.art(p.image), p.x, p.y);
        if (p === this.hover) {
          ctx.strokeStyle = C.glowGlass;
          ctx.lineWidth = 1;
          ctx.strokeRect(p.x - 2.5, p.y - 2.5, p.w + 5, p.h + 5);
        }
      }
    });
    this.drawLight(f);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawVignette();
    this.drawGrain();
  }

  inLayer(speed, fn) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(CX - this.offset(speed), 0);
    fn();
    ctx.restore();
  }

  // Lamp flicker: subtle when calm, stronger as Pressure rises.
  flicker() {
    const amp = lerp(FX.flickerCalm, FX.flickerTense, clamp(this.pressure / 100, 0, 1));
    const t = this.time;
    const n = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1 + 1.7) * 0.3 + Math.sin(t * 29.7) * 0.2;
    return 1 + amp * n;
  }

  fireFlicker() {
    const t = this.time;
    return 1 + 0.08 * Math.sin(t * 11.3) + 0.05 * Math.sin(t * 23.9 + 0.7);
  }

  // Shadow wash, then warm light pools added on top.
  drawLight(f) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = FX.wash;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fire = this.fireFlicker();
    for (const l of FX.lights) {
      this.inLayer(SPEED[l.layer], () => glow(ctx, l.x, l.y, l.r, l.a * (l.fire ? fire : f), l.rgb));
    }
    ctx.restore();
  }

  drawVignette() {
    const ctx = this.ctx;
    const a = lerp(FX.vignetteCalm, FX.vignetteTense, clamp(this.pressure / 100, 0, 1));
    const g = ctx.createRadialGradient(CX, VIEW.h * 0.45, VIEW.h * 0.35, CX, VIEW.h * 0.45, VIEW.w * 0.62);
    g.addColorStop(0, 'rgba(4, 8, 6, 0)');
    g.addColorStop(1, `rgba(4, 8, 6, ${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }

  drawGrain() {
    const ctx = this.ctx;
    ctx.globalAlpha = FX.grainAlpha;
    ctx.drawImage(this.grain[Math.floor(this.time * 12) % this.grain.length], 0, 0);
    ctx.globalAlpha = 1;
  }
}

// Builds the placeholder canvas for an art name from config IMAGES.
function generate(name) {
  if (name === 'back_wall') return makeBackWall();
  if (name === 'james_chair') return makeChair();
  if (name === 'desk') return makeDesk();
  if (name.startsWith('james_')) return makeJames(name.slice('james_'.length));
  if (name.startsWith('prop_')) return makeProp(name.slice('prop_'.length));
  throw new Error(`no placeholder for ${name}`);
}

// ---- effects ---------------------------------------------------------------------------

function glow(ctx, x, y, r, a, rgb) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb}, ${a})`);
  g.addColorStop(0.4, `rgba(${rgb}, ${a * 0.4})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function makeRain() {
  const w = L.window;
  return Array.from({ length: FX.rainDrops }, () => ({
    x: w.x - 60 + Math.random() * (w.w + 120),
    y: w.y - 20 + Math.random() * (w.h + 20),
    v: 140 + Math.random() * 90,
    len: 3 + Math.floor(Math.random() * 4),
    a: 0.25 + Math.random() * 0.45,
  }));
}

function makeGrain() {
  return Array.from({ length: 4 }, () => {
    const c = document.createElement('canvas');
    c.width = VIEW.w;
    c.height = VIEW.h;
    const g = c.getContext('2d');
    const data = g.createImageData(VIEW.w, VIEW.h);
    for (let i = 0; i < data.data.length; i += 4) {
      const v = Math.random() * 255;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
      data.data[i + 3] = 255;
    }
    g.putImageData(data, 0, 0);
    return c;
  });
}
