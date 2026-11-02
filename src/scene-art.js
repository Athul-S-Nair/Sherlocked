// Generated placeholder art. Each make*() paints one canvas, once, at the size and position
// of the matching art file in config/scene.js, so a real PNG can replace it one for one.
// The draw*() functions are the animated parts (fire, flames, clock), drawn every frame.
// Everything is drawn with whole-pixel rectangles so it stays crisp when scaled up.
import { VIEW, PALETTE as P, LAYOUT as L, PROPS } from '../config/scene.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export const R = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h); };

// Filled ellipse built from rows (no anti-aliasing).
export function disc(g, color, cx, cy, rx, ry = rx) {
  g.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

// Pixel line (Bresenham), optionally thick.
export function line(g, color, x0, y0, x1, y1, w = 1) {
  g.fillStyle = color;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    g.fillRect(x0 - (w >> 1), y0 - (w >> 1), w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function dither(g, color, x, y, w, h) {
  g.fillStyle = color;
  for (let j = 0; j < h; j++) for (let i = (j & 1); i < w; i += 2) g.fillRect(x + i, y + j, 1, 1);
}

export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- back wall (960x270, layout x -480) ---------------------------------------------------

export function makeBackWall() {
  const W = L.wall;
  const [c, g] = canvas(W.w, VIEW.h);
  g.translate(-W.x, 0);
  const x0 = W.x, x1 = W.x + W.w;

  // Striped wallpaper with a small damask motif.
  R(g, P.wall, x0, 0, W.w, W.railY);
  for (let x = x0; x < x1; x += 12) {
    R(g, P.wallStripe, x, 0, 4, W.railY);
    R(g, P.wallDark, x + 4, 0, 1, W.railY);
  }
  for (let row = 0, y = 16; y < W.railY - 6; row++, y += 18) {
    for (let x = x0 + 8 + (row & 1) * 6; x < x1; x += 12) {
      R(g, P.wallMotif, x, y); R(g, P.wallMotif, x - 1, y + 1, 3, 1); R(g, P.wallMotif, x, y + 2);
    }
  }
  // Cornice.
  R(g, P.cornice, x0, 0, W.w, W.corniceH);
  R(g, P.corniceLine, x0, W.corniceH - 2, W.w, 1);
  R(g, P.wallDark, x0, W.corniceH, W.w, 2);
  // Wainscot with raised panels.
  R(g, P.wainscot, x0, W.railY, W.w, W.floorY - W.railY);
  R(g, P.wainscotLight, x0, W.railY, W.w, 2);
  R(g, P.wainscotDark, x0, W.railY + 2, W.w, 2);
  for (let x = x0 + 6; x < x1 - 40; x += 48) {
    R(g, P.wainscotDark, x, W.railY + 12, 40, 1);
    R(g, P.wainscotDark, x, W.railY + 12, 1, W.floorY - W.railY - 24);
    R(g, P.wainscotLight, x, W.floorY - 12, 40, 1);
    R(g, P.wainscotLight, x + 39, W.railY + 12, 1, W.floorY - W.railY - 24);
  }
  R(g, P.floor, x0, W.floorY, W.w, VIEW.h - W.floorY);
  R(g, P.wainscotDark, x0, W.floorY, W.w, 3);

  windowFrame(g, L.window);
  bookcase(g, L.bookcase);
  coatRack(g, L.coatRack);
  painting(g, L.painting);
  clockCase(g, L.clock);
  fireplace(g, L.fireplace);
  sconce(g, L.sconce);
  sconce(g, L.gasLamp);
  armchair(g, L.watsonChair, P.green, P.greenLight, P.greenDark);
  bowler(g, L.watsonChair.x + 2, L.watsonChair.y + 46);

  // Darken towards the ceiling.
  const grad = g.createLinearGradient(0, 0, 0, 60);
  grad.addColorStop(0, 'rgba(5, 8, 6, 0.55)');
  grad.addColorStop(1, 'rgba(5, 8, 6, 0)');
  g.fillStyle = grad;
  g.fillRect(x0, 0, W.w, 60);

  // Window panes stay transparent so the rain layer shows through.
  const w = L.window;
  g.clearRect(w.x, w.y, w.w / 2 - 2, w.h / 2 - 2);
  g.clearRect(w.x + w.w / 2 + 2, w.y, w.w / 2 - 2, w.h / 2 - 2);
  g.clearRect(w.x, w.y + w.h / 2 + 2, w.w / 2 - 2, w.h / 2 - 2);
  g.clearRect(w.x + w.w / 2 + 2, w.y + w.h / 2 + 2, w.w / 2 - 2, w.h / 2 - 2);
  return c;
}

function windowFrame(g, w) {
  R(g, P.woodDark, w.x - 7, w.y - 7, w.w + 14, w.h + 16);
  R(g, P.wood, w.x - 5, w.y - 5, w.w + 10, w.h + 10);
  R(g, P.woodLight, w.x - 7, w.y + w.h + 3, w.w + 14, 3);   // sill
  R(g, P.woodHi, w.x - 7, w.y + w.h + 3, w.w + 14, 1);
  // Curtains with folds.
  for (const cx of [w.x - 26, w.x + w.w + 6]) {
    R(g, P.velvet, cx, w.y - 16, 20, w.h + 40);
    for (let i = 0; i < 20; i += 5) {
      R(g, P.velvetLight, cx + i + 1, w.y - 16, 1, w.h + 40);
      R(g, P.velvetDark, cx + i + 3, w.y - 16, 2, w.h + 40);
    }
    R(g, P.brass, cx + 2, w.y + 44, 16, 2);  // tie-back
  }
  R(g, P.brassDark, w.x - 30, w.y - 19, w.w + 60, 3);
  R(g, P.brassLight, w.x - 30, w.y - 19, w.w + 60, 1);
}

function bookcase(g, b) {
  const r = rng(11);
  R(g, P.woodDark, b.x, b.y, b.w, b.h);
  R(g, '#140b06', b.x + 6, b.y + 10, b.w - 12, b.h - 10);
  R(g, P.wood, b.x, b.y, 6, b.h); R(g, P.woodHi, b.x + 1, b.y, 1, b.h);
  R(g, P.wood, b.x + b.w - 6, b.y, 6, b.h); R(g, P.woodDark, b.x + b.w - 2, b.y, 2, b.h);
  R(g, P.woodLight, b.x - 3, b.y, b.w + 6, 8); R(g, P.woodHi, b.x - 3, b.y, b.w + 6, 1);
  const spines = [['#5a2420', '#7a3a30', '#3a1410'], ['#24382a', '#3a5640', '#16241a'], ['#3a2a48', '#54406a', '#241a30'],
    ['#6a5028', '#8a6c3a', '#46341a'], ['#22344a', '#34506a', '#141f2c'], ['#4a3020', '#6a4630', '#2e1c12']];
  for (let sy = b.y + 10; sy + 34 <= b.y + b.h; sy += 37) {
    const floor = sy + 33;
    for (let x = b.x + 7; x < b.x + b.w - 9;) {
      const bw = 4 + Math.floor(r() * 5);
      if (x + bw > b.x + b.w - 7) break;
      const bh = 20 + Math.floor(r() * 11);
      const [base, hi, lo] = spines[Math.floor(r() * spines.length)];
      R(g, base, x, floor - bh, bw, bh);
      R(g, hi, x, floor - bh, 1, bh);
      R(g, lo, x + bw - 1, floor - bh, 1, bh);
      R(g, P.brassDark, x + 1, floor - bh + 3, bw - 2, 1);
      R(g, P.brassDark, x + 1, floor - 5, bw - 2, 1);
      x += bw + (r() < 0.12 ? 4 : 0);
    }
    R(g, P.wood, b.x + 6, floor, b.w - 12, 4);
    R(g, P.woodHi, b.x + 6, floor, b.w - 12, 1);
  }
}

function coatRack(g, { x, y }) {
  R(g, P.woodDark, x - 1, y + 4, 3, 206);
  R(g, P.woodLight, x - 1, y + 4, 1, 206);
  disc(g, P.woodLight, x, y + 3, 3);
  for (const [dx, dy] of [[-7, 10], [6, 10], [-5, 16], [5, 16]]) line(g, P.brassDark, x, y + 12, x + dx, y + dy);
  R(g, P.woodDark, x - 12, y + 206, 25, 3);
  // Long coat hanging from a hook.
  g.fillStyle = '#2b1d16';
  for (let yy = y + 18; yy < y + 150; yy++) {
    const hw = Math.min(14, 5 + (yy - y - 18) * 0.35);
    g.fillRect(x - hw + 1, yy, hw * 2, 1);
  }
  for (let i = -9; i <= 9; i += 6) R(g, '#3a2a20', x + i, y + 40, 1, 108);
  for (let i = -6; i <= 12; i += 6) R(g, '#1d130e', x + i, y + 44, 1, 104);
  R(g, '#3a2a20', x - 6, y + 20, 12, 3);
  bowler(g, x - 9, y - 4);
}

function bowler(g, x, y) {
  disc(g, '#141215', x + 9, y + 7, 7, 6);
  R(g, '#141215', x, y + 10, 19, 3);
  R(g, '#2a272c', x + 5, y + 3, 4, 1);
  R(g, '#3a2a20', x + 3, y + 9, 13, 1);
}

function painting(g, p) {
  R(g, P.brassDark, p.x, p.y, p.w, p.h);
  R(g, P.brassLight, p.x, p.y, p.w, 1); R(g, P.brassLight, p.x, p.y, 1, p.h);
  R(g, P.brass, p.x + 2, p.y + 2, p.w - 4, p.h - 4);
  R(g, P.brassDark, p.x + 4, p.y + 4, p.w - 8, p.h - 8);
  const ix = p.x + 5, iy = p.y + 5, iw = p.w - 10, ih = p.h - 10;
  const grad = g.createLinearGradient(0, iy, 0, iy + ih);
  grad.addColorStop(0, '#8a6c48');
  grad.addColorStop(1, '#4a3626');
  g.fillStyle = grad;
  g.fillRect(ix, iy, iw, ih);
  R(g, '#9a7c56', ix + 4, iy + 6, 14, 2); R(g, '#9a7c56', ix + 30, iy + 9, 12, 2);
  // Skyline with a clock tower.
  const base = iy + ih;
  for (const [dx, h, w] of [[0, 8, 10], [9, 12, 7], [15, 7, 9], [24, 10, 6], [38, 9, 8], [45, 13, 9]]) R(g, '#2a1e14', ix + dx, base - h, w, h);
  const tx = ix + 31;
  R(g, '#2a1e14', tx, base - 26, 6, 26);
  R(g, '#2a1e14', tx + 1, base - 30, 4, 4);
  R(g, '#2a1e14', tx + 2, base - 34, 2, 4);
  R(g, '#c8a060', tx + 2, base - 22, 2, 2);
}

function clockCase(g, { x, y, r }) {
  disc(g, P.woodDark, x, y, r + 4);
  disc(g, P.wood, x, y, r + 3);
  disc(g, P.woodHi, x - 1, y - 1, r + 1);
  disc(g, P.woodDark, x, y, r + 1);
  disc(g, '#e6dcc0', x, y, r);
  disc(g, '#cfc3a4', x + 2, y + 2, r - 3);
  disc(g, '#e6dcc0', x, y, r - 4);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    R(g, P.ink, Math.round(x + Math.sin(a) * (r - 2)), Math.round(y - Math.cos(a) * (r - 2)), i % 3 ? 1 : 2, i % 3 ? 1 : 2);
  }
  // Pendulum box.
  R(g, P.woodDark, x - 9, y + r + 2, 18, 40);
  R(g, P.wood, x - 8, y + r + 3, 16, 38);
  R(g, '#120b07', x - 5, y + r + 6, 10, 30);
  R(g, P.woodHi, x - 8, y + r + 3, 1, 38);
  R(g, P.woodDark, x - 3, y + r + 42, 6, 4);
}

export function drawClock(g, { x, y, r }, t) {
  // Hands show a fixed late hour; the pendulum swings.
  line(g, P.ink, x, y, x + 6, y - 4, 2);
  line(g, P.ink, x, y, x - 2, y - (r - 4));
  R(g, P.brassDark, x - 1, y - 1, 2, 2);
  const swing = Math.sin(t * Math.PI) * 3;
  const by = y + r + 30;
  line(g, P.brassDark, x, y + r + 6, Math.round(x + swing), by);
  disc(g, P.brass, Math.round(x + swing), by, 3);
  R(g, P.brassLight, Math.round(x + swing) - 1, by - 2, 1, 1);
}

function fireplace(g, f) {
  const { x, y, w, h } = f;
  // Mantel shelf.
  R(g, P.woodLight, x - 6, y, w + 12, 7);
  R(g, P.woodHi, x - 6, y, w + 12, 1);
  R(g, P.woodDark, x - 6, y + 6, w + 12, 2);
  // Surround with carved panels.
  R(g, P.wood, x, y + 8, w, h - 8);
  R(g, P.woodLight, x, y + 8, 2, h - 8);
  R(g, P.woodDark, x + w - 2, y + 8, 2, h - 8);
  for (const px of [x + 6, x + w - 24]) {
    R(g, P.woodDark, px, y + 18, 18, h - 30);
    R(g, P.woodLight, px + 1, y + 19, 16, h - 32);
    R(g, P.wood, px + 3, y + 21, 12, h - 36);
  }
  R(g, P.woodDark, x + 30, y + 14, w - 60, 8);
  R(g, P.woodHi, x + 31, y + 15, w - 62, 1);
  // Firebox: stone border, black interior with an arched top.
  const ox = x + 30, oy = y + 32, ow = w - 60, oh = h - 46;
  R(g, P.stoneDark, ox - 4, oy - 4, ow + 8, oh + 4);
  R(g, P.stone, ox - 3, oy - 3, ow + 6, 2);
  R(g, '#0c0806', ox, oy, ow, oh);
  for (let i = 0; i < 4; i++) {
    R(g, P.stoneDark, ox, oy + i, 4 - i, 1);
    R(g, P.stoneDark, ox + ow - 4 + i, oy + i, 4 - i, 1);
  }
  // Hearth.
  R(g, P.stoneDark, x - 4, y + h - 8, w + 8, 8);
  R(g, P.stone, x - 4, y + h - 8, w + 8, 1);
  // On the mantel: a bust and some books.
  const bx = x + w - 30, by = y;
  R(g, P.stoneDark, bx - 7, by - 6, 14, 6);
  R(g, P.stone, bx - 6, by - 6, 12, 1);
  g.fillStyle = P.stone;
  for (let i = 0; i < 8; i++) g.fillRect(bx - 4 - i, by - 7 - i, 9 + i * 2 - 1, 1);
  disc(g, P.stone, bx, by - 22, 5, 6);
  R(g, P.stoneLight, bx - 4, by - 26, 2, 5);
  R(g, P.stoneDark, bx + 2, by - 22, 2, 5);
  R(g, P.stoneLight, bx - 9, by - 14, 4, 3);
  for (const [dx, bw, bh, col] of [[8, 5, 18, '#5a2420'], [13, 4, 16, '#24382a'], [17, 6, 19, '#6a5028'], [23, 4, 15, '#22344a']]) {
    R(g, col, x + dx, by - bh, bw, bh);
    R(g, P.brassDark, x + dx + 1, by - bh + 3, bw - 2, 1);
  }
}

export function drawFire(g, f, t, flicker) {
  const ox = f.x + 30, ow = f.w - 60, floor = f.y + f.h - 16;
  for (let i = 2; i < ow - 2; i += 2) {
    const u = i / ow;
    const env = Math.sin(u * Math.PI);
    const n = Math.sin(i * 0.9 + t * 9) * 0.5 + Math.sin(i * 1.7 - t * 13) * 0.3 + Math.sin(i * 0.37 + t * 5) * 0.2;
    const h = Math.max(2, Math.round((6 + 20 * env) * (0.75 + 0.3 * n) * flicker));
    const x = ox + i;
    R(g, P.fireRed, x, floor - h, 2, h);
    R(g, P.fireOrange, x, floor - Math.round(h * 0.7), 2, Math.round(h * 0.7));
    if (h > 8) R(g, P.fireYellow, x, floor - Math.round(h * 0.4), 2, Math.round(h * 0.4));
  }
  // Logs and grate in front of the flames.
  R(g, '#3a2214', ox + 6, floor - 3, ow - 12, 4);
  R(g, '#5a3420', ox + 8, floor - 3, ow - 16, 1);
  R(g, '#ff9a3a', ox + 14, floor, 3, 1); R(g, '#ff9a3a', ox + ow - 20, floor, 4, 1);
  R(g, P.brassDark, ox + 2, floor + 1, ow - 4, 2);
  for (let i = ox + 4; i < ox + ow - 4; i += 6) R(g, P.brassDark, i, floor - 4, 1, 5);
  R(g, P.brass, ox + 2, floor + 1, ow - 4, 1);
}

function sconce(g, { x, y }) {
  R(g, P.brassDark, x - 2, y + 4, 5, 14);
  R(g, P.brass, x - 1, y + 5, 3, 12);
  line(g, P.brass, x, y + 16, x, y + 22, 2);
  R(g, P.brassDark, x - 4, y + 22, 9, 2);
  // Tulip glass shade.
  g.fillStyle = P.glowGlass;
  for (let i = 0; i < 12; i++) {
    const hw = 3 + Math.round(Math.sin((i / 12) * Math.PI * 0.8) * 4);
    g.fillRect(x - hw, y - 10 + i, hw * 2 + 1, 1);
  }
  R(g, P.glowHot, x - 1, y - 6, 3, 6);
  R(g, P.brass, x - 5, y + 2, 11, 1);
}

function armchair(g, c, base, light, dark) {
  const { x, y, w, h } = c;
  for (let i = 0; i < h - 22; i++) {
    const inset = i < 8 ? 8 - i : 0;
    R(g, base, x + 8 + inset, y + i, w - 16 - inset * 2, 1);
  }
  R(g, light, x + 14, y + 6, 3, h - 34);
  R(g, dark, x + w - 14, y + 6, 3, h - 34);
  for (let ty = y + 10; ty < y + h - 34; ty += 10) for (let tx = x + 20 + ((ty / 10) & 1) * 5; tx < x + w - 18; tx += 10) {
    R(g, dark, tx, ty); R(g, light, tx, ty - 1);
  }
  R(g, dark, x, y + 34, 16, h - 42); R(g, light, x, y + 34, 16, 3);
  R(g, dark, x + w - 16, y + 34, 16, h - 42); R(g, light, x + w - 16, y + 34, 16, 3);
  R(g, light, x + 14, y + h - 36, w - 28, 12);
  R(g, base, x + 14, y + h - 32, w - 28, 8);
  R(g, P.woodDark, x + 4, y + h - 8, 4, 8);
  R(g, P.woodDark, x + w - 8, y + h - 8, 4, 8);
}

// ---- rain layer --------------------------------------------------------------------------

export function drawOutside(g, w, rain) {
  const grad = g.createLinearGradient(0, w.y, 0, w.y + w.h);
  grad.addColorStop(0, P.sky);
  grad.addColorStop(1, P.skyLow);
  g.fillStyle = grad;
  g.fillRect(w.x - 80, w.y, w.w + 160, w.h);
  const base = w.y + w.h;
  for (const [dx, h, cw] of [[-60, 40, 50], [-12, 52, 36], [24, 34, 44], [66, 58, 30], [96, 38, 60], [150, 48, 40]]) {
    R(g, P.rooftops, w.x + dx, base - h, cw, h);
    R(g, P.rooftops, w.x + dx + 6, base - h - 8, 4, 8);
  }
  R(g, '#c98a3a', w.x + 34, base - 22, 2, 3);
  R(g, '#c98a3a', w.x + 104, base - 18, 2, 3);
  g.fillStyle = P.rain;
  for (const d of rain) {
    g.globalAlpha = d.a;
    g.fillRect(Math.round(d.x), Math.round(d.y), 1, d.len);
  }
  g.globalAlpha = 1;
}

// ---- James's chair (layout LAYOUT.chair) ----------------------------------------------------

export function makeChair() {
  const ch = L.chair;
  const [c, g] = canvas(ch.w, ch.h);
  g.translate(-ch.x, -ch.y);
  const top = ch.y, bottom = ch.y + ch.h;
  // Wingback: rounded top, wings flaring out.
  for (let y = top; y < bottom - 6; y++) {
    const i = y - top;
    const hw = i < 10 ? 34 + Math.round(Math.sqrt(i * 10) * 1.6) : Math.min(56, 50 + Math.floor((i - 10) / 6));
    R(g, P.leatherDark, -hw, y, hw * 2, 1);
    if (hw > 4) R(g, P.leather, -hw + 3, y, hw * 2 - 6, 1);
  }
  R(g, P.leatherLight, -40, top + 8, 3, ch.h - 40);
  R(g, P.leatherDark, 36, top + 8, 4, ch.h - 40);
  // Button tufting.
  for (let row = 0, y = top + 12; y < top + 90; row++, y += 11) {
    for (let x = -36 + (row & 1) * 6; x <= 36; x += 12) {
      R(g, P.leatherDark, x, y, 2, 2);
      R(g, P.leatherLight, x - 1, y - 1, 1, 1);
      line(g, P.leatherDark, x - 4, y - 4, x, y);
      line(g, P.leatherDark, x + 5, y - 4, x + 1, y);
    }
  }
  // Rolled arms.
  for (const ax of [ch.x, ch.x + ch.w - 22]) {
    R(g, P.leatherDark, ax, top + 78, 22, ch.h - 84);
    R(g, P.leather, ax + 1, top + 78, 20, 6);
    R(g, P.leatherLight, ax + 2, top + 78, 18, 2);
    R(g, P.leather, ax + 3, top + 86, 16, ch.h - 96);
  }
  // Brass nail trim along the arms and the top of the back.
  for (let y = top + 80; y < bottom - 10; y += 4) {
    R(g, P.brass, ch.x + 3, y); R(g, P.brass, ch.x + ch.w - 4, y);
  }
  for (let x = -32; x <= 32; x += 4) R(g, P.brass, x, top + 2);
  return c;
}

// ---- James (layout LAYOUT.james), one canvas per expression -------------------------------

// Brow, eye and mouth shapes per expression, as [x, y, w, h] rects relative to the face centre.
const FACES = {
  composed: { brows: [[-10, -7, 7, 1], [3, -7, 7, 1]], mouth: [[-4, 10, 8, 1]], smile: true },
  uneasy: { brows: [[-10, -7, 5, 1], [-5, -8, 2, 1], [5, -7, 5, 1], [3, -8, 2, 1]], mouth: [[-4, 10, 3, 1], [-1, 11, 2, 1], [1, 10, 3, 1]] },
  irritated: { brows: [[-10, -8, 3, 1], [-7, -7, 2, 1], [-5, -6, 2, 1], [3, -6, 2, 1], [5, -7, 2, 1], [7, -8, 3, 1]], mouth: [[-3, 10, 6, 1]], narrow: true },
  flustered: { brows: [[-10, -9, 7, 1], [3, -9, 7, 1]], mouth: [[-2, 9, 4, 3]], cheeks: true, wide: true },
  pained: { brows: [[-10, -6, 3, 1], [-7, -7, 2, 1], [-5, -8, 2, 1], [3, -8, 2, 1], [5, -7, 2, 1], [7, -6, 3, 1]], mouth: [[-5, 11, 2, 1], [-3, 10, 6, 1], [3, 11, 2, 1]] },
  broken: { brows: [[-10, -5, 3, 1], [-7, -6, 4, 1], [3, -6, 4, 1], [7, -5, 3, 1]], mouth: [[-3, 11, 6, 1]], eyesDown: true, dy: 3 },
};

export function makeJames(expression) {
  const j = L.james;
  const [c, g] = canvas(j.w, j.h);
  g.translate(-j.x, -j.y);
  const face = FACES[expression] || FACES.composed;
  const fx = j.face.x, fy = j.face.y + (face.dy || 0);

  // Torso: tailcoat over a waistcoat, shirt and white cravat.
  for (let y = 96; y < j.y + j.h; y++) {
    const hw = Math.min(48, 26 + Math.round((y - 96) * 2.4));
    R(g, P.coat, -hw, y, hw * 2, 1);
    R(g, P.coatLight, -hw, y, 3, 1);
    R(g, P.coatDark, hw - 4, y, 4, 1);
  }
  for (let y = 96; y < j.y + j.h; y++) {
    const lw = Math.max(0, 14 - Math.round((y - 96) * 0.25));
    R(g, P.waistcoat, -lw, y, lw * 2, 1);
  }
  for (let y = 96; y < 132; y++) {
    const sw = Math.max(0, 9 - Math.round((y - 96) * 0.26));
    R(g, P.shirt, -sw, y, sw * 2, 1);
    R(g, P.shirtShade, sw - 2, y, 2, 1);
  }
  // Lapels.
  line(g, P.coatLight, -10, 96, -20, 140, 2);
  line(g, P.coatLight, 10, 96, 20, 140, 2);
  line(g, P.coatDark, -14, 104, -10, 120);
  line(g, P.coatDark, 14, 104, 10, 120);
  for (let y = 136; y < 170; y += 9) R(g, P.brassDark, -1, y, 2, 2);  // waistcoat buttons
  // Cravat.
  R(g, P.shirt, -6, 93, 12, 6);
  R(g, P.shirtShade, -6, 98, 12, 1);
  R(g, P.shirtShade, 2, 93, 1, 5);
  // Neck.
  R(g, P.skinShade, fx - 6, 86, 12, 8);
  R(g, P.skinDark, fx + 2, 86, 4, 8);

  // Head: ears, face, hair.
  R(g, P.skinShade, fx - 16, fy - 3, 3, 9); R(g, P.skinDark, fx - 15, fy, 1, 3);
  R(g, P.skinShade, fx + 13, fy - 3, 3, 9); R(g, P.skinDark, fx + 14, fy, 1, 3);
  disc(g, P.skin, fx, fy, 13, 16);
  for (let dy = -10; dy <= 14; dy++) {
    const hw = Math.round(13 * Math.sqrt(Math.max(0, 1 - (dy / 16) ** 2)));
    R(g, P.skinShade, fx + hw - 3, fy + dy, 3, 1);
  }
  R(g, P.skinLight, fx - 9, fy + 2, 3, 4);
  R(g, P.skinShade, fx - 7, fy + 14, 14, 2);  // jaw
  // Hair: a grey cap with short sides.
  const r = rng(5);
  for (let dy = -17; dy <= -8; dy++) {
    const hw = Math.round(14 * Math.sqrt(Math.max(0, 1 - ((dy + 6) / 12) ** 2)));
    for (let x = fx - hw; x <= fx + hw; x++) {
      const v = r();
      R(g, v < 0.2 ? P.hairDark : v > 0.8 ? P.hairLight : P.hair, x, fy + dy);
    }
  }
  R(g, P.hair, fx - 14, fy - 8, 3, 8); R(g, P.hairDark, fx - 14, fy - 2, 2, 3);
  R(g, P.hair, fx + 11, fy - 8, 3, 8); R(g, P.hairDark, fx + 12, fy - 2, 2, 3);
  // Eyes, nose, brows, mouth.
  const ey = fy - 3 + (face.eyesDown ? 1 : 0);
  for (const ex of [fx - 8, fx + 3]) {
    if (face.eyesDown) {
      R(g, P.eye, ex, ey + 1, 5, 1);
    } else {
      R(g, P.skinShade, ex, ey - 1, 5, 1);
      R(g, face.wide ? P.shirt : P.skinShade, ex, ey, 5, face.narrow ? 1 : 2);
      R(g, P.eye, ex + 1, ey, 3, face.narrow ? 1 : 2);
    }
  }
  R(g, P.skinShade, fx + 1, fy - 1, 2, 7);
  R(g, P.skinLight, fx - 1, fy - 1, 1, 6);
  R(g, P.skinDark, fx - 2, fy + 6, 5, 1);
  line(g, P.skinShade, fx - 6, fy + 5, fx - 7, fy + 10);
  line(g, P.skinShade, fx + 6, fy + 5, fx + 7, fy + 10);
  for (const [x, y, w, h] of face.brows) R(g, P.hairDark, fx + x, fy + y, w, h);
  for (const [x, y, w, h] of face.mouth) R(g, P.lip, fx + x, fy + y, w, h);
  if (face.smile) { R(g, P.lip, fx - 5, fy + 9, 1, 1); R(g, P.lip, fx + 4, fy + 9, 1, 1); }
  if (face.cheeks) {
    R(g, 'rgba(200, 70, 60, 0.55)', fx - 11, fy + 3, 4, 2);
    R(g, 'rgba(200, 70, 60, 0.55)', fx + 7, fy + 3, 4, 2);
  }
  return c;
}

// Overlays drawn on the generated James each frame (layout coordinates, plus his sway).
// open: 0..1 mouth opening from the voice level.
export function drawMouth(g, expression, open, dx, dy) {
  const h = open > 0.55 ? 3 : open > 0.2 ? 2 : 0;
  if (!h) return;
  const face = FACES[expression] || FACES.composed;
  const fx = L.james.face.x + dx, fy = L.james.face.y + (face.dy || 0) + dy;
  R(g, P.skin, fx - 5, fy + 8, 10, h + 3);
  R(g, '#3a1410', fx - 3, fy + 9, 6, h);
  R(g, P.lip, fx - 3, fy + 9 + h, 6, 1);
  R(g, P.lip, fx - 2, fy + 8, 4, 1);
}

// Eyes slid to one side: the "thinking" glance away while he considers his answer.
export function drawGlance(g, expression, dx, dy) {
  const face = FACES[expression] || FACES.composed;
  if (face.eyesDown) return;
  const fx = L.james.face.x + dx, fy = L.james.face.y + (face.dy || 0) + dy;
  for (const ex of [fx - 8, fx + 3]) {
    R(g, P.skinShade, ex, fy - 3, 5, face.narrow ? 1 : 2);
    R(g, P.eye, ex + 3, fy - 3, 2, face.narrow ? 1 : 2);
  }
}

// ---- the desk and everything on it that isn't evidence (layout LAYOUT.deskLayer) -----------

export function makeDesk() {
  const D = L.deskLayer;
  const [c, g] = canvas(D.w, D.h);
  g.translate(-D.x, -D.y);
  const top = L.deskTop, x0 = D.x;
  const r = rng(3);
  // Surface: planks running across, with grain.
  R(g, P.desk, x0, top, D.w, VIEW.h - top);
  for (const y of [176, 191, 208, 228, 252]) {
    R(g, P.deskDark, x0, y, D.w, 1);
    R(g, P.deskLight, x0, y + 1, D.w, 1);
  }
  for (let i = 0; i < 520; i++) {
    const y = top + 3 + Math.floor(r() * (VIEW.h - top - 3));
    R(g, r() < 0.5 ? P.deskDark : P.deskLight, x0 + Math.floor(r() * D.w), y, 6 + Math.floor(r() * 30), 1);
  }
  R(g, P.deskDark, x0, top - 2, D.w, 2);
  R(g, P.deskHi, x0, top, D.w, 1);

  books(g, L.books);
  bankerLamp(g, L.bankerLamp);
  magnifier(g, L.magnifier);
  inkwell(g, L.inkwell);
  candleStick(g, L.candle);
  return c;
}

function books(g, { x, y }) {
  const stack = [[0, 16, 64, '#5a2420', '#7a3a30'], [4, 12, 58, '#3a2414', '#5a3a24'], [-2, 14, 62, '#24382a', '#3a5640']];
  let yy = y + 48;
  for (const [dx, h, w, base, hi] of stack) {
    yy -= h;
    R(g, base, x + dx, yy, w, h);
    R(g, hi, x + dx, yy, w, 1);
    R(g, P.paperLight, x + dx + w - 4, yy + 2, 3, h - 4);
    R(g, P.brassDark, x + dx + 6, yy + 3, 1, h - 6);
  }
}

function bankerLamp(g, { x, y }) {
  // Base, stem, then the green glass shade with a glowing underside.
  disc(g, P.brassDark, x, y + 106, 18, 5);
  disc(g, P.brass, x, y + 105, 16, 4);
  R(g, P.brassLight, x - 10, y + 102, 14, 1);
  R(g, P.brassDark, x - 2, y + 36, 5, 68);
  R(g, P.brass, x - 2, y + 36, 3, 68);
  R(g, P.brassLight, x - 2, y + 36, 1, 68);
  disc(g, P.brass, x, y + 70, 4, 2);
  disc(g, P.brass, x, y + 40, 5, 2);
  for (let i = 0; i < 30; i++) {
    const hw = i < 14 ? Math.round(36 * Math.sqrt(1 - ((14 - i) / 14) ** 2)) : 36;
    R(g, P.lampGreen, x - hw, y + i, hw * 2, 1);
    if (hw > 6) {
      R(g, P.lampGreenHi, x - hw + 4, y + i, Math.min(10, hw), 1);
      R(g, P.lampGreenDark, x + hw - 6, y + i, 6, 1);
    }
  }
  R(g, P.lampGreenHi, x - 28, y + 5, 20, 2);
  R(g, P.brassDark, x - 37, y + 30, 74, 2);
  R(g, P.brass, x - 37, y + 30, 74, 1);
  R(g, P.glowGlass, x - 33, y + 32, 66, 2);
  R(g, P.glowHot, x - 20, y + 32, 40, 1);
  line(g, P.brass, x + 18, y + 32, x + 18, y + 44);
  disc(g, P.brassLight, x + 18, y + 45, 1);
}

function magnifier(g, { x, y }) {
  line(g, '#0f0c0a', x + 10, y + 7, x + 34, y + 15, 4);
  line(g, '#3a3028', x + 12, y + 6, x + 33, y + 13);
  disc(g, P.brassDark, x, y, 14, 10);
  disc(g, P.brass, x, y, 13, 9);
  disc(g, '#3a3a34', x, y, 10, 7);
  disc(g, '#56564c', x - 2, y - 2, 6, 4);
  R(g, '#d8d8c8', x - 6, y - 4, 3, 1);
  R(g, P.brassLight, x - 10, y - 7, 8, 1);
}

function inkwell(g, { x, y }) {
  R(g, '#14181a', x - 8, y + 4, 16, 14);
  R(g, '#2a3438', x - 7, y + 5, 3, 12);
  R(g, '#0a0c0d', x + 5, y + 5, 3, 13);
  R(g, P.brassDark, x - 5, y, 10, 4);
  R(g, P.brass, x - 5, y, 10, 1);
  // Quill feather leaning out of the well.
  for (let i = 0; i < 46; i++) {
    const t = i / 46;
    const px = Math.round(x + 2 + t * 28 + t * t * 6);
    const py = Math.round(y - t * 52);
    const vane = i > 8 ? Math.round(Math.sin(t * Math.PI) * 5) : 0;
    R(g, '#2a2624', px - vane, py, vane + 1, 1);
    R(g, '#3e3a36', px, py, vane, 1);
    R(g, '#d8d0c0', px, py, 1, 1);
  }
}

function candleStick(g, { x, y }) {
  disc(g, P.brassDark, x, y + 60, 15, 4);
  disc(g, P.brass, x, y + 59, 13, 3);
  R(g, P.brassLight, x - 8, y + 57, 10, 1);
  R(g, P.brassDark, x - 3, y + 30, 6, 28);
  R(g, P.brass, x - 3, y + 30, 4, 28);
  R(g, P.brassLight, x - 3, y + 30, 1, 28);
  disc(g, P.brass, x, y + 44, 5, 2);
  disc(g, P.brassDark, x, y + 28, 10, 3);
  disc(g, P.brass, x, y + 27, 9, 2);
  R(g, '#e8e0c8', x - 5, y, 10, 27);
  R(g, '#fff8e8', x - 4, y, 2, 27);
  R(g, '#c8bea4', x + 3, y, 2, 27);
  R(g, '#e8e0c8', x - 6, y + 4, 2, 7);  // drips
  R(g, '#e8e0c8', x + 4, y + 2, 2, 11);
  R(g, '#2a2018', x, y - 3, 1, 3);       // wick
}

export function drawCandleFlame(g, { x, y }, t, flicker) {
  const sway = Math.round(Math.sin(t * 3.1) * 0.8 + Math.sin(t * 7.7) * 0.5);
  const h = Math.round(9 * flicker);
  for (let i = 0; i < h; i++) {
    const hw = i < 3 ? 1 : i < h - 3 ? 2 : 1;
    R(g, i < h / 2 ? P.fireYellow : P.fireOrange, x - hw + (i < h / 2 ? sway : 0), y - 3 - h + i, hw * 2, 1);
  }
  R(g, P.glowHot, x - 1 + sway, y - 3 - Math.round(h * 0.6), 1, 3);
}

// ---- evidence props --------------------------------------------------------------------------

export function makeProp(id) {
  const p = PROPS.find((q) => q.id === id);
  const [c, g] = canvas(p.w, p.h);
  PROP_ART[id](g, p.w, p.h);
  return c;
}

const PROP_ART = {
  notes(g, w, h) {
    R(g, '#2a1a10', 2, 2, w - 2, h - 2);
    R(g, '#c8b48a', 0, 0, w - 2, h - 2);
    R(g, '#ddc9a0', 1, 1, w - 4, 2);
    R(g, P.paperShade, w - 3, 1, 1, h - 3);
    for (let y = 3; y < h - 4; y += 4) { R(g, '#5a5048', 2, y, 3, 2); R(g, '#8a8070', 2, y, 1, 1); }
    R(g, P.ink, 12, 8, 26, 2);
    R(g, P.ink, 15, 13, 20, 2);
    R(g, '#8a6c48', 10, 20, 30, 1);
    R(g, '#8a6c48', 10, 23, 24, 1);
  },
  letter(g, w, h) {
    R(g, P.paperShade, 2, 2, w - 2, h - 2);
    R(g, P.paperLight, 4, 0, w - 10, 10);                  // letter peeking out
    for (let y = 2; y < 9; y += 2) R(g, P.ink, 7, y, w - 18 - (y % 3) * 2, 1);
    R(g, P.paper, 0, 6, w - 2, h - 8);
    line(g, P.paperShade, 0, 6, (w - 2) / 2, 15);
    line(g, P.paperShade, w - 3, 6, (w - 2) / 2, 15);
    disc(g, '#8a1a1a', (w - 2) / 2, 15, 3);
    R(g, '#b82a2a', (w - 2) / 2 - 1, 14, 1, 1);
    R(g, P.ink, 6, h - 7, 14, 1);
  },
  key(g, w, h) {
    disc(g, P.brassDark, 6, 7, 6);
    disc(g, P.brass, 6, 6, 5);
    R(g, P.deskDark, 4, 4, 4, 4);
    R(g, P.brassLight, 3, 2, 3, 1);
    R(g, P.brassDark, 12, 6, w - 12, 3);
    R(g, P.brass, 12, 6, w - 12, 1);
    R(g, P.brass, w - 8, 9, 2, 4);
    R(g, P.brass, w - 4, 9, 3, 3);
    R(g, P.brassDark, 14, 5, 2, 5);
  },
  statement(g, w, h) {
    R(g, P.paperShade, 2, 2, w - 2, h - 2);
    R(g, '#e4d8b8', 0, 0, w - 2, h - 2);
    R(g, P.paperShade, w - 8, 0, 6, 6);
    R(g, '#c8bc9c', w - 8, 0, 1, 6);
    R(g, P.ink, 4, 4, 16, 2);
    for (let y = 10; y < h - 6; y += 3) R(g, '#4a4038', 4, y, w - 10 - ((y * 5) % 7), 1);
    R(g, P.ink, w - 16, h - 6, 10, 1);
  },
};
