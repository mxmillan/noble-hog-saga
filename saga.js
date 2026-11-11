// The Noble Hog Saga — The Hog Man Cometh, Part the First.
// The game of the book: four chapters that follow its pages, which are shown as the story scenes.
// This file is the engine (hog, camera, companion, foes, HUD, chapter loading). The chapters themselves
// are data-and-build functions in saga-levels.js; the cast and props are in hog3d-models.js.
// No build step: three.js is the vendored copy in vendor/, wired up by the import map in index.html.
import * as THREE from 'three';
import * as Models from './hog3d-models.js?v=4';
import { LEVELS } from './saga-levels.js?v=1';

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
// The 2D sprite art is used for dialogue portraits and the HUD icon. (The book's wizard is the old man in the cap.)
const SPRITE_FILES = {
  hog: 'sprites/hogman/hogman_idle.png', gollum: 'sprites/gollum/gollum_idle.png', gollum_hurt: 'sprites/gollum/gollum_hurt.png',
  gollum_crouch: 'sprites/gollum/gollum_crouching.png', troll: 'sprites/enemies/tile_troll_stand.png', troll_defeated: 'sprites/enemies/tile_troll_defeated.png',
  wizard: 'sprites/wizard/wizard_01.png', taco: 'sprites/collectibles/taco.png',
};
const TILE_FILES = { cobble: 'backgrounds/level3_tiles/platform_cobble_street.png', sky: 'backgrounds/level1_tiles/bg_mountains_sky.png' };
const TILE = {};

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
    clang() { tone(900, 0.12, 'square', 0.1, 400); tone(1350, 0.2, 'triangle', 0.08, 700); noise(0.06, 0.15, 5000); },
    splat() { noise(0.25, 0.3, 700, 150); tone(160, 0.15, 'sine', 0.12, 70); },
    bolt() { tone(700, 0.3, 'sine', 0.08, 1400); },
    ring() { [84, 88, 91].forEach((m, i) => tone(f(m), 0.18, 'triangle', 0.09, 0, i * 0.05)); },
    page() { noise(0.12, 0.07, 3000, 800); },
    gust() { noise(1.3, 0.14, 350, 1000); },
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

// ───────────────────────────── materials & small builders ─────────────────────────────
const M = {};
function lam(color, map) { return new THREE.MeshLambertMaterial({ color, map: map || null, flatShading: true }); }
function mesh(geo, mat, x, y, z, parent = world.g) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }
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
function makeShadow(r, keep = false) { const m = new THREE.Mesh(shadowGeo, M.shadow); m.scale.setScalar(r); m.userData.r = r; (keep ? scene : world.g).add(m); return m; }   // keep: outlives the chapter
const UP = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), gOut = {};
function placeShadow(m, x, y, z) {
  const g = groundBelow(x, z, y + STEP, gOut), k = clamp(1 - (y - g) / 14, 0.35, 1);
  m.position.set(x, g + 0.07, z); m.scale.setScalar(m.userData.r * k);
  if (gOut.ref) m.quaternion.identity();
  else { const [gx, gz] = terrainGrad(x, z, 0.8); tmpV.set(-gx, 1, -gz).normalize(); m.quaternion.setFromUnitVectors(UP, tmpV); }
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


// ═════════════════════════════ the world, one chapter at a time ═════════════════════════════
// Everything a chapter builds hangs off world.g and the lists below, so loading the next chapter is
// "throw the group away, empty the lists, build again". The hog, the Gollum Man and the HUD persist.
const world = { g: new THREE.Group(), grid: null, level: null, index: 0, waterY: -99, killY: -22, windX: 0, windZ: 0,
  items: [], crows: [], npcs: [], flags: [], triggers: [], tick: [], draw: [], rings: [], foodGot: 0, foodTotal: 0, target: null };
scene.add(world.g);
const parts = [], clouds = [];
function terrainH(x, z) {
  const G = world.grid; if (!G) return 0;
  const fx = (x - G.x0) / G.c, fz = (z - G.z0) / G.c;
  if (fx < 0 || fz < 0 || fx >= G.nx || fz >= G.nz) return -80;
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, r = iz * (G.nx + 1) + ix, H = G.h;
  const h00 = H[r], h10 = H[r + 1], h01 = H[r + G.nx + 1], h11 = H[r + G.nx + 2];
  return tx + tz <= 1 ? h00 + (h10 - h00) * tx + (h01 - h00) * tz : h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
}
function terrainGrad(x, z, e = 0.6) { return [(terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e), (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e)]; }

// ───────────────────────────── game state ─────────────────────────────
const PR = 0.9, PH = 3.0, STEP = 0.55, RUN = 11.5, GRAV = 40, JUMP = 16.5, CHARGE_SPEED = 27;
const P = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, dirX: 0, dirZ: -1, grounded: true, ground: null, coyote: 0, jumpBuf: 0, canBoost: true,
            charge: 0, boostT: 0, fuel: 0.4, hp: 4, maxHp: 4, gy: 0, inv: 0, stun: 0, dead: 0, anim: 0, squash: 0, sliding: false, frozen: false, wantCharge: false, safeT: 0, hoof: 0 };
const cam = { yaw: 0, pitch: 0.34, dist: 15, cur: 15, manualT: 0, tgt: new THREE.Vector3(), shake: 0 };
let state = 'loading', time = 0, playTime = 0, deaths = 0, foodAll = 0;
let checkpoint = { x: 0, y: 0, z: 0 }, lastSafe = { x: 0, y: 0, z: 0 };
let hog, playerShadow, leash, hemi, sun, sky, water, snow;
const SKY = { top: '#9fd4f5', haze: '#dfeaf6' };
// The Gollum Man: a companion on a leash, not a foe. mode 'follow' trots behind the hog; 'stay' holds a pose somewhere.
const GOL = { on: false, mode: 'follow', x: 0, y: 0, z: 0, hx: 0, hz: -1, frame: 'gol_idle', cower: false, m: null, shadow: null, vy: 0 };
const fly = { x: 0, y: 0, z: 0, yaw: Math.PI, pitch: 0, rings: [], got: 0, endZ: 0, done: null };

// ───────────────────────────── sky, light and weather ─────────────────────────────
const amb = { t: null, fogC: new THREE.Color(), bgC: new THREE.Color() };
function buildSky() {
  const img = TILE.sky, c = mkCanvas(256, 160), g = c.getContext('2d', { willReadFrequently: true });
  if (img) { g.drawImage(img, 0, 0, 256, 160); const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; }; SKY.top = px(128, 2); SKY.haze = px(128, 150); }
  scene.background = new THREE.Color(SKY.top); scene.fog = new THREE.Fog(new THREE.Color(SKY.haze), 150, 720);
  const t = img ? new THREE.Texture(img) : mkTex(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1); t.needsUpdate = true;
  sky = new THREE.Mesh(new THREE.CylinderGeometry(1400, 1400, 1100, 40, 1, true), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.position.y = 418; sky.renderOrder = -1; scene.add(sky);
  water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3f93cf, transparent: true, opacity: 0.86, map: rep(M.tex.grass, 200, 200) })); scene.add(water);
  hemi = new THREE.HemisphereLight(0xdcefff, 0x8a7a55, 1.5); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff0d0, 2.2); sun.position.set(70, 120, 60); scene.add(sun);
  const cr = mulberry(31);
  for (let i = 0; i < 20; i++) { const cl = Models.buildCloud(cr); cl.position.set(-750 + cr() * 1500, 100 + cr() * 80, -750 + cr() * 1500); cl.scale.setScalar(7 + cr() * 10); cl.userData.v = 1.5 + cr() * 2.5; scene.add(cl); clouds.push(cl); }
  // Snow: a box of flakes that travels with the camera and wraps.
  const n = 900, pos = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 70;
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.28, sizeAttenuation: true, fog: false })); snow.frustumCulled = false; snow.visible = false; scene.add(snow);
}
// a: { bg, fog, near, far, hemi: [sky, ground, strength], sun: [colour, strength], sky, snow, clouds, water: [y, colour] }. 'sky'/'haze' mean the painted sky's own colours.
function setAmbience(a, instant = false) {
  amb.t = a; const col = v => (v === 'sky' ? SKY.top : v === 'haze' ? SKY.haze : v);
  amb.bgC.set(col(a.bg)); amb.fogC.set(col(a.fog));
  sky.visible = !!a.sky; snow.visible = !!a.snow; for (const c of clouds) c.visible = !!a.clouds;
  water.visible = !!a.water; world.waterY = a.water ? a.water[0] : -99; if (a.water) { water.position.y = a.water[0]; water.material.color.set(a.water[1]); }
  hemi.color.set(a.hemi[0]); hemi.groundColor.set(a.hemi[1]); sun.color.set(a.sun[0]);
  if (instant) { scene.background.copy(amb.bgC); scene.fog.color.copy(amb.fogC); scene.fog.near = a.near; scene.fog.far = a.far; hemi.intensity = a.hemi[2]; sun.intensity = a.sun[1]; }
}
function tickAmbience(dt) {
  const a = amb.t; if (!a) return; const k = 1 - Math.exp(-1.6 * dt);
  scene.background.lerp(amb.bgC, k); scene.fog.color.lerp(amb.fogC, k); scene.fog.near = lerp(scene.fog.near, a.near, k); scene.fog.far = lerp(scene.fog.far, a.far, k);
  hemi.intensity = lerp(hemi.intensity, a.hemi[2], k); sun.intensity = lerp(sun.intensity, a.sun[1], k);
  if (snow.visible) { const p = snow.geometry.attributes.position, wx = world.windX * 0.4; for (let i = 0; i < p.count; i++) { let y = p.getY(i) - (5 + (i % 5)) * dt, x = p.getX(i) + (1.5 + wx) * dt; if (y < -35) y += 70; if (x > 35) x -= 70; p.setY(i, y); p.setX(i, x); } p.needsUpdate = true; snow.position.copy(camera.position); }
  for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x - camera.position.x > 760) c.position.x -= 1520; }
  sky.position.x = camera.position.x; sky.position.z = camera.position.z; water.position.x = camera.position.x; water.position.z = camera.position.z; water.material.map.offset.set(time * 0.004, time * 0.0025);
}

// ───────────────────────────── loading a chapter ─────────────────────────────
function buildGround(L) {
  const [x0, x1, z0, z1] = L.bounds, c = L.cell || 3, nx = Math.ceil((x1 - x0) / c), nz = Math.ceil((z1 - z0) / c), h = new Float32Array((nx + 1) * (nz + 1));
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) h[iz * (nx + 1) + ix] = L.height(x0 + ix * c, z0 + iz * c);
  world.grid = { x0, z0, nx, nz, c, h };
  const pos = [], col = [], uv = [], cc = new THREE.Color(), jr = mulberry(77);
  const tri = (ax, az, ha, bx, bz, hb, cx, cz, hc) => {
    const hm = (ha + hb + hc) / 3; if (hm < -30) return;                 // the void between areas is simply not drawn
    const e1y = hb - ha, e2y = hc - ha, nxx = e1y * (cz - az) - (bz - az) * e2y, ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nzz = (bx - ax) * e2y - e1y * (cx - ax);
    L.tint(cc, (ax + bx + cx) / 3, (az + bz + cz) / 3, hm, ny / Math.hypot(nxx, ny, nzz), jr); cc.offsetHSL(0, 0, jr() * 0.08 - 0.04);
    for (const [x, hh, z] of [[ax, ha, az], [bx, hb, bz], [cx, hc, cz]]) { pos.push(x, hh, z); col.push(cc.r, cc.g, cc.b); uv.push(x / 9, z / 9); }
  };
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const xa = x0 + ix * c, xb = xa + c, za = z0 + iz * c, zb = za + c, r = iz * (nx + 1) + ix, h00 = h[r], h10 = h[r + 1], h01 = h[r + nx + 1], h11 = h[r + nx + 2];
    tri(xa, za, h00, xa, zb, h01, xb, za, h10); tri(xb, za, h10, xa, zb, h01, xb, zb, h11);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
  world.g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: M.tex.grass })));
}
function loadLevel(i) {
  scene.remove(world.g); world.g = new THREE.Group(); scene.add(world.g);
  solids.length = 0; movers.length = 0;
  Object.assign(world, { items: [], crows: [], npcs: [], flags: [], triggers: [], tick: [], draw: [], rings: [], foodGot: 0, foodTotal: 0, target: null, windX: 0, windZ: 0, killY: -22, index: i });
  const L = world.level = LEVELS[i];
  buildGround(L); setAmbience(L.ambience, true);
  GOL.on = false; GOL.mode = 'follow'; GOL.cower = false; nearNpc = null;
  L.build(E);
  const [sx, sz, dx, dz] = L.start; P.x = sx; P.z = sz; P.y = groundBelow(sx, sz, 999); P.vx = P.vy = P.vz = 0; P.dirX = dx; P.dirZ = dz; P.hp = P.maxHp; P.fuel = Math.max(P.fuel, 0.45); P.dead = 0; P.inv = 0; P.charge = 0; P.frozen = false;
  checkpoint = { x: P.x, y: P.y, z: P.z }; lastSafe = { ...checkpoint }; P.gy = P.y;
  cam.yaw = Math.atan2(-dx, -dz); cam.pitch = 0.34; cam.dist = cam.cur = 15; cam.tgt.set(P.x, P.y + 2.4, P.z);
  if (GOL.on) { GOL.x = P.x - dx * 3 + dz * 1.5; GOL.z = P.z - dz * 3 - dx * 1.5; GOL.y = groundBelow(GOL.x, GOL.z, 999); }
  hog.yaw = Math.atan2(dx, dz); updateHUD();
}

// ───────────────────────────── HUD, barks, dialogue, pages ─────────────────────────────
const PORTRAIT = {};
const pic = name => PORTRAIT[name] || '';
function updateHUD() {
  const hs = $('hearts'); while (hs.children.length < P.maxHp) hs.appendChild(document.createElement('i'));
  [...hs.children].forEach((h, i) => h.classList.toggle('off', i >= P.hp));
  $('food').textContent = `${world.foodGot}/${world.foodTotal}`;
}
function setObjective(t, target) { $('objective').textContent = t; world.target = target === undefined ? world.target : target; }
let toastT = 0, barkT = 0;
function toast(t, secs = 2.2) { $('toast').textContent = t; $('toast').classList.add('on'); toastT = secs; }
function bark(spr, text, secs = 4.2) { const b = $('bark'); b.hidden = false; b.querySelector('img').src = pic(spr); b.querySelector('p').textContent = text; barkT = secs; }
const dlg = { q: [], i: 0, shown: 0, done: null, full: '' };
function say(lines, done) { dlg.q = lines; dlg.i = 0; dlg.done = done || null; state = 'dialog'; $('dialog').hidden = false; $('prompt').hidden = true; showLine(); }
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
// The book itself tells the story: its pages are shown between stretches of play.
const book = { q: [], i: 0, done: null };
function pages(list, done) { if (!list.length) { if (done) done(); return; } book.q = list; book.i = 0; book.done = done || null; state = 'pages'; $('book').hidden = false; $('prompt').hidden = true; $('bark').hidden = true; showPage(); }
function showPage() { $('book-img').src = `assets/book/p-${String(book.q[book.i]).padStart(2, '0')}.jpg`; $('book-n').textContent = `${book.i + 1} / ${book.q.length}`; Sound.page(); }
function turnPage(skipAll) {
  if (!skipAll && ++book.i < book.q.length) return showPage();
  $('book').hidden = true; state = 'play'; const d = book.done; book.done = null; if (d) d();
}
function fadeThen(fn, ms = 280) { P.frozen = true; $('fade').style.opacity = 1; setTimeout(() => { fn(); P.frozen = false; $('fade').style.opacity = 0; }, ms); }
function chapterCard(L) { const c = $('card'); c.querySelector('small').textContent = L.chapter; c.querySelector('b').textContent = L.title; c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }

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
  if (full) { P.hp = P.maxHp; P.fuel = Math.max(P.fuel, 0.4); if (world.level.onRespawn) world.level.onRespawn(E); }
  P.gy = P.y; cam.tgt.set(P.x, P.y + 2.4, P.z); updateHUD();
}
function fall(wet) {
  if (P.frozen) return;
  if (wet) { Sound.splash(); puff(P.x, world.waterY + 0.3, P.z, 0xcfeaff, 14, 5, 0.6, 0.6, 6, 14); } else Sound.whoosh();
  P.hp -= 1; const dead = P.hp <= 0; if (dead) deaths++; updateHUD();
  fadeThen(() => respawn(dead ? checkpoint : lastSafe, dead));
}
function stepPlayer(dt) {
  if (P.frozen) return;
  P.inv = Math.max(0, P.inv - dt); P.boostT = Math.max(0, P.boostT - dt); P.squash = Math.max(0, P.squash - dt * 4); P.jumpBuf -= dt;
  if (P.dead > 0) {
    P.dead -= dt; P.vx *= 0.9; P.vz *= 0.9; P.vy -= GRAV * dt; P.y += P.vy * dt; const g = groundBelow(P.x, P.z, P.y + 1); if (P.y < g) { P.y = g; P.vy = 0; }
    if (P.dead <= 0) { P.dead = 0.001; fadeThen(() => respawn(checkpoint, true)); }
    return;
  }
  if (P.grounded && P.ground && P.ground.dz !== undefined) { P.x += P.ground.dx; P.z += P.ground.dz; }
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
  const icy = P.grounded && !P.ground && world.level.ice && world.level.ice(P.x, P.z);
  if (P.charge > 0) {
    P.charge -= dt;
    if (wm > 0.2) { const a = Math.atan2(P.dirZ, P.dirX), b = Math.atan2(wz, wx), na = a + clamp(wrap(b - a), -2.4 * dt, 2.4 * dt); P.dirX = Math.cos(na); P.dirZ = Math.sin(na); }
    P.vx = P.dirX * CHARGE_SPEED; P.vz = P.dirZ * CHARGE_SPEED; if (P.vy < 0) P.vy *= 0.8;
    if (Math.random() < dt * 40) puff(P.x - P.dirX * 1.6, P.y + 1 + Math.random(), P.z - P.dirZ * 1.6, 0x8fdc2a, 1, 2, 0.8, 0.45, 1);
  } else {
    // On ice the hog can barely push off or stop: that is the whole hazard.
    const acc = (icy ? (wm > 0.05 ? 13 : 4) : P.grounded ? (wm > 0.05 ? 62 : 50) : 26) * dt, tx = wx * RUN, tz = wz * RUN, dx = tx - P.vx, dz = tz - P.vz, d = Math.hypot(dx, dz);
    if (d <= acc) { P.vx = tx; P.vz = tz; } else { P.vx += dx / d * acc; P.vz += dz / d * acc; }
    if (wm > 0.2) { P.dirX = wx / wm; P.dirZ = wz / wm; }
  }
  P.sliding = false;
  if (P.grounded && !P.ground) {
    // A slope is ground that also rises behind the hog. The lip of a ledge drops away in front but is level behind:
    // treating that as a slope pinned the hog on the edge of every chasm he landed short of.
    const [gx, gz] = terrainGrad(P.x, P.z), sl0 = Math.hypot(gx, gz), sl = sl0 > 1.05 ? Math.min(sl0, (terrainH(P.x + gx / sl0 * 0.6, P.z + gz / sl0 * 0.6) - P.y) / 0.6) : sl0;
    P.slideT = sl > 2.5 ? (P.slideT || 0) + dt : 0;
    if (P.slideT > 1.2 && P.y < lastSafe.y - 5) { P.slideT = 0; fall(false); return; }   // wedged on a cliff face well below where he stood: that is a fall, not a place to stand
    if (sl > 1.05) { P.sliding = true; P.vx -= gx / sl0 * 34 * dt; P.vz -= gz / sl0 * 34 * dt; const up = (P.vx * gx + P.vz * gz) / sl0; if (up > 0) { P.vx -= gx / sl0 * up; P.vz -= gz / sl0 * up; } }
  }
  if (P.jumpBuf > 0) {
    if ((P.grounded || P.coyote > 0) && !P.sliding) { P.vy = JUMP; P.grounded = false; P.ground = null; P.coyote = 0; P.jumpBuf = 0; P.squash = -1; Sound.jump(); }
    else if (!P.grounded && P.coyote <= 0 && P.canBoost && P.fuel >= 0.2) { P.vy = 17.5; P.fuel -= 0.2; P.canBoost = false; P.boostT = 0.4; P.jumpBuf = 0; Sound.boost(); puff(P.x, P.y, P.z, 0x8fdc2a, 8, 3, 0.9, 0.5, -2); }
  }
  if (!input.jumpHeld && P.vy > 5 && P.boostT <= 0) P.vy -= 60 * dt;

  let nx = P.x + (P.vx + world.windX) * dt, nz = P.z + (P.vz + world.windZ) * dt;
  for (const s of solids) {
    if (s.off || P.y >= s.y1 - STEP || P.y + PH <= s.y0) continue;
    if (s.kind === 'cyl') {
      const r = cylR(s, P.y) + PR, dx = nx - s.x, dz = nz - s.z, d2 = dx * dx + dz * dz;
      if (d2 < r * r) { const d = Math.sqrt(d2) || 0.001; nx = s.x + dx / d * r; nz = s.z + dz / d * r; }
    } else if (nx > s.x0 - PR && nx < s.x1 + PR && nz > s.z0 - PR && nz < s.z1 + PR) {
      const a = nx - (s.x0 - PR), b = (s.x1 + PR) - nx, c = nz - (s.z0 - PR), d = (s.z1 + PR) - nz, m = Math.min(a, b, c, d);
      if (m === a) nx = s.x0 - PR; else if (m === b) nx = s.x1 + PR; else if (m === c) nz = s.z0 - PR; else nz = s.z1 + PR;
    }
  }
  // Round rooms and arenas: once inside, the hog stays inside (except through a gate).
  for (const r of world.rings) if (r.on !== false) {
    const dx = nx - r.x, dz = nz - r.z, d = Math.hypot(dx, dz), pd = Math.hypot(P.x - r.x, P.z - r.z), lim = r.r - PR;
    if (pd <= lim + 0.05 && d > lim && !(r.gate !== undefined && Math.abs(wrap(Math.atan2(dz, dx) - r.gate)) < r.gateW)) { nx = r.x + dx / d * lim; nz = r.z + dz / d * lim; }
  }
  if (terrainH(nx, nz) > P.y + STEP) { if (terrainH(nx, P.z) <= P.y + STEP) { nz = P.z; P.vz = 0; } else if (terrainH(P.x, nz) <= P.y + STEP) { nx = P.x; P.vx = 0; } else { nx = P.x; nz = P.z; P.vx = P.vz = 0; } }

  P.vy = Math.max(-46, P.vy - GRAV * dt);
  let ny = P.y + P.vy * dt;
  if (P.vy > 0) for (const s of solids) if (!s.off && s.y0 >= P.y + PH - 0.01 && ny + PH > s.y0 && inFoot(s, nx, nz, PR * 0.5)) { ny = s.y0 - PH; P.vy = 0; }
  const g = groundBelow(nx, nz, P.y + STEP, gOut), was = P.grounded;
  if (ny <= g || (was && P.vy <= 0 && ny - g < 0.5)) {
    if (!was && P.vy < -6) { P.squash = 1; Sound.land(); puff(nx, g + 0.2, nz, 0xe6dcc0, 5, 3, 0.5, 0.35, 0.6); }
    ny = g; P.vy = 0; P.grounded = true; P.ground = gOut.ref; P.coyote = 0.1; P.canBoost = true; P.gy = g;
  } else { P.grounded = false; P.ground = null; P.coyote -= dt; }
  P.x = nx; P.y = ny; P.z = nz;

  const moving = Math.hypot(P.vx, P.vz) > 1.5; P.anim += dt * (moving ? 1 : 0.3);
  const beat = Math.floor(P.anim * 13 / Math.PI); if (beat !== P.hoof) { P.hoof = beat; if (moving && P.grounded) Sound.hoof(); }
  if (P.grounded && moving && P.charge <= 0 && Math.random() < dt * 9) puff(P.x - P.dirX * 1.2, P.y + 0.2, P.z - P.dirZ * 1.2, 0xe6dcc0, 1, 1, 0.4, 0.35, 0.8);
  P.safeT -= dt;
  if (P.grounded && P.safeT <= 0 && !P.sliding && !icy && P.y > world.waterY + 0.3 && (!P.ground || P.ground.dz === undefined)) { P.safeT = 0.4; const [gx, gz] = P.ground ? [0, 0] : terrainGrad(P.x, P.z, 1.6); if (Math.hypot(gx, gz) < 0.5) lastSafe = { x: P.x, y: P.y, z: P.z }; }
  if (P.y < world.waterY - 0.4 && terrainH(P.x, P.z) < world.waterY) fall(true); else if (P.y < Math.max(world.killY, P.gy - 34)) fall(false);   // into the void, or simply a very long way down
  P.fuel = Math.min(1, P.fuel + (P.fuel < 0.25 ? 0.035 * dt : 0));
}

// ───────────────────────────── the Gollum Man, on his leash ─────────────────────────────
function stepGollum(dt) {
  const G = GOL; if (!G.on) return;
  if (G.mode === 'follow') {
    const tx = P.x - P.dirX * 3.6 + P.dirZ * 1.7, tz = P.z - P.dirZ * 3.6 - P.dirX * 1.7, dx = tx - G.x, dz = tz - G.z, d = Math.hypot(dx, dz);
    const lost = d > 26 || G.y < world.killY + 4 || Math.abs(G.y - P.y) > 9 && P.grounded;
    if (lost) { G.x = P.x - P.dirX * 2.5; G.z = P.z - P.dirZ * 2.5; G.y = P.y + 0.5; G.vy = 0; puff(G.x, G.y + 1, G.z, 0xe6dcc0, 8, 4, 0.5, 0.4, 1); return; }
    const sp = clamp((d - 0.8) * 5, 0, 15), mvx = d > 0.01 ? dx / d * sp : 0, mvz = d > 0.01 ? dz / d * sp : 0, nx = G.x + mvx * dt, nz = G.z + mvz * dt;
    const g = groundBelow(nx, nz, G.y + 2.4), safe = g > world.waterY - 0.1 && g > world.killY + 6;       // he will not walk into water or off a ledge; the leash yanks him over
    if (safe) { G.x = nx; G.z = nz; }
    const gg = groundBelow(G.x, G.z, G.y + 2.4); G.vy -= GRAV * dt; G.y += G.vy * dt; if (G.y <= gg) { G.y = gg; G.vy = 0; }
    if (sp > 1) { G.hx = dx / d; G.hz = dz / d; G.frame = 'gol_crawl'; } else { G.hx = lerp(G.hx, P.dirX, 0.05); G.hz = lerp(G.hz, P.dirZ, 0.05); G.frame = G.cower ? 'gol_crouch' : 'gol_idle'; }
    if (G.vy > 1 || G.y - gg > 0.6) G.frame = 'gol_jump';
  }
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function drawGollum(dt) {
  const G = GOL; G.m.g.visible = G.shadow.visible = G.on && !G.riding && state !== 'fly';
  leash.visible = G.on && G.mode === 'follow' && !G.riding && state !== 'fly';
  if (!G.on || G.riding) return;
  Models.animGollum(G.m, { frame: G.frame, dirX: G.hx, dirZ: G.hz, time, shake: false }, dt);
  G.m.g.position.set(G.x, G.y, G.z); placeShadow(G.shadow, G.x, G.y, G.z);
  if (leash.visible) { hog.arms[0].getWorldPosition(_a); G.m.head.getWorldPosition(_b); _a.y -= 0.6; leash.position.copy(_a).lerp(_b, 0.5); leash.scale.z = _a.distanceTo(_b); leash.lookAt(_b); }
}

// ───────────────────────────── food, crows, talk, triggers ─────────────────────────────
function addItem(type, x, z, y) {
  const s = Models.buildFood(type); world.g.add(s); const it = { type, x, z, y: y ?? groundBelow(x, z, 999) + 1.5, s, taken: false, ph: rnd() * TAU, drop: 0 };
  s.position.set(x, it.y, z); world.items.push(it); world.foodTotal++; return it;
}
function stepItems(dt) {
  for (const it of world.items) {
    if (it.taken) continue;
    if (it.drop > 0) { it.drop -= dt; continue; }
    if ((it.x - P.x) ** 2 + (it.z - P.z) ** 2 < 2.9 && Math.abs(P.y + 1.5 - it.y) < 2.3 && P.dead <= 0) {
      it.taken = true; it.s.visible = false; world.foodGot++; foodAll++;
      if (it.type === 'burrito') { P.fuel = Math.min(1, P.fuel + 0.5); if (P.hp < P.maxHp) { P.hp++; Sound.heal(); } else Sound.eat(); }
      else { P.fuel = Math.min(1, P.fuel + (it.type === 'burger' ? 0.25 : 0.15)); Sound.eat(); }
      puff(it.x, it.y, it.z, 0xfff3a0, 6, 4, 0.35, 0.4, 2); updateHUD();
    }
  }
}
function addCrow(cx, cz, r, spd, absY = null) {
  const m = Models.buildCrow(); world.g.add(m.g); const c = { m, cx, cz, r, spd, absY, ang: rnd() * TAU, alive: true, s: m.g, x: cx, y: 0, z: cz, shadow: makeShadow(0.8), back: 0 }; world.crows.push(c); return c;
}
function stepCrows(dt) {
  for (const c of world.crows) {
    if (!c.alive) { c.back -= dt; if (c.back <= 0 && Math.hypot(c.cx - P.x, c.cz - P.z) > 45) { c.alive = true; c.s.visible = c.shadow.visible = true; } continue; }
    c.ang += c.spd / c.r * dt; c.x = c.cx + Math.cos(c.ang) * c.r; c.z = c.cz + Math.sin(c.ang) * c.r;
    c.y = (c.absY ?? terrainH(c.x, c.z) + 1.1) + Math.sin(time * 3 + c.cx) * 0.35;
    if (P.dead > 0) continue;
    const dx = P.x - c.x, dz = P.z - c.z;
    if (dx * dx + dz * dz < 2.6 && P.y < c.y + 1.9 && P.y + PH > c.y) {
      const stomp = P.vy < -0.5 && P.y > c.y + 0.7;
      if (P.charge > 0 || stomp) { c.alive = false; c.back = 25; c.s.visible = c.shadow.visible = false; Sound.stomp(); puff(c.x, c.y + 1, c.z, 0x222222, 10, 6, 0.4, 0.6, 3, 12); P.fuel = Math.min(1, P.fuel + 0.1); if (stomp && P.charge <= 0) { P.vy = 14; P.canBoost = true; } }
      else hurt(1, dx, dz);
    }
  }
}
function addNpc(o) {       // o: { m, anim, spr, name, x, z, lines, onTalk, yaw }
  const y = groundBelow(o.x, o.z, 999); world.g.add(o.m.g); o.m.g.position.set(o.x, y - 0.05, o.z); o.m.yaw = o.yaw ?? 0; makeShadow(1.1).position.set(o.x, y + 0.07, o.z);
  const n = { ...o, y, i: 0, yaw0: o.m.yaw, body: addCyl(o.x, o.z, 0.8, 0.8, y - 2, y + 4, false) }; world.npcs.push(n); return n;
}
// (x, z) is where the hog reappears; the pole stands ox to the side of it. Keep (x, z) on solid ground.
function addFlag(x, z, ox = 3) {
  const y = groundBelow(x, z, 999); mesh(new THREE.CylinderGeometry(0.1, 0.1, 4, 5), M.woodDark, x + ox, y + 2, z);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1.8, -0.5, 0, 0, -1, 0]), 3));
  const f = new THREE.Mesh(g, M.flag); f.position.set(x + ox, y + 4, z); world.g.add(f); world.flags.push({ x, y, z, f, on: false });
}
// A trigger fires when the hog comes within r of it — on its own level, not from a ledge above or the ground below.
function addTrigger(x, z, r, fn, o = {}) { const t = { x, z, r, fn, done: false, y: o.y ?? groundBelow(x, z, 999), repeat: o.repeat }; world.triggers.push(t); return t; }
let nearNpc = null;
function stepWorld() {
  for (const f of world.flags) if (!f.on && Math.hypot(P.x - f.x, P.z - f.z) < 7 && Math.abs(P.y - f.y) < 4 && P.grounded) {
    world.flags.forEach(o => { o.on = false; o.f.material = M.flag; }); f.on = true; f.f.material = M.flagOn; checkpoint = { x: f.x, y: f.y, z: f.z }; Sound.check(); toast('Checkpoint'); }
  for (const t of world.triggers) if (!t.done && state === 'play' && P.dead <= 0 && Math.hypot(P.x - t.x, P.z - t.z) < t.r && Math.abs(P.y - t.y) < 6) { t.done = !t.repeat; t.fn(E); if (state !== 'play') break; }
  nearNpc = null;
  if (state === 'play') for (const n of world.npcs) if (!n.gone && Math.hypot(P.x - n.x, P.z - n.z) < (n.reach || 5.5) && Math.abs(P.y - n.y) < 3) nearNpc = n;
  $('prompt').hidden = !nearNpc; if (nearNpc) $('prompt').textContent = `E  ${nearNpc.verb || 'Talk to'} ${nearNpc.name}`;
  if (nearNpc && HIT.KeyE && P.grounded) { const n = nearNpc; if (n.onTalk) n.onTalk(n, E); else { const l = n.lines[n.i % n.lines.length]; n.i++; say(l.map(t => [n.spr, n.name, t])); } }
}
function updateCompass() {
  const t = state === 'play' ? (typeof world.target === 'function' ? world.target() : world.target) : null, el = $('compass');
  const dx = t ? t[0] - P.x : 0, dz = t ? t[1] - P.z : 0, d = Math.hypot(dx, dz);
  if (!t || d < 14) { el.hidden = true; return; }
  el.hidden = false; const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
  el.firstElementChild.style.transform = `rotate(${Math.atan2(dx * c - dz * s, -dx * s - dz * c)}rad)`; el.lastElementChild.textContent = `${Math.round(d)}m`;
}

// ───────────────────────────── foes ─────────────────────────────
// Every foe is an object with step(dt) and draw(dt), pushed onto world.tick / world.draw by its spawn function.
const actor = a => { world.tick.push(a); world.draw.push(a); return a; };
const blink = (m, inv, hz = 16) => { m.g.visible = !(inv > 0 && Math.floor(time * hz) % 2); };
const pips = (n, of) => '●'.repeat(Math.max(0, n)) + '○'.repeat(Math.max(0, of - n));

// The Tile Troll: sleeps by his pond, then slams when close and hurls tiles when not.
function spawnTroll(o) {
  const T = actor({ x: o.x, z: o.z, hx: o.hx ?? o.x, hz: o.hz ?? o.z, y: 0, hp: 3, state: 'sleep', t: 0, inv: 0, cool: 1, throwT: 3, yaw: o.yaw ?? 0, m: Models.buildTroll(), shadow: makeShadow(2.2), tiles: [], held: Models.buildTile() });
  world.g.add(T.m.g); T.m.yaw = T.yaw; T.body = addCyl(T.x, T.z, 1.7, 1.7, -99, 99, false); T.m.sh[0].add(T.held); T.held.position.set(0, -2.9, 0.3); T.held.visible = false;
  T.wake = () => { if (T.state === 'sleep') { T.state = 'idle'; T.cool = 1.2; Sound.thud(); cam.shake = 0.4; } };
  T.step = dt => {
    T.y = terrainH(T.x, T.z); T.inv = Math.max(0, T.inv - dt); T.cool -= dt; T.body.x = T.x; T.body.z = T.z; T.body.off = T.state === 'dead' || T.state === 'gone';
    T.body.y0 = T.y - 1; T.body.y1 = T.y + 5;
    for (const tl of T.tiles) if (tl.life > 0) {
      tl.life -= dt; tl.x += tl.vx * dt; tl.z += tl.vz * dt; tl.m.position.set(tl.x, tl.y, tl.z); tl.m.rotation.y += 14 * dt;
      const hit = (P.x - tl.x) ** 2 + (P.z - tl.z) ** 2 < 2.6 && Math.abs(P.y + 1.5 - tl.y) < 2;
      if (tl.life <= 0 || hit) { tl.life = 0; tl.m.visible = false; puff(tl.x, tl.y, tl.z, 0xf4f6f8, 8, 5, 0.3, 0.4, 2, 10); if (hit && P.charge <= 0) hurt(1, tl.vx, tl.vz); else if (hit) Sound.stomp(); }
    }
    if (T.state === 'sleep' || T.state === 'dead' || T.state === 'gone') return;
    const dx = P.x - T.x, dz = P.z - T.z, d = Math.hypot(dx, dz) || 0.001, alive = P.dead <= 0;
    if (alive) T.yaw = Math.atan2(dx, dz);
    if (T.state === 'idle') {
      T.walking = alive && d > 3.6 && Math.hypot(P.x - T.hx, P.z - T.hz) < 26;
      if (T.walking) { T.x += dx / d * 3.8 * dt; T.z += dz / d * 3.8 * dt; }
      T.throwT -= dt;
      if (alive && d < 5 && T.cool <= 0) { T.state = 'windup'; T.t = 0.6; }
      else if (alive && d > 9 && d < 34 && T.throwT <= 0) { T.state = 'hoist'; T.t = 0.75; T.held.visible = true; }
    } else if (T.state === 'windup') {
      T.t -= dt;
      if (T.t <= 0) { T.state = 'recover'; T.t = 1.1; Sound.thud(); cam.shake = Math.max(cam.shake, 0.45); puff(T.x + dx / d * 2.5, T.y + 0.3, T.z + dz / d * 2.5, 0xd8c8a0, 12, 8, 0.8, 0.6, 2); if (d < 5.8 && P.y - T.y < 2.6 && P.charge <= 0) hurt(1, dx, dz); }
    } else if (T.state === 'hoist') {
      T.t -= dt;
      if (T.t <= 0) {       // "he hoisted aloft a shining square" — and lets fly
        T.state = 'recover'; T.t = 0.5; T.throwT = 2.6 + Math.random(); T.held.visible = false; Sound.whoosh();
        let tl = T.tiles.find(q => q.life <= 0); if (!tl) { tl = { m: Models.buildTile() }; world.g.add(tl.m); T.tiles.push(tl); }
        tl.x = T.x; tl.z = T.z; tl.y = T.y + 2.2; tl.vx = dx / d * 21; tl.vz = dz / d * 21; tl.life = 2.2; tl.m.visible = true; tl.m.rotation.set(Math.PI / 2, 0, 0);
      }
    } else if (T.state === 'recover') { T.t -= dt; if (T.t <= 0) { T.state = 'idle'; T.cool = 1.0; } }
    if (alive && T.inv <= 0) {
      const charge = P.charge > 0 && d < 3.3 && P.y - T.y < 6, stomp = P.vy < -1 && d < 2.4 && P.y > T.y + 4.6 && P.y < T.y + 7.5;
      if (charge || stomp) {
        T.hp--; T.inv = 1.3; T.held.visible = false; Sound.stomp(); Sound.thud(); cam.shake = 0.4; puff(T.x, T.y + 4, T.z, 0xffffff, 10, 7, 0.6, 0.4, 2); T.x -= dx / d * 1.6; T.z -= dz / d * 1.6;
        if (stomp) { P.vy = 15; P.canBoost = true; } else { P.charge = 0; P.vx = dx / d * 9; P.vz = dz / d * 9; P.vy = 8; P.grounded = false; }
        if (o.onHit) o.onHit(T);
        if (T.hp <= 0) { T.state = 'dead'; if (o.onDefeat) o.onDefeat(T); } else { T.state = 'windup'; T.t = 0.8; }
      }
    }
  };
  T.draw = dt => {
    const st = T.state === 'sleep' || T.state === 'dead' ? 'dead' : T.state === 'hoist' ? 'windup' : T.state === 'gone' ? 'dead' : T.state;
    Models.animTroll(T.m, { state: st, walking: T.walking && T.state === 'idle', time, yaw: T.yaw }, dt);
    T.m.g.position.set(T.x, T.y, T.z); blink(T.m, T.state === 'dead' ? 0 : T.inv); T.shadow.position.set(T.x, T.y + 0.07, T.z);
    if (T.state === 'gone') { T.m.g.visible = false; T.shadow.visible = false; }
  };
  T.y = terrainH(T.x, T.z);
  return T;
}

// The shield-maiden: no charge gets through her shield from the front. She bashes, tires, and that is the opening.
function spawnMaiden(o) {
  const A = actor({ x: o.x, z: o.z, hx: o.x, hz: o.z, y: 0, hp: o.hp ?? 3, max: o.hp ?? 3, state: 'idle', t: 0, inv: 0, cool: 2.4, yaw: o.yaw ?? 0, fx: 0, fz: 1, m: Models.buildMaiden(), shadow: makeShadow(1.2), on: false });
  world.g.add(A.m.g); A.m.yaw = A.yaw; A.body = addCyl(A.x, A.z, 1.0, 1.0, -99, 99, false);
  A.start = () => { A.on = true; A.state = 'guard'; };
  A.step = dt => {
    A.y = groundBelow(A.x, A.z, A.y + 3); A.inv = Math.max(0, A.inv - dt); A.body.x = A.x; A.body.z = A.z; A.body.y0 = A.y - 1; A.body.y1 = A.y + 4; A.body.off = !A.on || A.state === 'gone';
    if (!A.on || A.state === 'gone') return;
    const dx = P.x - A.x, dz = P.z - A.z, d = Math.hypot(dx, dz) || 0.001, alive = P.dead <= 0;
    A.walking = false;
    if (A.state === 'guard') {
      const ty = Math.atan2(dx, dz); A.yaw += clamp(wrap(ty - A.yaw), -3.2 * dt, 3.2 * dt);
      if (alive && d > 6.5) { A.x += dx / d * 3 * dt; A.z += dz / d * 3 * dt; A.walking = true; }
      A.cool -= dt; if (alive && A.cool <= 0 && d < 20) { A.state = 'windup'; A.t = 0.7; Sound.gollum(); }
    } else if (A.state === 'windup') {
      A.yaw = Math.atan2(dx, dz); A.t -= dt; if (A.t <= 0) { A.state = 'bash'; A.t = 0.8; A.fx = dx / d; A.fz = dz / d; Sound.whoosh(); }
    } else if (A.state === 'bash') {
      A.t -= dt; let nx = A.x + A.fx * 20 * dt, nz = A.z + A.fz * 20 * dt;
      if (o.arena) { const ax = nx - o.arena.x, az = nz - o.arena.z, ad = Math.hypot(ax, az); if (ad > o.arena.r - 1.5) { nx = o.arena.x + ax / ad * (o.arena.r - 1.5); nz = o.arena.z + az / ad * (o.arena.r - 1.5); A.t = Math.min(A.t, 0.05); } }
      A.x = nx; A.z = nz; if (Math.random() < dt * 30) puff(A.x, A.y + 0.3, A.z, 0xd8d0c0, 1, 2, 0.5, 0.3, 0.5);
      if (alive && d < 2.3 && Math.abs(P.y - A.y) < 2.6 && P.charge <= 0) hurt(1, dx, dz);
      if (A.t <= 0) { A.state = 'tired'; A.t = 1.9 - (A.max - A.hp) * 0.2; }
    } else if (A.state === 'tired') { A.t -= dt; if (A.t <= 0) { A.state = 'guard'; A.cool = 2.0 - (A.max - A.hp) * 0.35 + Math.random(); }
    } else if (A.state === 'hurt') { A.t -= dt; A.x -= A.fx * 9 * dt * A.t; A.z -= A.fz * 9 * dt * A.t; if (A.t <= 0) { A.state = 'guard'; A.cool = 1.4; } }
    // The hog's attacks.
    if (alive && A.inv <= 0 && A.state !== 'hurt') {
      const charge = P.charge > 0 && d < 2.8 && Math.abs(P.y - A.y) < 2.8, stomp = P.vy < -1 && d < 1.9 && P.y > A.y + 2.4 && P.y < A.y + 5;
      if (charge || stomp) {
        const behind = Math.abs(wrap(Math.atan2(dx, dz) - A.yaw)) > 1.9;                 // the hog is at her back
        if (A.state === 'tired' || (behind && charge)) {
          A.hp--; A.inv = 1.2; A.state = 'hurt'; A.t = 0.8; A.fx = dx / d; A.fz = dz / d; Sound.stomp(); Sound.clang(); cam.shake = 0.35; puff(A.x, A.y + 2, A.z, 0xffffff, 10, 6, 0.5, 0.4, 2);
          if (stomp) { P.vy = 14; P.canBoost = true; } else { P.charge = 0; P.vx = dx / d * 8; P.vz = dz / d * 8; P.vy = 7; P.grounded = false; }
          if (o.onHit) o.onHit(A);
          if (A.hp <= 0) { A.state = 'gone'; puff(A.x, A.y + 2, A.z, 0x55605a, 16, 7, 0.8, 0.7, 3); if (o.onDefeat) o.onDefeat(A); }
        } else { Sound.clang(); cam.shake = 0.25; A.inv = 0.5; P.charge = 0; P.vx = dx / d * 13; P.vz = dz / d * 13; P.vy = stomp ? 13 : 7; P.grounded = false; P.stun = 0.25; puff(A.x + dx / d, A.y + 2, A.z + dz / d, 0xffe9a0, 6, 6, 0.3, 0.3, 2); }
      }
    }
  };
  A.draw = dt => {
    Models.animMaiden(A.m, { state: A.state === 'gone' ? 'idle' : A.state, yaw: A.yaw, time, walk: A.walking }, dt);
    A.m.g.position.set(A.x, A.y, A.z); blink(A.m, A.inv); A.shadow.position.set(A.x, A.y + 0.07, A.z);
    if (A.state === 'gone') A.m.g.visible = A.shadow.visible = false;
  };
  A.y = groundBelow(A.x, A.z, 999);
  return A;
}

// Anyone who lobs things in an arc: the Tower Man and his slop bucket. o.src() gives where it leaves his hands.
function spawnThrower(o) {
  const A = actor({ x: o.x, z: o.z, y: o.y ?? 0, hp: o.hp ?? 0, max: o.hp ?? 0, on: false, t: o.first ?? 1.2, inv: 0, m: o.m, shots: [], pose: 'idle', poseT: 0, yaw: o.yaw ?? 0 });
  const ringG = new THREE.RingGeometry(2.0, 2.5, 16).rotateX(-Math.PI / 2), ringM = new THREE.MeshBasicMaterial({ color: 0x7a5a1a, transparent: true, opacity: 0.7, depthWrite: false });
  A.lob = (tx, tz, onLand) => {
    let s = A.shots.find(q => q.life <= 0);
    if (!s) { s = { m: mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.6, 7), lam(0x6b4a2a), 0, 0, 0), ring: mesh(ringG, ringM, 0, 0, 0) }; A.shots.push(s); }
    const [sx, sy, sz] = o.src(A); Object.assign(s, { sx, sy, sz, tx, tz, ty: groundBelow(tx, tz, 999), life: 1.3, dur: 1.3, onLand }); s.m.visible = s.ring.visible = true; s.ring.position.set(tx, s.ty + 0.12, tz);
    A.pose = 'throw'; A.poseT = 0.5; Sound.whoosh();
  };
  A.step = dt => {
    A.inv = Math.max(0, A.inv - dt); A.poseT -= dt; if (A.poseT <= 0) A.pose = A.on ? 'shout' : 'idle';
    for (const s of A.shots) if (s.life > 0) {
      s.life -= dt; const k = 1 - s.life / s.dur; s.m.position.set(lerp(s.sx, s.tx, k), lerp(s.sy, s.ty, k) + 9 * k * (1 - k), lerp(s.sz, s.tz, k)); s.m.rotation.x += 7 * dt; s.ring.scale.setScalar(1.25 - k * 0.25);
      if (s.life <= 0) { s.m.visible = s.ring.visible = false; Sound.splat(); puff(s.tx, s.ty + 0.4, s.tz, 0x7a6a2a, 14, 6, 0.6, 0.6, 4, 12); if (s.onLand) s.onLand(); else if (Math.hypot(P.x - s.tx, P.z - s.tz) < 2.7 && P.y - s.ty < 2.5) hurt(1, P.x - s.tx, P.z - s.tz); }
    }
    if (!A.on || P.dead > 0) return;
    A.yaw = Math.atan2(P.x - A.x, P.z - A.z);
    A.t -= dt; if (A.t <= 0 && (!o.active || o.active())) { A.t = o.period ?? 2.4; A.lob(P.x + P.vx * 0.9, P.z + P.vz * 0.9); }
    if (A.max && A.inv <= 0) {
      const dx = P.x - A.x, dz = P.z - A.z, d = Math.hypot(dx, dz) || 0.001;
      if ((P.charge > 0 && d < 2.8 && Math.abs(P.y - A.y) < 3) || (P.vy < -1 && d < 1.9 && P.y > A.y + 2.2 && P.y < A.y + 5)) {
        A.hp--; A.inv = 1.4; Sound.stomp(); cam.shake = 0.3; puff(A.x, A.y + 2, A.z, 0xffffff, 10, 6, 0.5, 0.4, 2); P.charge = 0; P.vx = dx / d * 8; P.vz = dz / d * 8; P.vy = 9; P.grounded = false;
        if (o.onHit) o.onHit(A);
        if (A.hp <= 0) { A.on = false; A.gone = true; puff(A.x, A.y + 2, A.z, 0x8a7a5a, 16, 7, 0.8, 0.7, 3); if (o.onDefeat) o.onDefeat(A); }
      }
    }
  };
  A.draw = dt => { if (!A.m) return; Models.animFolk(A.m, { yaw: A.yaw, time, pose: A.pose }, dt); A.m.g.position.set(A.x, A.y, A.z); blink(A.m, A.inv); if (A.gone) A.m.g.visible = false; };
  return A;
}

// The wizard, turned: he looses slow lights that hunt the hog. A charge pops them, and him.
function spawnCaster(o) {
  const A = actor({ x: o.x, z: o.z, y: o.y, hp: o.hp ?? 2, on: false, t: 1.5, inv: 0, m: o.m, orbs: [], yaw: 0 });
  A.step = dt => {
    A.inv = Math.max(0, A.inv - dt);
    for (const b of A.orbs) if (b.life > 0) {
      b.life -= dt; const dx = P.x - b.x, dz = P.z - b.z, dy = P.y + 1.5 - b.y, d = Math.hypot(dx, dz, dy) || 0.001, k = 1 - Math.exp(-1.8 * dt);
      b.vx = lerp(b.vx, dx / d * 9.5, k); b.vy = lerp(b.vy, dy / d * 9.5, k); b.vz = lerp(b.vz, dz / d * 9.5, k); b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.m.position.set(b.x, b.y, b.z); b.m.scale.setScalar(1 + Math.sin(time * 20) * 0.15);
      if (Math.random() < dt * 20) puff(b.x, b.y, b.z, 0xffe9a0, 1, 0.5, 0.2, 0.3, 0);
      if (d < 1.9 || b.life <= 0) { b.life = 0; b.m.visible = false; puff(b.x, b.y, b.z, 0xffe9a0, 8, 5, 0.3, 0.3, 1); if (d < 1.9 && P.charge <= 0) hurt(1, dx, dz); else if (d < 1.9) Sound.stomp(); }
    }
    if (!A.on || P.dead > 0) return;
    const dx = P.x - A.x, dz = P.z - A.z, d = Math.hypot(dx, dz) || 0.001; A.yaw = Math.atan2(dx, dz);
    A.t -= dt; if (A.t <= 0) {
      A.t = 2.3; Sound.bolt(); let b = A.orbs.find(q => q.life <= 0); if (!b) { b = { m: mesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }), 0, 0, 0) }; A.orbs.push(b); }
      Object.assign(b, { x: A.x, y: A.y + 4.2, z: A.z, vx: 0, vy: 4, vz: 0, life: 4.6 }); b.m.visible = true;
    }
    if (A.inv <= 0 && ((P.charge > 0 && d < 2.8 && Math.abs(P.y - A.y) < 3) || (P.vy < -1 && d < 1.9 && P.y > A.y + 2.2 && P.y < A.y + 5))) {
      A.hp--; A.inv = 1.4; Sound.stomp(); cam.shake = 0.3; puff(A.x, A.y + 2, A.z, 0xffffff, 10, 6, 0.5, 0.4, 2); P.charge = 0; P.vx = dx / d * 8; P.vz = dz / d * 8; P.vy = 9; P.grounded = false;
      if (o.onHit) o.onHit(A);
      if (A.hp <= 0) { A.on = false; A.gone = true; for (const b of A.orbs) { b.life = 0; b.m.visible = false; } puff(A.x, A.y + 2, A.z, 0xbfd0ff, 16, 7, 0.8, 0.7, 3); if (o.onDefeat) o.onDefeat(A); }
      else if (o.spots) { const s = o.spots[(Math.random() * o.spots.length) | 0]; puff(A.x, A.y + 2, A.z, 0xbfd0ff, 12, 6, 0.6, 0.5, 2); A.x = s[0]; A.z = s[1]; puff(A.x, A.y + 2, A.z, 0xbfd0ff, 12, 6, 0.6, 0.5, 2); }
    }
  };
  A.draw = dt => { Models.animNpc(A.m, { time, yaw: A.yaw, talking: A.on }, dt); A.m.g.position.set(A.x, A.y, A.z); blink(A.m, A.inv); if (A.gone) A.m.g.visible = false; };
  return A;
}

// Things that roll down a path at the hog: snowballs on the mountain, barrels on the castle's spiral.
// o: { curve(u, lane) → [x, z], u0, length, speed, period, lane (alternating ±) or lanes (a repeating list), radius, make(), active(), colour }
function spawnRollers(o) {
  const A = actor({ list: [], t: 1, n: 0 });
  A.step = dt => {
    A.t -= dt;
    if (A.t <= 0 && o.active()) { A.t = o.period; let b = A.list.find(q => !q.alive); if (!b) { b = { m: o.make(), shadow: makeShadow(o.radius * 0.95) }; world.g.add(b.m); A.list.push(b); } b.alive = true; b.u = o.u0; b.lane = o.lanes ? o.lanes[A.n++ % o.lanes.length] : (A.n++ % 2 ? 1 : -1) * o.lane; b.m.visible = b.shadow.visible = true; }
    for (const b of A.list) if (b.alive) {
      b.u -= o.speed * dt / o.length; [b.x, b.z] = o.curve(b.u, b.lane); b.y = groundBelow(b.x, b.z, 999) + o.radius * 0.95;
      const [ax, az] = o.curve(b.u + 0.004, b.lane); b.m.position.set(b.x, b.y, b.z); b.m.rotation.y = Math.atan2(ax - b.x, az - b.z); b.m.children[0].rotation.x -= o.speed / o.radius * dt; b.shadow.position.set(b.x, b.y - o.radius * 0.9, b.z);
      const dx = P.x - b.x, dz = P.z - b.z, dy = P.y + 1.5 - b.y, smash = () => { b.alive = false; b.m.visible = b.shadow.visible = false; puff(b.x, b.y, b.z, o.colour, 12, 7, 0.7, 0.6, 3, 14); };
      if (b.u <= (o.u1 ?? 0)) { smash(); if (Math.hypot(dx, dz) < 40) Sound.land(); }
      else if (P.dead <= 0 && dx * dx + dz * dz + dy * dy < (o.radius + 0.85) ** 2) { if (P.charge > 0) { smash(); Sound.stomp(); Sound.thud(); cam.shake = 0.3; P.fuel = Math.min(1, P.fuel + 0.06); } else hurt(1, dx, dz); }
    }
  };
  A.draw = () => {};
  return A;
}

// ───────────────────────────── the last page: Juli flies ─────────────────────────────
function startFlight(o) {      // o: { x, y, z, rings: [[x, y, z]...], done }
  Object.assign(fly, { x: o.x, y: o.y, z: o.z, yaw: Math.PI, pitch: 0.1, got: 0, done: o.done, rings: o.rings.map(([x, y, z]) => { const m = Models.buildRingGate(); m.position.set(x, y, z); world.g.add(m); return { x, y, z, m, got: false }; }) });
  fly.endZ = o.rings[o.rings.length - 1][2] - 70; state = 'fly'; $('hud').classList.add('flying'); setObjective(`Fly!  Rings 0/${fly.rings.length}`, null); $('prompt').hidden = true;
  hog.pillion.add(GOL.m.g); GOL.m.g.position.set(0, -0.75, 0); GOL.m.g.rotation.set(0, 0, 0); GOL.m.yaw = 0; GOL.riding = true; GOL.m.g.visible = true;
  toast('W / S climb and dive  ·  A / D bank', 5);
}
function stepFlight(dt) {
  fly.yaw += -input.x * 1.25 * dt; fly.pitch = clamp(fly.pitch + (input.y * 1.5 - fly.pitch * 1.2) * dt, -0.6, 0.6);
  const cp = Math.cos(fly.pitch), dx = Math.sin(fly.yaw) * cp, dy = Math.sin(fly.pitch), dz = Math.cos(fly.yaw) * cp, sp = 26, pz = fly.z;
  fly.x += dx * sp * dt; fly.y = clamp(fly.y + dy * sp * dt, 26, 110); fly.z += dz * sp * dt;
  for (const r of fly.rings) {
    r.m.rotation.z += dt * 0.8;
    if (!r.got && (pz - r.z) * (fly.z - r.z) <= 0 && Math.hypot(fly.x - r.x, fly.y + 1.5 - r.y) < 5.6) { r.got = true; fly.got++; r.m.visible = false; Sound.ring(); puff(r.x, r.y, r.z, 0xffe27a, 16, 9, 0.5, 0.7, 2); setObjective(`Fly!  Rings ${fly.got}/${fly.rings.length}`); }
  }
  Models.animGollum(GOL.m, { frame: 'gol_idle', dirX: 0, dirZ: 1, time, shake: false }, dt); GOL.m.g.rotation.y = 0;
  Models.animHogman(hog, { dirX: Math.sin(fly.yaw), dirZ: Math.cos(fly.yaw), moving: true, grounded: false, vy: 0, charge: false, boost: 0, dead: false, anim: time, time, squash: 0, fly: true }, dt);
  hog.g.position.set(fly.x, fly.y, fly.z); hog.g.rotation.x = -fly.pitch; hog.g.rotation.z = input.x * -0.35; hog.g.visible = true; playerShadow.visible = false;
  const k = 1 - Math.exp(-6 * dt); cam.tgt.x = lerp(cam.tgt.x, fly.x, k); cam.tgt.y = lerp(cam.tgt.y, fly.y + 2, k); cam.tgt.z = lerp(cam.tgt.z, fly.z, k);
  camera.position.set(cam.tgt.x - Math.sin(fly.yaw) * 15, cam.tgt.y + 5, cam.tgt.z - Math.cos(fly.yaw) * 15); camera.lookAt(cam.tgt.x + dx * 8, cam.tgt.y + dy * 8, cam.tgt.z + dz * 8);
  if (fly.z < fly.endZ || HIT.KeyN && DEV) { state = 'play'; $('hud').classList.remove('flying'); const d = fly.done; fly.done = null; d(fly.got, fly.rings.length); }
}

// ───────────────────────────── camera ─────────────────────────────
function camBlocked(x, y, z) {
  if (y < terrainH(x, z) + 0.7) return true;
  for (const s of solids) if (s.occlude && !s.off && y > s.y0 - 0.3 && y < s.y1 + 0.3) {
    if (s.kind === 'cyl' ? (x - s.x) ** 2 + (z - s.z) ** 2 < (cylR(s, y) + 0.6) ** 2 : x > s.x0 - 0.6 && x < s.x1 + 0.6 && z > s.z0 - 0.6 && z < s.z1 + 0.6) return true;
  }
  return false;
}
function updateCamera(dt, follow = true) {
  if (SAGA.spy) { follow = false; cam.tgt.set(...SAGA.spy); }
  if (follow) {
    if (input.camX || input.camY) cam.manualT = 1.6; else cam.manualT -= dt;
    cam.yaw += input.camX * 2.3 * dt; cam.pitch = clamp(cam.pitch + input.camY * 1.3 * dt, 0.06, 1.3);
    if (cam.manualT <= 0 && state === 'play' && P.charge <= 0) cam.yaw -= input.x * 0.85 * dt;
    const k = 1 - Math.exp(-12 * dt), ky = 1 - Math.exp(-(P.grounded ? 9 : 5) * dt);
    cam.tgt.x = lerp(cam.tgt.x, P.x, k); cam.tgt.z = lerp(cam.tgt.z, P.z, k); cam.tgt.y = lerp(cam.tgt.y, P.y + 2.4, ky);
  }
  const cp = Math.cos(cam.pitch), ox = Math.sin(cam.yaw) * cp, oy = Math.sin(cam.pitch), oz = Math.cos(cam.yaw) * cp;
  let dmax = cam.dist;
  if (follow) for (let d = 1.5; d <= cam.dist + 0.01; d += 0.75) if (camBlocked(cam.tgt.x + ox * d, cam.tgt.y + oy * d, cam.tgt.z + oz * d)) { dmax = Math.max(3.5, d - 0.9); break; }
  cam.cur = dmax < cam.cur ? dmax : lerp(cam.cur, dmax, 1 - Math.exp(-4 * dt));
  cam.shake = Math.max(0, cam.shake - dt); const sh = cam.shake * 1.2;
  camera.position.set(cam.tgt.x + ox * cam.cur + (Math.random() - 0.5) * sh, cam.tgt.y + oy * cam.cur + (Math.random() - 0.5) * sh, cam.tgt.z + oz * cam.cur);
  camera.lookAt(cam.tgt);
}
let dragging = false, lastPX = 0, lastPY = 0;
canvas.addEventListener('pointerdown', e => { dragging = true; lastPX = e.clientX; lastPY = e.clientY; canvas.classList.add('drag'); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!dragging) return; cam.yaw -= (e.clientX - lastPX) * 0.006; cam.pitch = clamp(cam.pitch + (e.clientY - lastPY) * 0.005, 0.06, 1.3); lastPX = e.clientX; lastPY = e.clientY; cam.manualT = 2.5; });
const endDrag = () => { dragging = false; canvas.classList.remove('drag'); };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 1.5, 8, 28); e.preventDefault(); }, { passive: false });

// ───────────────────────────── drawing ─────────────────────────────
function updateVisuals(dt) {
  if (state !== 'fly') {
    Models.animHogman(hog, { dirX: P.dirX, dirZ: P.dirZ, moving: Math.hypot(P.vx, P.vz) > 1.5, grounded: P.grounded, vy: P.vy, charge: P.charge > 0, boost: P.boostT, dead: P.dead > 0, anim: P.anim, time, squash: P.squash }, dt);
    hog.g.rotation.x = 0; hog.g.position.set(P.x, P.y + hog.lift, P.z);
    hog.g.visible = state === 'title' ? false : !(P.inv > 0 && P.dead <= 0 && Math.floor(time * 14) % 2);
    placeShadow(playerShadow, P.x, P.y, P.z); playerShadow.visible = state !== 'title';
  }
  for (const it of world.items) if (!it.taken) { it.s.rotation.y = time * 1.8 + it.ph; it.s.position.y = it.y + Math.sin(time * 2 + it.ph) * 0.18; it.s.visible = it.drop <= 0; }
  for (const c of world.crows) if (c.alive) { const d = Math.sign(c.spd); Models.animCrow(c.m, { dirX: -Math.sin(c.ang) * d, dirZ: Math.cos(c.ang) * d, time, phase: c.cx, bank: d }, dt); c.s.position.set(c.x, c.y + 1, c.z); placeShadow(c.shadow, c.x, c.y, c.z); }
  for (const n of world.npcs) if (!n.gone) (n.anim || Models.animNpc)(n.m, { time, yaw: n.fixed ? n.yaw0 : Math.hypot(P.x - n.x, P.z - n.z) < 22 ? Math.atan2(P.x - n.x, P.z - n.z) : n.yaw0, talking: state === 'dialog' && nearNpc === n, pose: n.pose }, dt);
  for (const a of world.draw) a.draw(dt);
  drawGollum(dt);
  for (const f of world.flags) f.f.rotation.y = Math.sin(time * 3 + f.x) * 0.5;
  tickAmbience(dt);
  $('gasfill').style.width = `${P.fuel * 100}%`; $('gas').classList.toggle('low', P.fuel < 0.2);
  updateCompass();
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').classList.remove('on');
  if (barkT > 0 && (barkT -= dt) <= 0) $('bark').hidden = true;
  updateParticles(dt);
}

// ───────────────────────────── main loop and the run of chapters ─────────────────────────────
function simulate(dt) {
  time += dt; playTime += dt;
  for (const m of movers) m.update(dt);
  stepPlayer(dt); stepGollum(dt); stepItems(dt); stepCrows(dt);
  for (const a of world.tick) a.step(dt);
}
function frame(dt) {
  readInput();
  if (HIT.KeyM) toast(Sound.toggle() ? 'Sound off' : 'Sound on', 1);
  if (state === 'play') {
    if (cardDue) { cardDue = false; chapterCard(world.level); }                 // once the opening pages are turned
    if (HIT.Escape || HIT.KeyP) { state = 'pause'; $('pause').hidden = false; }
    else {
      if (HIT.Space) P.jumpBuf = 0.13;
      if (HIT.ShiftLeft || HIT.ShiftRight || HIT.KeyF) P.wantCharge = true;
      if (DEV) { for (let i = 0; i < LEVELS.length; i++) if (HIT['Digit' + (i + 1)]) { beginLevel(i); break; } if (HIT.KeyN) completeLevel(); }
      for (let rem = dt; rem > 1e-5 && state === 'play';) { const h = Math.min(rem, 1 / 90); simulate(h); rem -= h; }
      if (state === 'play') stepWorld();
      updateCamera(dt);
    }
  } else if (state === 'pause') { if (HIT.Escape || HIT.KeyP || HIT.Enter) { state = 'play'; $('pause').hidden = true; }
  } else if (state === 'dialog') { time += dt; tickDialog(dt); updateCamera(dt);
  } else if (state === 'pages') { time += dt; if (HIT.Enter || HIT.Space || HIT.KeyE) turnPage(false); else if (HIT.Escape) turnPage(true); if (state !== 'pages') updateCamera(dt);
  } else if (state === 'fly') { time += dt; stepFlight(dt);
  } else if (state === 'title' || state === 'end') {
    time += dt; cam.yaw += dt * 0.1; cam.pitch = 0.3; cam.cur = cam.dist = 34; const [sx, sz] = world.level.start; cam.tgt.set(sx, groundBelow(sx, sz, 999) + 6, sz - 20); updateCamera(dt, false);
    if (state === 'title' && (HIT.Enter || HIT.Space)) startGame(saved() > 0 ? saved() : 0);
  }
  updateVisuals(dt);
  renderer.render(scene, camera);
  for (const k in HIT) delete HIT[k];
}
let lastT = 0, cardDue = false;
function loop(t) { const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t; frame(dt); requestAnimationFrame(loop); }

function saved() { try { return clamp(parseInt(localStorage.getItem('hogSaga.chapter') || '0', 10) || 0, 0, LEVELS.length - 1); } catch { return 0; } }
function beginLevel(i) {
  loadLevel(i); state = 'play'; $('hud').hidden = false;
  try { localStorage.setItem('hogSaga.chapter', String(i)); } catch { /* private window: no saving */ }   // progress is the chapter reached (the title's backdrop load must not overwrite it) $('hud').classList.remove('flying'); $('bark').hidden = true; $('book').hidden = true; $('dialog').hidden = true;
  cardDue = true; world.level.begin(E);
}
function startGame(i) {
  if (state !== 'title') return;
  Sound.init(); $('title').hidden = true; P.maxHp = 4; playTime = 0; deaths = 0; foodAll = 0;
  if (i === 0) { state = 'play'; pages([2, 3], () => beginLevel(0)); } else beginLevel(i);
}
function completeLevel() {
  if (P.frozen) return; const next = world.index + 1;
  Sound.win();
  if (next < LEVELS.length) fadeThen(() => beginLevel(next), 900);
  else fadeThen(() => { state = 'end'; $('hud').hidden = true; try { localStorage.setItem('hogSaga.chapter', '0'); } catch { /* fine */ }
    const m = Math.floor(playTime / 60), s = Math.floor(playTime % 60);
    $('end-stats').innerHTML = `Time ${m}:${String(s).padStart(2, '0')}<br>Morsels eaten ${foodAll}<br>Tumbles ${deaths}` + (fly.rings.length ? `<br>Rings ${fly.got}/${fly.rings.length}` : '');
    hog.g.rotation.set(0, 0, 0); loadLevel(0); $('end').hidden = false; }, 900);
}

// What a chapter is handed to build itself with.
const E = {
  THREE, Models, M, P, GOL, world, cam, lam, rep, mesh, makeShadow, puff, Sound,
  h: terrainH, ground: (x, z) => groundBelow(x, z, 999), addCyl, addBox, movers,
  put(m, x, z, yaw = 0, sink = 0.2) { m.position.set(x, groundBelow(x, z, 999) - sink, z); m.rotation.y = yaw; world.g.add(m); return m; },
  item: addItem, crow: addCrow, npc: addNpc, flag: addFlag, trigger: addTrigger,
  line(type, x0, z0, x1, z1, n) { for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1); addItem(type, lerp(x0, x1, t), lerp(z0, z1, t)); } },
  ring(o) { world.rings.push(o); return o; },
  light(x, y, z, colour = 0xffb060, strength = 60, reach = 40) { const l = new THREE.PointLight(colour, strength, reach, 1.6); l.position.set(x, y, z); world.g.add(l); return l; },
  say, pages, bark, toast, objective: setObjective, ambience: setAmbience, hurt, complete: completeLevel,
  troll: spawnTroll, maiden: spawnMaiden, thrower: spawnThrower, caster: spawnCaster, rollers: spawnRollers, actor, flight: startFlight,
  // indoors: look down over the walls rather than be squeezed against them
  teleport(x, z, dirX, dirZ, then, amb2, indoors) { fadeThen(() => { if (amb2) setAmbience(amb2, true); cam.pitch = indoors ? 0.82 : 0.34; cam.dist = cam.cur = indoors ? 12.5 : 15; P.x = x; P.z = z; P.y = groundBelow(x, z, 999); P.vx = P.vy = P.vz = 0; P.dirX = dirX; P.dirZ = dirZ; P.charge = 0; P.gy = P.y; cam.yaw = Math.atan2(-dirX, -dirZ); cam.tgt.set(P.x, P.y + 2.4, P.z); lastSafe = { x, y: P.y, z }; checkpoint = { ...lastSafe }; hog.yaw = Math.atan2(dirX, dirZ); if (then) then(); }, 450); },
  gollum(on, o = {}) { GOL.on = on; GOL.riding = false; Object.assign(GOL, o); if (on && o.x !== undefined) GOL.y = groundBelow(o.x, o.z, 999); if (on && GOL.m.g.parent !== scene) { scene.add(GOL.m.g); GOL.m.g.rotation.set(0, 0, 0); } },
  flash(colour = '#fff', ms = 500) { const f = $('fade'); f.style.transition = 'none'; f.style.background = colour; f.style.opacity = 1; setTimeout(() => { f.style.transition = `opacity ${ms}ms`; f.style.opacity = 0; setTimeout(() => { f.style.background = '#000'; f.style.transition = ''; }, ms + 60); }, 60); },
  later(secs, fn) { const a = { t: secs, step(dt) { if (a.t > 0 && (a.t -= dt) <= 0) fn(); }, draw() {} }; world.tick.push(a); return a; },
  get time() { return time; }, get state() { return state; },
};

async function boot() {
  const names = Object.keys(SPRITE_FILES), tiles = Object.keys(TILE_FILES); let done = 0; const total = names.length + tiles.length;
  const tick = () => { $('start').textContent = `LOADING ${Math.round(++done / total * 100)}%`; };
  await Promise.all([
    ...names.map(async n => { const img = await loadImage(A + SPRITE_FILES[n]); if (!img) console.warn('missing sprite', SPRITE_FILES[n]); PORTRAIT[n] = processSprite(img).canvas.toDataURL(); tick(); }),
    ...tiles.map(async n => { TILE[n] = await loadImage(A + TILE_FILES[n]); tick(); }),
  ]);
  for (const n of ['maiden', 'towerman', 'barkeep']) PORTRAIT[n] = `assets/book/portraits/${n}.jpg`;
  try { await Promise.race([document.fonts.load('16px "Press Start 2P"'), new Promise(r => setTimeout(r, 1500))]); } catch { /* signs fall back to monospace */ }
  makeMaterials(); buildSky(); initParticles();
  hog = Models.buildHogman(); scene.add(hog.g); hog.lift = 0; playerShadow = makeShadow(1.4, true);
  GOL.m = Models.buildGollum(); scene.add(GOL.m.g); GOL.shadow = makeShadow(1.0, true);
  leash = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1), lam(0x5a3c20)); scene.add(leash);
  $('foodicon').src = pic('taco');
  const lv = parseInt(new URLSearchParams(location.search).get('level') || '', 10);
  loadLevel(0); state = 'title';
  const cont = saved(); $('continue').hidden = cont === 0; if (cont > 0) $('continue').textContent = `CONTINUE — ${LEVELS[cont].title.toUpperCase()}`;
  $('start').disabled = false; $('start').textContent = 'NEW GAME'; $('start').onclick = () => startGame(0); $('continue').onclick = () => startGame(cont);
  $('again').onclick = () => location.reload(); $('dialog').onclick = () => { if (state === 'dialog') advanceDialog(); }; $('book').onclick = () => { if (state === 'pages') turnPage(false); };
  requestAnimationFrame(loop);
  if (lv >= 1 && lv <= LEVELS.length) { Sound.init(); $('title').hidden = true; beginLevel(lv - 1); }
}

// Console/test handle. ?dev adds keys: 1–4 jump to a chapter, N finishes the current one.
const SAGA = window.SAGA = {
  P, cam, GOL, world, E, fly, solids, scene, renderer, Models, LEVELS,
  get state() { return state; },
  warp(x, z, y) { P.x = x; P.z = z; P.y = y ?? groundBelow(x, z, 999); P.vx = P.vy = P.vz = 0; cam.tgt.set(P.x, P.y + 2.4, P.z); },
  spy: null, look(x, y, z, yaw = 0, pitch = 0.2, dist = 7) { SAGA.spy = [x, y, z]; cam.yaw = yaw; cam.pitch = pitch; cam.dist = cam.cur = dist; },
  level(i) { Sound.init(); $('title').hidden = true; beginLevel(i); },
  skip() { for (let k = 0; k < 60 && (state === 'dialog' || state === 'pages'); k++) { if (state === 'pages') turnPage(true); else advanceDialog(); } },
  tick(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) frame(dt); },
  press(code) { HIT[code] = true; }, hold(code, on = true) { KEY[code] = on; },
};

boot();
