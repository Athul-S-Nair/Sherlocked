// Every tunable for the scene in one place: resolution, camera, palette, layout, art
// filenames and effect strengths.
//
// Layout coordinates: x = 0 is the centre of the view when looking straight ahead,
// y is in screen pixels (0..270). Each layer scrolls by PAN.range * speed at full head
// turn, so nearer layers (higher speed) move more: that is the parallax.

export const VIEW = { w: 480, h: 270 };

export const PAN = {
  range: 240,        // back-wall pixels scrolled at full head turn (the wall is 2x the view)
  edgeZone: 0.18,    // outer fraction of the screen on each side that turns the head
  maxSpeed: 1.2,     // pan units per second at the very edge (pan runs -1..1)
  ease: 6,           // higher = snappier follow
  dragPerScreen: 2,  // dragging across the full screen width moves this many pan units
};

export const LEAN = { zoom: 1.7, ease: 7 };

export const SPEED = { rain: 0.85, wall: 1, james: 1.1, desk: 1.25 };

export const PALETTE = {
  shadow: '#0a0f0d',
  // Wallpaper and panelling.
  wall: '#1b2b22', wallStripe: '#21352a', wallDark: '#142019', wallMotif: '#263d30',
  cornice: '#1a110b', corniceLine: '#3a2616',
  wainscot: '#24150d', wainscotLight: '#3a2416', wainscotDark: '#170d08',
  floor: '#160e09',
  // Wood.
  wood: '#3b2214', woodLight: '#5a3520', woodHi: '#7a4a2a', woodDark: '#24140c',
  desk: '#4a2a18', deskLight: '#64391f', deskHi: '#86512c', deskDark: '#311a0e',
  // Metal, glass, fire.
  brass: '#c99a45', brassLight: '#f0cd7a', brassDark: '#8a6428',
  lampGreen: '#174428', lampGreenHi: '#2a6a40', lampGreenDark: '#0c2816',
  glowGlass: '#f6d48a', glowHot: '#fff3d0',
  fireRed: '#c8401a', fireOrange: '#ff8a2a', fireYellow: '#ffd25a',
  // Fabric, paper, stone.
  leather: '#6a1f1c', leatherLight: '#8a3028', leatherDark: '#45120f',
  green: '#2a3f22', greenLight: '#3a5530', greenDark: '#1b2a16',
  velvet: '#4a1418', velvetLight: '#651d22', velvetDark: '#300b0e',
  paper: '#d8c8a0', paperLight: '#eadcb8', paperShade: '#b09c74',
  ink: '#2a2018', stone: '#8a8478', stoneLight: '#aaa496', stoneDark: '#5e5a52',
  sky: '#1a2a36', skyLow: '#2b3d48', rain: '#8fa9b8', rooftops: '#101c24',
  // James.
  coat: '#19181d', coatLight: '#2b2930', coatDark: '#0f0e12', waistcoat: '#2f2c33',
  shirt: '#e8e2d4', shirtShade: '#b8b0a0',
  skin: '#d6a688', skinLight: '#e8bea0', skinShade: '#b07e66', skinDark: '#8a5e4c',
  hair: '#9c9c9c', hairLight: '#c6c6c6', hairDark: '#6c6c6c',
  eye: '#2a1c16', lip: '#9a5a4a',
};

// Art files. Anything missing is replaced by a generated placeholder of the same size,
// so dropping a PNG with the right name into public/ "just works". Sizes are internal pixels.
export const IMAGES = {
  back_wall: '/assets/scene/back_wall.png',       // 960x270 at x -480; window panes transparent
  james_chair: '/assets/scene/james_chair.png',   // LAYOUT.chair
  desk: '/assets/scene/desk.png',                 // LAYOUT.deskLayer (desk + lamp + decor)
  james_composed: '/assets/james_composed.png',   // LAYOUT.james, for every expression: same
  james_uneasy: '/assets/james_uneasy.png',       // size and head position so swaps never jump
  james_irritated: '/assets/james_irritated.png',
  james_flustered: '/assets/james_flustered.png',
  james_pained: '/assets/james_pained.png',
  james_broken: '/assets/james_broken.png',
  prop_notes: '/assets/props/notes.png',
  prop_letter: '/assets/props/letter.png',
  prop_key: '/assets/props/key.png',
  prop_statement: '/assets/props/statement.png',
};

export const EXPRESSIONS = ['composed', 'uneasy', 'irritated', 'flustered', 'pained', 'broken'];

export const LAYOUT = {
  wall: { x: -480, w: 960, corniceH: 8, railY: 138, floorY: 236 },
  window: { x: -440, y: 40, w: 120, h: 100 },          // left side area
  bookcase: { x: -262, y: 6, w: 110, h: 230 },
  coatRack: { x: -124, y: 26 },
  painting: { x: -96, y: 20, w: 64, h: 46 },
  clock: { x: 64, y: 38, r: 16 },
  fireplace: { x: 108, y: 78, w: 126, h: 98 },        // fire sits above the desk line
  sconce: { x: 172, y: 46 },
  watsonChair: { x: 300, y: 96, w: 82, h: 96 },      // right side area (hint lives here)
  gasLamp: { x: 410, y: 58 },
  chair: { x: -64, y: 58, w: 128, h: 146 },
  james: { x: -52, y: 44, w: 104, h: 150, face: { x: 0, y: 74 } },
  deskLayer: { x: -560, y: 100, w: 1120, h: 170 },
  deskTop: 164,
  bankerLamp: { x: -198, y: 128 },                    // shade top centre
  books: { x: -306, y: 190 },
  magnifier: { x: 92, y: 196 },
  inkwell: { x: 146, y: 188 },
  candle: { x: 204, y: 166 },                         // top of the wax
};

// Clickable things on the desk (desk layer). evidenceId is what /api/chat receives;
// lineId is Holmes's observation in data/fixed-lines.json. The case notes open the summary.
export const PROPS = [
  { id: 'notes', image: 'prop_notes', title: 'Case notes', x: -164, y: 171, w: 50, h: 32 },
  { id: 'letter', image: 'prop_letter', title: "The moneylender's letter", evidenceId: 'E1', lineId: 'holmes_letter', x: -98, y: 174, w: 40, h: 26 },
  { id: 'key', image: 'prop_key', title: 'The study key', evidenceId: 'E2', lineId: 'holmes_key', x: -38, y: 186, w: 36, h: 14 },
  { id: 'statement', image: 'prop_statement', title: 'Staff statement', evidenceId: 'E3', lineId: 'holmes_emma', x: 18, y: 172, w: 38, h: 30 },
];

export const EFFECTS = {
  rainDrops: 70,
  wash: 'rgba(4, 10, 9, 0.4)',   // darkens everything before the lights are added
  // [x, y, radius, alpha, rgb, layer]; alpha is scaled by the flicker.
  lights: [
    { x: -198, y: 196, r: 190, a: 0.34, rgb: '255, 190, 90', layer: 'desk' },   // banker's lamp
    { x: -198, y: 180, r: 50, a: 0.3, rgb: '255, 220, 140', layer: 'desk' },
    { x: 204, y: 158, r: 110, a: 0.26, rgb: '255, 180, 80', layer: 'desk' },    // candle
    { x: 170, y: 148, r: 150, a: 0.32, rgb: '255, 120, 40', layer: 'wall', fire: true },
    { x: 172, y: 52, r: 80, a: 0.2, rgb: '255, 200, 120', layer: 'wall' },     // sconce
    { x: 410, y: 64, r: 130, a: 0.24, rgb: '255, 190, 100', layer: 'wall' },   // gas lamp
  ],
  flickerCalm: 0.04,    // lamp flicker amplitude at zero pressure
  flickerTense: 0.18,   // ...and at full pressure
  vignetteCalm: 0.5,
  vignetteTense: 0.85,
  grainAlpha: 0.04,
};
