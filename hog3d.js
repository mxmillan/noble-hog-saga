// The Noble Hog Saga 3D — Tilting at Windmills
// A one-level 3D platformer. Low-poly world and low-poly cast (see hog3d-models.js); the original
// 2D sprite art lives on as dialogue portraits and HUD icons.
// No build step: three.js is the vendored copy in vendor/, wired up by the import map in hog3d.html.
import * as THREE from 'three';
import * as Models from './hog3d-models.js?v=3';

// ───────────────────────────── utils ─────────────────────────────
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
function mulberry(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rnd = mulberry(1605); // world layout is seeded so it is the same every run
const DEV = new URLSearchParams(location.search).has('dev');

// ───────────────────────────── world shape ─────────────────────────────
// Terrain grid. The island has a western lobe, so the grid is wider than it is deep.
const X0 = -420, X1 = 230, Z0 = -230, Z1 = 230, NX = 212, NZ = 150, CX = (X1 - X0) / NX, CZ = (Z1 - Z0) / NZ;
const HMAP = new Float32Array((NX + 1) * (NZ + 1));
const MILL = { x: 0, z: -100, base: 30, h: 29.8, r0: 8, r1: 6.5, deckR: 10.5, deckY: 60.6,
               hubY: 47, plane: 11.5, len: 15, wid: 3.4, speed: -0.36, angle: 0.4 };   // negative: the low blade sweeps east→west, the way the stair climbs
const GATE_ANG = 40 * Math.PI / 180;                  // where the stair meets the deck
const RIVER = x => 62 + 10 * Math.sin(x * 0.02);
const FERRY_X = 70, FERRY_RZ = RIVER(FERRY_X);
// The western lobe: a lake the river runs through (with an islet), a hamlet south of it, a quarry hill north-west.
const WEST = { x: -255, z: 10 };
const LAKE = { x: -262, z: 68, r: 52, isletR: 11, y: 6.4 };
const HAMLET = { x: -212, z: 142 };
// The quarry's ramp is a ledge winding 270° up the hill: u = 0 at the foot, 1 at the top.
const QUARRY = { x: -332, z: -48, top: 26, a0: 0.35, sweep: Math.PI * 1.5, r0: 31, r1: 10 };
const quarryAt = (u, lane = 0) => { const a = QUARRY.a0 + u * QUARRY.sweep, r = lerp(QUARRY.r0, QUARRY.r1, u) + lane; return [QUARRY.x + Math.cos(a) * r, QUARRY.z + Math.sin(a) * r]; };
const islandD = (x, z) => Math.min(Math.hypot(x * 0.92, z * 0.82), Math.hypot((x - WEST.x) * 1.15, (z - WEST.z) * 1.05));   // < 168 is dry land
// [x, z, top height, plateau radius, foot radius]
const HILLS = [[MILL.x, MILL.z, MILL.base, 24, 80], [-75, 120, 13, 8, 30], [72, 0, 13, 8, 30], [-80, -20, 14, 8, 30], [QUARRY.x, QUARRY.z, QUARRY.top, 10, 35]];
// [x, z, full radius, fade radius, height]
const FLATS = [[0, 165, 16, 30, 6.5], [0, 82, 5, 12, 6.5], [0, 42, 5, 12, 6.5],
               [FERRY_X, FERRY_RZ + 16, 4, 9, 6.5], [FERRY_X, FERRY_RZ - 16, 4, 9, 6.5], [0, 98, 9, 16, 6.5],
               [HAMLET.x, HAMLET.z, 18, 32, 6.8], [LAKE.x, LAKE.z + 58, 4, 9, 6.5], [LAKE.x, LAKE.z - 58, 4, 9, 6.5]];
const PATHS = [[0, 190, 0, 80], [0, 44, 0, -20], [0, -20, 0, -76], [0, 140, -68, 124], [0, 120, FERRY_X, FERRY_RZ + 17],
               [FERRY_X, FERRY_RZ - 17, 72, 10], [0, 20, -72, -14],
               [-68, 124, -140, 134], [-140, 134, HAMLET.x, HAMLET.z - 5], [HAMLET.x, HAMLET.z - 5, LAKE.x, LAKE.z + 56],
               [LAKE.x, LAKE.z - 56, LAKE.x, -6], [LAKE.x, -6, -303, -37], [LAKE.x, -6, -170, -14], [-170, -14, -88, -20]];

function rawH(x, z) {
  let h = 6.5 + 1.1 * Math.sin(x * 0.031 + 0.5) * Math.cos(z * 0.027) + 0.7 * Math.sin(x * 0.07 + 1.3) * Math.sin(z * 0.063 + 0.5);
  for (const [cx, cz, top, pr, fr] of HILLS) h = lerp(h, top, sstep(fr, pr, Math.hypot(x - cx, z - cz)));
  for (const [cx, cz, r0, r1, t] of FLATS) h = lerp(h, t, sstep(r1, r0, Math.hypot(x - cx, z - cz)));
  const qd = Math.hypot(x - QUARRY.x, z - QUARRY.z);
  if (qd < 46) {                                          // cut the ramp's ledge into the quarry hill
    let da = Math.atan2(z - QUARRY.z, x - QUARRY.x) - QUARRY.a0; da -= Math.floor(da / TAU) * TAU;
    const u = da / QUARRY.sweep;
    if (u <= 1.04) { const uc = Math.min(1, u); h = lerp(h, lerp(6.5, QUARRY.top, uc), sstep(6.6, 4.2, Math.abs(qd - lerp(QUARRY.r0, QUARRY.r1, uc)))); }
  }
  h = lerp(h, -2.6, sstep(14, 5, Math.abs(z - RIVER(x))));
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  h = lerp(h, -3, sstep(LAKE.r, LAKE.r - 11, ld));
  h = lerp(h, LAKE.y, sstep(LAKE.isletR + 5, LAKE.isletR, ld));
  h = lerp(h, -7, sstep(168, 205, islandD(x, z)));
  return h;
}
// Collision reads the same triangles the mesh draws, so feet never float or sink.
function terrainH(x, z) {
  const fx = (x - X0) / CX, fz = (z - Z0) / CZ;
  if (fx < 0 || fz < 0 || fx >= NX || fz >= NZ) return -8;
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, r = iz * (NX + 1) + ix;
  const h00 = HMAP[r], h10 = HMAP[r + 1], h01 = HMAP[r + NX + 1], h11 = HMAP[r + NX + 2];
  return tx + tz <= 1 ? h00 + (h10 - h00) * tx + (h01 - h00) * tz : h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
}
function terrainGrad(x, z, e = 0.6) {
  return [(terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e), (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e)];
}
function pathDist(x, z) {
  let best = 1e9;
  for (const [ax, az, bx, bz] of PATHS) {
    const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// ───────────────────────────── renderer ─────────────────────────────
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 3000);
function resize() {
  // Render small and let CSS scale it up with hard pixels — the chunky 64-bit-era look.
  renderer.setPixelRatio(Math.min(1, 540 / innerHeight));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ───────────────────────────── assets ─────────────────────────────
const A = 'assets/';
// The 2D art still on show: portraits, HUD icons, the sign's lettering and the win card.
const SPRITE_FILES = {
  hog_idle: 'sprites/hogman/hogman_idle.png', gol_idle: 'sprites/gollum/gollum_idle.png', gol_hurt: 'sprites/gollum/gollum_hurt.png',
  gol_crouch: 'sprites/gollum/gollum_crouching.png', troll_stand: 'sprites/enemies/tile_troll_stand.png',
  troll_defeated: 'sprites/enemies/tile_troll_defeated.png', troll_sign: 'sprites/enemies/tile_troll_sign.png',
  wizard: 'sprites/wizard/wizard_02.png', oldman: 'sprites/wizard/wizard_01.png', taco: 'sprites/collectibles/taco.png',
  ring: 'sprites/collectibles/one_ring.png', ring_text: 'sprites/collectibles/one_ring_text.png',
};
const TILE_FILES = { cobble: 'backgrounds/level3_tiles/platform_cobble_street.png', sky: 'backgrounds/level1_tiles/bg_mountains_sky.png' };
const SPR = {}, TILE = {};

function loadImage(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
function mkTex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// These PNGs carry 10–40% transparent margin. Crop to the painted content so a portrait fills its frame.
function processSprite(img) {
  if (!img) { const c = mkCanvas(8, 8), g = c.getContext('2d'); g.fillStyle = '#f0f'; g.fillRect(0, 0, 8, 8); return finishSprite(c); }
  const w = img.naturalWidth, h = img.naturalHeight, c = mkCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 40) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 <= x0) { x0 = 0; y0 = 0; x1 = w - 2; y1 = h - 2; }
  const bw = x1 - x0 + 2, bh = y1 - y0 + 2, s = Math.min(1, 512 / Math.max(bw, bh));
  const out = mkCanvas(bw * s, bh * s); out.getContext('2d').drawImage(c, x0, y0, bw, bh, 0, 0, out.width, out.height);
  return finishSprite(out);
}
function finishSprite(c) { return { canvas: c, aspect: c.width / c.height }; }
function drawTex(w, h, draw, repeat = true) { const c = mkCanvas(w, h); draw(c.getContext('2d'), w, h); return mkTex(c, repeat); }
function rep(tex, x, y) { const t = tex.clone(); t.repeat.set(x, y); t.needsUpdate = true; return t; }

// ───────────────────────────── sound (all synthesised) ─────────────────────────────
const Sound = (() => {
  let ac = null, master = null, muted = false, nextT = 0, stepI = 0;
  const f = m => 440 * Math.pow(2, (m - 69) / 12);
  function tone(freq, dur, type = 'square', vol = 0.12, to = 0, at = 0) {
    if (!ac) return; const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.2, fc = 800, to = 0, at = 0) {
    if (!ac) return; const t = ac.currentTime + at, n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = b; fl.type = 'lowpass';
    fl.frequency.setValueAtTime(fc, t); if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t);
  }
  // A little Andalusian-cadence loop (Am G F E), eighth notes.
  const ROOT = [45, 43, 41, 40];
  const LEAD = [69, 0, 72, 76, 0, 72, 69, 0, 67, 0, 71, 74, 0, 71, 67, 0, 65, 0, 69, 72, 0, 69, 65, 0, 76, 77, 76, 74, 72, 71, 68, 64,
                76, 0, 76, 77, 76, 0, 72, 0, 74, 0, 74, 76, 74, 0, 71, 0, 72, 0, 72, 74, 72, 0, 69, 0, 71, 72, 71, 68, 64, 0, 64, 0];
  function music() {
    if (!ac) return;
    while (nextT < ac.currentTime + 0.3) {
      const at = nextT - ac.currentTime, i = stepI % 64, bar = (i >> 3) % 4, s = i & 7;
      if (s === 0 || s === 3 || s === 6) tone(f(ROOT[bar]), 0.22, 'triangle', 0.09, 0, at);
      if (s === 4) tone(f(ROOT[bar] + 7), 0.18, 'triangle', 0.06, 0, at);
      if (LEAD[i]) tone(f(LEAD[i]), 0.17, 'square', 0.022, 0, at);
      if (s % 2 === 0) noise(0.03, 0.02, 6000, 0, at);
      nextT += 0.2; stepI++;
    }
  }
  return {
    init() { if (ac) return; ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.6;
      master.connect(ac.destination); nextT = ac.currentTime + 0.1; setInterval(music, 100); },
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.6; return muted; },
    jump() { tone(300, 0.16, 'square', 0.08, 620); },
    boost() { noise(0.45, 0.3, 900, 120); tone(140, 0.4, 'sawtooth', 0.07, 60); },
    charge() { noise(0.55, 0.32, 1400, 150); tone(110, 0.5, 'sawtooth', 0.08, 55); },
    land() { noise(0.08, 0.12, 300); },
    hoof() { noise(0.035, 0.05, 1100, 500); },
    eat() { tone(880, 0.07, 'square', 0.07); tone(1320, 0.1, 'square', 0.07, 0, 0.06); },
    heal() { [72, 76, 79, 84].forEach((m, i) => tone(f(m), 0.1, 'square', 0.07, 0, i * 0.06)); },
    hit() { tone(220, 0.25, 'sawtooth', 0.14, 70); noise(0.15, 0.2, 1200); },
    stomp() { tone(180, 0.12, 'square', 0.12, 520); noise(0.1, 0.15, 2000); },
    thud() { noise(0.35, 0.4, 220, 60); tone(70, 0.3, 'sine', 0.3, 35); },
    splash() { noise(0.5, 0.3, 2500, 400); },
    whoosh() { noise(0.25, 0.12, 500, 1800); },
    gollum() { tone(520, 0.12, 'sawtooth', 0.06, 340); tone(420, 0.18, 'sawtooth', 0.06, 250, 0.13); },
    die() { [64, 60, 57, 52].forEach((m, i) => tone(f(m), 0.22, 'square', 0.1, 0, i * 0.18)); },
    talk() { tone(500 + Math.random() * 200, 0.03, 'square', 0.03); },
    check() { tone(f(72), 0.08, 'square', 0.07); tone(f(79), 0.14, 'square', 0.07, 0, 0.08); },
    win() { [60, 64, 67, 72, 67, 72, 76, 84].forEach((m, i) => tone(f(m), i === 7 ? 0.7 : 0.16, 'square', 0.1, 0, i * 0.14)); },
  };
})();

// ───────────────────────────── input ─────────────────────────────
const KEY = {}, HIT = {};
const input = { x: 0, y: 0, jumpHeld: false, camX: 0, camY: 0 };
let padPrev = [];
addEventListener('keydown', e => {
  if (!KEY[e.code]) HIT[e.code] = true; KEY[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { KEY[e.code] = false; });
addEventListener('blur', () => { for (const k in KEY) KEY[k] = false; });
function readInput() {
  let x = (KEY.KeyD ? 1 : 0) - (KEY.KeyA ? 1 : 0), y = (KEY.KeyW ? 1 : 0) - (KEY.KeyS ? 1 : 0);
  let cx = (KEY.ArrowLeft ? 1 : 0) - (KEY.ArrowRight ? 1 : 0), cy = (KEY.ArrowUp ? 1 : 0) - (KEY.ArrowDown ? 1 : 0);
  let jump = !!KEY.Space;
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (gp) {
    const dz = v => (Math.abs(v) < 0.18 ? 0 : v), b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    x += dz(gp.axes[0] || 0); y -= dz(gp.axes[1] || 0); cx -= dz(gp.axes[2] || 0); cy -= dz(gp.axes[3] || 0);
    jump = jump || b(0);
    const map = { 0: 'Space', 1: 'KeyF', 2: 'KeyF', 3: 'KeyE', 9: 'Escape' };
    for (const i in map) { if (b(i) && !padPrev[i]) HIT[map[i]] = true; padPrev[i] = b(i); }
  }
  const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  input.x = x; input.y = y; input.jumpHeld = jump; input.camX = clamp(cx, -1, 1); input.camY = clamp(cy, -1, 1);
}

// ───────────────────────────── collision world ─────────────────────────────
// Two shapes do everything: tapered cylinders and axis-aligned boxes. `stand` means the top is a floor.
const solids = [], movers = [];
function addCyl(x, z, r0, r1, y0, y1, stand = false, occlude = false) { const s = { kind: 'cyl', x, z, r0, r1, y0, y1, stand, occlude }; solids.push(s); return s; }
function addBox(x0, x1, z0, z1, y0, y1, stand = true) { const s = { kind: 'box', x0, x1, z0, z1, y0, y1, stand }; solids.push(s); return s; }
const cylR = (s, y) => lerp(s.r0, s.r1, clamp((y - s.y0) / (s.y1 - s.y0), 0, 1));
function inFoot(s, x, z, pad = 0) {
  if (s.kind === 'cyl') { const r = s.r1 + pad; return (x - s.x) ** 2 + (z - s.z) ** 2 <= r * r; }
  return x >= s.x0 - pad && x <= s.x1 + pad && z >= s.z0 - pad && z <= s.z1 + pad;
}
function groundBelow(x, z, y, out) {
  let g = terrainH(x, z), ref = null;
  for (const s of solids) if (s.stand && s.y1 <= y && s.y1 > g && inFoot(s, x, z, 0.3)) { g = s.y1; ref = s; }
  if (out) out.ref = ref;
  return g;
}

// ───────────────────────────── game state ─────────────────────────────
const PR = 0.9, PH = 3.0, STEP = 0.55, RUN = 11.5, GRAV = 40, JUMP = 16.5, CHARGE_SPEED = 27;
const P = { x: 0, y: 0, z: 166, vx: 0, vy: 0, vz: 0, dirX: 0, dirZ: -1, grounded: true, ground: null, coyote: 0, jumpBuf: 0, canBoost: true,
            charge: 0, boostT: 0, fuel: 0.3, hp: 4, inv: 0, stun: 0, dead: 0, face: 1, anim: 0, squash: 0, sliding: false, frozen: false,
            wantCharge: false, safeT: 0, maxHp: 4, hoof: 0 };
const cam = { yaw: 0, pitch: 0.34, dist: 15, cur: 15, manualT: 0, tgt: new THREE.Vector3(0, 9, 166), shake: 0 };
let state = 'loading', time = 0, playTime = 0, deaths = 0, foodGot = 0, foodTotal = 0, hasRing = false;
let checkpoint = { x: 0, y: 0, z: 166 }, lastSafe = { x: 0, y: 0, z: 166 };
const items = [], crows = [], npcs = [], flags = [], parts = [], mills = [], clouds = [], boulders = [];
let hog, ringModel, playerShadow, sky, sea, ferry, heart = null;
const intro = { t: 0, dur: 6 };
const GOL = { x: 0, y: 0, z: 0, state: 'perch', perch: 0, t: 0, hits: 0, vx: 0, vy: 0, vz: 0, face: 1, inv: 0, barked: false, lungeT: 4, spr: null, shadow: null, frame: 'gol_idle', dirX: 0, dirZ: 0, met: false };
const PERCHES = [{ x: -70, z: 124.5 }, { x: LAKE.x + 4.5, z: LAKE.z + 3.5 }, { x: 77, z: 4.5 }];
const TROLL = { x: 0, z: 98, hx: 0, hz: 98, hp: 3, state: 'idle', t: 0, inv: 0, cool: 0, spr: null, shadow: null, seen: false, body: null };
const ring = { x: 0, y: 0, z: 0, free: false, vy: 0 };

// ───────────────────────────── materials & small builders ─────────────────────────────
const M = {};
function lam(color, map) { return new THREE.MeshLambertMaterial({ color, map: map || null, flatShading: true }); }
function mesh(geo, mat, x, y, z, parent = scene) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }
function makeMaterials() {
  const wood = drawTex(64, 64, (g, w, h) => {
    g.fillStyle = '#a06e3c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = Math.random() < 0.5 ? '#8a5c30' : '#b27c46'; g.fillRect(Math.random() * w | 0, Math.random() * h | 0, 3 + Math.random() * 6, 1); }
    g.fillStyle = '#5e3c1c'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2);
    for (let y = 0; y < h; y += 16) g.fillRect(((y * 7) % 48) + 8, y, 2, 16);
  });
  const lattice = drawTex(32, 32, (g, w, h) => {
    g.fillStyle = '#efe2bd'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8c79b'; g.fillRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#6b4423'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
  });
  const plaster = drawTex(64, 64, (g, w, h) => {
    g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = Math.random() < 0.5 ? '#e4dccb' : '#fffaf0'; g.fillRect(Math.random() * w | 0, Math.random() * h | 0, 2 + Math.random() * 5, 2); }
  });
  const tiles = drawTex(32, 32, (g, w, h) => {
    g.fillStyle = '#7b3f2a'; g.fillRect(0, 0, w, h); g.fillStyle = '#5c2c1c';
    for (let y = 0; y < h; y += 8) { g.fillRect(0, y, w, 2); for (let x = (y / 8 % 2) * 8; x < w; x += 16) g.fillRect(x, y, 2, 8); }
  });
  // The cobble tile is a side view: cobbles on top, a stone wall below. Use the wall part.
  const cob = TILE.cobble, cw = cob ? cob.naturalWidth : 64, ch = cob ? cob.naturalHeight : 64;
  const wallC = mkCanvas(512, 128), wg = wallC.getContext('2d');
  if (cob) wg.drawImage(cob, 0, ch * 0.42, cw, ch * 0.56, 0, 0, 512, 128); else { wg.fillStyle = '#777'; wg.fillRect(0, 0, 512, 128); }
  M.tex = { wood, lattice, plaster, tiles, wall: mkTex(wallC, true) };
  M.wood = lam(0xffffff, wood); M.woodDark = lam(0x8a6a4a, wood); M.white = lam(0xffffff, plaster); M.roof = lam(0xffffff, tiles);
  M.stone = lam(0xffffff, rep(M.tex.wall, 6, 1)); M.dark = lam(0x2b1a10); M.glow = new THREE.MeshBasicMaterial({ color: 0xffd45a });
  M.sail = new THREE.MeshLambertMaterial({ map: lattice, side: THREE.DoubleSide, flatShading: true });
  // Everything natural gets the same treatment as the mill's plaster: one colour, flecked with pixels.
  const fleck = (base, a, b, n = 70) => drawTex(16, 16, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { g.fillStyle = Math.random() < 0.5 ? a : b; g.fillRect(Math.random() * w | 0, Math.random() * h | 0, 2, 1); } });
  M.tex.grass = drawTex(32, 32, (g, w, h) => { g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 150; i++) { g.fillStyle = Math.random() < 0.55 ? '#d6d6d6' : '#ffffff'; g.fillRect(Math.random() * w | 0, Math.random() * h | 0, 1, 1 + (Math.random() * 3 | 0)); } });
  M.rock = lam(0xffffff, fleck('#8f8a80', '#79746b', '#a5a096')); M.hay = lam(0xffffff, rep(fleck('#dcb84a', '#c49c34', '#efd272'), 3, 1)); M.trunk = lam(0xffffff, fleck('#6b4a2a', '#573a1e', '#7d5a36'));
  M.cypress = lam(0xffffff, rep(fleck('#2f6b3a', '#24562d', '#3d7d48'), 3, 3)); M.olive = lam(0xffffff, rep(fleck('#6f9a45', '#5c8538', '#82ad55'), 2, 2)); M.olive2 = lam(0xffffff, rep(fleck('#88ad52', '#739a42', '#9dbf66'), 2, 2));
  Models.setShared(M.tex);
  M.shadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.flag = new THREE.MeshBasicMaterial({ color: 0xd8342a, side: THREE.DoubleSide });
  M.flagOn = new THREE.MeshBasicMaterial({ color: 0x4ad13a, side: THREE.DoubleSide });
}
const shadowGeo = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
function makeShadow(r) { const m = new THREE.Mesh(shadowGeo, M.shadow); m.scale.setScalar(r); m.userData.r = r; scene.add(m); return m; }
const UP = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), gOut = {};
function placeShadow(m, x, y, z) {
  const g = groundBelow(x, z, y + STEP, gOut), k = clamp(1 - (y - g) / 14, 0.35, 1);
  m.position.set(x, g + 0.07, z); m.scale.setScalar(m.userData.r * k);
  if (gOut.ref) m.quaternion.identity();
  else { const [gx, gz] = terrainGrad(x, z, 0.8); tmpV.set(-gx, 1, -gz).normalize(); m.quaternion.setFromUnitVectors(UP, tmpV); }
}

// ───────────────────────────── world build ─────────────────────────────
function buildTerrain() {
  for (let iz = 0; iz <= NZ; iz++) for (let ix = 0; ix <= NX; ix++) HMAP[iz * (NX + 1) + ix] = rawH(X0 + ix * CX, Z0 + iz * CZ);
  const pos = new Float32Array(NX * NZ * 18), col = new Float32Array(NX * NZ * 18), uv = new Float32Array(NX * NZ * 12), c = new THREE.Color(), c2 = new THREE.Color();
  let o = 0; const jr = mulberry(77);
  const hAt = (x, z) => HMAP[Math.round((z - Z0) / CZ) * (NX + 1) + Math.round((x - X0) / CX)];
  const tri = (ax, az, bx, bz, cx, cz) => {
    const ha = hAt(ax, az), hb = hAt(bx, bz), hc = hAt(cx, cz), e1y = hb - ha, e2y = hc - ha;
    const nx = e1y * (cz - az) - (bz - az) * e2y, ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * e2y - e1y * (cx - ax);
    const nyN = ny / Math.hypot(nx, ny, nz), hm = (ha + hb + hc) / 3, mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3, j = jr() * 0.12 - 0.06;
    if (hm < 0.9) c.set(hm < -0.6 ? 0xb9a878 : 0xdccb92);
    else if (nyN < 0.74) c.set(0x9a8460);
    else if (pathDist(mx, mz) < 2.7) c.set(0xc7a970);
    else { c.set(0x70ad40).lerp(c2.set(0xcdbb58), sstep(8, 27, hm) * 0.9); if (jr() < 0.5) c.offsetHSL(0, 0, 0.03); }
    c.offsetHSL(0, 0, j);
    for (const [x, h, z] of [[ax, ha, az], [bx, hb, bz], [cx, hc, cz]]) { pos[o] = x; pos[o + 1] = h; pos[o + 2] = z; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; uv[o / 3 * 2] = x / 9; uv[o / 3 * 2 + 1] = z / 9; o += 3; }
  };
  for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
    const x0 = X0 + ix * CX, x1 = X0 + (ix + 1) * CX, z0 = Z0 + iz * CZ, z1 = Z0 + (iz + 1) * CZ;
    tri(x0, z0, x0, z1, x1, z0); tri(x1, z0, x0, z1, x1, z1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: M.tex.grass })));
}

function buildSky() {
  // Sample the painted sky for the fog and clear colours so the horizon has no seam.
  const img = TILE.sky; let top = '#9fd4f5', haze = '#dfeaf6';
  const c = mkCanvas(256, 160), g = c.getContext('2d', { willReadFrequently: true });
  if (img) {
    g.drawImage(img, 0, 0, 256, 160);
    const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
    top = px(128, 2); haze = px(128, 150);
  } else { g.fillStyle = top; g.fillRect(0, 0, 256, 160); }
  scene.background = new THREE.Color(top); scene.fog = new THREE.Fog(new THREE.Color(haze), 150, 720);
  const t = img ? new THREE.Texture(img) : mkTex(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1); t.needsUpdate = true;
  sky = new THREE.Mesh(new THREE.CylinderGeometry(1400, 1400, 1100, 40, 1, true), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.position.y = 418; sky.renderOrder = -1; scene.add(sky);                    // puts the painted horizon at sea level
  sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3f93cf, transparent: true, opacity: 0.86, map: rep(M.tex.grass, 260, 260) }));
  scene.add(sea);
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x8a7a55, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2); sun.position.set(70, 120, 60); scene.add(sun);
  const cr = mulberry(31);
  for (let i = 0; i < 20; i++) { const c = Models.buildCloud(cr); c.position.set(-750 + cr() * 1500, 100 + cr() * 80, -750 + cr() * 1500); c.scale.setScalar(7 + cr() * 10); c.userData.v = 1.5 + cr() * 2.5; scene.add(c); clouds.push(c); }
}

function makeSails(len, wid) {
  const g = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Group(); b.rotation.z = k * Math.PI / 2; g.add(b);
    mesh(new THREE.BoxGeometry(len, 0.3, 0.3), M.woodDark, len / 2, 0, 0, b);
    const cl = len - 2.2, mat = M.sail.clone(); mat.map = rep(M.tex.lattice, Math.round(cl / (wid / 3)), 3);
    mesh(new THREE.PlaneGeometry(cl, wid), mat, 2 + cl / 2, -wid / 2 - 0.1, 0, b);
  }
  mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.8, 8).rotateX(Math.PI / 2), M.woodDark, 0, 0, 0, g);
  return g;
}
function buildMill(cx, cz, o) {
  const baseY = terrainH(cx, cz), g = new THREE.Group(); g.position.set(cx, baseY, cz); scene.add(g);
  const plaster = lam(0xffffff, rep(M.tex.plaster, 6, 4));
  mesh(new THREE.CylinderGeometry(o.r1, o.r0, o.h + 3, 14, 1), plaster, 0, (o.h - 3) / 2, 0, g);
  mesh(new THREE.CylinderGeometry(o.r0 + 0.35, o.r0 + 0.8, 3.4, 14, 1), M.stone, 0, 0.5, 0, g);
  const s = o.big ? 1.5 : 1;
  mesh(new THREE.BoxGeometry(1.5 * s, 2.7 * s, 0.5), M.dark, 0, 1.35 * s, o.r0 - 0.15, g);
  for (const a of [0.9, 2.3, 4.0, 5.3]) { const r = lerp(o.r0, o.r1, 0.55) + 0.02; const wm = mesh(new THREE.BoxGeometry(0.9 * s, 1.3 * s, 0.3), M.dark, Math.cos(a) * r, o.h * 0.55, Math.sin(a) * r, g); wm.rotation.y = -a + Math.PI / 2; }
  const rh = lerp(o.r0, o.r1, o.hub / o.h);
  mesh(new THREE.CylinderGeometry(0.32, 0.32, o.plane - rh + 0.6, 6).rotateX(Math.PI / 2), M.woodDark, 0, o.hub, (o.plane + rh) / 2 - 0.3, g);
  const sails = makeSails(o.len, o.wid); sails.position.set(0, o.hub, o.plane); g.add(sails);
  if (!o.big) {
    const roofM = lam(0xffffff, rep(M.tex.tiles, 8, 2));
    mesh(new THREE.ConeGeometry(o.r1 + 0.9, o.r1 * 1.5, 14), roofM, 0, o.h + o.r1 * 0.75, 0, g);
  }
  addCyl(cx, cz, o.r0 + 0.3, o.r1, baseY - 3, baseY + o.h, false, true);
  const m = { g, sails, angle: rnd() * TAU, speed: o.speed, baseY }; mills.push(m); return m;
}
function buildGreatMill() {
  const m = buildMill(MILL.x, MILL.z, { r0: MILL.r0, r1: MILL.r1, h: MILL.h, hub: MILL.hubY - MILL.base, plane: MILL.plane, len: MILL.len, wid: MILL.wid, speed: MILL.speed, big: true });
  m.angle = MILL.angle; MILL.ref = m; const g = m.g, dy = MILL.deckY - MILL.base;
  // The "giant's" eyes.
  for (const sx of [-2.1, 2.1]) mesh(new THREE.BoxGeometry(1.5, 2, 0.4), M.glow, sx, 23.5, lerp(MILL.r0, MILL.r1, 23.5 / MILL.h) - 0.25, g);
  // Corbel + deck + cap.
  mesh(new THREE.CylinderGeometry(MILL.deckR - 0.2, MILL.r1, 2.6, 20, 1), M.woodDark, 0, dy - 2.1, 0, g);
  const deckM = lam(0xffffff, rep(M.tex.wood, 6, 6));
  mesh(new THREE.CylinderGeometry(MILL.deckR, MILL.deckR, 0.8, 24), deckM, 0, dy - 0.4, 0, g);
  mesh(new THREE.CylinderGeometry(3, 3.2, 4.6, 12), lam(0xffffff, rep(M.tex.plaster, 4, 2)), 0, dy + 2.3, 0, g);
  mesh(new THREE.ConeGeometry(4.5, 5.2, 12), lam(0xffffff, rep(M.tex.tiles, 8, 2)), 0, dy + 4.6 + 2.6, 0, g);
  mesh(new THREE.BoxGeometry(1.3, 2.4, 0.4), M.dark, 0, dy + 1.2, 3.05, g);
  addCyl(MILL.x, MILL.z, MILL.deckR, MILL.deckR, MILL.deckY - 0.8, MILL.deckY, true, true);
  addCyl(MILL.x, MILL.z, 3.2, 3.2, MILL.deckY, MILL.deckY + 10, false, true);
  // Parapet, with a gap where the stair arrives.
  const posts = 30, pr = MILL.deckR - 0.25, postG = new THREE.BoxGeometry(0.3, 1.1, 0.3), railG = new THREE.BoxGeometry(TAU * pr / posts, 0.18, 0.18);
  for (let i = 0; i < posts; i++) {
    const a = i / posts * TAU, am = a + Math.PI / posts;
    if (Math.abs(wrap(a - GATE_ANG)) > 0.26) mesh(postG, M.woodDark, Math.cos(a) * pr, dy + 0.55, Math.sin(a) * pr, g);
    if (Math.abs(wrap(am - GATE_ANG)) > 0.33) { const r = mesh(railG, M.woodDark, Math.cos(am) * pr, dy + 1.05, Math.sin(am) * pr, g); r.rotation.y = -am - Math.PI / 2; }
  }
  // Spiral stair: round wooden steps winding once round the tower. The one due south is pushed out into the sails' path.
  const n = 15, a0 = 30 * Math.PI / 180, a1 = 400 * Math.PI / 180, stepG = new THREE.CylinderGeometry(2.3, 1.9, 0.5, 10), bigG = new THREE.CylinderGeometry(3.1, 2.6, 0.5, 12);
  MILL.steps = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), a = lerp(a0, a1, t), y = lerp(31.9, MILL.deckY - 0.4, t), rT = MILL.r0 - (y - MILL.base) / MILL.h * (MILL.r0 - MILL.r1);
    const south = Math.max(0, Math.cos(a - Math.PI / 2)) ** 20, big = i === 6 || i === 10, rad = big ? 3.1 : 2.3;
    let R = lerp(rT + rad + 0.3, MILL.plane, south); R = lerp(R, MILL.deckR + 2.4, sstep(0.7, 1, t));
    const x = MILL.x + Math.cos(a) * R, z = MILL.z + Math.sin(a) * R;
    mesh(big ? bigG : stepG, M.wood, x, y - 0.25, z);
    const beamL = R - rT + 0.5, beam = mesh(new THREE.BoxGeometry(beamL, 0.35, 0.5), M.woodDark, MILL.x + Math.cos(a) * (rT + beamL / 2 - 0.4), y - 0.65, MILL.z + Math.sin(a) * (rT + beamL / 2 - 0.4));
    beam.rotation.y = -a;
    addCyl(x, z, rad, rad, y - 0.5, y, true);
    MILL.steps.push({ x, y, z, big });
  }
}

function buildProps() {
  // City gate behind the start: you have just ridden out of level 3.
  const gate = Models.buildGatehouse(); gate.position.set(0, terrainH(0, 195) - 1, 196); gate.rotation.y = Math.PI; scene.add(gate);
  // The curtain wall runs only as far as the land does, and ends in a corner tower on each side.
  const wallM = lam(0xffffff, rep(M.tex.wall, 5, 2)), merlon = new THREE.BoxGeometry(2.2, 1.6, 4.6), merM = lam(0xffffff, rep(M.tex.wall, 0.3, 0.2));
  for (const sx of [-1, 1]) {
    mesh(new THREE.BoxGeometry(60, 22, 4), wallM, sx * 44, 6, 196); for (let i = 0; i < 13; i++) mesh(merlon, merM, sx * (16.5 + i * 4.4), 17.8, 196); addCyl(sx * 10, 195.4, 4.7, 4.7, -10, 40, false);
    mesh(new THREE.CylinderGeometry(4.6, 5, 30, 10), lam(0xffffff, rep(M.tex.wall, 4, 3)), sx * 76, 8, 197); mesh(new THREE.ConeGeometry(5.6, 7, 10), lam(0xd06a50, rep(M.tex.tiles, 8, 3)), sx * 76, 26.5, 197);
  }
  addBox(-230, 230, 191.5, 200, -10, 40, false);
  // Bridge.
  const bw = 6.4, bz0 = 44, bz1 = 80, by = 6.75;
  const bm = mesh(new THREE.BoxGeometry(bw, 0.6, bz1 - bz0), lam(0xffffff, rep(M.tex.wood, 2, 10)), 0, by - 0.3, 62); bm.material.map.rotation = 0;
  for (const sx of [-1, 1]) {
    for (let z = bz0 + 1; z <= bz1 - 1; z += 4.25) mesh(new THREE.BoxGeometry(0.35, 1.5, 0.35), M.woodDark, sx * (bw / 2 - 0.2), by + 0.75, z);
    mesh(new THREE.BoxGeometry(0.22, 0.22, bz1 - bz0 - 2), M.woodDark, sx * (bw / 2 - 0.2), by + 1.5, 62);
    for (const z of [bz0 + 9, bz1 - 9]) mesh(new THREE.BoxGeometry(0.7, 9, 0.7), M.woodDark, sx * (bw / 2 - 0.4), by - 4.8, z);
  }
  addBox(-bw / 2, bw / 2, bz0, bz1, by - 0.6, by, true);
  // Ferry crossing to the east: two jetties and a raft that slides between them.
  const jm = lam(0xffffff, rep(M.tex.wood, 2, 3)), rz = FERRY_RZ;
  for (const [z0, z1] of [[rz + 8, rz + 17], [rz - 17, rz - 8]]) {
    mesh(new THREE.BoxGeometry(5, 0.6, z1 - z0), jm, FERRY_X, 6.45, (z0 + z1) / 2); addBox(FERRY_X - 2.5, FERRY_X + 2.5, z0, z1, 6.15, 6.75, true);
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.6, 9, 0.6), M.woodDark, FERRY_X + sx * 2, 2, z0 < rz ? z1 - 0.6 : z0 + 0.6);
  }
  const fm = mesh(new THREE.BoxGeometry(5, 0.7, 5), lam(0xffffff, rep(M.tex.wood, 2, 2)), FERRY_X, 6.2, rz);
  ferry = addBox(FERRY_X - 2.5, FERRY_X + 2.5, rz - 2.5, rz + 2.5, 5.85, 6.55, true);
  ferry.mesh = fm; ferry.dx = 0; ferry.dz = 0; ferry.z = rz;
  ferry.update = () => { const z = rz + Math.sin(time * 0.9) * 4.2; ferry.dz = z - ferry.z; ferry.z = z; ferry.z0 = z - 2.5; ferry.z1 = z + 2.5; fm.position.z = z; };
  movers.push(ferry);
  // Hay bales by the start: a first lesson in jumping.
  const bale = (x, z, r, h) => { const y = terrainH(x, z); mesh(new THREE.CylinderGeometry(r, r, h, 10), M.hay, x, y + h / 2, z); addCyl(x, z, r, r, y - 1, y + h, true); return y + h; };
  bale(13, 151, 1.7, 1.7); const topBale = bale(16.6, 148.5, 1.9, 3.6); bale(-24, 96, 1.7, 1.7); bale(30, 30, 1.7, 1.7); bale(33.4, 28, 1.9, 3.6);
  addItem('burrito', 16.6, 148.5, topBale + 1.5); addItem('burrito', 33.4, 28, terrainH(33.4, 28) + 5.1);
  // Outside the walls: a house, a watch tower, an abandoned cart, and the troll's sign.
  const put = (m, x, z, yaw = 0, sink = 0.2) => { m.position.set(x, terrainH(x, z) - sink, z); m.rotation.y = yaw; scene.add(m); return m; };
  put(Models.buildHouse(), -27, 178, Math.PI); addBox(-31, -23, 174.5, 181.5, -5, 40, false);
  put(Models.buildTownTower(), 30, 181, Math.PI); addBox(27.3, 32.7, 178.3, 183.7, -5, 40, false);
  put(Models.buildCart(), -12, 160, 2.2, 0.02); addCyl(-12, 160, 1.9, 1.9, -5, 40, false);
  put(Models.buildSign(SPR.troll_sign.canvas), 7.5, 113, -0.25, 0.1); addCyl(7.5, 113, 0.6, 0.6, -5, 40, false);
  // Small windmills.
  buildMill(-75, 120, { r0: 3.4, r1: 2.5, h: 12, hub: 10.2, plane: 3.7, len: 6.2, wid: 1.7, speed: 0.9 });
  buildMill(72, 0, { r0: 3.4, r1: 2.5, h: 12, hub: 10.2, plane: 3.7, len: 6.2, wid: 1.7, speed: -0.75 });
  buildMill(-80, -20, { r0: 3.6, r1: 2.6, h: 13, hub: 11, plane: 3.9, len: 6.8, wid: 1.8, speed: 0.65 });
  buildGreatMill();
  buildWest();
  // Trees and rocks.
  const coneG = new THREE.ConeGeometry(1, 1, 7), blobG = new THREE.IcosahedronGeometry(1, 0), trunkG = new THREE.CylinderGeometry(0.28, 0.4, 1, 6), rockG = new THREE.IcosahedronGeometry(1, 0);
  let placed = 0, tries = 0;
  while (placed < 150 && tries++ < 9000) {
    const x = X0 + 20 + rnd() * (X1 - X0 - 65), z = (rnd() * 2 - 1) * 205, h = terrainH(x, z);
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 6 || Math.hypot(x - QUARRY.x, z - QUARRY.z) < 41 || Math.hypot(x - HAMLET.x, z - HAMLET.z) < 24) continue;
    if (h < 3 || islandD(x, z) > 160 || Math.abs(z - RIVER(x)) < 19 || pathDist(x, z) < 6.5 || z > 184) continue;
    if (HILLS.some(([cx, cz, , pr]) => Math.hypot(x - cx, z - cz) < pr + 6) || Math.hypot(x, z - 165) < 15 || Math.hypot(x - TROLL.hx, z - TROLL.hz) < 17) continue;
    const [gx, gz] = terrainGrad(x, z); if (Math.hypot(gx, gz) > 0.5) continue;
    const kind = rnd();
    if (kind < 0.42) { const s = 0.8 + rnd() * 0.5, th = 7 + rnd() * 4; const m = mesh(coneG, M.cypress, x, h + th * s / 2 + 0.6, z); m.scale.set(1.25 * s, th * s, 1.25 * s); mesh(trunkG, M.trunk, x, h + 0.4, z).scale.set(1, 1.6, 1); addCyl(x, z, 0.7, 0.7, h - 2, h + 6, false); }
    else if (kind < 0.8) { const s = 1 + rnd() * 0.6; mesh(trunkG, M.trunk, x, h + 1.2 * s, z).scale.set(1.2 * s, 2.6 * s, 1.2 * s); const b = mesh(blobG, rnd() < 0.5 ? M.olive : M.olive2, x, h + 3.6 * s, z); b.scale.set(2.3 * s, 1.8 * s, 2.3 * s); b.rotation.y = rnd() * 3;
      mesh(blobG, M.olive, x + 1.1 * s, h + 3 * s, z + 0.5 * s).scale.setScalar(1.3 * s); addCyl(x, z, 0.6, 0.6, h - 2, h + 5, false); }
    else { const s = 0.9 + rnd() * 1.4; const r = mesh(rockG, M.rock, x, h + s * 0.35, z); r.scale.set(s * 1.2, s, s * 1.1); r.rotation.set(rnd(), rnd() * 3, rnd()); addCyl(x, z, s * 0.9, s * 0.9, h - 2, h + s * 1.05, true); }
    placed++;
  }
}

// ───────────────────────────── the western lobe ─────────────────────────────
function fence(pts) {
  const postG = new THREE.BoxGeometry(0.22, 1.3, 0.22);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 3.2));
    for (let k = 0; k <= n; k++) {
      const x = lerp(ax, bx, k / n), z = lerp(az, bz, k / n), y = terrainH(x, z); mesh(postG, M.woodDark, x, y + 0.6, z); addCyl(x, z, 0.9, 0.9, y - 2, y + 1.3, false);
      if (k === n) break;
      const x2 = lerp(ax, bx, (k + 1) / n), z2 = lerp(az, bz, (k + 1) / n), y2 = terrainH(x2, z2), l = Math.hypot(x2 - x, z2 - z);
      addCyl((x + x2) / 2, (z + z2) / 2, 0.9, 0.9, y - 2, (y + y2) / 2 + 1.3, false);        // low enough to jump
      for (const hh of [0.5, 1.0]) { const r = mesh(new THREE.BoxGeometry(l + 0.1, 0.12, 0.1), M.woodDark, (x + x2) / 2, (y + y2) / 2 + hh, (z + z2) / 2); r.rotation.y = Math.atan2(-(z2 - z), x2 - x); r.rotation.z = Math.atan2(y2 - y, l); }
    }
  }
}
function signpost(x, z, boards) { const m = Models.buildSignpost(boards); m.position.set(x, terrainH(x, z) - 0.1, z); scene.add(m); addCyl(x, z, 0.5, 0.5, -5, 40, false); }
function buildWest() {
  const put = (m, x, z, yaw = 0, sink = 0.2) => { m.position.set(x, terrainH(x, z) - sink, z); m.rotation.y = yaw; scene.add(m); return m; };
  // Stepping stones from the south shore to the islet. The mossy ones sink under a hog.
  const stoneG = new THREE.CylinderGeometry(2.2, 1.7, 9, 8), mossG = new THREE.CylinderGeometry(2.25, 2.25, 0.25, 8), moss = lam(0x5f8f3a);
  LAKE.stones = [[0, 46, 0], [-2.6, 39.6, 0], [2.2, 33.2, 1], [-2.2, 26.8, 0], [2.4, 20.6, 1], [-0.4, 14.9, 0]].map(([dx, dz, sinks]) => {
    const x = LAKE.x + dx, z = LAKE.z + dz, m = mesh(stoneG, M.rock, x, LAKE.y - 4.5, z), s = addCyl(x, z, 2.2, 2.2, LAKE.y - 9, LAKE.y, true);
    if (sinks) {
      mesh(mossG, moss, 0, 4.45, 0, m); s.dx = 0; s.dz = 0;
      s.update = dt => { const on = P.grounded && P.ground === s; s.y1 = clamp(s.y1 + (on ? -1.7 : 1.1) * dt, -1.6, LAKE.y); s.y0 = s.y1 - 9; m.position.y = s.y1 - 4.5; };
      movers.push(s);
    }
    return { x, z, sinks, s };
  });
  // North side: what is left of a plank bridge. The middle span has come adrift.
  LAKE.planks = [-15.5, -23.5, -31.5, -39.5, -46.6].map((dz, i) => {
    const z = LAKE.z + dz, m = mesh(new THREE.BoxGeometry(4.4, 0.5, 5), lam(0xffffff, rep(M.tex.wood, 2, 2)), LAKE.x, LAKE.y - 0.25, z), s = addBox(LAKE.x - 2.2, LAKE.x + 2.2, z - 2.5, z + 2.5, LAKE.y - 0.5, LAKE.y, true);
    if (i === 2) { s.dx = 0; s.dz = 0; s.cx = LAKE.x; s.update = () => { const x = LAKE.x + Math.sin(time * 0.8) * 5.5; s.dx = x - s.cx; s.cx = x; s.x0 = x - 2.2; s.x1 = x + 2.2; m.position.x = x; }; movers.push(s); }
    else for (const sx of [1, -1]) mesh(new THREE.BoxGeometry(0.4, 9, 0.4), M.woodDark, sx * 1.8, -4.4, 0, m);
    return { z, s };
  });
  // The islet's ruined mill.
  put(Models.buildRuinedMill(), LAKE.x - 3, LAKE.z - 3, 0.4, 0.1); addCyl(LAKE.x - 3, LAKE.z - 3, 3.7, 3.0, LAKE.y - 3, LAKE.y + 7, false, true);
  // The hamlet.
  put(Models.buildHouse(), HAMLET.x - 14, HAMLET.z + 9, Math.PI); addBox(HAMLET.x - 18, HAMLET.x - 10, HAMLET.z + 5.5, HAMLET.z + 12.5, -5, 40, false);
  put(Models.buildHouse(), HAMLET.x + 13, HAMLET.z + 11, Math.PI); addBox(HAMLET.x + 9, HAMLET.x + 17, HAMLET.z + 7.5, HAMLET.z + 14.5, -5, 40, false);
  put(Models.buildTownTower(), HAMLET.x - 1, HAMLET.z + 19, Math.PI); addBox(HAMLET.x - 3.7, HAMLET.x + 1.7, HAMLET.z + 16.3, HAMLET.z + 21.7, -5, 40, false);
  put(Models.buildWell(), HAMLET.x, HAMLET.z, 0.3, 0.05); { const y = terrainH(HAMLET.x, HAMLET.z); addCyl(HAMLET.x, HAMLET.z, 1.75, 1.75, y - 2, y + 1.3, true); }
  put(Models.buildCart(), HAMLET.x + 9, HAMLET.z - 6, -0.6, 0.02); addCyl(HAMLET.x + 9, HAMLET.z - 6, 1.9, 1.9, -5, 40, false);
  fence([[HAMLET.x - 24, HAMLET.z - 2], [HAMLET.x - 24, HAMLET.z - 14], [HAMLET.x - 11, HAMLET.z - 14], [HAMLET.x - 11, HAMLET.z - 2]]);
  for (const [dx, dz, r, h] of [[-20, -10, 1.7, 1.7], [-16, -6, 1.7, 1.7], [-17.5, -10.5, 1.9, 3.5]]) { const x = HAMLET.x + dx, z = HAMLET.z + dz, y = terrainH(x, z); mesh(new THREE.CylinderGeometry(r, r, h, 10), M.hay, x, y + h / 2, z); addCyl(x, z, r, r, y - 1, y + h, true); }
  fence([[-5.5, 186], [-5.5, 172]]); fence([[5.5, 186], [5.5, 172]]);
  // The quarry: a heart at the top for anyone who can dodge the rocks, and the pile they roll from.
  const [px, pz] = quarryAt(1, -4.5);
  for (const [dx, dy, dz, sc] of [[0, 1.2, 0, 1.5], [1.9, 0.9, 1.2, 1.2], [-1.4, 1.0, 1.6, 1.3], [0.4, 3.0, 0.8, 1.2]]) { const b = mesh(new THREE.IcosahedronGeometry(1, 1), M.rock, px + dx, QUARRY.top + dy, pz + dz); b.scale.setScalar(sc); b.rotation.set(dx, dz, dy); }
  addCyl(px, pz, 3.2, 3.2, QUARRY.top - 2, QUARRY.top + 4, false);
  heart = { x: QUARRY.x - 1, y: QUARRY.top + 2, z: QUARRY.z - 1, taken: false, m: Models.buildHeart() }; scene.add(heart.m);
  for (const [dx, dz, w, h, d] of [[5, -5, 2.4, 1.6, 2], [6.5, -2.6, 1.8, 1.2, 1.8], [-6, 4, 2.6, 1.4, 2.2]]) { const x = QUARRY.x + dx, z = QUARRY.z + dz; mesh(new THREE.BoxGeometry(w, h, d), M.rock, x, QUARRY.top + h / 2, z); addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, QUARRY.top - 1, QUARRY.top + h, true); }
  // Finger-posts at the junctions.
  signpost(-5, 134, [{ text: 'LITTLE MILL - LAKE', dx: -1, dz: -0.12 }, { text: 'BRIDGE - GREAT MILL', dx: 0, dz: -1 }, { text: 'RAFT', dx: 1, dz: -0.35 }]);
  signpost(-140, 129, [{ text: 'HAMLET - LAKE', dx: -1, dz: 0.1 }, { text: 'CITY GATE', dx: 1, dz: 0.2 }]);
  signpost(LAKE.x + 6, LAKE.z + 60, [{ text: 'RUINED MILL', dx: 0, dz: -1 }, { text: 'HAMLET', dx: 1, dz: 0.5 }]);
  signpost(LAKE.x + 6, -3, [{ text: 'QUARRY - MIND THE ROCKS', dx: -1, dz: -0.75 }, { text: 'GREAT MILL', dx: 1, dz: -0.1 }, { text: 'LAKE', dx: 0, dz: 1 }]);
  signpost(5, 38, [{ text: 'GREAT MILL', dx: 0, dz: -1 }, { text: 'QUARRY - LAKE', dx: -1, dz: -0.3 }, { text: 'CITY GATE', dx: 0, dz: 1 }]);
}
// Wild flowers and tufts, instanced: thousands of them cost two draw calls.
function buildFlora() {
  const fr = mulberry(404), spots = [];
  for (let i = 0; i < 12000 && spots.length < 1100; i++) {
    const x = X0 + 15 + fr() * (X1 - X0 - 55), z = Z0 + 20 + fr() * (Z1 - Z0 - 55), h = terrainH(x, z);
    if (h < 3.2 || islandD(x, z) > 163 || pathDist(x, z) < 3.2 || Math.abs(z - RIVER(x)) < 16 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 3 || Math.hypot(x - QUARRY.x, z - QUARRY.z) < 36) continue;
    const [gx, gz] = terrainGrad(x, z); if (Math.hypot(gx, gz) < 0.6) spots.push([x, z]);
  }
  const d = new THREE.Object3D(), col = new THREE.Color(), nF = Math.floor(spots.length * 0.4), per = 4;
  const flowers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshLambertMaterial({ flatShading: true }), nF * per);
  const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.26, 0.8, 4), lam(0x4f8f36), spots.length - nF);
  const pal = [0xffffff, 0xffd84a, 0xe8483a, 0xb07adf, 0xff9ac0];
  spots.forEach(([x, z], i) => {
    if (i < nF) { const c = pal[(fr() * pal.length) | 0]; for (let k = 0; k < per; k++) { const fx = x + (fr() - 0.5) * 2.4, fz = z + (fr() - 0.5) * 2.4; d.position.set(fx, terrainH(fx, fz) + 0.22, fz); d.rotation.set(0, fr() * 3, 0); d.scale.setScalar(0.8 + fr() * 0.6); d.updateMatrix(); flowers.setMatrixAt(i * per + k, d.matrix); flowers.setColorAt(i * per + k, col.set(c)); } }
    else { const sc = 0.8 + fr() * 0.8; d.position.set(x, terrainH(x, z) + 0.3 * sc, z); d.rotation.set(0, fr() * 3, 0); d.scale.setScalar(sc); d.updateMatrix(); tufts.setMatrixAt(i - nF, d.matrix); }
  });
  scene.add(flowers, tufts);
}

// ───────────────────────────── things to eat, things to fear ─────────────────────────────
function addItem(type, x, z, y) {
  const s = Models.buildFood(type); scene.add(s); const it = { type, x, z, y: y ?? terrainH(x, z) + 1.5, s, taken: false, ph: rnd() * TAU, drop: 0 };
  s.position.set(x, it.y, z); items.push(it); foodTotal++; return it;
}
const line = (type, x0, z0, x1, z1, n, yf) => { for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1), x = lerp(x0, x1, t), z = lerp(z0, z1, t); addItem(type, x, z, yf ? yf(x, z) : undefined); } };
const circle = (type, cx, cz, r, n, a0 = 0) => { for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU; addItem(type, cx + Math.cos(a) * r, cz + Math.sin(a) * r); } };
function buildItems() {
  line('taco', 0, 156, 0, 122, 6);
  line('burger', -14, 142, -58, 128, 5);
  circle('taco', -75, 120, 6.2, 6, 0.4);
  line('taco', 0, 76, 0, 48, 5, () => 6.75 + 1.5);
  line('burger', 22, 116, 60, 96, 4);
  addItem('burrito', FERRY_X, FERRY_RZ, 9.3);
  line('taco', 0, 34, 0, -14, 6);
  circle('taco', 72, 0, 6.2, 6, 1.1); circle('taco', -80, -20, 6.3, 6, 2);
  addItem('burrito', 72, -6.5); addItem('burrito', -80, -26.8);
  line('burger', 0, -28, 0, -70, 6);
  line('taco', 40, -30, 56, -8, 4); line('taco', -30, 0, -62, -14, 4);
  MILL.steps.forEach((s, i) => { if (s.big) addItem('burrito', s.x, s.z, s.y + 1.5); else if (i % 2 === 1) addItem('taco', s.x, s.z, s.y + 1.5); });
  for (const a of [0.9, 2.5, 4.1, 5.5]) addItem('burger', MILL.x + Math.cos(a) * 7, MILL.z + Math.sin(a) * 7, MILL.deckY + 1.5);
  // West.
  line('taco', -84, 127, -134, 134, 5); line('burger', -150, 135, -196, 139, 4);
  circle('taco', HAMLET.x, HAMLET.z, 5.5, 6); addItem('burrito', HAMLET.x - 17.5, HAMLET.z - 10.5, terrainH(HAMLET.x - 17.5, HAMLET.z - 10.5) + 5);
  line('taco', HAMLET.x - 12, HAMLET.z - 9, LAKE.x + 4, LAKE.z + 60, 4);
  LAKE.stones.forEach(st => addItem(st.sinks ? 'burger' : 'taco', st.x, st.z, LAKE.y + 1.6));
  addItem('burrito', LAKE.x + 6, LAKE.z - 6, LAKE.y + 1.5); for (const a of [0.4, 2.0, 3.6, 5.2]) addItem('burger', LAKE.x + Math.cos(a) * 8, LAKE.z + Math.sin(a) * 8, LAKE.y + 1.5);
  LAKE.planks.forEach((pl, i) => { if (i !== 2) addItem('taco', LAKE.x, pl.z, LAKE.y + 1.6); });
  line('taco', LAKE.x, LAKE.z - 60, LAKE.x, -2, 4); line('burger', LAKE.x - 8, -12, -297, -33, 4); line('taco', LAKE.x + 14, -8, -100, -19, 7);
  for (let u = 0.08; u < 0.95; u += 0.085) { const [x, z] = quarryAt(u, u * 30 % 2 < 1 ? 1.6 : -1.6); addItem(u > 0.45 && u < 0.55 ? 'burrito' : 'burger', x, z); }
}
function buildCreatures() {
  // [centre x, z, orbit radius, speed, fixed height or null]
  for (const [cx, cz, r, spd, absY] of [[-36, 136, 9, 5, null], [30, 126, 8, -5.5, null], [0, 16, 11, 6, null], [-42, -6, 9, -5, null],
    [42, -44, 11, 6, null], [-26, -58, 9, -6, null], [MILL.x, MILL.z, 14.5, 6.5, 50],
    [HAMLET.x + 16, HAMLET.z - 16, 9, 5, null], [LAKE.x, LAKE.z + 30, 7, -4.5, LAKE.y + 2.3], [LAKE.x - 8, -4, 10, 6, null], [-212, -12, 9, -5.5, null], [-150, 128, 9, 5.5, null]]) {
    const m = Models.buildCrow(); scene.add(m.g); const s = m.g, c = { m, cx, cz, r, spd, absY, ang: rnd() * TAU, alive: true, s, x: cx, y: 0, z: cz, shadow: makeShadow(0.8), back: 0 };
    crows.push(c);
  }
  // Tile Troll at the bridge.
  TROLL.m = Models.buildTroll(); scene.add(TROLL.m.g); TROLL.shadow = makeShadow(2.2);
  TROLL.loot = [0, 1, 2].map(() => { const it = addItem('burrito', TROLL.x, TROLL.z); it.drop = Infinity; return it; });   // in his pockets until he falls
  // Gollum Man and the Ring he should not have.
  GOL.m = Models.buildGollum(); scene.add(GOL.m.g); GOL.shadow = makeShadow(1.0); GOL.hx = 0; GOL.hz = 1;
  ringModel = Models.buildRing(); scene.add(ringModel);
  placeGollumAtPerch();
  // Friendly faces.
  const npc = (id, spr, name, x, z, lines, look) => { const m = spr === 'wizard' ? Models.buildWizard() : Models.buildMiller(look); scene.add(m.g); const y = terrainH(x, z); m.g.position.set(x, y - 0.05, z); m.yaw = Math.atan2(-x, 166 - z); makeShadow(1.1).position.set(x, y + 0.07, z); addCyl(x, z, 0.8, 0.8, y - 2, y + 4, false); npcs.push({ id, spr, name, x, y, z, lines, i: 0, m, yaw0: m.yaw }); };
  npc('wizard', 'wizard', 'The Wizard', 6.5, 158, [
    ['Still here, noble Hogman? The Gollum Man was last seen skulking by the little mill to the west. Beyond it lie the hamlet and the lake.'],
    ['Mind the bridge. A Tile Troll has taken a liking to it. A good hard CHARGE is the only language he respects.'],
    ['There is a raft crossing to the east, if trolls are not to your taste.'],
  ]);
  npc('oldman', 'oldman', 'The Old Miller', -9, -82, [
    ['That bug-eyed wretch shot up my stairs like a rat up a drainpipe. Round the back of the mill and up, that is the way.'],
    ['Mind the sails on the south side, lad. Time your jump. They have flattened better knights than you.'],
    ['Some fool with a lance called her a giant once. She has never forgiven it.'],
  ]);
  npc('other', 'oldman', 'The Other Miller', HAMLET.x + 5, HAMLET.z - 5, [
    ['Crossing the lake? Mind the mossy stones, friend. They sink. Do not dawdle on the mossy ones.'],
    ['Rocks come loose up at the quarry all day long. They say there is something shiny at the top. I say there are rocks. A good CHARGE breaks them, mind.'],
    ['Folk say I look like the miller up the hill. I do not see it myself.'],
  ], { coat: ['#5a7a3a', '#4a6830', '#6c8c48'], cap: 0xd9b84a, brim: 0xd9b84a });
  // Checkpoint flags.
  for (const [x, z] of [[0, 150], [0, 36], [0, -79], [HAMLET.x - 2, HAMLET.z - 12], [LAKE.x - 8, LAKE.z + 5], [LAKE.x - 4, LAKE.z - 60], [-298, -30]]) {
    const y = terrainH(x + 4, z); mesh(new THREE.CylinderGeometry(0.1, 0.1, 4, 5), M.woodDark, x + 4, y + 2, z);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1.8, -0.5, 0, 0, -1, 0]), 3));
    const f = new THREE.Mesh(g, M.flag); f.position.set(x + 4, y + 4, z); scene.add(f); flags.push({ x: x + 4, y, z, f, on: false });
  }
}
function placeGollumAtPerch() {
  const p = PERCHES[GOL.perch]; GOL.x = p.x; GOL.z = p.z; GOL.y = terrainH(p.x, p.z); GOL.state = 'perch'; GOL.barked = false; GOL.frame = 'gol_idle';
}

// ───────────────────────────── particles ─────────────────────────────
let puffTex;
function initParticles() {
  puffTex = drawTex(16, 16, g => { g.fillStyle = '#fff'; g.beginPath(); g.arc(8, 8, 7, 0, TAU); g.fill(); }, false);
  for (let i = 0; i < 70; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false })); s.visible = false; scene.add(s); parts.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, g: 0 }); }
}
let partI = 0;
function puff(x, y, z, color, n = 6, speed = 3, size = 0.6, life = 0.5, up = 1.5, grav = 0) {
  for (let i = 0; i < n; i++) {
    const p = parts[partI++ % parts.length], a = Math.random() * TAU, sp = speed * (0.4 + Math.random() * 0.6);
    p.s.position.set(x, y, z); p.s.material.color.set(color); p.s.visible = true; p.life = p.max = life * (0.7 + Math.random() * 0.6);
    p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = up * (0.3 + Math.random()); p.size = size * (0.6 + Math.random() * 0.7); p.grow = size; p.g = grav;
  }
}
function updateParticles(dt) {
  for (const p of parts) if (p.life > 0) {
    p.life -= dt; if (p.life <= 0) { p.s.visible = false; continue; }
    p.vy -= p.g * dt; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    const k = p.life / p.max; p.s.material.opacity = k * 0.9; p.s.scale.setScalar(p.size + p.grow * (1 - k));
  }
}

// ───────────────────────────── HUD, barks, dialogue ─────────────────────────────
const portrait = {};
function pic(name) { return portrait[name] || (portrait[name] = SPR[name].canvas.toDataURL()); }
function updateHUD() {
  const hs = $('hearts'); while (hs.children.length < P.maxHp) hs.appendChild(document.createElement('i'));
  [...hs.children].forEach((h, i) => h.classList.toggle('off', i >= P.hp));
  $('food').textContent = `${foodGot}/${foodTotal}`; $('ringicon').hidden = !hasRing;
}
function setObjective(t) { $('objective').textContent = t; }
let toastT = 0, barkT = 0;
function toast(t, secs = 2.2) { $('toast').textContent = t; $('toast').classList.add('on'); toastT = secs; }
function bark(spr, text, secs = 4.2) { const b = $('bark'); b.hidden = false; b.querySelector('img').src = pic(spr); b.querySelector('p').textContent = text; barkT = secs; }
const dlg = { q: [], i: 0, shown: 0, done: null, full: '' };
function say(lines, done) { // lines: [sprite, name, text]
  dlg.q = lines; dlg.i = 0; dlg.done = done || null; state = 'dialog'; $('dialog').hidden = false; $('prompt').hidden = true; showLine();
}
function showLine() { const [spr, name, text] = dlg.q[dlg.i]; $('dlg-portrait').src = pic(spr); $('dlg-name').textContent = name; dlg.full = text; dlg.shown = 0; $('dlg-text').textContent = ''; }
function advanceDialog() {
  if (dlg.shown < dlg.full.length) { dlg.shown = dlg.full.length; $('dlg-text').textContent = dlg.full; return; }
  if (++dlg.i < dlg.q.length) return showLine();
  $('dialog').hidden = true; state = 'play'; const d = dlg.done; dlg.done = null; if (d) d();
}
function tickDialog(dt) {
  if (dlg.shown < dlg.full.length) { const before = dlg.shown | 0; dlg.shown = Math.min(dlg.full.length, dlg.shown + dt * 55); if ((dlg.shown | 0) !== before) { $('dlg-text').textContent = dlg.full.slice(0, dlg.shown | 0); if ((dlg.shown | 0) % 3 === 0) Sound.talk(); } }
  if (HIT.Enter || HIT.KeyE || HIT.Space) advanceDialog();
}
function fadeThen(fn) { P.frozen = true; $('fade').style.opacity = 1; setTimeout(() => { fn(); P.frozen = false; $('fade').style.opacity = 0; }, 280); }

// ───────────────────────────── player ─────────────────────────────
function hurt(n, kx = 0, kz = 0) {
  if (P.inv > 0 || P.dead > 0 || P.frozen || state !== 'play') return false;
  P.hp -= n; P.inv = 1.6; P.stun = 0.35; P.charge = 0;
  const k = Math.hypot(kx, kz); if (k > 0.001) { P.vx = kx / k * 11; P.vz = kz / k * 11; }
  P.vy = 9; P.grounded = false; P.ground = null; P.coyote = 0; cam.shake = 0.35; Sound.hit(); updateHUD();
  puff(P.x, P.y + 1.5, P.z, 0xffffff, 6, 5, 0.5, 0.35);
  if (P.hp <= 0) { P.dead = 2.4; deaths++; Sound.die(); }
  return true;
}
function respawn(at, full) {
  P.x = at.x; P.z = at.z; P.y = Math.max(at.y ?? -99, groundBelow(at.x, at.z, (at.y ?? 999) + 1)); P.vx = P.vy = P.vz = 0; P.charge = 0; P.stun = 0; P.dead = 0; P.inv = 2;
  if (full) { P.hp = P.maxHp; P.fuel = Math.max(P.fuel, 0.4); }
  cam.tgt.set(P.x, P.y + 2.4, P.z); updateHUD();
}
function dunk() {
  if (P.frozen) return; Sound.splash(); puff(P.x, 0.3, P.z, 0xcfeaff, 14, 5, 0.6, 0.6, 6, 14);
  P.hp -= 1; deaths += P.hp <= 0 ? 1 : 0; updateHUD();
  const dead = P.hp <= 0; fadeThen(() => respawn(dead ? checkpoint : lastSafe, dead));
}
function stepPlayer(dt) {
  if (P.frozen) return;
  P.inv = Math.max(0, P.inv - dt); P.boostT = Math.max(0, P.boostT - dt); P.squash = Math.max(0, P.squash - dt * 4); P.jumpBuf -= dt;
  if (P.dead > 0) {
    P.dead -= dt; P.vx *= 0.9; P.vz *= 0.9; P.vy -= GRAV * dt; P.y += P.vy * dt; const g = groundBelow(P.x, P.z, P.y + 1); if (P.y < g) { P.y = g; P.vy = 0; }
    if (P.dead <= 0) { P.dead = 0.001; fadeThen(() => respawn(checkpoint, true)); }
    return;
  }
  // Carried by a moving floor.
  if (P.grounded && P.ground && P.ground.dz !== undefined) { P.x += P.ground.dx; P.z += P.ground.dz; }

  // Steering, relative to the camera.
  let ix = input.x, iy = input.y; if (P.stun > 0) { P.stun -= dt; ix = iy = 0; }
  const fwx = -Math.sin(cam.yaw), fwz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  const wx = rx * ix + fwx * iy, wz = rz * ix + fwz * iy, wm = Math.hypot(wx, wz);
  if (P.wantCharge) {
    P.wantCharge = false;
    if (P.charge <= 0 && P.stun <= 0) {
      if (P.fuel >= 0.2) { P.fuel -= 0.22; P.charge = 0.5; if (wm > 0.2) { P.dirX = wx / wm; P.dirZ = wz / wm; } P.vy = Math.max(P.vy, 2.5); Sound.charge(); cam.shake = 0.15; }
      else toast('Out of gas — eat something!', 1.4);
    }
  }
  if (P.charge > 0) {
    P.charge -= dt;
    if (wm > 0.2) { const a = Math.atan2(P.dirZ, P.dirX), b = Math.atan2(wz, wx), na = a + clamp(wrap(b - a), -2.4 * dt, 2.4 * dt); P.dirX = Math.cos(na); P.dirZ = Math.sin(na); }
    P.vx = P.dirX * CHARGE_SPEED; P.vz = P.dirZ * CHARGE_SPEED; if (P.vy < 0) P.vy *= 0.8;
    if (Math.random() < dt * 40) puff(P.x - P.dirX * 1.6, P.y + 1 + Math.random(), P.z - P.dirZ * 1.6, 0x8fdc2a, 1, 2, 0.8, 0.45, 1);
  } else {
    const acc = (P.grounded ? (wm > 0.05 ? 62 : 50) : 26) * dt, tx = wx * RUN, tz = wz * RUN, dx = tx - P.vx, dz = tz - P.vz, d = Math.hypot(dx, dz);
    if (d <= acc) { P.vx = tx; P.vz = tz; } else { P.vx += dx / d * acc; P.vz += dz / d * acc; }
    if (wm > 0.2) { P.dirX = wx / wm; P.dirZ = wz / wm; }
  }
  // Steep ground: you slide, and you cannot run up it.
  P.sliding = false;
  if (P.grounded && !P.ground) {
    const [gx, gz] = terrainGrad(P.x, P.z), sl = Math.hypot(gx, gz);
    if (sl > 1.05) { P.sliding = true; P.vx -= gx / sl * 34 * dt; P.vz -= gz / sl * 34 * dt; const up = (P.vx * gx + P.vz * gz) / sl; if (up > 0) { P.vx -= gx / sl * up; P.vz -= gz / sl * up; } }
  }
  // Jumping. A second press in mid-air spends gas on a boost.
  if (P.jumpBuf > 0) {
    if ((P.grounded || P.coyote > 0) && !P.sliding) { P.vy = JUMP; P.grounded = false; P.ground = null; P.coyote = 0; P.jumpBuf = 0; P.squash = -1; Sound.jump(); }
    else if (!P.grounded && P.coyote <= 0 && P.canBoost && P.fuel >= 0.2) { P.vy = 17.5; P.fuel -= 0.2; P.canBoost = false; P.boostT = 0.4; P.jumpBuf = 0; Sound.boost(); puff(P.x, P.y, P.z, 0x8fdc2a, 8, 3, 0.9, 0.5, -2); }
  }
  if (!input.jumpHeld && P.vy > 5 && P.boostT <= 0) P.vy -= 60 * dt;

  // Horizontal move, then push out of anything solid.
  let nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
  for (const s of solids) {
    if (P.y >= s.y1 - STEP || P.y + PH <= s.y0) continue;
    if (s.kind === 'cyl') {
      const r = cylR(s, P.y) + PR, dx = nx - s.x, dz = nz - s.z, d2 = dx * dx + dz * dz;
      if (d2 < r * r) { const d = Math.sqrt(d2) || 0.001; nx = s.x + dx / d * r; nz = s.z + dz / d * r; }
    } else if (nx > s.x0 - PR && nx < s.x1 + PR && nz > s.z0 - PR && nz < s.z1 + PR) {
      const a = nx - (s.x0 - PR), b = (s.x1 + PR) - nx, c = nz - (s.z0 - PR), d = (s.z1 + PR) - nz, m = Math.min(a, b, c, d);
      if (m === a) nx = s.x0 - PR; else if (m === b) nx = s.x1 + PR; else if (m === c) nz = s.z0 - PR; else nz = s.z1 + PR;
    }
  }
  // The deck's parapet keeps a charging hog from flying off the top of the mill.
  if (P.y > MILL.deckY - 0.45 && P.y < MILL.deckY + 0.85) {
    const dx = nx - MILL.x, dz = nz - MILL.z, r = Math.hypot(dx, dz), pr = Math.hypot(P.x - MILL.x, P.z - MILL.z), lim = MILL.deckR - PR;
    if (Math.abs(wrap(Math.atan2(dz, dx) - GATE_ANG)) > 0.24) {
      if (pr <= lim + 0.05 && r > lim) { nx = MILL.x + dx / r * lim; nz = MILL.z + dz / r * lim; }
      else if (pr >= MILL.deckR + 0.2 && r < MILL.deckR + 0.2) { nx = MILL.x + dx / r * (MILL.deckR + 0.2); nz = MILL.z + dz / r * (MILL.deckR + 0.2); }
    }
  }
  // Troll is a wall while he stands.
  if (TROLL.state !== 'dead' && P.y < TROLL.y + 5) { const dx = nx - TROLL.x, dz = nz - TROLL.z, d = Math.hypot(dx, dz) || 0.001; if (d < 2.2) { nx = TROLL.x + dx / d * 2.2; nz = TROLL.z + dz / d * 2.2; } }
  // Terrain taller than a step is a wall too.
  if (terrainH(nx, nz) > P.y + STEP) { if (terrainH(nx, P.z) <= P.y + STEP) { nz = P.z; P.vz = 0; } else if (terrainH(P.x, nz) <= P.y + STEP) { nx = P.x; P.vx = 0; } else { nx = P.x; nz = P.z; P.vx = P.vz = 0; } }

  // Vertical.
  P.vy = Math.max(-46, P.vy - GRAV * dt);
  let ny = P.y + P.vy * dt;
  if (P.vy > 0) for (const s of solids) if (s.y0 >= P.y + PH - 0.01 && ny + PH > s.y0 && inFoot(s, nx, nz, PR * 0.5)) { ny = s.y0 - PH; P.vy = 0; }
  const g = groundBelow(nx, nz, P.y + STEP, gOut), was = P.grounded;
  if (ny <= g || (was && P.vy <= 0 && ny - g < 0.5)) {
    if (!was && P.vy < -6) { P.squash = 1; Sound.land(); puff(nx, g + 0.2, nz, 0xe6dcc0, 5, 3, 0.5, 0.35, 0.6); }
    ny = g; P.vy = 0; P.grounded = true; P.ground = gOut.ref; P.coyote = 0.1; P.canBoost = true;
  } else { P.grounded = false; P.ground = null; P.coyote -= dt; }
  P.x = nx; P.y = ny; P.z = nz;

  const moving = Math.hypot(P.vx, P.vz) > 1.5; P.anim += dt * (moving ? 1 : 0.3);
  const beat = Math.floor(P.anim * 13 / Math.PI); if (beat !== P.hoof) { P.hoof = beat; if (moving && P.grounded) Sound.hoof(); }
  if (P.grounded && moving && P.charge <= 0 && Math.random() < dt * 9) puff(P.x - P.dirX * 1.2, P.y + 0.2, P.z - P.dirZ * 1.2, 0xe6dcc0, 1, 1, 0.4, 0.35, 0.8);
  // Remember the last trustworthy patch of ground, for fishing him out of the river.
  P.safeT -= dt;
  if (P.grounded && P.safeT <= 0 && !P.sliding && P.y > 2.5 && (!P.ground || P.ground.dz === undefined)) { P.safeT = 0.4; const [gx, gz] = P.ground ? [0, 0] : terrainGrad(P.x, P.z); if (Math.hypot(gx, gz) < 0.55) lastSafe = { x: P.x, y: P.y, z: P.z }; }
  if (P.y < -0.4) dunk();
  P.fuel = Math.min(1, P.fuel + (P.fuel < 0.25 ? 0.035 * dt : 0));
}

// ───────────────────────────── the Great Mill's sails ─────────────────────────────
function stepSails(dt) {
  for (const m of mills) { m.angle += m.speed * dt; m.sails.rotation.z = m.angle; }
  if (state !== 'play' || P.dead > 0 || P.inv > 0) return;
  const lx = P.x - MILL.x, ly = P.y + 1.5 - MILL.hubY, lz = P.z - (MILL.z + MILL.plane);
  if (Math.abs(lz) > 1.1 || lx * lx + ly * ly > (MILL.len + 1) ** 2) return;
  for (let k = 0; k < 4; k++) {
    const a = MILL.ref.angle + k * Math.PI / 2, dx = Math.cos(a), dy = Math.sin(a), along = lx * dx + ly * dy, perp = -lx * dy + ly * dx;
    if (along > 1.5 && along < MILL.len + 0.3 && perp > -MILL.wid - 0.45 && perp < 0.45) {
      const tx = -dy * MILL.speed * along;                      // the blade's sideways speed where it caught him
      if (hurt(1, tx || 0.01, 0.9)) { P.vx = clamp(tx * 1.6, -14, 14); P.vz = 7; P.vy = 10; Sound.whoosh(); bark('oldman', 'THWACK! Told you to mind the sails.', 2.6); }
      return;
    }
  }
}

// ───────────────────────────── food ─────────────────────────────
function stepItems(dt) {
  for (const it of items) {
    if (it.taken) continue;
    if (it.drop > 0) { it.drop -= dt; continue; }
    if ((it.x - P.x) ** 2 + (it.z - P.z) ** 2 < 2.9 && Math.abs(P.y + 1.5 - it.y) < 2.3 && P.dead <= 0) {
      it.taken = true; it.s.visible = false; foodGot++;
      if (it.type === 'burrito') { P.fuel = Math.min(1, P.fuel + 0.5); if (P.hp < P.maxHp) { P.hp++; Sound.heal(); } else Sound.eat(); }
      else { P.fuel = Math.min(1, P.fuel + (it.type === 'burger' ? 0.25 : 0.15)); Sound.eat(); }
      puff(it.x, it.y, it.z, 0xfff3a0, 6, 4, 0.35, 0.4, 2); updateHUD();
      if (foodGot === foodTotal) toast('Every last morsel! A hog well fed.', 3.5);
    }
  }
}

// ───────────────────────────── the quarry ─────────────────────────────
let boulderT = 1.5, boulderN = 0;
function stepQuarry(dt) {
  const near = Math.hypot(P.x - QUARRY.x, P.z - QUARRY.z) < 120;
  boulderT -= dt;
  if (boulderT <= 0 && near) {
    boulderT = 3.3;
    let b = boulders.find(o => !o.alive);
    if (!b) { b = { m: mesh(new THREE.IcosahedronGeometry(1.6, 1), M.rock, 0, 0, 0), shadow: makeShadow(1.5) }; boulders.push(b); }
    b.alive = true; b.u = 0.96; b.lane = (boulderN++ % 2 ? 1 : -1) * 2; b.m.visible = b.shadow.visible = true;
  }
  for (const b of boulders) if (b.alive) {
    b.u -= 10.5 * dt / (lerp(QUARRY.r0, QUARRY.r1, b.u) * QUARRY.sweep);                 // steady speed along the ledge
    [b.x, b.z] = quarryAt(b.u, b.lane); b.y = terrainH(b.x, b.z) + 1.5;
    b.m.position.set(b.x, b.y, b.z); b.m.rotation.x += 6 * dt; b.m.rotation.z += 2.3 * dt; b.shadow.position.set(b.x, b.y - 1.43, b.z);
    const dx = P.x - b.x, dz = P.z - b.z, dy = P.y + 1.5 - b.y;
    const smash = () => { b.alive = false; b.m.visible = b.shadow.visible = false; puff(b.x, b.y, b.z, 0x9a958a, 12, 7, 0.7, 0.6, 3, 14); };
    if (b.u <= 0) { smash(); if (Math.hypot(dx, dz) < 40) Sound.land(); }
    else if (P.dead <= 0 && dx * dx + dz * dz + dy * dy < 2.6 * 2.6) {
      if (P.charge > 0) { smash(); Sound.stomp(); Sound.thud(); cam.shake = 0.3; P.fuel = Math.min(1, P.fuel + 0.06); }   // a charging hog goes straight through
      else hurt(1, dx, dz);
    }
  }
  if (heart && !heart.taken && (P.x - heart.x) ** 2 + (P.z - heart.z) ** 2 < 4 && Math.abs(P.y + 1.5 - heart.y) < 2.6) {
    heart.taken = true; heart.m.visible = false; P.maxHp = 5; P.hp = 5; Sound.heal(); Sound.check(); updateHUD(); puff(heart.x, heart.y, heart.z, 0xff8a80, 14, 5, 0.4, 0.7, 3);
    toast('A fifth heart! The hog swells with pride.', 3.5);
  }
}

// ───────────────────────────── crows ─────────────────────────────
function stepCrows(dt) {
  for (const c of crows) {
    if (!c.alive) { c.back -= dt; if (c.back <= 0 && Math.hypot(c.cx - P.x, c.cz - P.z) > 45) { c.alive = true; c.s.visible = true; c.shadow.visible = true; } continue; }
    c.ang += c.spd / c.r * dt; c.x = c.cx + Math.cos(c.ang) * c.r; c.z = c.cz + Math.sin(c.ang) * c.r;
    c.y = (c.absY ?? terrainH(c.x, c.z) + 1.1) + Math.sin(time * 3 + c.cx) * 0.35;
    if (P.dead > 0) continue;
    const dx = P.x - c.x, dz = P.z - c.z;
    if (dx * dx + dz * dz < 2.6 && P.y < c.y + 1.9 && P.y + PH > c.y) {
      const stomp = P.vy < -0.5 && P.y > c.y + 0.7;
      if (P.charge > 0 || stomp) {
        c.alive = false; c.back = 25; c.s.visible = false; c.shadow.visible = false; Sound.stomp(); puff(c.x, c.y + 1, c.z, 0x222222, 10, 6, 0.4, 0.6, 3, 12);
        P.fuel = Math.min(1, P.fuel + 0.1); if (stomp && P.charge <= 0) { P.vy = 14; P.canBoost = true; }
      } else hurt(1, dx, dz);
    }
  }
}

// ───────────────────────────── Tile Troll ─────────────────────────────
function stepTroll(dt) {
  const T = TROLL; T.y = terrainH(T.x, T.z); T.inv = Math.max(0, T.inv - dt); T.cool -= dt;
  if (T.state === 'dead') return;
  const dx = P.x - T.x, dz = P.z - T.z, d = Math.hypot(dx, dz) || 0.001, alive = P.dead <= 0;
  if (!T.seen && d < 26) { T.seen = true; bark('troll_stand', 'TILE TROLL: None shall pass! Not without a permit, three quotes and a deposit!'); }
  if (T.state === 'idle') {
    const home = Math.hypot(T.x - T.hx, T.z - T.hz);
    if (alive && d < 17 && d > 3.6 && Math.hypot(P.x - T.hx, P.z - T.hz) < 19) { T.x += dx / d * 3.6 * dt; T.z += dz / d * 3.6 * dt; }
    else if (d >= 17 && home > 0.5) { T.x += (T.hx - T.x) / home * 2.5 * dt; T.z += (T.hz - T.z) / home * 2.5 * dt; }
    if (alive && d < 5 && T.cool <= 0) { T.state = 'windup'; T.t = 0.6; }
  } else if (T.state === 'windup') {
    T.t -= dt;
    if (T.t <= 0) { T.state = 'recover'; T.t = 1.1; Sound.thud(); cam.shake = Math.max(cam.shake, d < 20 ? 0.45 : 0); puff(T.x + dx / d * 2.5, T.y + 0.3, T.z + dz / d * 2.5, 0xd8c8a0, 12, 8, 0.8, 0.6, 2);
      if (d < 5.8 && P.y - T.y < 2.6 && P.charge <= 0) hurt(1, dx, dz); }
  } else if (T.state === 'recover') { T.t -= dt; if (T.t <= 0) { T.state = 'idle'; T.cool = 1.0; } }
  // Being hit: a charge anywhere, or a landing on his head.
  if (alive && T.inv <= 0) {
    const charge = P.charge > 0 && d < 3.3 && P.y - T.y < 6, stomp = P.vy < -1 && d < 2.4 && P.y > T.y + 4.6 && P.y < T.y + 7.5;
    if (charge || stomp) {
      T.hp--; T.inv = 0.9; Sound.stomp(); Sound.thud(); cam.shake = 0.4; puff(T.x, T.y + 4, T.z, 0xffffff, 10, 7, 0.6, 0.4, 2);
      T.x -= dx / d * 1.6; T.z -= dz / d * 1.6;
      if (stomp) { P.vy = 15; P.canBoost = true; } else { P.charge = 0; P.vx = dx / d * 9; P.vz = dz / d * 9; P.vy = 8; P.grounded = false; }
      if (T.hp <= 0) {
        T.state = 'dead'; bark('troll_defeated', 'TILE TROLL: Urgh… the grout… it fades… Go on then. Mind the wet sealant.', 5);
        T.loot.forEach((it, i) => { const a = i / 3 * TAU + 0.5; it.x = T.x + Math.cos(a) * 3.4; it.z = T.z + Math.sin(a) * 3.4; it.y = terrainH(it.x, it.z) + 1.5; it.s.position.set(it.x, it.y, it.z); it.drop = 0.5; });
      } else { T.state = 'windup'; T.t = 0.8; T.inv = 1.3; }   // struck, he swings straight back
    }
  }
}

// ───────────────────────────── Gollum Man ─────────────────────────────
const GOL_BARKS = ['GOLLUM MAN: The precious is OURS, piggy-man! Catch us if it can!', 'GOLLUM MAN: It hops the stones! Clever piggy. East we goes, over the river, far, far away!',
  'GOLLUM MAN: Fat hog still follows? Up, up, up we goes — to the big mill!'];
const GOL_NEXT = ['He fled west — the ruined mill on the lake', 'He fled east — the little mill beyond the river'];
function onDeck() { return P.y >= MILL.deckY - 0.1 && P.y < MILL.deckY + 6 && Math.hypot(P.x - MILL.x, P.z - MILL.z) < MILL.deckR + 0.3; }
function gollumHit(stomp, dx, dz, d) {
  const G = GOL; G.hits++; G.state = 'hurt'; G.t = 1.0; G.inv = 1.7; G.vx = -dx / d * 13; G.vz = -dz / d * 13; G.vy = 9; G.frame = 'gol_hurt';
  Sound.stomp(); Sound.gollum(); cam.shake = 0.3; puff(G.x, G.y + 1.2, G.z, 0xffffff, 10, 6, 0.5, 0.4, 2);
  if (stomp) { P.vy = 14; P.canBoost = true; } else { P.charge = 0; P.vx = dx / d * 7; P.vz = dz / d * 7; P.vy = 7; P.grounded = false; }
  setObjective(G.hits < 3 ? `Catch the Gollum Man!  ${G.hits}/3` : 'Take the Ring!');
  bark('gol_hurt', ['GOLLUM MAN: Ach! It squashes us!', 'GOLLUM MAN: Nasty, stinking hog!', 'GOLLUM MAN: Nooo! It burns us! Take it — take the horrid ring!'][G.hits - 1], 3);
}
function stepGollum(dt) {
  const G = GOL, cx = MILL.x, cz = MILL.z; G.inv = Math.max(0, G.inv - dt);
  const dx = P.x - G.x, dz = P.z - G.z, d = Math.hypot(dx, dz) || 0.001, dy = P.y - G.y;
  const face = (vx, vz) => { const l = Math.hypot(vx, vz); if (l > 0.02) { G.hx = vx / l; G.hz = vz / l; } };   // which way he is looking
  switch (G.state) {
    case 'perch':
      G.frame = 'gol_idle'; face(dx, dz);
      if (onDeck()) { G.perch = PERCHES.length; G.state = 'top'; G.x = cx - 6.5; G.z = cz - 2; G.y = MILL.deckY; break; }   // hog skipped ahead: he is already up here
      if (d < 13 && !G.barked) { G.barked = true; G.state = 'taunt'; G.t = 1.1; bark('gol_idle', GOL_BARKS[G.perch]); Sound.gollum(); }
      break;
    case 'taunt':
      G.t -= dt; G.frame = 'gol_crouch'; face(dx, dz);
      if (G.t <= 0) {
        const nxt = PERCHES[G.perch + 1] || { x: cx, z: cz }, l = Math.hypot(nxt.x - G.x, nxt.z - G.z);
        G.dirX = (nxt.x - G.x) / l; G.dirZ = (nxt.z - G.z) / l; G.y0 = G.y; G.t = 0; G.state = 'leap'; G.frame = 'gol_jump'; Sound.whoosh(); puff(G.x, G.y + 0.3, G.z, 0xe6dcc0, 8, 4, 0.6, 0.5, 1);
      }
      break;
    case 'leap':
      G.t += dt; G.x += G.dirX * 34 * dt; G.z += G.dirZ * 34 * dt; G.y = G.y0 + 26 * G.t - 5 * G.t * G.t; face(G.dirX, G.dirZ);
      if (G.t > 1.8) {
        G.perch++;
        if (G.perch < PERCHES.length) { placeGollumAtPerch(); setObjective(GOL_NEXT[G.perch - 1]); }
        else { G.state = 'top'; G.x = cx - 6.5; G.z = cz - 2; G.y = MILL.deckY; G.frame = 'gol_idle'; setObjective('Climb the Great Windmill'); }
      }
      break;
    case 'top':
      face(dx, dz);
      if (onDeck() && P.grounded) {
        checkpoint = { x: cx + Math.cos(GATE_ANG) * 7.5, y: MILL.deckY, z: cz + Math.sin(GATE_ANG) * 7.5 }; Sound.check();
        say([['gol_idle', 'The Gollum Man', 'It climbed. It actually climbed. On a PIG. Nowhere left to run, precious…'],
             ['gol_crouch', 'The Gollum Man', '…so we bites it instead! Come, piggy-man. Catch us three times, if it can!'],
             ['hog_idle', 'The Hog', 'Oink.']], () => { G.state = 'flee'; G.lungeT = 4; G.met = true; setObjective('Catch the Gollum Man!  0/3'); });
      }
      break;
    case 'flee': {
      // Keep the cap between himself and the hog.
      const ga = Math.atan2(G.z - cz, G.x - cx), pa = Math.atan2(P.z - cz, P.x - cx), diff = wrap(ga - pa), sp = (9 + G.hits * 1.2) * (Math.abs(diff) > 2.7 ? 0.25 : 1);
      const r = lerp(Math.hypot(G.x - cx, G.z - cz), 6.8, 1 - Math.exp(-3 * dt)), na = ga + (diff >= 0 ? 1 : -1) * sp / r * dt;
      const ox = G.x, oz = G.z; G.x = cx + Math.cos(na) * r; G.z = cz + Math.sin(na) * r; G.y = MILL.deckY; face(G.x - ox, G.z - oz); G.frame = 'gol_crawl';
      G.lungeT -= dt; if (!onDeck()) G.lungeT = Math.max(G.lungeT, 1.5);
      if (G.lungeT <= 0 && d < 10 && onDeck()) { G.state = 'windup'; G.t = 0.7; Sound.gollum(); }
      break; }
    case 'windup':
      G.t -= dt; G.frame = 'gol_idle'; face(dx, dz);
      if (G.t <= 0) { G.state = 'lunge'; G.t = 0.55; G.vx = dx / 0.55; G.vz = dz / 0.55; G.vy = 9; const s = Math.hypot(G.vx, G.vz); if (s > 20) { G.vx *= 20 / s; G.vz *= 20 / s; } Sound.whoosh(); }
      break;
    case 'lunge':
      G.t -= dt; G.x += G.vx * dt; G.z += G.vz * dt; G.vy -= 33 * dt; G.y = Math.max(MILL.deckY, G.y + G.vy * dt); G.frame = 'gol_jump'; face(G.vx, G.vz);
      if (G.t <= 0) { G.y = MILL.deckY; G.state = 'rest'; G.t = 0.9 - G.hits * 0.15; }
      break;
    case 'rest':
      G.t -= dt; G.frame = 'gol_crouch'; if (G.t <= 0) { G.state = 'flee'; G.lungeT = 3 - G.hits * 0.5 + Math.random() * 2; }
      break;
    case 'hurt':
      G.t -= dt; G.x += G.vx * dt; G.z += G.vz * dt; G.vx *= 1 - 4 * dt; G.vz *= 1 - 4 * dt; G.vy -= 33 * dt; G.y = Math.max(MILL.deckY, G.y + G.vy * dt); G.frame = 'gol_hurt';
      if (G.t <= 0) {
        if (G.hits >= 3) { G.state = 'beaten'; G.frame = 'gol_crouch'; ring.free = true; ring.x = G.x; ring.y = G.y + 2.6; ring.z = G.z; ring.vy = 9; ring.tx = cx + (G.x - cx) * 0.4 + 0; ring.tz = cz + (G.z - cz) * 0.4; ring.t = 0; }
        else {
          // Vault clean over the cap to the far side of the deck, away from the hog.
          const pa = Math.atan2(P.z - cz, P.x - cx) + Math.PI + (Math.random() - 0.5);
          G.state = 'escape'; G.t = 0; G.sx = G.x; G.sz = G.z; G.ex = cx + Math.cos(pa) * 7; G.ez = cz + Math.sin(pa) * 7; G.inv = 1.4; Sound.whoosh();
        }
      }
      break;
    case 'escape': {
      G.t += dt / 0.95; const k = Math.min(1, G.t); G.x = lerp(G.sx, G.ex, k); G.z = lerp(G.sz, G.ez, k); G.y = MILL.deckY + 46 * k * (1 - k); G.frame = 'gol_jump'; face(G.ex - G.sx, G.ez - G.sz);
      if (k >= 1) { G.y = MILL.deckY; G.state = 'flee'; G.lungeT = 1.6 + Math.random() * 1.5; puff(G.x, G.y + 0.3, G.z, 0xe6dcc0, 6, 4, 0.5, 0.4, 1); }
      break; }
  }
  if (['flee', 'windup', 'lunge', 'rest', 'hurt', 'beaten'].includes(G.state)) {   // keep him on the boards (the vault is exempt: it goes over the cap)
    const r = Math.hypot(G.x - cx, G.z - cz) || 1, rr = clamp(r, 4.3, MILL.deckR - 1.2); G.x = cx + (G.x - cx) / r * rr; G.z = cz + (G.z - cz) / r * rr;
  }
  // Catching him: touch, stomp or charge. Only his lunge bites back.
  if (['flee', 'windup', 'lunge', 'rest'].includes(G.state) && P.dead <= 0 && !P.frozen) {
    const stomp = P.vy < -1 && dy > 0.9 && dy < 3.2 && d < 2.0, charge = P.charge > 0 && d < 2.6 && Math.abs(dy) < 2.6, touch = G.state !== 'lunge' && d < 1.8 && Math.abs(dy) < 2;
    if (G.inv <= 0 && (stomp || charge || touch)) gollumHit(stomp, dx, dz, d);
    else if (G.state === 'lunge' && d < 1.8 && Math.abs(dy) < 2) hurt(1, dx, dz);
  }
  // The Ring.
  if (ring.free && !hasRing) {
    ring.t += dt; const k = 1 - Math.exp(-2.5 * dt); ring.x = lerp(ring.x, ring.tx, k); ring.z = lerp(ring.z, ring.tz, k);
    ring.vy -= 22 * dt; ring.y = Math.max(MILL.deckY + 1.7, ring.y + ring.vy * dt);
    if (ring.t > 0.6 && Math.hypot(P.x - ring.x, P.z - ring.z) < 2 && Math.abs(P.y + 1.5 - ring.y) < 2.6) win();
  }
}

function win() {
  hasRing = true; state = 'win'; Sound.win(); updateHUD(); $('bark').hidden = true; $('prompt').hidden = true; setObjective('The Ring is reclaimed!');
  const m = Math.floor(playTime / 60), s = Math.floor(playTime % 60);
  $('win-stats').innerHTML = `Time ${m}:${String(s).padStart(2, '0')}<br>Food ${foodGot}/${foodTotal}<br>Tumbles ${deaths}` + (TROLL.state === 'dead' ? '<br>Tile Troll: grouted' : '');
  $('win-ring').src = pic('ring_text');
  setTimeout(() => { $('win').hidden = false; }, 2600);
}

// ───────────────────────────── the compass ─────────────────────────────
// Where the current objective is, or null when the hog is already upon it.
function objectiveTarget() {
  const G = GOL;
  if (hasRing) return null;
  if (ring.free) return [ring.x, ring.z];
  if (G.state === 'perch' || G.state === 'taunt') return [G.x, G.z];
  if (G.state === 'top' && Math.hypot(P.x - MILL.x, P.z - MILL.z) > 26) return [MILL.steps[0].x, MILL.steps[0].z];
  return null;
}
function updateCompass() {
  const t = state === 'play' ? objectiveTarget() : null, el = $('compass');
  const dx = t ? t[0] - P.x : 0, dz = t ? t[1] - P.z : 0, d = Math.hypot(dx, dz);
  if (!t || d < 16) { el.hidden = true; return; }
  el.hidden = false;
  const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);                       // screen-right is (c, -s); screen-forward is (-s, -c)
  el.firstElementChild.style.transform = `rotate(${Math.atan2(dx * c - dz * s, -dx * s - dz * c)}rad)`;
  el.lastElementChild.textContent = `${Math.round(d)}m`;
}

// ───────────────────────────── checkpoints & talking ─────────────────────────────
let nearNpc = null;
function stepWorld(dt) {
  for (const f of flags) if (!f.on && Math.hypot(P.x - f.x, P.z - f.z) < 7 && P.grounded) {
    flags.forEach(o => { o.on = false; o.f.material = M.flag; }); f.on = true; f.f.material = M.flagOn; checkpoint = { x: f.x - 4, y: f.y, z: f.z }; Sound.check(); toast('Checkpoint'); }
  nearNpc = null;
  for (const n of npcs) if (Math.hypot(P.x - n.x, P.z - n.z) < 5.5 && Math.abs(P.y - n.y) < 3) nearNpc = n;
  $('prompt').hidden = !nearNpc; if (nearNpc) $('prompt').textContent = `E  Talk to ${nearNpc.name}`;
  if (nearNpc && HIT.KeyE && P.grounded) { const n = nearNpc, l = n.lines[n.i % n.lines.length]; n.i++; say(l.map(t => [n.spr, n.name, t])); }
}

// ───────────────────────────── camera ─────────────────────────────
function camBlocked(x, y, z) {
  if (y < terrainH(x, z) + 0.7) return true;
  for (const s of solids) if (s.occlude && y > s.y0 - 0.3 && y < s.y1 + 0.3 && (x - s.x) ** 2 + (z - s.z) ** 2 < (cylR(s, y) + 0.6) ** 2) return true;
  return false;
}
function updateCamera(dt, follow = true) {
  if (HOG.spy) { follow = false; cam.tgt.set(...HOG.spy); }                // dev: stare at a fixed point instead of the hog
  if (follow) {
    if (input.camX || input.camY) cam.manualT = 1.6; else cam.manualT -= dt;
    cam.yaw += input.camX * 2.3 * dt; cam.pitch = clamp(cam.pitch + input.camY * 1.3 * dt, 0.06, 1.3);
    if (cam.manualT <= 0 && state === 'play' && P.charge <= 0) cam.yaw -= input.x * 0.85 * dt;   // drift round behind him as he turns
    const k = 1 - Math.exp(-12 * dt), ky = 1 - Math.exp(-(P.grounded ? 9 : 5) * dt);
    cam.tgt.x = lerp(cam.tgt.x, P.x, k); cam.tgt.z = lerp(cam.tgt.z, P.z, k); cam.tgt.y = lerp(cam.tgt.y, P.y + 2.4, ky);
  }
  const cp = Math.cos(cam.pitch), ox = Math.sin(cam.yaw) * cp, oy = Math.sin(cam.pitch), oz = Math.cos(cam.yaw) * cp;
  let dmax = cam.dist;
  if (follow) for (let d = 1.5; d <= cam.dist + 0.01; d += 0.75) if (camBlocked(cam.tgt.x + ox * d, cam.tgt.y + oy * d, cam.tgt.z + oz * d)) { dmax = Math.max(3.5, d - 0.9); break; }
  cam.cur = dmax < cam.cur ? dmax : lerp(cam.cur, dmax, 1 - Math.exp(-4 * dt));
  cam.shake = Math.max(0, cam.shake - dt);
  const sh = cam.shake * 1.2;
  camera.position.set(cam.tgt.x + ox * cam.cur + (Math.random() - 0.5) * sh, cam.tgt.y + oy * cam.cur + (Math.random() - 0.5) * sh, cam.tgt.z + oz * cam.cur);
  camera.lookAt(cam.tgt);
}
let dragging = false, lastPX = 0, lastPY = 0;
canvas.addEventListener('pointerdown', e => { dragging = true; lastPX = e.clientX; lastPY = e.clientY; canvas.classList.add('drag'); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!dragging) return; cam.yaw -= (e.clientX - lastPX) * 0.006; cam.pitch = clamp(cam.pitch + (e.clientY - lastPY) * 0.005, 0.06, 1.3); lastPX = e.clientX; lastPY = e.clientY; cam.manualT = 2.5; });
const endDrag = () => { dragging = false; canvas.classList.remove('drag'); };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 1.5, 8, 28); e.preventDefault(); }, { passive: false });

// ───────────────────────────── drawing the cast ─────────────────────────────
function updateVisuals(dt) {
  // Hogman.
  Models.animHogman(hog, { dirX: P.dirX, dirZ: P.dirZ, moving: Math.hypot(P.vx, P.vz) > 1.5, grounded: P.grounded, vy: P.vy, charge: P.charge > 0, boost: P.boostT,
    dead: P.dead > 0, anim: P.anim, time, squash: P.squash }, dt);
  hog.g.position.set(P.x, P.y + hog.lift, P.z);
  hog.g.visible = state === 'title' ? false : !(P.inv > 0 && P.dead <= 0 && Math.floor(time * 14) % 2);
  placeShadow(playerShadow, P.x, P.y, P.z); playerShadow.visible = state !== 'title';

  // Food turns on the spot.
  for (const it of items) if (!it.taken) { it.s.rotation.y = time * 1.8 + it.ph; it.s.position.y = it.y + Math.sin(time * 2 + it.ph) * 0.18; it.s.visible = it.drop <= 0; }
  for (const c of crows) if (c.alive) { const d = Math.sign(c.spd); Models.animCrow(c.m, { dirX: -Math.sin(c.ang) * d, dirZ: Math.cos(c.ang) * d, time, phase: c.cx, bank: d }, dt); c.s.position.set(c.x, c.y + 1, c.z); placeShadow(c.shadow, c.x, c.y, c.z); }
  // Troll: he watches the hog.
  const T = TROLL, tdx = P.x - T.x, tdz = P.z - T.z, td = Math.hypot(tdx, tdz), ty = T.y ?? terrainH(T.x, T.z);
  if (td < 30) T.yaw = Math.atan2(tdx, tdz);
  Models.animTroll(T.m, { state: T.state, walking: td < 17 && td > 3.6 && P.dead <= 0, time, yaw: T.yaw ?? Math.PI }, dt);
  T.m.g.position.set(T.x, ty, T.z); T.m.g.visible = !(T.inv > 0 && T.state !== 'dead' && Math.floor(time * 16) % 2); T.shadow.position.set(T.x, ty + 0.07, T.z);
  // Gollum Man.
  const G = GOL;
  Models.animGollum(G.m, { frame: G.frame, dirX: G.hx, dirZ: G.hz, time, shake: G.state === 'windup' }, dt);
  G.m.g.position.set(G.x, G.y, G.z);
  G.m.g.visible = !(G.inv > 0 && G.state !== 'hurt' && G.state !== 'escape' && Math.floor(time * 14) % 2); placeShadow(G.shadow, G.x, G.y, G.z);
  G.shadow.visible = G.state !== 'leap' && G.state !== 'escape';
  for (const n of npcs) Models.animNpc(n.m, { time, yaw: Math.hypot(P.x - n.x, P.z - n.z) < 22 ? Math.atan2(P.x - n.x, P.z - n.z) : n.yaw0, talking: state === 'dialog' && nearNpc === n }, dt);
  // The Ring: over his head, then loose, then held aloft.
  G.m.head.getWorldPosition(tmpV);
  let rh = 0.85, rxp = tmpV.x, ryp = tmpV.y + 1.3 + Math.sin(time * 3) * 0.12, rzp = tmpV.z;
  if (hasRing) { rh = 1.15; rxp = P.x; ryp = P.y + 5.1 + Math.sin(time * 3) * 0.1; rzp = P.z; } else if (ring.free) { rh = 1.5; rxp = ring.x; ryp = ring.y + Math.sin(time * 3) * 0.15; rzp = ring.z; }
  ringModel.scale.setScalar(rh); ringModel.rotation.y = time * 3.2; ringModel.position.set(rxp, ryp, rzp);
  if ((ring.free || hasRing) && Math.random() < dt * 12) puff(rxp + (Math.random() - 0.5), ryp + (Math.random() - 0.5), rzp, 0xffe27a, 1, 0.5, 0.18, 0.5, 1.2);
  for (const f of flags) f.f.rotation.y = Math.sin(time * 3 + f.x) * 0.5;

  sky.position.x = camera.position.x; sky.position.z = camera.position.z; sea.position.set(camera.position.x, Math.sin(time * 0.8) * 0.06, camera.position.z);
  $('gasfill').style.width = `${P.fuel * 100}%`; $('gas').classList.toggle('low', P.fuel < 0.2);
  if (heart && !heart.taken) { heart.m.rotation.y = time * 2; heart.m.position.set(heart.x, heart.y + Math.sin(time * 2.5) * 0.2, heart.z); }
  for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x - camera.position.x > 760) c.position.x -= 1520; }
  sea.material.map.offset.set(time * 0.004, time * 0.0025);
  updateCompass();
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').classList.remove('on');
  if (barkT > 0 && (barkT -= dt) <= 0) $('bark').hidden = true;
  updateParticles(dt);
}

// ───────────────────────────── main loop ─────────────────────────────
function simulate(dt) {
  time += dt; playTime += dt;
  for (const m of movers) m.update(dt);
  stepSails(dt); stepPlayer(dt); stepItems(dt); stepCrows(dt); stepTroll(dt); stepQuarry(dt); stepGollum(dt);
}
function frame(dt) {
  readInput();
  if (HIT.KeyM) toast(Sound.toggle() ? 'Sound off' : 'Sound on', 1);
  if (state === 'play') {
    if (HIT.Escape || HIT.KeyP) { state = 'pause'; $('pause').hidden = false; }
    else {
      if (HIT.Space) P.jumpBuf = 0.13;
      if (HIT.ShiftLeft || HIT.ShiftRight || HIT.KeyF) P.wantCharge = true;
      if (DEV) { const w = { Digit1: [0, 150], Digit2: [0, 36], Digit3: [0, -79], Digit4: [MILL.x + 7, MILL.z + 5, MILL.deckY], Digit5: [HAMLET.x, HAMLET.z - 12], Digit6: [LAKE.x, LAKE.z + 58], Digit7: [LAKE.x - 6, LAKE.z + 4], Digit8: [-300, -32], Digit9: [QUARRY.x + 4, QUARRY.z + 4] }; for (const k in w) if (HIT[k]) HOG.warp(...w[k]); }
      for (let rem = dt; rem > 1e-5 && state === 'play';) { const h = Math.min(rem, 1 / 90); simulate(h); rem -= h; }
      if (state === 'play') stepWorld(dt);
      updateCamera(dt);
    }
  } else if (state === 'pause') {
    if (HIT.Escape || HIT.KeyP || HIT.Enter) { state = 'play'; $('pause').hidden = true; }
  } else if (state === 'dialog') {
    time += dt; stepSails(dt); tickDialog(dt); updateCamera(dt);
  } else if (state === 'intro') {
    // A sweep back from the Great Windmill, down the length of the level, to the hog at the gate.
    time += dt; stepSails(dt); intro.t += dt;
    const k = sstep(0.18, 1, intro.t / intro.dur);
    cam.tgt.set(lerp(MILL.x, P.x, k), lerp(MILL.base + 22, P.y + 2.4, k), lerp(MILL.z, P.z, k));
    cam.yaw = lerp(0.85, 0, k); cam.pitch = lerp(0.42, 0.34, k); cam.dist = cam.cur = lerp(85, 15, k); updateCamera(dt, false);
    if (intro.t >= intro.dur || HIT.Enter || HIT.Space || HIT.KeyE) endIntro();
  } else if (state === 'title') {
    time += dt; stepSails(dt); cam.yaw += dt * 0.12; cam.pitch = 0.2; cam.cur = cam.dist = 62; cam.tgt.set(MILL.x, MILL.base + 20, MILL.z); updateCamera(dt, false);
    if (HIT.Enter || HIT.Space) startGame();
  } else if (state === 'win') {
    time += dt; stepSails(dt); cam.yaw += dt * 0.3; cam.dist = lerp(cam.dist, 10, 1 - Math.exp(-dt)); cam.pitch = lerp(cam.pitch, 0.24, 1 - Math.exp(-dt)); updateCamera(dt);
    if (HIT.Enter && !$('win').hidden) location.reload();
  }
  updateVisuals(dt);
  renderer.render(scene, camera);
  for (const k in HIT) delete HIT[k];
}
let lastT = 0;
function loop(t) { const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t; frame(dt); requestAnimationFrame(loop); }

function startGame() {
  if (state !== 'title') return;
  Sound.init(); $('title').hidden = true; state = 'intro'; intro.t = 0; toast('WINDMILL COUNTRY', 4);
  $('hud').hidden = false; $('hud').classList.add('cine');
}
function endIntro() {
  if (state !== 'intro') return;
  $('hud').classList.remove('cine'); $('toast').classList.remove('on'); toastT = 0;
  cam.yaw = 0; cam.pitch = 0.34; cam.dist = cam.cur = 15; cam.tgt.set(P.x, P.y + 2.4, P.z);
  setObjective('Find the Gollum Man by the little windmill'); updateHUD();
  say([['wizard', 'The Wizard', 'Noble Hogman! Thank the stars. The Gollum Man has made off with the One Ring and fled into the windmill country.'],
       ['wizard', 'The Wizard', 'He means to hide atop the Great Windmill on the far hill. Folk hereabouts swear the mills are giants. They are not. Probably.'],
       ['wizard', 'The Wizard', 'Eat what you find — a fed hog is a fast hog. SHIFT to charge, and SPACE again in mid-air for a… gaseous lift.'],
       ['wizard', 'The Wizard', 'The arrow up top points to your quarry. The finger-posts point to everything else.'],
       ['hog_idle', 'The Hog', 'Oink.']]);
}

async function boot() {
  const names = Object.keys(SPRITE_FILES), tiles = Object.keys(TILE_FILES); let done = 0; const total = names.length + tiles.length;
  const tick = () => { $('start').textContent = `LOADING ${Math.round(++done / total * 100)}%`; };
  await Promise.all([
    ...names.map(async n => { const img = await loadImage(A + SPRITE_FILES[n]); if (!img) console.warn('missing sprite', SPRITE_FILES[n]); SPR[n] = processSprite(img); tick(); }),
    ...tiles.map(async n => { TILE[n] = await loadImage(A + TILE_FILES[n]); tick(); }),
  ]);
  try { await Promise.race([document.fonts.load('16px "Press Start 2P"'), new Promise(r => setTimeout(r, 1500))]); } catch { /* the finger-posts fall back to monospace */ }
  makeMaterials(); buildTerrain(); buildSky(); initParticles();
  buildProps(); buildItems(); buildCreatures(); buildFlora();
  P.y = terrainH(P.x, P.z); checkpoint = { x: P.x, y: P.y, z: P.z }; lastSafe = { ...checkpoint }; TROLL.y = terrainH(TROLL.x, TROLL.z);
  playerShadow = makeShadow(1.4); hog = Models.buildHogman(); scene.add(hog.g);
  $('foodicon').src = pic('taco'); $('ringicon').src = pic('ring');
  state = 'title'; $('start').disabled = false; $('start').textContent = 'PRESS ENTER'; $('start').onclick = startGame; $('again').onclick = () => location.reload(); $('dialog').onclick = () => { if (state === 'dialog') advanceDialog(); };
  requestAnimationFrame(loop);
}

// Handy from the console, and what the dev keys (?dev, then 1–4) call.
const HOG = window.HOG = {
  P, cam, GOL, TROLL, MILL, LAKE, QUARRY, HAMLET, quarryAt, items, crows, npcs, boulders, solids, terrainH, scene, renderer, Models,
  get state() { return state; },
  warp(x, z, y) { P.x = x; P.z = z; P.y = y ?? groundBelow(x, z, 999); P.vx = P.vy = P.vz = 0; cam.tgt.set(P.x, P.y + 2.4, P.z); },
  spy: null, look(x, y, z, yaw = 0, pitch = 0.2, dist = 7) { HOG.spy = [x, y, z]; cam.yaw = yaw; cam.pitch = pitch; cam.dist = cam.cur = dist; },
  start: () => startGame(), skip() { endIntro(); while (state === 'dialog') { advanceDialog(); } },
  tick(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) frame(dt); },
  press(code) { HIT[code] = true; }, hold(code, on = true) { KEY[code] = on; },
};

boot();
