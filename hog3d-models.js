// The cast and props of Tilting at Windmills as low-poly models, in the windmill's style:
// flat-shaded primitives with small hand-pixelled textures. There are no model files —
// everything is built here from boxes, cylinders and cones, and posed in code.
//
// Every character faces +Z, stands with its feet at y = 0, and comes back as a plain object
// holding its root group `g` plus the joints its anim* function turns.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
let seed = 20261110;
const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

// ───────────────────────────── building blocks ─────────────────────────────
function tex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// A flat colour with a scatter of darker and lighter pixels: the same trick as the windmill's plaster.
function speckle(size, base, cols, n) {
  return tex(size, size, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) { g.fillStyle = cols[(rand() * cols.length) | 0]; g.fillRect((rand() * w) | 0, (rand() * h) | 0, 1 + ((rand() * 2) | 0), 1); }
  }, true);
}
// Pixel art from rows of letters: each letter is a palette key.
function pixels(rows, pal) {
  return tex(rows[0].length, rows.length, g => rows.forEach((r, y) => [...r].forEach((ch, x) => { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); })));
}
const lam = (color, map) => new THREE.MeshLambertMaterial({ color, map: map || null, flatShading: true });
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function add(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }
function pivot(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
// A limb hangs straight down from its pivot, so rotation.x swings it: negative forward, positive back.
function limb(parent, x, y, z, w, len, d, mat) { const p = pivot(parent, x, y, z); add(p, B(w, len, d), mat, 0, -len / 2, 0); return p; }
// A box whose +Z side carries a face.
function faced(parent, w, h, d, front, side, back, x, y, z) { return add(parent, B(w, h, d), [side, side, side, side, front, back || side], x, y, z); }
const ease = (cur, target, dt, rate = 14) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
function turnTo(m, yaw, dt, rate = 14) { m.yaw += wrap(yaw - m.yaw) * (1 - Math.exp(-rate * dt)); m.g.rotation.y = m.yaw; }

let shared = {};
/** Textures the game already made for the windmill: { wood, wall, tiles, plaster }. */
export function setShared(t) { shared = t; }
const rep = (t, x, y) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };

// ───────────────────────────── Hogman ─────────────────────────────
export function buildHogman() {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const body = pivot(g);
  const hide = lam(0xffffff, speckle(32, '#8b867d', ['#6f6a62', '#a39d92', '#7b766e', '#5f5a54'], 300));
  const dark = lam(0x4b4640), pink = lam(0xdca592), mane = lam(0x55504a), ivory = lam(0xf2ead8), black = lam(0x15120f);
  // The hog: a seven-sided barrel, wider at the shoulder.
  add(body, new THREE.CylinderGeometry(0.82, 0.72, 2.3, 7).rotateX(Math.PI / 2), hide, 0, 1.34, 0);
  add(body, new THREE.CylinderGeometry(0.72, 0.42, 0.45, 7).rotateX(Math.PI / 2), hide, 0, 1.32, -1.36);
  add(body, B(0.16, 0.3, 1.8), mane, 0, 2.14, 0.2);
  const tail = pivot(body, 0, 1.7, -1.5);                                 // a short curl, not a peg
  add(tail, B(0.09, 0.09, 0.3), dark, 0, 0.07, -0.13).rotation.x = 0.6; add(tail, B(0.09, 0.22, 0.09), dark, 0, 0.24, -0.26); add(tail, B(0.09, 0.09, 0.18), dark, 0, 0.33, -0.18);
  const head = pivot(body, 0, 1.34, 1.05);
  add(head, new THREE.CylinderGeometry(0.3, 0.64, 1.2, 6).rotateX(Math.PI / 2), hide, 0, 0, 0.58);
  add(head, new THREE.CylinderGeometry(0.31, 0.31, 0.14, 6).rotateX(Math.PI / 2), pink, 0, 0, 1.22);
  for (const sx of [1, -1]) {
    add(head, B(0.07, 0.1, 0.05), black, sx * 0.11, 0.02, 1.28);
    add(head, B(0.1, 0.13, 0.1), black, sx * 0.43, 0.2, 0.5);
    const ear = add(head, new THREE.ConeGeometry(0.19, 0.44, 4), hide, sx * 0.4, 0.55, 0.14); ear.rotation.z = -sx * 0.45;
    const tusk = add(head, new THREE.ConeGeometry(0.065, 0.3, 4), ivory, sx * 0.27, 0.02, 0.98); tusk.rotation.x = 0.3; tusk.rotation.z = -sx * 0.3;
  }
  const legs = [[0.46, 0.8], [-0.46, 0.8], [0.46, -0.9], [-0.46, -0.9]].map(([x, z]) => {
    const l = limb(body, x, 0.98, z, 0.3, 0.74, 0.32, hide); add(l, B(0.33, 0.26, 0.36), dark, 0, -0.85, 0.01); return l;
  });
  // The rider.
  const jacket = lam(0xffffff, speckle(16, '#e8742a', ['#d9641c', '#f08a3e', '#c9581a'], 46)), trouser = lam(0x8a5a22), boot = lam(0x5e3b18);
  const skin = lam(0xe2b48c), hat = lam(0x8f6a2a), band = lam(0x5a3f18), shirt = lam(0xf6f1e6), wood = lam(0x7a5230);
  const rider = pivot(body, 0, 1.98, -0.12);
  for (const sx of [1, -1]) {
    const l = limb(rider, sx * 0.6, 0.12, 0.05, 0.42, 0.8, 0.46, trouser); l.rotation.x = -0.55; l.rotation.z = sx * 0.42;
    add(l, B(0.37, 0.5, 0.42), boot, 0, -1.0, 0); add(l, B(0.37, 0.2, 0.3), boot, 0, -1.16, 0.3);
  }
  // "A portly fellow": a barrel of a torso and a belly that rides out over the belt.
  add(rider, B(1.24, 1.08, 0.9), jacket, 0, 0.64, 0.02);
  add(rider, B(1.12, 0.7, 0.5), jacket, 0, 0.46, 0.56);
  add(rider, B(0.9, 0.3, 0.36), jacket, 0, 0.88, 0.5);
  add(rider, B(0.3, 0.4, 0.06), shirt, 0, 0.98, 0.69);
  add(rider, B(1.28, 0.13, 0.94), band, 0, 0.16, 0.02);
  const arms = [1, -1].map(sx => { const a = limb(rider, sx * 0.76, 1.04, 0.02, 0.33, 0.82, 0.33, jacket); a.rotation.x = -1.0; a.rotation.z = -sx * 0.16; add(a, B(0.22, 0.2, 0.22), skin, 0, -0.9, 0); return a; });
  const stick = add(arms[1], B(0.07, 0.07, 1.15), wood, 0, -0.9, 0.35); stick.rotation.x = 0.5;
  const rhead = pivot(rider, 0, 1.15, 0.02);
  const pal = { S: '#e2b48c', D: '#2c1d12', W: '#ffffff', K: '#111111', N: '#c9966c', M: '#7a2a20' };
  const face = lam(0xffffff, pixels(['SSSSSSSS', 'SSSSSSSS', 'SDDSSDDS', 'SWKSSKWS', 'SSSNNSSS', 'DDDDDDDD', 'DDDMMDDD', 'DDDDDDDD'], pal));
  const cheek = lam(0xffffff, pixels(['DDSSSSSS', 'DDSSSSSS', 'DDSSSSSS', 'DDSSSSSS', 'DDSSSSSS', 'DDDDDDDD', 'DDDDDDDD', 'DDDDDDDD'], pal));
  faced(rhead, 0.54, 0.54, 0.54, face, cheek, lam(0x2c1d12), 0, 0.3, 0);
  add(rhead, B(0.1, 0.12, 0.08), lam(0xc9966c), 0, 0.27, 0.3);
  add(rhead, new THREE.CylinderGeometry(0.7, 0.7, 0.07, 9), hat, 0, 0.6, 0);
  add(rhead, new THREE.CylinderGeometry(0.3, 0.37, 0.34, 9), hat, 0, 0.8, 0);
  add(rhead, new THREE.CylinderGeometry(0.375, 0.375, 0.09, 9), band, 0, 0.68, 0);
  // The gas: a clutch of green blobs behind (charge) and beneath (mid-air boost).
  const green = [lam(0x8fdc2a), lam(0x6fbf1c), lam(0xb6f04a)], blob = new THREE.IcosahedronGeometry(1, 0);
  const cloud = (parent, x, y, z, spots) => { const c = pivot(parent, x, y, z); spots.forEach(([bx, by, bz, s], i) => add(c, blob, green[i % 3], bx, by, bz).scale.setScalar(s)); c.visible = false; return c; };
  const gas = cloud(g, 0, 1.25, -2.2, [[0, 0, 0, 0.55], [0.3, 0.2, -0.6, 0.7], [-0.35, -0.1, -0.9, 0.8], [0.1, 0.35, -1.5, 0.95], [-0.2, 0, -2.2, 0.75]]);
  const gasUp = cloud(g, 0, 0.1, -0.7, [[0, 0, 0, 0.6], [0.3, -0.6, 0.2, 0.75], [-0.3, -1.1, -0.1, 0.9], [0.1, -1.8, 0.1, 0.7]]);
  // Juli's wings (hidden until the chronicle's last page) and a pillion seat for the Gollum Man.
  const wingG = new THREE.BufferGeometry();
  wingG.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.9, 3.4, 0.3, 0.2, 0, 0, -0.8, 0, 0, -0.8, 3.4, 0.3, 0.2, 2.6, 0.1, -1.5, 0, 0, -0.8, 2.6, 0.1, -1.5, 1.2, 0, -1.9]), 3));
  wingG.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(18), 2)); wingG.computeVertexNormals();
  const feather = lam(0xffffff, speckle(16, '#e8c98a', ['#d4b070', '#f4dca8', '#c9a060'], 50)); feather.side = THREE.DoubleSide;
  const wings = [1, -1].map(sx => { const w = pivot(body, sx * 0.62, 1.95, 0.35); add(w, wingG, feather).scale.x = sx; w.visible = false; return w; });
  const pillion = pivot(body, 0, 1.98, -1.12);
  return { g, body, head, tail, legs, rider, rhead, arms, gas, gasUp, wings, pillion, yaw: Math.PI, roll: 0 };
}
/** s: { dirX, dirZ, moving, grounded, vy, charge, boost, dead, anim, time, squash } */
export function animHogman(m, s, dt) {
  if (!s.dead) turnTo(m, Math.atan2(s.dirX, s.dirZ), dt, s.fly ? 40 : 16);
  const air = !s.grounded && !s.dead, run = s.moving && s.grounded && !s.dead, ph = s.anim * 13;
  const amp = s.dead ? 0 : s.charge ? 1.05 : run ? 0.78 : 0;
  // Trot: diagonal pairs together. In the air, a full stretch.
  const sw = Math.sin(ph) * amp;
  const L = s.fly ? [-0.6, -0.6, 0.9, 0.9] : air ? [-0.85, -0.85, 0.8, 0.8] : s.dead ? [0.5, -0.3, 0.2, -0.5] : [sw, -sw, -sw, sw];
  // s.wing (0..1) lets the wings be seen growing before she flies.
  const wing = s.wing ?? (s.fly ? 1 : 0);
  m.wings.forEach((w, i) => { w.visible = wing > 0.01; w.scale.setScalar(Math.max(0.01, wing)); w.rotation.z = (i ? -1 : 1) * (Math.sin(s.time * 8) * 0.55 * (s.fly ? 1 : 0.35) + 0.2); });
  m.legs.forEach((l, i) => { l.rotation.x = ease(l.rotation.x, L[i], dt, 22); });
  m.body.position.y = ease(m.body.position.y, run || s.charge ? Math.abs(Math.sin(ph)) * 0.11 : Math.sin(s.time * 2.4) * 0.015, dt, 30);
  m.body.rotation.x = ease(m.body.rotation.x, air ? clamp(-s.vy * 0.02, -0.32, 0.32) : s.charge ? 0.07 : Math.sin(ph * 2) * 0.03 * amp, dt, 12);
  m.head.rotation.x = 0.2 + Math.sin(ph + 1) * 0.09 * amp + (amp ? 0 : Math.sin(s.time * 1.3) * 0.05) + (s.charge ? 0.25 : 0);
  m.tail.rotation.y = Math.sin(s.time * 7) * 0.5;
  m.rider.position.y = 1.98 + Math.abs(Math.sin(ph + 0.9)) * 0.07 * amp;
  m.rider.rotation.x = ease(m.rider.rotation.x, s.dead ? -1.1 : s.charge ? 0.4 : air ? -0.12 : 0.06 * amp, dt, 10);
  m.rhead.rotation.x = -m.rider.rotation.x * 0.6; m.rhead.rotation.y = amp ? 0 : Math.sin(s.time * 0.7) * 0.25;
  m.arms.forEach((a, i) => { a.rotation.x = s.dead ? -2.6 : -1.0 + Math.sin(ph + i * Math.PI) * 0.14 * amp - (s.charge ? 0.3 : 0); });
  // Bowled over: the hog rolls onto his side.
  m.roll = ease(m.roll, s.dead ? 1.45 : 0, dt, 9); m.g.rotation.z = m.roll;
  const sq = s.squash;
  m.g.scale.set(1 + Math.max(0, sq) * 0.14, 1 - Math.max(0, sq) * 0.2 + (sq < 0 || (air && s.vy > 4) ? 0.07 : 0), 1 + Math.max(0, sq) * 0.14);
  m.lift = Math.sin(m.roll) * 0.7;                       // caller adds this so the rolled hog rests on the ground
  m.gas.visible = !!s.charge; if (s.charge) { m.gas.scale.setScalar(1 + Math.sin(s.time * 38) * 0.1); m.gas.rotation.z = s.time * 9; }
  m.gasUp.visible = !!s.boost; if (s.boost) { m.gasUp.scale.setScalar(0.7 + s.boost * 1.2); m.gasUp.rotation.y = s.time * 9; }
}

// ───────────────────────────── Gollum Man ─────────────────────────────
// Pose numbers are world angles: 0 hangs straight down, negative reaches forward. `pitch` tilts the
// whole trunk (negative lifts the chest). `knee`/`elbow` are relative to the bone above.
const GOL_POSES = {
  gol_idle:   { y: 0.92, pitch: -0.62, head: 0.1, arm: [-0.08, -0.08], elbow: [0, 0], leg: [-1.3, -1.3], knee: [1.75, 1.75] },
  gol_crawl:  { y: 0.76, pitch: -0.15, head: -0.1, arm: [-0.6, -0.6], elbow: [-0.5, -0.5], leg: [-1.35, -1.35], knee: [2.1, 2.1] },
  gol_jump:   { y: 1.0, pitch: -0.5, head: -0.2, arm: [-2.0, -1.7], elbow: [-0.2, -0.2], leg: [0.55, 0.9], knee: [0.7, 0.4] },
  gol_hurt:   { y: 0.95, pitch: -1.2, head: 0.5, arm: [-2.9, -2.9], elbow: [-1.7, -1.7], leg: [-1.2, -1.2], knee: [2.3, 2.3] },
  gol_crouch: { y: 0.6, pitch: -0.3, head: 0.55, arm: [-0.9, -0.9], elbow: [-1.5, -1.5], leg: [-1.5, -1.5], knee: [2.35, 2.35] },
  gol_ride:   { y: 0.95, pitch: -1.3, head: 0.15, arm: [-1.25, -1.25], elbow: [-0.5, -0.5], leg: [-1.2, -1.2], knee: [1.0, 1.0] },   // sat up behind the rider, arms round him
};
export function buildGollum() {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const skin = lam(0xffffff, speckle(16, '#d9a05c', ['#c98f4e', '#e3ad6a', '#cf9654'], 44)), bare = lam(0xd9a05c);
  const denim = lam(0xffffff, speckle(16, '#3f5f9a', ['#35508a', '#5273ad', '#2f4a7c'], 50)), hair = lam(0xa8743a), white = lam(0xf4f1e8);
  const shoe = lam(0xffffff, pixels(['TTDTTTDT', 'TDTTDTTT', 'TTTDTTDT', 'DTTTTDTT'], { T: '#d9a441', D: '#3a2410' }));
  const torso = pivot(g, 0, 0.9, -0.35);
  add(torso, B(0.6, 0.4, 1.0), skin, 0, 0, 0.52);
  add(torso, B(0.5, 0.1, 0.7), bare, 0, 0.22, 0.6);                     // a ridge of spine
  add(torso, B(0.68, 0.46, 0.48), denim, 0, -0.02, 0.08);
  const head = pivot(torso, 0, 0.14, 1.0);
  const pal = { G: '#d9a05c', F: '#2a2622', W: '#f4f4ec', K: '#111111', N: '#b9823f', M: '#8a4a30' };
  const face = lam(0xffffff, pixels(['GGGGGGGGGG', 'GGGGGGGGGG', 'GFFFGGFFFG', 'GFWKFFKWFG', 'GFFFGGFFFG', 'GGGGNNGGGG', 'GGGGGGGGGG', 'GGGMMMMGGG'], pal));
  faced(head, 0.64, 0.58, 0.6, face, bare, bare, 0, 0.27, 0.2);
  add(head, B(0.1, 0.1, 0.1), lam(0xb9823f), 0, 0.2, 0.52);
  for (const sx of [1, -1]) { const e = add(head, B(0.07, 0.36, 0.26), bare, sx * 0.39, 0.34, 0.12); e.rotation.z = -sx * 0.4; e.rotation.y = sx * 0.3; }
  add(head, B(0.5, 0.06, 0.34), hair, 0, 0.58, 0.02);
  add(head, B(0.56, 0.5, 0.07), hair, 0, 0.28, -0.13);
  for (const sx of [1, -1]) add(head, B(0.07, 0.42, 0.2), hair, sx * 0.34, 0.22, -0.04);
  const sh = [], el = [], hip = [], kn = [], ft = [];
  for (const sx of [1, -1]) {
    const s = limb(torso, sx * 0.37, -0.02, 0.9, 0.15, 0.62, 0.15, bare), e = limb(s, 0, -0.62, 0, 0.13, 0.6, 0.13, bare);
    add(e, B(0.21, 0.08, 0.34), bare, 0, -0.62, 0.1); sh.push(s); el.push(e);
    const h = limb(torso, sx * 0.29, -0.08, 0.05, 0.2, 0.6, 0.2, bare), k = limb(h, 0, -0.6, 0, 0.17, 0.58, 0.17, bare), f = pivot(k, 0, -0.58, 0);
    add(f, B(0.25, 0.2, 0.5), shoe, 0, -0.06, 0.12); add(f, B(0.26, 0.15, 0.16), white, 0, -0.085, 0.4); add(f, B(0.27, 0.06, 0.52), white, 0, -0.16, 0.13);
    hip.push(h); kn.push(k); ft.push(f);
  }
  const cur = JSON.parse(JSON.stringify(GOL_POSES.gol_idle));
  return { g, torso, head, sh, el, hip, kn, ft, cur, yaw: 0, tilt: 0 };
}
/** s: { frame, dirX, dirZ, time, moving, shake } */
export function animGollum(m, s, dt) {
  turnTo(m, Math.atan2(s.dirX, s.dirZ), dt, 14);
  const p = GOL_POSES[s.frame] || GOL_POSES.gol_idle, c = m.cur, ph = s.time * 17;
  // Scuttling swings opposite limbs; everything else eases to the pose.
  const sw = s.frame === 'gol_crawl' ? Math.sin(ph) : 0;
  c.y = ease(c.y, p.y + Math.abs(sw) * 0.05, dt); c.pitch = ease(c.pitch, p.pitch, dt); c.head = ease(c.head, p.head, dt);
  for (let i = 0; i < 2; i++) {
    const d = i ? -1 : 1;
    c.arm[i] = ease(c.arm[i], p.arm[i] + sw * d * 0.45, dt, 24); c.elbow[i] = ease(c.elbow[i], p.elbow[i], dt);
    c.leg[i] = ease(c.leg[i], p.leg[i] - sw * d * 0.35, dt, 24); c.knee[i] = ease(c.knee[i], p.knee[i] - sw * d * 0.2, dt, 24);
    m.sh[i].rotation.x = c.arm[i] - c.pitch; m.el[i].rotation.x = c.elbow[i];
    m.hip[i].rotation.x = c.leg[i] - c.pitch; m.kn[i].rotation.x = c.knee[i];
    m.ft[i].rotation.x = -(c.leg[i] + c.knee[i]);                // soles stay flat to the ground
  }
  m.torso.position.y = c.y; m.torso.rotation.x = c.pitch;
  m.head.rotation.x = -c.pitch * 0.85 + c.head; m.head.rotation.y = s.frame === 'gol_idle' ? Math.sin(s.time * 1.1) * 0.5 : 0;
  m.head.rotation.z = s.shake ? Math.sin(s.time * 50) * 0.12 : 0;
}

// ───────────────────────────── Tile Troll ─────────────────────────────
export function buildTroll() {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const hideTex = speckle(16, '#8c6e48', ['#7c6040', '#9a7a52', '#84683f'], 40);
  const skin = lam(0xffffff, hideTex), bare = lam(0x8c6e48), cloth = lam(0xffffff, speckle(16, '#4f5f33', ['#43522b', '#5b6c3c'], 40));
  const hair = lam(0x241c14), wrap_ = lam(0xa39a82);
  const pal = { T: '#8c6e48', H: '#241c14', K: '#111111', W: '#f0e8d0', N: '#735838', M: '#5a1f18', L: '#74593a' };
  const chestT = lam(0xffffff, pixels(['TTTTTTTTTTTT', 'TTTTTTTTTTTT', 'TLLLLTTLLLLT', 'TTTTTLLTTTTT', 'TTTTTLLTTTTT', 'TTLLLLLLLLTT'], pal));
  const absT = lam(0xffffff, pixels(['TTTTLLTTTT', 'TLLLLLLLLT', 'TTTTLLTTTT', 'TLLLLLLLLT', 'TTTTLLTTTT'], pal));
  const face = lam(0xffffff, pixels(['HHHHHHHH', 'HHHHHHHH', 'THHTTHHT', 'TKWTTWKT', 'TTTNNTTT', 'HHTTTTHH', 'HHHMMHHH', 'HHHHHHHH'], pal));
  const body = pivot(g, 0, 2.7, 0);
  const hip = [], kn = [];
  for (const sx of [1, -1]) {
    const h = limb(body, sx * 0.55, 0, 0, 0.92, 1.4, 0.95, skin), k = limb(h, 0, -1.4, 0, 0.8, 1.1, 0.85, skin);
    add(k, B(0.86, 0.3, 0.9), wrap_, 0, -0.95, 0); add(k, B(0.86, 0.26, 1.3), bare, 0, -1.2, 0.2);
    hip.push(h); kn.push(k);
  }
  const torso = pivot(body, 0, 0, 0);
  add(torso, B(2.0, 0.85, 1.15), cloth, 0, 0.1, 0); add(torso, B(0.9, 0.9, 0.12), cloth, 0, -0.5, 0.6);
  faced(torso, 1.55, 1.0, 0.95, absT, skin, skin, 0, 0.95, 0);
  faced(torso, 2.5, 1.3, 1.25, chestT, skin, skin, 0, 2.0, 0);
  const sh = [], el = [];
  for (const sx of [1, -1]) {
    add(torso, new THREE.IcosahedronGeometry(0.62, 0), bare, sx * 1.42, 2.45, 0);
    const s = limb(torso, sx * 1.55, 2.4, 0, 0.68, 1.3, 0.68, skin), e = limb(s, 0, -1.3, 0, 0.6, 1.15, 0.6, skin);
    add(e, B(0.66, 0.25, 0.66), wrap_, 0, -1.0, 0); add(e, B(0.74, 0.62, 0.74), bare, 0, -1.42, 0);
    sh.push(s); el.push(e);
  }
  const head = pivot(torso, 0, 2.7, 0.1);
  faced(head, 0.98, 1.0, 0.98, face, lam(0xffffff, pixels(['HHHHHHHH', 'HHHHHHHH', 'HHTTTTTT', 'HHTTTTTT', 'HHTTTTTT', 'HHHHTTHH', 'HHHHHHHH', 'HHHHHHHH'], pal)), hair, 0, 0.5, 0);
  add(head, B(1.06, 0.3, 1.06), hair, 0, 1.0, -0.02); add(head, B(0.5, 0.45, 0.25), hair, 0, -0.1, 0.42);
  add(head, B(0.2, 0.2, 0.14), lam(0x735838), 0, 0.42, 0.52);
  return { g, body, torso, head, hip, kn, sh, el, yaw: Math.PI, cur: { y: 2.7, lean: 0, arm: 0.1, elbow: -0.25, spread: 0.2, hipA: 0, knee: 0, head: 0 } };
}
/** s: { state: idle|windup|recover|dead, t, walking, time, yaw } */
export function animTroll(m, s, dt) {
  if (s.state !== 'dead') turnTo(m, s.yaw, dt, 6);
  const c = m.cur, ph = s.time * 5.5;
  // Wind-up: both fists overhead. Recover: they come down in front of him.
  let p = { y: 2.7, lean: 0.03, arm: 0.1, elbow: -0.3, spread: 0.22, hipA: 0, knee: 0, head: 0 };
  if (s.state === 'windup') p = { ...p, lean: -0.22, arm: -3.0, elbow: -0.3, spread: 0.15, head: -0.2 };
  else if (s.state === 'recover') p = { ...p, lean: 0.5, arm: -0.75, elbow: -0.5, spread: 0.05, head: 0.3 };
  else if (s.state === 'dead') p = { y: 1.55, lean: 0.75, arm: -0.35, elbow: -0.4, spread: 0.1, hipA: -1.45, knee: 2.6, head: 0.6 };
  const rate = s.state === 'recover' ? 22 : s.state === 'dead' ? 5 : 9;
  for (const k in p) c[k] = ease(c[k], p[k], dt, rate);
  const walk = s.walking && s.state === 'idle' ? Math.sin(ph) * 0.4 : 0;
  m.body.position.y = c.y + (s.state === 'idle' ? Math.sin(s.time * 2) * 0.03 : 0);
  m.torso.rotation.x = c.lean; m.head.rotation.x = c.head;
  for (let i = 0; i < 2; i++) {
    const d = i ? -1 : 1;
    m.hip[i].rotation.x = c.hipA + walk * d; m.kn[i].rotation.x = c.knee + Math.max(0, -walk * d) * 0.6;
    m.sh[i].rotation.x = c.arm - walk * d * 0.5; m.sh[i].rotation.z = d * c.spread; m.el[i].rotation.x = c.elbow;
  }
}

// ───────────────────────────── crow ─────────────────────────────
export function buildCrow() {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const black = lam(0xffffff, speckle(8, '#1d1d25', ['#2a2a36', '#141418'], 14)), beak = lam(0xe9b020), eye = lam(0xf2f2f2);
  const ico = new THREE.IcosahedronGeometry(1, 0);
  add(g, ico, black).scale.set(0.42, 0.4, 0.78);
  add(g, ico, black, 0, 0.3, 0.62).scale.setScalar(0.3);
  const b = add(g, new THREE.ConeGeometry(0.11, 0.42, 4).rotateX(Math.PI / 2), beak, 0, 0.26, 1.02); b.rotation.x = 0.15;
  for (const sx of [1, -1]) { add(g, B(0.06, 0.07, 0.07), eye, sx * 0.24, 0.38, 0.74); add(g, B(0.05, 0.25, 0.05), beak, sx * 0.15, -0.45, -0.05); }
  add(g, B(0.42, 0.05, 0.6), black, 0, 0.02, -0.95).rotation.x = -0.15;
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.5, 1.5, 0, 0.15, 0, 0, -0.5, 0, 0, -0.5, 1.5, 0, 0.15, 1.2, 0, -0.6]), 3));
  wing.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(12), 2)); wing.computeVertexNormals();
  const wm = black.clone(); wm.side = THREE.DoubleSide;
  const wings = [1, -1].map(sx => { const p = pivot(g, sx * 0.3, 0.18, 0.05); const w = add(p, wing, wm); w.scale.x = sx; return p; });
  g.scale.setScalar(1.25);
  return { g, wings, yaw: 0 };
}
export function animCrow(m, s, dt) {
  turnTo(m, Math.atan2(s.dirX, s.dirZ), dt, 10);
  const f = Math.sin(s.time * 15 + s.phase) * 0.75 + 0.1;
  m.wings[0].rotation.z = f; m.wings[1].rotation.z = -f;
  m.g.rotation.z = -s.bank * 0.35;
}

// ───────────────────────────── the Wizard and the Old Miller ─────────────────────────────
export function buildWizard() {
  const g = new THREE.Group();
  const starry = tex(16, 16, (c, w, h) => { c.fillStyle = '#2e4fb0'; c.fillRect(0, 0, w, h); c.fillStyle = '#27439a'; for (let i = 0; i < 26; i++) c.fillRect((rand() * w) | 0, (rand() * h) | 0, 2, 1);
    c.fillStyle = '#ffd94a'; for (const [x, y] of [[2, 3], [9, 1], [13, 7], [5, 10], [11, 13], [1, 14]]) c.fillRect(x, y, 1, 1); }, true);
  const robe = lam(0xffffff, rep(starry, 3, 2)), hatM = lam(0xffffff, rep(starry, 2, 1)), skin = lam(0xe2b48c), white = lam(0xf2f1ea), wood = lam(0x7a5230), gold = lam(0xe8b23a);
  const body = pivot(g);
  add(body, new THREE.CylinderGeometry(0.44, 1.05, 3.0, 8), robe, 0, 1.5, 0);
  add(body, new THREE.CylinderGeometry(0.62, 0.66, 0.16, 8), gold, 0, 1.75, 0);
  const pal = { S: '#e2b48c', W: '#f2f1ea', K: '#111111', N: '#c9966c', B: '#cfd6ee' };
  const face = lam(0xffffff, pixels(['SSSSSSSS', 'SSSSSSSS', 'WWWSSWWW', 'SBKSSKBS', 'SSSNNSSS', 'WWWNNWWW', 'WWWWWWWW', 'WWWWWWWW'], pal));
  const head = pivot(body, 0, 3.0, 0);
  faced(head, 0.6, 0.6, 0.58, face, lam(0xffffff, pixels(['WWSSSSSS', 'WWSSSSSS', 'WWSSSSSS', 'WWSSSSSS', 'WWWSSSSS', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW'], pal)), white, 0, 0.32, 0);
  add(head, new THREE.ConeGeometry(0.36, 1.5, 5).rotateX(Math.PI), white, 0, -0.5, 0.26);
  add(head, new THREE.CylinderGeometry(0.82, 0.82, 0.08, 9), hatM, 0, 0.64, 0);
  const tip = add(head, new THREE.ConeGeometry(0.5, 1.5, 8), hatM, 0, 1.38, -0.05); tip.rotation.x = -0.14;
  add(head, new THREE.CylinderGeometry(0.51, 0.51, 0.12, 8), gold, 0, 0.74, 0);
  const arms = [1, -1].map(sx => { const a = limb(body, sx * 0.55, 2.8, 0, 0.34, 1.15, 0.36, robe); a.rotation.z = sx * 0.16; add(a, B(0.2, 0.2, 0.2), skin, 0, -1.24, 0); return a; });
  arms[0].rotation.x = -0.95;
  const staff = pivot(body, 0.78, 0, 0.95);
  add(staff, new THREE.CylinderGeometry(0.07, 0.09, 4.3, 6), wood, 0, 2.15, 0);
  const orb = add(staff, new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xcdf1ff }), 0, 4.55, 0);
  add(staff, new THREE.TorusGeometry(0.34, 0.06, 4, 8, Math.PI * 1.5), wood, 0, 4.5, 0).rotation.z = -Math.PI * 0.25;
  g.scale.setScalar(0.92);
  return { g, body, head, arms, orb, yaw: 0 };
}
/** o: { coat: [base, dark, light], cap, brim } — the hamlet's "other miller" is the same build in different clothes. */
export function buildMiller(o = {}) {
  const g = new THREE.Group(), cc = o.coat || ['#35557f', '#2d4a70', '#41648f'];
  const skin = lam(0xe2b48c), coat = lam(0xffffff, speckle(16, cc[0], [cc[1], cc[2]], 40)), shorts = lam(0x8f8c5c), boot = lam(0x5a3a1c), sock = lam(0xd8d2c0), white = lam(0xf2f1ea), cap = lam(o.cap ?? 0x3a5f9a);
  const body = pivot(g);
  for (const sx of [1, -1]) { const l = limb(body, sx * 0.24, 1.55, 0, 0.26, 1.05, 0.28, skin); add(l, B(0.3, 0.22, 0.3), sock, 0, -1.02, 0); add(l, B(0.32, 0.42, 0.52), boot, 0, -1.34, 0.08); }
  add(body, B(0.86, 0.66, 0.52), shorts, 0, 1.62, 0);
  add(body, B(0.9, 1.2, 0.56), coat, 0, 2.5, 0);
  add(body, B(0.2, 1.0, 0.06), lam(0xc9c2a8), 0, 2.56, 0.29);
  const arms = [1, -1].map(sx => { const a = limb(body, sx * 0.57, 3.02, 0, 0.25, 1.15, 0.27, coat); a.rotation.z = sx * 0.08; add(a, B(0.2, 0.2, 0.2), skin, 0, -1.24, 0); return a; });
  arms[1].rotation.x = -0.5;
  let orb = null;
  if (o.staff) {                                      // the book's wizard: a blazing staff, and a pint he never touches
    arms[0].rotation.x = -0.9; const st = pivot(body, 0.72, 0, 0.85);
    add(st, new THREE.CylinderGeometry(0.07, 0.09, 4.1, 6), lam(0x7a5230), 0, 2.05, 0);
    orb = add(st, new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }), 0, 4.3, 0);
    add(arms[1], new THREE.CylinderGeometry(0.17, 0.15, 0.4, 7), lam(0xd9962a), 0, -1.38, 0.12); add(arms[1], new THREE.CylinderGeometry(0.18, 0.18, 0.08, 7), lam(0xf6f1e6), 0, -1.15, 0.12);
  }
  const pal = { S: '#e2b48c', W: '#f2f1ea', K: '#111111', N: '#c9966c' };
  const face = lam(0xffffff, pixels(['SSSSSSSS', 'SSSSSSSS', 'WWSSSSWW', 'SKSSSSKS', 'SSSNNSSS', 'WWWNNWWW', 'WWWWWWWW', 'WWWWWWWW'], pal));
  const head = pivot(body, 0, 3.12, 0);
  faced(head, 0.56, 0.56, 0.54, face, lam(0xffffff, pixels(['SSSSSSSS', 'SSSSSSSS', 'WSSSSSSS', 'WSSSSSSS', 'WWSSSSSS', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW'], pal)), white, 0, 0.3, 0);
  add(head, new THREE.ConeGeometry(0.32, 1.25, 5).rotateX(Math.PI), white, 0, -0.42, 0.24);
  add(head, new THREE.CylinderGeometry(0.3, 0.33, 0.3, 8), cap, 0, 0.7, 0); add(head, new THREE.CylinderGeometry(o.brim ? 0.62 : 0.35, o.brim ? 0.62 : 0.35, o.brim ? 0.07 : 0.12, 8), lam(o.brim ?? 0x2f4f84), 0, 0.58, 0);
  return { g, body, head, arms, orb, yaw: 0 };
}
/** Both stand and breathe, and turn to whoever comes close. s: { time, yaw, talking } */
export function animNpc(m, s, dt) {
  turnTo(m, s.yaw, dt, 5);
  m.body.position.y = Math.sin(s.time * 1.8 + m.yaw) * 0.03;
  m.head.rotation.x = Math.sin(s.time * 1.1) * 0.05 + (s.talking ? Math.sin(s.time * 9) * 0.07 : 0);
  if (m.orb) m.orb.scale.setScalar(1 + Math.sin(s.time * 4) * 0.12);
}

// ───────────────────────────── food and the Ring ─────────────────────────────
export function buildFood(type) {
  const g = new THREE.Group();
  if (type === 'taco') {
    const shell = lam(0xffffff, speckle(16, '#f2c230', ['#e0ad1c', '#f8d458', '#d9a318'], 40)); shell.side = THREE.DoubleSide;
    add(g, new THREE.CylinderGeometry(0.78, 0.78, 0.46, 10, 1, false, Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), shell, 0, 0.3, 0);
    for (const sz of [1, -1]) add(g, new THREE.CircleGeometry(0.78, 10, Math.PI, Math.PI), shell, 0, 0.3, sz * 0.23);
    add(g, B(1.3, 0.18, 0.36), lam(0x6b3f1c), 0, 0.26, 0);
    add(g, B(1.4, 0.16, 0.3), lam(0x63b33a), 0, 0.4, 0).rotation.y = 0.05;
    for (const [x, c] of [[-0.42, 0xd8382c], [0.05, 0xf2d24a], [0.44, 0xd8382c]]) add(g, B(0.22, 0.18, 0.24), lam(c), x, 0.5, 0);
  } else if (type === 'burger') {
    const bun = lam(0xffffff, speckle(16, '#d9963c', ['#c98630', '#f2e2b0', '#e2a44a'], 26));
    add(g, new THREE.CylinderGeometry(0.62, 0.56, 0.22, 9), bun, 0, -0.42, 0);
    add(g, new THREE.CylinderGeometry(0.68, 0.68, 0.07, 9), lam(0x63b33a), 0, -0.27, 0);
    add(g, new THREE.CylinderGeometry(0.64, 0.64, 0.2, 9), lam(0x5a3018), 0, -0.13, 0);
    add(g, B(1.0, 0.06, 1.0), lam(0xf2c230), 0, 0.0, 0).rotation.y = Math.PI / 4;
    add(g, new THREE.CylinderGeometry(0.6, 0.6, 0.09, 9), lam(0xd8382c), 0, 0.08, 0);
    add(g, new THREE.SphereGeometry(0.64, 9, 3, 0, TAU, 0, Math.PI / 2), bun, 0, 0.13, 0).scale.y = 0.75;
  } else {
    const wrapM = lam(0xffffff, speckle(16, '#e8cf9a', ['#c9a060', '#f2deb0', '#b98a48'], 34));
    const r = pivot(g); r.rotation.z = 0.3;
    add(r, new THREE.CylinderGeometry(0.36, 0.36, 1.35, 8).rotateZ(Math.PI / 2), wrapM);
    add(r, new THREE.CylinderGeometry(0.31, 0.31, 0.08, 8).rotateZ(Math.PI / 2), lam(0xffffff, speckle(8, '#4f8a30', ['#d8382c', '#f2d24a', '#5a3018', '#f4f1e8'], 30)), 0.69, 0, 0);
    add(r, new THREE.CylinderGeometry(0.38, 0.38, 0.6, 8).rotateZ(Math.PI / 2), lam(0xc9d0d6), -0.42, 0, 0);
  }
  return g;
}
export function buildRing() {
  const g = new THREE.Group();
  const gold = new THREE.MeshLambertMaterial({ color: 0xf4bd2c, emissive: 0x6a4500, flatShading: true });
  add(g, new THREE.TorusGeometry(0.42, 0.11, 6, 14), gold);
  return g;
}

// ───────────────────────────── props ─────────────────────────────
const timberTex = () => tex(32, 32, (c, w, h) => {
  c.fillStyle = '#eadfc4'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ded2b4'; for (let i = 0; i < 40; i++) c.fillRect((rand() * w) | 0, (rand() * h) | 0, 3, 1);
  c.fillStyle = '#4a3220'; c.fillRect(0, 0, w, 3); c.fillRect(0, h - 3, w, 3); c.fillRect(0, 0, 3, h); c.fillRect(w - 3, 0, 3, h);
  for (let i = 0; i < 9; i++) { c.fillRect(3 + i, 20 + i, 3, 2); c.fillRect(w - 6 - i, 20 + i, 3, 2); }
  c.fillRect(10, 7, 12, 14); c.fillStyle = '#28374a'; c.fillRect(12, 9, 8, 10); c.fillStyle = '#4a3220'; c.fillRect(15, 9, 2, 10); c.fillRect(12, 13, 8, 2);
  c.fillStyle = '#f2d98a'; c.fillRect(12, 9, 3, 4);
}, true);
// A pitched roof: a three-sided prism laid on its side, ridge along X.
const roofGeo = (r, len) => new THREE.CylinderGeometry(r, r, len, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);
export function buildHouse() {
  const g = new THREE.Group(), timber = timberTex();
  add(g, B(7, 2.6, 6), lam(0xffffff, rep(shared.wall, 2, 1)), 0, 1.0, 0);
  add(g, B(1.4, 2.2, 0.3), lam(0x3a2414), 1.6, 1.1, 3.0);
  add(g, B(7.1, 3, 6.1), lam(0xffffff, rep(timber, 3, 1)), 0, 3.8, 0);
  add(g, B(7.8, 0.3, 6.8), lam(0x4a3220), 0, 5.4, 0);
  add(g, B(7.7, 2.9, 6.7), lam(0xffffff, rep(timber, 3, 1)), 0, 6.95, 0);
  const roof = add(g, roofGeo(4.6, 8.5), lam(0xffffff, rep(shared.tiles, 6, 4)), 0, 8.4 + 4.6 * 0.5 * 0.62, 0); roof.scale.y = 0.62;
  add(g, B(0.9, 2.6, 0.9), lam(0xffffff, rep(shared.wall, 1, 1)), -2.2, 11.3, -1);
  return g;
}
export function buildTownTower() {
  const g = new THREE.Group(), timber = timberTex();
  add(g, B(4.4, 4.5, 4.4), lam(0xffffff, rep(shared.wall, 1.5, 1.5)), 0, 1.9, 0);
  add(g, B(1.2, 2.3, 0.3), lam(0x3a2414), 0, 1.15, 2.2);
  add(g, B(4.3, 9, 4.3), lam(0xffffff, rep(timber, 2, 3)), 0, 8.6, 0);
  add(g, B(5.3, 0.3, 5.3), lam(0x4a3220), 0, 13.2, 0);
  add(g, B(5.2, 3, 5.2), lam(0xffffff, rep(timber, 2, 1)), 0, 14.85, 0);
  add(g, new THREE.ConeGeometry(4.3, 5, 4).rotateY(Math.PI / 4), lam(0xffffff, rep(shared.tiles, 6, 3)), 0, 18.85, 0);
  add(g, new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), lam(0x4a3220), 0, 22.2, 0);
  return g;
}
export function buildCart() {
  const g = new THREE.Group(), wood = lam(0xffffff, rep(shared.wood, 1, 1)), dark = lam(0x5a3c20);
  const bed = pivot(g, 0, 1.25, 0); bed.rotation.x = 0.16;                 // resting on its shafts, nose down
  add(bed, B(1.9, 0.18, 3.0), wood);
  for (const sx of [1, -1]) add(bed, B(0.14, 0.75, 3.0), wood, sx * 0.9, 0.42, 0);
  add(bed, B(1.9, 0.75, 0.14), wood, 0, 0.42, -1.45);
  for (const sx of [1, -1]) add(bed, B(0.13, 0.13, 2.6), dark, sx * 0.72, -0.1, 2.7);
  add(bed, B(0.8, 0.7, 0.8), lam(0xffffff, rep(shared.wood, 1, 1)), -0.35, 0.45, -0.7).rotation.y = 0.3;
  add(bed, B(0.6, 0.5, 0.6), lam(0x8a6a3a), 0.4, 0.36, 0.1);
  add(bed, new THREE.IcosahedronGeometry(0.45, 0), lam(0xc9b78a), 0.3, 0.5, 0.9).scale.set(1, 0.8, 1.2);
  const wheelT = tex(32, 32, (c, w) => { c.fillStyle = '#5a3c20'; c.fillRect(0, 0, w, w); c.fillStyle = '#8a6238'; c.beginPath(); c.arc(16, 16, 12, 0, TAU); c.fill();
    c.fillStyle = '#5a3c20'; for (let i = 0; i < 4; i++) { c.save(); c.translate(16, 16); c.rotate(i * Math.PI / 4); c.fillRect(-13, -1.5, 26, 3); c.restore(); } c.beginPath(); c.arc(16, 16, 3.5, 0, TAU); c.fill(); });
  const cap = lam(0xffffff, wheelT);
  for (const sx of [1, -1]) add(g, new THREE.CylinderGeometry(1.0, 1.0, 0.2, 12).rotateZ(Math.PI / 2), [dark, cap, cap], sx * 1.15, 1.0, -0.2);
  add(g, new THREE.CylinderGeometry(0.1, 0.1, 2.4, 6).rotateZ(Math.PI / 2), dark, 0, 1.0, -0.2);
  return g;
}
/** The board keeps the original lettering: `canvas` is the sign sprite, whose top ~64% is the board. */
export function buildSign(canvas) {
  const g = new THREE.Group(), dark = lam(0x5a3c20);
  add(g, B(0.4, 3.0, 0.4), dark, 0, 1.5, 0);
  const ch = Math.round(canvas.height * 0.64), c = document.createElement('canvas'); c.width = canvas.width; c.height = ch; c.getContext('2d').drawImage(canvas, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  const w = 4.8, h = w * ch / canvas.width, board = pivot(g, 0, 2.6 + h / 2 - 0.5, 0); board.rotation.z = -0.03;
  add(board, B(w * 0.9, h * 0.72, 0.22), dark);
  const art = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, flatShading: true });
  add(board, new THREE.PlaneGeometry(w, h), art, 0, 0, 0.13);
  const back = add(board, new THREE.PlaneGeometry(w, h), art, 0, 0, -0.13); back.rotation.y = Math.PI;
  return g;
}
/** City gatehouse, facing +Z: a keep with an arch, two round towers with red caps. */
export function buildGatehouse() {
  const g = new THREE.Group(), stone = (x, y) => lam(0xffffff, rep(shared.wall, x, y)), red = lam(0xd06a50, rep(shared.tiles, 8, 3)), dark = lam(0x17120e);
  add(g, B(13, 16, 5), stone(2, 2.5), 0, 7.5, 0);
  for (let i = -3; i <= 3; i++) add(g, B(1.3, 1.5, 5.4), stone(0.3, 0.3), i * 1.95, 16.2, 0);
  add(g, B(5.4, 6.4, 0.5), dark, 0, 3.0, 2.4);
  add(g, new THREE.CylinderGeometry(2.7, 2.7, 0.5, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), dark, 0, 6.2, 2.4);
  const bars = tex(16, 16, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#5a5650'; for (let x = 1; x < w; x += 4) c.fillRect(x, 0, 2, h); for (let y = 2; y < h; y += 5) c.fillRect(0, y, w, 2); }, true);
  add(g, new THREE.PlaneGeometry(5.4, 3.4), new THREE.MeshLambertMaterial({ map: rep(bars, 3, 2), alphaTest: 0.5 }), 0, 7.0, 2.7);
  add(g, B(1.5, 1.8, 0.3), lam(0xe8b23a), 0, 11.2, 2.6); add(g, B(1.0, 1.2, 0.34), lam(0xa8322a), 0, 11.2, 2.62);
  for (const sx of [1, -1]) {
    add(g, new THREE.CylinderGeometry(4.1, 4.5, 23, 10), stone(4, 3), sx * 10, 10.5, 0.6);
    add(g, new THREE.CylinderGeometry(4.6, 4.2, 1.6, 10), stone(4, 0.3), sx * 10, 22.4, 0.6);
    add(g, new THREE.ConeGeometry(5.1, 7.5, 10), red, sx * 10, 27, 0.6);
    for (const y of [9, 16]) add(g, B(0.7, 2.2, 0.4), dark, sx * 10, y, 5.0);
    add(g, new THREE.CylinderGeometry(0.08, 0.08, 3, 5), dark, sx * 10, 32, 0.6);
    const f = new THREE.BufferGeometry(); f.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 2.2, -0.6, 0, 0, -1.2, 0]), 3));
    add(g, f, new THREE.MeshBasicMaterial({ color: 0xd8342a, side: THREE.DoubleSide }), sx * 10, 33.4, 0.6);
  }
  return g;
}

// ───────────────────────────── the western lobe ─────────────────────────────
export function buildHeart() {
  const g = new THREE.Group(), red = new THREE.MeshLambertMaterial({ color: 0xe5332a, emissive: 0x5a0d0a, flatShading: true }), ico = new THREE.IcosahedronGeometry(0.52, 0);
  for (const sx of [1, -1]) add(g, ico, red, sx * 0.4, 0.3, 0);
  add(g, new THREE.ConeGeometry(0.86, 1.1, 6).rotateX(Math.PI), red, 0, -0.42, 0);
  g.scale.set(1, 1, 0.62);
  return g;
}
export function buildWell() {
  const g = new THREE.Group(), stone = lam(0xffffff, rep(shared.wall, 2, 0.6)), dark = lam(0x5a3c20);
  add(g, new THREE.CylinderGeometry(1.6, 1.75, 1.3, 10), stone, 0, 0.65, 0);
  add(g, new THREE.CylinderGeometry(1.25, 1.25, 0.06, 10), lam(0x1f3a4a), 0, 1.31, 0);
  for (const sx of [1, -1]) add(g, B(0.2, 2.6, 0.2), dark, sx * 1.45, 2.4, 0);
  add(g, new THREE.CylinderGeometry(0.09, 0.09, 3.1, 6).rotateZ(Math.PI / 2), dark, 0, 3.0, 0);
  add(g, B(0.05, 1.0, 0.05), lam(0xc9b78a), 0.3, 2.5, 0); add(g, new THREE.CylinderGeometry(0.26, 0.2, 0.36, 7), dark, 0.3, 1.9, 0);
  const roof = add(g, roofGeo(1.5, 3.6), lam(0xffffff, rep(shared.tiles, 3, 2)), 0, 3.7 + 0.75 * 0.7, 0); roof.scale.y = 0.7;
  return g;
}
/** boards: [{ text, dx, dz }] — each board's point aims along (dx, dz). Lettering reads right from both sides. */
export function buildSignpost(boards) {
  const g = new THREE.Group(), dark = lam(0x5a3c20);
  add(g, new THREE.CylinderGeometry(0.14, 0.17, 3.9, 6), dark, 0, 1.95, 0);
  const label = str => { const t = tex(256, 44, (c, w, h) => { c.fillStyle = '#c9a56a'; c.fillRect(0, 0, w, h); c.fillStyle = '#b08a52'; for (let i = 0; i < 60; i++) c.fillRect((rand() * w) | 0, (rand() * h) | 0, 10, 2);
    c.fillStyle = '#5a3c20'; c.fillRect(0, 0, w, 3); c.fillRect(0, h - 3, w, 3); c.fillRect(0, 0, 3, h); c.fillRect(w - 3, 0, 3, h);
    let px = 16; c.textBaseline = 'middle'; c.textAlign = 'center'; do { c.font = `${px}px "Press Start 2P", monospace`; px--; } while (c.measureText(str).width > w - 18 && px > 6);
    c.fillStyle = '#3a2410'; c.fillText(str, w / 2, h / 2 + 2); }); return new THREE.MeshLambertMaterial({ map: t }); };
  boards.forEach((b, i) => {
    const p = pivot(g, 0, 3.45 - i * 0.78, 0); p.rotation.y = Math.atan2(-b.dz, b.dx);
    add(p, B(3.3, 0.62, 0.12), dark, 1.9, 0, 0);                            // clear of the post, so no lettering hides behind it
    add(p, B(0.5, 0.2, 0.1), dark, 0.2, 0, 0);
    add(p, new THREE.PlaneGeometry(3.2, 0.55), label(`${b.text} >`), 1.9, 0, 0.07);
    add(p, new THREE.PlaneGeometry(3.2, 0.55), label(`< ${b.text}`), 1.9, 0, -0.07).rotation.y = Math.PI;
  });
  return g;
}
/** What is left of a mill: a jagged stump of tower, a fallen sail, rubble. */
export function buildRuinedMill() {
  const g = new THREE.Group(), plaster = lam(0xd8d2c2, rep(shared.plaster, 5, 2)), stone = lam(0xffffff, rep(shared.wall, 4, 1)), dark = lam(0x5a3c20), rock = lam(0x8f8a80);
  plaster.side = THREE.DoubleSide;
  add(g, new THREE.CylinderGeometry(2.8, 3.3, 6, 12, 1, true), plaster, 0, 3, 0);
  add(g, new THREE.CylinderGeometry(3.5, 3.9, 2.2, 12), stone, 0, 0.7, 0);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, h = [2.6, 0.6, 1.4, 0.3, 3.2, 1.8, 0.4, 0.9, 2.2, 0.5, 1.2, 0.2][i]; const b = add(g, B(1.5, h, 0.3), plaster, Math.cos(a) * 2.72, 6 + h / 2, Math.sin(a) * 2.72); b.rotation.y = -a + Math.PI / 2; }
  add(g, B(1.5, 2.7, 0.5), lam(0x17120e), 0, 1.35, 3.15);
  const sail = pivot(g, 3.6, 0.2, 2.4); sail.rotation.set(0.1, 0.5, 1.15);
  add(sail, B(7, 0.3, 0.3), dark, 3.5, 0, 0);
  const cloth = new THREE.MeshLambertMaterial({ map: rep(shared.lattice, 5, 3), side: THREE.DoubleSide, flatShading: true }); add(sail, new THREE.PlaneGeometry(4.6, 1.7), cloth, 4.4, -0.95, 0);
  const beam = add(g, B(5, 0.35, 0.35), dark, -3.4, 0.4, 1.5); beam.rotation.set(0, 0.7, 0.12);
  for (const [x, z, s2] of [[-3.8, -2.6, 0.9], [2.2, -4.1, 0.7], [4.4, -0.6, 0.55], [-1.5, 4.6, 0.6]]) { const r = add(g, new THREE.IcosahedronGeometry(1, 0), rock, x, s2 * 0.4, z); r.scale.set(s2 * 1.2, s2, s2); r.rotation.set(x, z, 1); }
  return g;
}
export function buildCloud(r = Math.random) {
  const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8fa0b4, flatShading: true }), ico = new THREE.IcosahedronGeometry(1, 0);
  const n = 3 + ((r() * 3) | 0);
  for (let i = 0; i < n; i++) { const b = add(g, ico, m, (i - n / 2) * 1.25 + r() * 0.5, r() * 0.35, r() * 0.9 - 0.45); b.scale.set(1.1 + r() * 0.7, 0.55 + r() * 0.35, 0.9 + r() * 0.5); b.rotation.y = r() * 3; }
  return g;
}

// ───────────────────────────── the chronicle's cast ─────────────────────────────
/** A townsperson. o: { skin, coat: [base, dark, light], legs, boots, hair, beard, bald, angry, apron, bareArms, scale } */
export function buildFolk(o = {}) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const skinC = o.skin ?? '#e2b48c', hairC = o.hair ?? '#3a2a1a', beardC = o.beard ?? null;
  const skin = lam(skinC), cc = o.coat || ['#6b4a2a', '#573a1e', '#7d5a36'], coat = lam(0xffffff, speckle(16, cc[0], [cc[1], cc[2]], 40));
  const body = pivot(g);
  const legs = [1, -1].map(sx => { const l = limb(body, sx * 0.24, 1.55, 0, 0.3, 1.2, 0.32, lam(o.legs ?? 0x4a3a2a)); add(l, B(0.34, 0.36, 0.5), lam(o.boots ?? 0x3a2414), 0, -1.37, 0.07); return l; });
  const torso = pivot(body, 0, 1.55, 0);
  add(torso, B(0.92, 1.3, 0.56), o.bareArms ? skin : coat, 0, 0.75, 0);
  if (o.bareArms) add(torso, B(0.94, 0.5, 0.58), coat, 0, 0.3, 0);
  if (o.apron) add(torso, B(0.72, 1.15, 0.06), lam(o.apron), 0, 0.45, 0.3);
  const arms = [1, -1].map(sx => { const a = limb(torso, sx * 0.6, 1.3, 0, 0.26, 1.1, 0.28, o.bareArms ? skin : coat); a.rotation.z = sx * 0.08; add(a, B(0.22, 0.22, 0.22), skin, 0, -1.2, 0); return a; });
  const head = pivot(torso, 0, 1.42, 0), pal = { S: skinC, H: o.bald ? skinC : hairC, K: '#111111', W: '#ffffff', N: '#b98a60', M: '#6a2a20', B: beardC || skinC };
  const face = lam(0xffffff, pixels(['HHHHHHHH', o.bald ? 'SSSSSSSS' : 'HSSSSSSH', o.angry ? 'SKKSSKKS' : 'SSSSSSSS', 'SWKSSKWS', 'SSSNNSSS', 'BBSSSSBB', 'BBBMMBBB', 'BBBBBBBB'], pal));
  const side = lam(0xffffff, pixels(['HHHHHHHH', 'HHHSSSSS', 'HHSSSSSS', 'HHSSSSSS', 'HSSSSSSS', 'BBBBSSSS', 'BBBBBBBB', 'BBBBBBBB'], pal));
  faced(head, 0.56, 0.56, 0.54, face, side, lam(o.bald ? skinC : hairC), 0, 0.3, 0);
  add(head, B(0.1, 0.12, 0.08), lam(0xb98a60), 0, 0.26, 0.3);
  if (beardC) add(head, B(0.4, 0.3, 0.2), lam(beardC), 0, -0.05, 0.22);
  if (o.scale) g.scale.setScalar(o.scale);
  return { g, body, torso, head, arms, legs, yaw: 0, lean: 0 };
}
/** s: { yaw, time, walk, pose: 'idle' | 'throw' | 'shout' } */
export function animFolk(m, s, dt) {
  turnTo(m, s.yaw, dt, 8);
  const w = s.walk ? Math.sin(s.time * 9) * 0.6 : 0, up = s.pose === 'throw' ? -2.9 : s.pose === 'shout' ? -1.6 + Math.sin(s.time * 14) * 0.3 : 0;
  m.legs.forEach((l, i) => { l.rotation.x = (i ? -w : w); });
  m.arms.forEach((a, i) => { a.rotation.x = ease(a.rotation.x, up + (i ? w : -w) * 0.6, dt, 16); });
  m.body.position.y = Math.sin(s.time * 2 + m.yaw) * 0.025; m.torso.rotation.x = ease(m.torso.rotation.x, s.pose === 'shout' ? 0.3 : 0, dt, 10);
  m.head.rotation.x = s.pose === 'shout' ? Math.sin(s.time * 20) * 0.08 : Math.sin(s.time * 1.2) * 0.04;
}
/** The red-haired shield-maiden. o.shadow builds her as the cloaked figure on the pass: all one dark cloth. */
export function buildMaiden(o = {}) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const skin = lam(0xe8c4a0), tunic = lam(0xffffff, speckle(16, '#5a4630', ['#4a3826', '#6c563c'], 40)), cloak = lam(0xffffff, speckle(16, '#55605a', ['#48524c', '#66726b'], 40)), hair = lam(0xc9571c), boot = lam(0x2e2118);
  const body = pivot(g);
  const legs = [1, -1].map(sx => { const l = limb(body, sx * 0.25, 1.7, 0, 0.3, 1.3, 0.32, lam(0x3a3028)); add(l, B(0.34, 0.5, 0.5), boot, 0, -1.4, 0.06); return l; });
  const torso = pivot(body, 0, 1.7, 0);
  add(torso, B(0.9, 1.35, 0.54), tunic, 0, 0.75, 0); add(torso, B(0.96, 0.6, 0.6), tunic, 0, 0.1, 0);
  add(torso, B(1.3, 0.5, 0.75), cloak, 0, 1.28, -0.02);
  const cape = pivot(torso, 0, 1.4, -0.32); add(cape, B(1.25, 2.3, 0.1), cloak, 0, -1.15, 0); cape.rotation.x = 0.12;
  const arms = [1, -1].map(sx => { const a = limb(torso, sx * 0.62, 1.3, 0, 0.25, 1.15, 0.27, tunic); add(a, B(0.21, 0.21, 0.21), skin, 0, -1.24, 0); return a; });
  const shield = pivot(arms[1], 0, -0.95, 0.28);
  add(shield, new THREE.CylinderGeometry(1.05, 1.05, 0.12, 12).rotateX(Math.PI / 2), lam(0xffffff, rep(shared.wood, 1, 1)));
  add(shield, new THREE.TorusGeometry(1.05, 0.08, 4, 12), lam(0x6a6e74)); add(shield, new THREE.IcosahedronGeometry(0.26, 0), lam(0x8a8e94), 0, 0, 0.1);
  const head = pivot(torso, 0, 1.5, 0), pal = { S: '#e8c4a0', H: '#c9571c', K: '#111111', W: '#ffffff', N: '#c9a07c', M: '#8a3a30' };
  faced(head, 0.54, 0.56, 0.52, lam(0xffffff, pixels(['HHHHHHHH', 'HHSSSSHH', 'HKKSSKKH', 'HWKSSKWH', 'HSSNNSSH', 'HSSSSSSH', 'HSSMMSSH', 'HHSSSSHH'], pal)),
    lam(0xffffff, pixels(['HHHHHHHH', 'HHHHHHSS', 'HHHHHSSS', 'HHHHHSSS', 'HHHHSSSS', 'HHHHSSSS', 'HHHHSSSS', 'HHHHHSSS'], pal)), hair, 0, 0.3, 0);
  add(head, B(0.66, 0.2, 0.64), hair, 0, 0.62, -0.02); add(head, B(0.72, 1.7, 0.2), hair, 0, -0.35, -0.3); add(head, B(0.16, 1.0, 0.3), hair, 0.34, -0.1, -0.08); add(head, B(0.16, 1.0, 0.3), hair, -0.34, -0.1, -0.08);
  if (o.shadow) { const dark = lam(0x121018); g.traverse(n => { if (n.isMesh) n.material = dark; }); const hood = add(head, new THREE.ConeGeometry(0.62, 1.0, 6), dark, 0, 0.75, -0.05); hood.rotation.x = -0.15; add(torso, B(1.5, 3.2, 0.9), dark, 0, 0.1, 0); }
  return { g, body, torso, head, arms, legs, shield, cape, yaw: 0, cur: { lean: 0, sh: -1.2, other: 0.1, crouch: 0 } };
}
/** s: { state: guard | windup | bash | tired | hurt | idle, yaw, time, walk } */
export function animMaiden(m, s, dt) {
  turnTo(m, s.yaw, dt, s.state === 'bash' ? 30 : 9);
  const P = { idle: { lean: 0, sh: -0.2, other: 0.1, crouch: 0 }, guard: { lean: 0.12, sh: -1.35, other: 0.3, crouch: 0.15 }, windup: { lean: -0.25, sh: -0.5, other: -0.6, crouch: 0.3 },
    bash: { lean: 0.55, sh: -1.6, other: 0.9, crouch: 0.2 }, tired: { lean: 0.6, sh: 0.1, other: 0.15, crouch: 0.35 }, hurt: { lean: -0.4, sh: -2.4, other: -2.2, crouch: 0.1 } }[s.state] || { lean: 0, sh: -0.2, other: 0.1, crouch: 0 };
  const c = m.cur; for (const k in P) c[k] = ease(c[k], P[k], dt, s.state === 'bash' ? 26 : 10);
  const w = s.walk ? Math.sin(s.time * 8) * 0.5 : 0;
  m.body.position.y = -c.crouch + (s.state === 'tired' ? Math.sin(s.time * 9) * 0.05 : 0); m.torso.rotation.x = c.lean;
  m.arms[1].rotation.x = c.sh; m.arms[0].rotation.x = c.other - w * 0.5; m.shield.rotation.x = -c.sh - 1.4;
  m.legs.forEach((l, i) => { l.rotation.x = (i ? -w : w) - (i ? 0 : c.crouch * 1.2); });
  m.cape.rotation.x = 0.12 + (s.state === 'bash' ? 0.9 : s.walk ? 0.3 : 0) + Math.sin(s.time * 3) * 0.04;
}

// ───────────────────────────── the chronicle's props ─────────────────────────────
export function checkerMat(rx = 4, ry = 4) {
  const t = tex(2, 2, c => { c.fillStyle = '#f2f4f8'; c.fillRect(0, 0, 2, 2); c.fillStyle = '#3f74c9'; c.fillRect(0, 0, 1, 1); c.fillRect(1, 1, 1, 1); }, true); t.repeat.set(rx, ry);
  return lam(0xffffff, t);
}
export function buildCastleTower(h = 26, r = 5) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(r, r * 1.08, h, 12), checkerMat(8, Math.round(h / 3)), 0, h / 2, 0);
  add(g, new THREE.CylinderGeometry(r * 1.15, r, 1.6, 12), lam(0xf2f4f8), 0, h + 0.8, 0);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; add(g, B(1.3, 1.3, 1.0), lam(0xf2f4f8), Math.cos(a) * r * 1.08, h + 2.2, Math.sin(a) * r * 1.08).rotation.y = -a; }
  add(g, new THREE.ConeGeometry(r * 1.05, r * 1.9, 12), lam(0x3f74c9), 0, h + 1.6 + r * 0.95, 0);
  add(g, new THREE.CylinderGeometry(0.07, 0.07, 2.4, 5), lam(0x2a2a2a), 0, h + 1.6 + r * 1.9 + 1.2, 0);
  return g;
}
export function buildPine(snow = false, r = Math.random) {
  const g = new THREE.Group(), green = lam(0xffffff, speckle(16, snow ? '#2f5a45' : '#1f4a33', ['#24503a', '#3a6b52'], 50)), white = lam(0xf4f7fa), h = 6 + r() * 4;
  add(g, new THREE.CylinderGeometry(0.3, 0.42, 1.6, 6), lam(0x4a3320), 0, 0.8, 0);
  for (let i = 0; i < 3; i++) { const rr = 2.4 - i * 0.65, y = 1.6 + i * h * 0.26; add(g, new THREE.ConeGeometry(rr, h * 0.42, 7), green, 0, y + h * 0.21, 0); if (snow) add(g, new THREE.ConeGeometry(rr * 0.62, h * 0.2, 7), white, 0, y + h * 0.33, 0); }
  return g;
}
export function buildBentTower() {                        // window at local (0, 11, 3.2), facing +Z
  const g = new THREE.Group(), stone = lam(0xffffff, rep(shared.wall, 3, 5)), dark = lam(0x0e0c0a);
  const lean = pivot(g); lean.rotation.z = 0.13;
  add(lean, new THREE.CylinderGeometry(3.0, 3.8, 19, 10), stone, 0, 9.5, 0);
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, hh = [2.8, 0.5, 1.6, 0.3, 2.2, 1.0, 0.4, 3.1, 0.8, 1.7][i]; add(lean, B(1.7, hh, 0.5), stone, Math.cos(a) * 2.9, 19 + hh / 2, Math.sin(a) * 2.9).rotation.y = -a + Math.PI / 2; }
  add(lean, B(1.9, 2.6, 0.5), dark, 0, 11, 3.05); add(lean, B(2.4, 0.4, 0.8), stone, 0, 9.6, 3.2);
  add(lean, B(1.4, 2.4, 0.5), dark, 0, 1.2, 3.75);
  return g;
}
export function buildThrone() {
  const g = new THREE.Group(), stone = lam(0xffffff, rep(shared.wall, 1.5, 1.5)), red = lam(0x8a1f1f);
  add(g, B(4.4, 0.8, 4), stone, 0, 0.4, 0); add(g, B(2.6, 1.2, 2.4), stone, 0, 1.4, -0.3); add(g, B(3.2, 5.5, 0.8), stone, 0, 3.5, -1.5);
  for (const sx of [1, -1]) add(g, B(0.6, 1.2, 2.4), stone, sx * 1.6, 2.4, -0.3);
  add(g, B(2.2, 0.15, 2.0), red, 0, 2.08, -0.2); add(g, new THREE.ConeGeometry(1.0, 1.6, 4), stone, 0, 7.0, -1.5).rotation.y = Math.PI / 4;
  return g;
}
export function buildLampTable() {
  const g = new THREE.Group();
  add(g, B(4, 1.5, 2.4), lam(0xffffff, rep(shared.wood, 1, 1)), 0, 0.75, 0); add(g, B(4.3, 0.1, 2.7), lam(0xf4f1e8), 0, 1.55, 0);
  add(g, new THREE.CylinderGeometry(0.28, 0.4, 0.2, 8), lam(0x5a3c20), 0.2, 1.7, -0.5); add(g, new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), lam(0x5a3c20), 0.2, 2.5, -0.5);
  add(g, new THREE.CylinderGeometry(0.5, 1.0, 1.1, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffdc8a, side: THREE.DoubleSide }), 0.2, 3.6, -0.5);
  for (const [x, y, z] of [[-1.1, 1.95, 0.2], [-0.2, 1.95, 0.55], [0.7, 1.95, 0.3], [-0.5, 2.6, 0.35], [1.3, 1.95, -0.2]]) { const b = buildFood('burger'); b.position.set(x, y, z); b.scale.setScalar(0.75); g.add(b); }
  return g;
}
export function buildTavern() {                           // door at local (0, 0, 5.2), facing +Z
  const g = new THREE.Group(), glow = new THREE.MeshBasicMaterial({ color: 0xffc860 });
  add(g, B(14, 5, 10), lam(0xffffff, rep(shared.wall, 4, 2)), 0, 2.4, 0);
  add(g, B(14.8, 4, 10.8), lam(0xffffff, rep(timberTex(), 5, 1)), 0, 6.9, 0);
  const roof = add(g, roofGeo(6.6, 16), lam(0xf4f7fa), 0, 8.9 + 6.6 * 0.5 * 0.6, 0); roof.scale.y = 0.6;
  add(g, B(2.2, 3.4, 0.4), lam(0x3a2414), 0, 1.7, 5.05); add(g, B(2.6, 0.3, 0.6), lam(0x5a3c20), 0, 3.55, 5.1);
  for (const x of [-4.5, 4.5]) add(g, B(1.6, 1.4, 0.3), glow, x, 2.6, 5.05);
  add(g, B(1.2, 3.4, 1.2), lam(0xffffff, rep(shared.wall, 1, 1)), 4.5, 12.4, -1);
  return g;
}
export function buildHangingSign(lines, o = {}) {         // a board hung from a bracket; reads from both sides
  const g = new THREE.Group(), dark = lam(0x5a3c20);
  add(g, B(0.35, 6.5, 0.35), dark, 0, 3.25, 0); add(g, B(3.6, 0.25, 0.25), dark, 1.6, 6.1, 0);
  const t = tex(96, 96, (c, w, h) => { c.fillStyle = o.bg || '#e8d49a'; c.fillRect(0, 0, w, h); c.fillStyle = '#5a3c20'; c.fillRect(0, 0, w, 4); c.fillRect(0, h - 4, w, 4); c.fillRect(0, 0, 4, h); c.fillRect(w - 4, 0, 4, h);
    if (o.palms) for (const px of [34, 62]) { c.fillStyle = '#6b4a2a'; c.fillRect(px - 1, 26, 3, 22); c.fillStyle = '#3f7a34'; for (const [dx, dy] of [[-10, -2], [-6, -7], [0, -9], [6, -7], [10, -2]]) c.fillRect(px + dx - 3, 24 + dy, 8, 4); }
    c.fillStyle = '#3a2410'; c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((ln, i) => { let px = 14; do { c.font = `${px}px "Press Start 2P", monospace`; px--; } while (c.measureText(ln).width > w - 14 && px > 5); c.fillText(ln, w / 2, (o.palms ? 62 : 30) + i * 17); }); });
  const m = new THREE.MeshLambertMaterial({ map: t }), b = pivot(g, 2.1, 4.4, 0);
  add(b, B(2.9, 2.9, 0.14), dark); add(b, new THREE.PlaneGeometry(2.8, 2.8), m, 0, 0, 0.08); add(b, new THREE.PlaneGeometry(2.8, 2.8), m, 0, 0, -0.08).rotation.y = Math.PI;
  for (const x of [-1, 1]) add(g, B(0.06, 0.4, 0.06), lam(0x2a2a2a), 2.1 + x, 6.0, 0);
  return g;
}
export function buildBarrel() {
  const g = new THREE.Group(), r = pivot(g);
  add(r, new THREE.CylinderGeometry(1.15, 1.15, 2.0, 10).rotateZ(Math.PI / 2), lam(0xffffff, rep(shared.wood, 1, 2)));
  for (const x of [-0.6, 0.6]) add(r, new THREE.CylinderGeometry(1.2, 1.2, 0.14, 10).rotateZ(Math.PI / 2), lam(0x3a3a3e), x, 0, 0);
  return g;
}
export function buildCandle(tall = 0.8) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.13, 0.15, tall, 6), lam(0xefe6c8), 0, tall / 2, 0);
  g.userData.flame = add(g, new THREE.ConeGeometry(0.12, 0.36, 5), new THREE.MeshBasicMaterial({ color: 0xffb040 }), 0, tall + 0.2, 0);
  return g;
}
export function buildMug() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.2, 0.18, 0.46, 7), lam(0xd9962a), 0, 0.23, 0); add(g, new THREE.CylinderGeometry(0.21, 0.21, 0.1, 7), lam(0xf6f1e6), 0, 0.5, 0); add(g, B(0.08, 0.26, 0.08), lam(0x8a8a8a), 0.27, 0.25, 0);
  return g;
}
export function buildTile() {
  const t = tex(8, 8, c => { c.fillStyle = '#f4f6f8'; c.fillRect(0, 0, 8, 8); c.fillStyle = '#9aa4ae'; c.fillRect(0, 0, 8, 1); c.fillRect(0, 0, 1, 8); c.fillRect(4, 0, 1, 8); c.fillRect(0, 4, 8, 1); });
  const side = lam(0xd8dde2), f = lam(0xffffff, t);
  return new THREE.Mesh(B(1.6, 1.6, 0.16), [side, side, side, side, f, f]);
}
export function buildCampfire() {
  const g = new THREE.Group(), log = lam(0x4a3320);
  for (let i = 0; i < 4; i++) { const l = add(g, new THREE.CylinderGeometry(0.16, 0.16, 1.5, 5).rotateZ(Math.PI / 2), log, 0, 0.18, 0); l.rotation.y = i * 0.8; }
  g.userData.flame = pivot(g, 0, 0.3, 0);
  add(g.userData.flame, new THREE.ConeGeometry(0.45, 1.2, 5), new THREE.MeshBasicMaterial({ color: 0xff8a20 }), 0, 0.6, 0); add(g.userData.flame, new THREE.ConeGeometry(0.25, 0.8, 5), new THREE.MeshBasicMaterial({ color: 0xffe070 }), 0, 0.5, 0);
  return g;
}
export function buildMushroom() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.08, 0.1, 0.4, 5), lam(0xd8d2c0), 0, 0.2, 0); add(g, new THREE.ConeGeometry(0.3, 0.3, 6), new THREE.MeshBasicMaterial({ color: 0x5fe0d0 }), 0, 0.5, 0);
  return g;
}
export function buildRingGate() {
  const g = new THREE.Group();
  add(g, new THREE.TorusGeometry(5, 0.4, 6, 18), new THREE.MeshBasicMaterial({ color: 0xffd45a }));
  return g;
}
