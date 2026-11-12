// The chapters of The Hog Man Cometh, Part the First.
//
// Each chapter is an object the engine (saga.js) loads in turn:
//   bounds, cell     the ground grid
//   height(x, z)     the ground. Below -30 is "void": not drawn, and a fall into it costs a heart
//   tint(c, x, z, h, ny)   the colour of a patch of ground (ny is how flat it is: 1 = level)
//   ice(x, z)        optional: where the hog cannot grip
//   start            [x, z, dirX, dirZ]
//   ambience         sky, fog, light, weather (see setAmbience in saga.js)
//   build(E)         place everything, using the engine handle E
//   begin(E)         runs once the chapter is up: opening pages, first objective
// The numbers passed to E.pages() are page numbers of the book (assets/book/p-NN.jpg).

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const n2 = (x, z) => Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17) + Math.sin(x * 0.07 - z * 0.11) * 0.6;
const pips = (n, of) => '●'.repeat(Math.max(0, n)) + '○'.repeat(Math.max(0, of - n));
function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Most ground is a trail: s runs along it, d is the signed distance off to the right-hand side.
function makeTrail(pts) {
  const segs = []; let s0 = 0;
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az); segs.push({ ax, az, dx: (bx - ax) / len, dz: (bz - az) / len, len, s0 }); s0 += len; }
  return { length: s0,
    at(s, lat = 0) { let q = segs[segs.length - 1]; for (const g of segs) if (s <= g.s0 + g.len) { q = g; break; } const t = s - q.s0; return [q.ax + q.dx * t - q.dz * lat, q.az + q.dz * t + q.dx * lat, q.dx, q.dz]; },
    locate(x, z) { let best = 1e9, s = 0, side = 1; for (const q of segs) { const t = clamp((x - q.ax) * q.dx + (z - q.az) * q.dz, 0, q.len), dd = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
      if (dd < best) { best = dd; s = q.s0 + t; side = (x - q.ax) * -q.dz + (z - q.az) * q.dx < 0 ? -1 : 1; } } return { s, d: side * best }; } };
}
// What the ground does beyond the trail's edge: a bank too steep to climb, or a drop into nothing.
function edge(a, kind, x, z, wallH = 22) {
  if (a <= 0) return 0;
  return kind === 'drop' ? -110 * sstep(0.3, 5, a) : wallH * sstep(0, 8, a) + n2(x, z) * 0.8 * sstep(0, 4, a);
}

const DAY = { bg: 'sky', fog: 'haze', near: 150, far: 720, hemi: [0xdcefff, 0x8a7a55, 1.5], sun: [0xfff0d0, 2.2], sky: true, clouds: true, water: [5.6, 0x3f93cf] };
const DUSK = { bg: 0x1c2c30, fog: 0x1c2c30, near: 18, far: 125, hemi: [0x7f9fa8, 0x2a2a20, 1.0], sun: [0x9fb8c8, 0.8], water: [5.6, 0x2a5a6a] };
const SNOW = { bg: 0xc4d2df, fog: 0xd3dde8, near: 22, far: 175, hemi: [0xe8f0ff, 0x8a94a8, 1.7], sun: [0xffffff, 1.3], snow: true };
const NIGHT = { bg: 0x0c1626, fog: 0x0c1626, near: 14, far: 115, hemi: [0x8fa8d8, 0x1a2030, 1.05], sun: [0x9fb4e8, 0.55], snow: true };
const TAVERN = { bg: 0x140d08, fog: 0x140d08, near: 26, far: 95, hemi: [0xb08c64, 0x2a1c10, 1.0], sun: [0xffd0a0, 0.55] };
const CAVE = { bg: 0x07060a, fog: 0x07060a, near: 12, far: 75, hemi: [0x7a6a58, 0x1a1410, 0.85], sun: [0xffc890, 0.4] };
const BRIGHT = { bg: 'sky', fog: 'haze', near: 120, far: 650, hemi: [0xe8f2ff, 0x9aa4b8, 1.7], sun: [0xfff4e0, 2.0], sky: true, clouds: true };
const FROST = { ...BRIGHT, water: [5.3, 0x6fb0dc] };   // the White Castle's approach: the same bright day, with a river in it
const SUNSET = { bg: 0xf2b98a, fog: 0xf6d2b0, near: 110, far: 720, hemi: [0xfff4ea, 0xd8c8d0, 2.1], sun: [0xffd8b0, 1.5], clouds: true, water: [19, 0xffffff] };   // 'water' here is the sea of cloud the hog flies over

// Shared set-dressing.
function pines(E, trail, s0, s1, half, o = {}) {
  const r = seeded(o.seed || 7), step = o.step || 5.5;
  for (let s = s0; s < s1; s += step) for (const sd of [-1, 1]) {
    if (o.side && o.side !== sd) continue;
    const [x, z] = trail.at(s + r() * 3, sd * (half + 0.8 + r() * 3.5)); if (o.skip && o.skip(x, z)) continue;
    const m = E.Models.buildPine(!!o.snow, r); m.scale.setScalar(0.9 + r() * 0.6); E.put(m, x, z, r() * 6, 0.3); E.addCyl(x, z, 0.75, 0.75, -99, 99, false);
    if (o.back) { const [bx, bz] = trail.at(s + 2.7, sd * (half + 6 + r() * 6)); const b = E.Models.buildPine(!!o.snow, r); b.scale.setScalar(1.2 + r() * 0.8); E.put(b, bx, bz, r() * 6, 0.5); }
  }
}
function rocks(E, list, colour) { const mat = colour ? E.lam(colour) : E.M.rock; for (const [x, z, sc] of list) { const y = E.ground(x, z), m = E.mesh(new E.THREE.IcosahedronGeometry(1, 0), mat, x, y + sc * 0.35, z); m.scale.set(sc * 1.2, sc, sc * 1.1); m.rotation.set(x, z, 1); E.addCyl(x, z, sc * 0.9, sc * 0.9, y - 2, y + sc * 1.05, true); } }
function stone(E, x, z, top, r = 2.1, mat) { E.mesh(new E.THREE.CylinderGeometry(r, r * 0.8, 9, 8), mat || E.M.rock, x, top - 4.5, z); return E.addCyl(x, z, r, r, top - 9, top, true); }
// A mossy stone: it sinks while the hog stands on it and rises again when he leaves.
function sinker(E, x, z, top, mat, r = 2.2) {
  const m = E.mesh(new E.THREE.CylinderGeometry(r, r * 0.78, 9, 8), mat || E.M.rock, x, top - 4.5, z), s = E.addCyl(x, z, r, r, top - 9, top, true);
  E.mesh(new E.THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.25, 8), E.lam(0x5f8f3a), 0, 4.45, 0, m); s.dx = 0; s.dz = 0;
  s.update = dt => { const on = E.P.grounded && E.P.ground === s; s.y1 = clamp(s.y1 + (on ? -1.7 : 1.1) * dt, top - 10.5, top); s.y0 = s.y1 - 9; m.position.y = s.y1 - 4.5; };
  E.movers.push(s); return s;
}
function candles(E, list, y) { for (const [x, z] of list) { const c = E.Models.buildCandle(1); c.position.set(x, y, z); E.world.g.add(c); } }

// ═════════════════════════════ Chapter the First: The Darkling Trail ═════════════════════════════
// Book pages 4–8: the town, the wizard's warning, the dark wood, the brute at the pond, the Tile Troll.
const T1 = makeTrail([[0, 0], [0, -75], [22, -135], [-16, -195], [12, -255], [-14, -318], [0, -372], [0, -478]]);
const GLADE = { x: 0, z: -435, r: 25 }, POND = { x: -14, z: -441, r: 8.5 };
// Two stretches of water across the trail (a ford, then a bog), and a thorn bank too tall to jump without the logs before it.
const FORDS = [[196, 210], [300, 332]], BANK1 = [366, 369, 375, 378], BANK1_H = 4.4;
const wet1 = s => FORDS.reduce((w, [p, q]) => Math.max(w, sstep(p, p + 4, s) * sstep(q, q - 4, s)), 0);
const bank1 = s => BANK1_H * sstep(BANK1[0], BANK1[1], s) * sstep(BANK1[3], BANK1[2], s);
const half1 = s => lerp(22, 7, sstep(64, 78, s));
const L1 = {
  chapter: 'Chapter the First', title: 'The Darkling Trail', bounds: [-72, 78, -498, 34], start: [0, -6, 0, -1], ambience: DAY,
  height(x, z) {
    const t = T1.locate(x, z);
    let h = 6.5 - 3.4 * wet1(t.s) + bank1(t.s) + edge(Math.abs(t.d) - half1(t.s), 'wall', x, z, t.s < 70 ? 15 : 22);
    h = Math.min(h, 6.5 + 22 * sstep(GLADE.r, GLADE.r + 9, Math.hypot(x - GLADE.x, z - GLADE.z)));
    return lerp(h, 3.4, sstep(POND.r, POND.r - 3.5, Math.hypot(x - POND.x, z - POND.z)));
  },
  tint(c, x, z, h, ny) {
    const t = T1.locate(x, z), a = Math.abs(t.d), town = t.s < 72;
    if (h < 5.4) c.set(0x6b6a55); else if (bank1(t.s) > 0.3 && a < 9) c.set(ny < 0.74 ? 0x24301c : 0x3a4a26); else if (ny < 0.74) c.set(town ? 0x8a8478 : 0x3a3326);
    else if (town) c.set(a < 7 ? 0x9a958c : 0x7fae4a);
    else if (Math.hypot(x - GLADE.x, z - GLADE.z) < GLADE.r + 2) c.set(0x4c7a3c);
    else c.set(a < 2.6 ? 0x6b5536 : 0x2f4f2e);
  },
  build(E) {
    const { THREE, Models, M } = E, at = (s, lat = 0) => T1.at(s, lat), r = seeded(11);
    // The town: a street of houses, and the wizard with his pint.
    for (const [s, sd, kind] of [[8, 1, 'h'], [8, -1, 't'], [28, -1, 'h'], [30, 1, 'h'], [50, 1, 't'], [50, -1, 'h']]) {
      const [x, z] = at(s, sd * 15), m = kind === 'h' ? Models.buildHouse() : Models.buildTownTower(), hw = kind === 'h' ? [3.6, 4.1] : [2.9, 2.9];
      E.put(m, x, z, sd > 0 ? -Math.PI / 2 : Math.PI / 2); E.addBox(x - hw[0], x + hw[0], z - hw[1], z + hw[1], -5, 40, false);
    }
    E.put(Models.buildWell(), -6, -22, 0.3, 0.05); E.addCyl(-6, -22, 1.75, 1.75, 4, 7.8, true);
    E.put(Models.buildCart(), 7, -58, 2.4, 0.02); E.addCyl(7, -58, 1.9, 1.9, -5, 40, false);
    for (const sd of [-1, 1]) {           // the town gate: two towers and a lintel
      const [x, z] = at(74, sd * 9.5); E.mesh(new THREE.CylinderGeometry(3.2, 3.6, 17, 10), E.lam(0xffffff, E.rep(M.tex.wall, 3, 2)), x, 14, z); E.mesh(new THREE.ConeGeometry(4, 5.5, 10), E.lam(0xd06a50, E.rep(M.tex.tiles, 6, 2)), x, 25.2, z); E.addCyl(x, z, 3.7, 3.7, -5, 40, false);
    }
    E.mesh(new THREE.BoxGeometry(13, 3, 3), E.lam(0xffffff, E.rep(M.tex.wall, 2, 0.5)), 0, 19, -74);
    const wiz = Models.buildMiller({ staff: true }), [wx, wz] = at(40, 5);
    L1.wizard = E.npc({ m: wiz, spr: 'wizard', name: 'The Wizard', x: wx, z: wz, yaw: -1.2, lines: [
      ['The cold mountain, I said. Through the wood, past the pond, and up. Do keep the small one on his leash.'],
      ['SHIFT to charge, and SPACE again in mid-air for a… gaseous lift. Eat what you find. I shall be at the pub.'],
    ] });
    E.trigger(wx - 4, wz, 9, () => E.pages([5], () => E.say([
      ['wizard', 'The Wizard', 'You seek the Lamp, and the food that lies beneath it? Then hear me. Peril and frost await on the cold mountain — and upon its peak, the prize.'],
      ['wizard', 'The Wizard', 'A fed hog is a fast hog: eat what you find. SHIFT to charge. SPACE again in mid-air for a… gaseous lift.'],
      ['gollum', 'The Gollum Man', 'It listens to the pint-man, does it? We does not like mountains. We likes scraps.'],
      ['hog', 'Juli the Hog', 'Oink.'],
    ], () => E.objective('Leave the town by the north gate', at(84)))));
    E.line('taco', 0, -14, 0, -34, 4); E.line('taco', 3, -48, 0, -68, 4); E.item('burrito', -6, -22, 9.4);
    E.flag(0, -70, -4);
    // The darkling trail.
    E.trigger(...at(86).slice(0, 2), 8, () => E.pages([6], () => { E.ambience(DUSK); E.objective('Follow the darkling trail', [GLADE.x, GLADE.z + 20]); }));
    const inGlade = (x, z) => Math.hypot(x - GLADE.x, z - GLADE.z) < GLADE.r + 4;
    pines(E, T1, 84, 436, 7, { seed: 3, back: true, skip: inGlade });
    for (let i = 0; i < 64; i++) { const [x, z] = at(86 + r() * 345, (r() < 0.5 ? -1 : 1) * (4.2 + r() * 3)); if (!inGlade(x, z) && E.h(x, z) > 6) E.put(Models.buildMushroom(), x, z, 0, 0); }
    for (const s of [140, 236]) {         // fallen trunks to hop
      const [x, z, dx, dz] = at(s), y = E.ground(x, z), log = E.mesh(new THREE.CylinderGeometry(0.8, 0.9, 15, 7).rotateZ(Math.PI / 2), M.trunk, x, y + 0.6, z); log.rotation.y = Math.atan2(-dx, -dz);
      for (let l = -6.6; l <= 6.6; l += 1.2) { const [lx, lz] = at(s, l); E.addCyl(lx, lz, 0.85, 0.85, y - 1, y + 1.3, true); }
      E.item('burger', x, z, y + 4.2);
    }
    { const [ax, az] = at(200.4, -1.5), [bx, bz] = at(205.6, 1.5); stone(E, ax, az, 6.3); stone(E, bx, bz, 6.3); E.item('taco', ax, az, 8); E.item('taco', bx, bz, 8); }   // the ford
    for (const [s, n] of [[96, 4], [118, 3], [156, 4], [178, 3], [220, 4], [262, 4], [282, 3], [338, 4], [386, 3], [402, 4]]) for (let i = 0; i < n; i++) { const [x, z] = at(s + i * 4, Math.sin(s + i) * 3); E.item(i === 1 && n === 4 ? 'burger' : 'taco', x, z); }
    for (const [s, rad, sp] of [[112, 5, 5], [168, 5, -5.5], [250, 5.5, 5.5], [346, 5, -5], [398, 5, 5.5]]) { const [x, z] = at(s); E.crow(x, z, rad, sp); }
    for (const sf of [214, 290, 338, 384, 424]) { const [x, z] = at(sf); E.flag(x, z, -3.5); }
    // The bog: five stones across, and the mossy ones sink.
    [[303.5, -1, 0], [309, 1, 0], [314.5, -1, 1], [320, 1, 0], [325.5, -0.8, 1]].forEach(([sb, lat, moss]) => { const [x, z] = at(sb, lat); if (moss) sinker(E, x, z, 6.3); else stone(E, x, z, 6.3); E.item(moss ? 'burger' : 'taco', x, z, 8); });
    { const [x, z] = at(296); E.trigger(x, z, 6, () => E.bark('gollum', 'THE GOLLUM MAN: Bog! Nasty bog. The green stones sinks, Hog Man. We knows. We has sunk.', 4.5)); }
    // The thorn bank: too tall to jump. Two stacked logs make a stair.
    for (const [sb, lat, hgt] of [[357.5, -1.5, 1.7], [362.6, 1.2, 3.3]]) { const [x, z] = at(sb, lat), y = E.ground(x, z); E.mesh(new THREE.CylinderGeometry(1.7, 1.8, hgt, 9), M.trunk, x, y + hgt / 2, z); E.mesh(new THREE.CylinderGeometry(1.72, 1.72, 0.12, 9), E.lam(0xb9925a), x, y + hgt, z); E.addCyl(x, z, 1.7, 1.7, y - 1, y + hgt, true); }
    for (let i = 0; i < 26; i++) { const [x, z] = at(366.5 + r() * 11, (r() * 2 - 1) * 8), y = E.h(x, z); if (y < 7.2) { const t2 = E.mesh(new THREE.ConeGeometry(0.5 + r() * 0.4, 1.6 + r() * 1.4, 4), E.lam(0x1f2a18), x, y + 0.7, z); t2.rotation.set((r() - 0.5) * 0.9, r() * 3, (r() - 0.5) * 0.9); } }
    { const [x, z] = at(372); E.item('burrito', x, z, 6.5 + BANK1_H + 1.6); }
    { const [x, z] = at(418, 5); E.put(Models.buildHangingSign(['LAIR OF', 'THE TILE', 'TROLL']), x, z, 0.2, 0.1); E.addCyl(x, z, 0.5, 0.5, -5, 40, false); E.item('burrito', x - 5, z - 6); }
    // The glade, the pond, and what laps at it.
    rocks(E, [[14, GLADE.z + 12, 1.6], [-17, GLADE.z + 14, 1.3], [16, GLADE.z - 14, 1.9], [4, GLADE.z - 20, 1.2]]);
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + 0.2; if (Math.abs(a - Math.PI / 2) < 0.45) continue; const m = Models.buildPine(false, r); m.scale.setScalar(1.3 + r() * 0.6); E.put(m, GLADE.x + Math.cos(a) * (GLADE.r + 3), GLADE.z + Math.sin(a) * (GLADE.r + 3), r() * 6, 0.4); }
    const troll = E.troll({ x: -5, z: GLADE.z - 1, hx: GLADE.x + 3, hz: GLADE.z, yaw: Math.atan2(-9, -5),
      onHit: T => E.objective(`Fell the Tile Troll  ${pips(T.hp, 3)}`),
      onDefeat: T => E.later(1.4, () => {                 // "With a burst of light he cast the Tile Troll into exile."
        E.flash('#fff', 1100); T.state = 'gone'; E.puff(T.x, T.y + 3, T.z, 0xffe9a0, 30, 12, 1.2, 1.2, 5); E.Sound.bolt(); E.GOL.cower = false;
        E.pages([8], () => E.say([['wizard', 'The Wizard', 'Exile! Staff blazing, pint untouched. Onward, hog-rider — the cold mountain will not climb itself.'], ['gollum', 'The Gollum Man', 'It is gone! The square-man is gone! We wept. We is not ashamed.']], () => E.complete()));
      }) });
    E.trigger(-5, GLADE.z - 1, 20, () => E.pages([7], () => { troll.wake(); E.GOL.cower = true; E.objective('Fell the Tile Troll  ●●●', null); E.bark('troll', 'TILE TROLL: Who disturbs my supper? I shall GROUT you where you stand! (Charge him — and mind the tiles.)', 6); }));
  },
  begin(E) { E.gollum(true); E.pages([4], () => E.objective('Seek the wizard in the town', [L1.wizard.x, L1.wizard.z])); },
};

// ═════════════════════════════ Chapter the Second: The Cold Mountain ═════════════════════════════
// Book pages 9–16: the climb, the bent tower and its slop bucket, the icy pass, the shadow that bars the way.
const T2 = makeTrail([[0, 0], [0, -85], [-32, -150], [8, -215], [44, -270], [44, -350], [12, -410], [12, -450], [-22, -506], [-22, -572], [6, -628]]);
const END2 = 666;                                   // where the shadow waits
// Above the pass: a knife-edge (a drop on both sides, s 500–600), then a last gully with snowballs.
const EDGE2 = [500, 600];
// Each chasm in the pass is cut wide in the ground, then given two stone ledges whose edges set the real gap.
// (The ground grid is too coarse to place a chasm's lip exactly: cut by the grid alone, these were unjumpable.)
const GAPS2 = [[338, 346], [398, 406], [546, 554]], LEDGE2 = [[334.5, 349.5], [394.5, 409.5], [542.5, 557.5]];
const half2 = s => lerp(lerp(lerp(8, 15, sstep(142, 156, s)), 4.8, sstep(238, 256, s)), 6.5, sstep(596, 612, s));
const iceAt2 = s => (s > 58 && s < 84) || (s > 112 && s < 138) || (s > 262 && s < 328) || (s > 352 && s < 390) || (s > 412 && s < 440) || (s > 508 && s < 536) || (s > 566 && s < 592);
const L2 = {
  chapter: 'Chapter the Second', title: 'The Cold Mountain', bounds: [-70, 82, -660, 34], start: [0, -6, 0, -1], ambience: SNOW,
  height(x, z) {
    const t = T2.locate(x, z), a = Math.abs(t.d), hf = half2(t.s);
    if (t.s > 250 && a < hf + 1.5 && GAPS2.some(([p, q]) => t.s > p && t.s < q)) return -60;
    const drop = t.d > 0 ? t.s > 248 && t.s < EDGE2[1] : t.s > EDGE2[0] && t.s < EDGE2[1];
    return 6.5 + 0.1 * t.s + edge(a - hf, drop ? 'drop' : 'wall', x, z, 24);
  },
  ice(x, z) { const t = T2.locate(x, z); return Math.abs(t.d) < half2(t.s) && iceAt2(t.s); },
  tint(c, x, z, h, ny) {
    const t = T2.locate(x, z), a = Math.abs(t.d);
    if (ny < 0.72) c.set(0x727887); else if (a < half2(t.s) && iceAt2(t.s)) c.set(0x9fcfee); else c.set(a < 2.4 ? 0xd4dbe4 : 0xeef2f6);
  },
  build(E) {
    const { THREE, Models, M } = E, at = (s, lat = 0) => T2.at(s, lat), sOf = () => T2.locate(E.P.x, E.P.z).s;
    pines(E, T2, 6, 150, 8, { seed: 5, snow: true, back: true, step: 7 }); pines(E, T2, 160, 240, 15, { seed: 9, snow: true, step: 9, side: -1 });
    rocks(E, [[5, -30, 1.3], [-5, -52, 1.1], [-14, -118, 1.4], [-8, -168, 1.5], [20, -224, 1.2]], 0x8f96a4);
    // Snowballs come down the first valley.
    E.rollers({ curve: (u, lane) => at(20 + u * 128, lane), u0: 1, length: 128, speed: 11, period: 3.5, lane: 3, radius: 1.5, colour: 0xf4f7fa,
      make() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), E.lam(0xf4f7fa))); return g; }, active: () => { const s = sOf(); return s > 6 && s < 152; } });
    for (const [s, n, type] of [[14, 4, 'taco'], [40, 3, 'taco'], [92, 4, 'burger'], [144, 3, 'taco'], [176, 4, 'taco'], [226, 3, 'burger']]) for (let i = 0; i < n; i++) { const [x, z] = at(s + i * 4.5, Math.sin(s * 1.3 + i * 2) * 4); E.item(type, x, z); }
    for (const [s, rad, sp] of [[50, 5.5, 5], [104, 5.5, -5.5], [222, 8, 5.5]]) { const [x, z] = at(s); E.crow(x, z, rad, sp); }
    for (const s of [146, 252, 352, 412, 486, 562, 606]) { const [x, z] = at(s, s > 480 ? 0 : -1.5); E.flag(x, z, -2.2); }
    // The ruin, and the man in the tower.
    const [tx, tz] = at(202, 13), [px, pz] = at(202, 0), ty = E.ground(tx, tz), tyaw = Math.atan2(px - tx, pz - tz), fx = Math.sin(tyaw), fz = Math.cos(tyaw);
    E.put(Models.buildBentTower(), tx, tz, tyaw, 0.6); E.addCyl(tx, tz, 4.1, 3.2, -99, 99, false).occlude = true;
    rocks(E, [[tx - 9, tz + 9, 1.4], [tx + 2, tz + 12, 1.1], [tx - 12, tz - 6, 1.7]], 0x8f96a4);
    const man = Models.buildFolk({ angry: true, bareArms: true, hair: '#6a4a2a', coat: ['#6b5a3a', '#5a4a2e', '#7c6a48'] }); E.world.g.add(man.g);
    // He leans from the window, which sits off-centre because the tower itself leans.
    const tower = E.thrower({ x: tx + fx * 2.3 - Math.cos(tyaw) * 1.4, z: tz + fz * 2.3 + Math.sin(tyaw) * 1.4, y: ty + 7.6, m: man, yaw: tyaw, period: 2.5, first: 99, src: A => [A.x + fx * 1.4, A.y + 4.6, A.z + fz * 1.4], active: () => { const s = sOf(); return s > 158 && s < 246; } });
    { const [x, z] = at(166); E.trigger(x, z, 10, () => E.pages([10, 11], () => {
      tower.on = true; E.bark('towerman', 'THE MAN IN THE TOWER: "You come me!"', 3.5);
      E.later(1.0, () => tower.lob(E.GOL.x, E.GOL.z, () => {         // the first bucket is for the Gollum Man. It always is.
        E.GOL.frame = 'gol_hurt'; E.pages([12], () => { tower.t = 2.2; E.objective('Get past the tower — mind the slop', at(256)); E.bark('gollum_hurt', 'THE GOLLUM MAN: Its contents foul! Its purpose unknown! We is SLICK with it!', 4); });
      }));
    })); }
    { const [x, z] = at(254); E.trigger(x, z, 7, () => { tower.on = false; E.pages([13], () => { E.objective('Climb the icy pass', at(END2)); E.toast('Ice: the hog cannot grip. Lean into the wind.', 4); }); }); }
    // The icy pass: a ledge, a drop, and a wind that wants the hog over it.
    const wind = { t: 4, on: 0, warn: 0 };
    E.actor({ step(dt) {
      const s = sOf(); E.world.windX = E.world.windZ = 0;
      const atGap = GAPS2.some(([p, q]) => s > p - 14 && s < q + 12);                 // no gusts while the hog is lining up a jump: that would just be cruel
      if (s < 266 || (s > 446 && s < EDGE2[0] + 4) || s > EDGE2[1] - 4 || atGap || E.P.dead > 0) { wind.t = Math.max(wind.t, 1.5); wind.on = 0; wind.warn = 0; return; }
      if (wind.warn > 0) { if ((wind.warn -= dt) <= 0) wind.on = 1.4; }           // a moment's warning, then it bites
      else if (wind.on > 0) { wind.on -= dt; const [, , dx, dz] = at(s), f = 6.5 * Math.min(1, (1.4 - wind.on) * 4); E.world.windX = -dz * f; E.world.windZ = dx * f; if (Math.random() < dt * 30) E.puff(E.P.x + dz * 6 + (Math.random() - 0.5) * 8, E.P.y + 1 + Math.random() * 3, E.P.z - dx * 6 + (Math.random() - 0.5) * 8, 0xffffff, 1, 1, 0.25, 0.5, 0); }
      else if ((wind.t -= dt) <= 0) { wind.t = 5.2; wind.warn = 0.7; E.Sound.gust(); E.toast(s > EDGE2[0] ? 'The wind! Hold the middle!' : 'The wind! Lean left!', 1.6); }
    }, draw() {} });
    for (const [s, n] of [[270, 4], [300, 3], [318, 3], [360, 4], [382, 2], [420, 4], [466, 4], [512, 4], [570, 4], [616, 3], [640, 4]]) for (let i = 0; i < n; i++) { const [x, z] = at(s + i * 4.5, s > 480 ? Math.sin(s + i) * 2 : -1.5); E.item(i % 3 === 2 ? 'burger' : 'taco', x, z); }
    for (const [p, q] of GAPS2) { const [x, z] = at((p + q) / 2); E.item('burrito', x, z, 6.5 + 0.1 * p + 4.2); }
    for (const s of LEDGE2.flat()) { const [x, z] = at(s), y = 6.5 + 0.1 * s; E.mesh(new THREE.CylinderGeometry(4.8, 4.2, 5, 10), E.lam(0xa9c4d8), x, y - 2.5, z); E.addCyl(x, z, 4.8, 4.8, y - 5, y, true); }
    { const [x, z] = at(300, -1); E.crow(x, z, 3.2, 4.5); } { const [x, z] = at(426, -1); E.crow(x, z, 3.2, -4.5); } { const [x, z] = at(524); E.crow(x, z, 3.4, 4.5); }
    // The knife-edge, then the last gully.
    { const [x, z] = at(EDGE2[0] - 4); E.trigger(x, z, 7, () => { E.toast('A knife-edge: nothing either side. Keep to the middle.', 4); E.bark('gollum', 'THE GOLLUM MAN: Do not look down, Hog Man. We looked down. We regrets it.', 4); }); }
    E.rollers({ curve: (u, lane) => at(604 + u * 56, lane), u0: 1, length: 56, speed: 10, period: 3.6, lane: 2.6, radius: 1.4, colour: 0xf4f7fa,
      make() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), E.lam(0xf4f7fa))); return g; }, active: () => { const s = sOf(); return s > 592 && s < END2 - 2; } });
    pines(E, T2, 612, END2 - 6, 6.5, { seed: 13, snow: true, step: 9 });
    // The shadow on the path.
    const [mx, mz] = at(END2 + 4), shade = Models.buildMaiden({ shadow: true }); E.put(shade.g, mx, mz, 0, 0);
    shade.g.rotation.y = Math.atan2(at(END2 - 20)[0] - mx, at(END2 - 20)[1] - mz);
    E.trigger(mx, mz, 13, () => E.pages([14, 15], () => E.say([
      ['maiden', 'The Shield-Maiden', 'That one. The small, damp one. He comes with me.'],
      ['gollum', 'The Gollum Man', 'No! Nooo! Hog Man! It has our leash! IT HAS OUR—'],
    ], () => { E.gollum(false); shade.g.visible = false; E.puff(mx, E.ground(mx, mz) + 2, mz, 0x333340, 18, 6, 0.9, 0.8, 2); E.pages([16], () => E.complete()); })));
  },
  begin(E) { E.gollum(true); E.pages([9], () => E.objective('Climb the cold mountain', T2.at(166))); },
};

// ═════════════════════════════ Chapter the Third: The Oasis ═════════════════════════════
// Book pages 17–27: alone in the frozen dark, the tavern, the small square door, the maiden's lair.
const T3 = makeTrail([[0, 0], [0, -70], [26, -125], [26, -158], [8, -184], [8, -204]]);
const DOOR3 = [8, -206.2];                           // the tavern's door, at the trail's end
const TAV = { x: 200, z: 0, hw: 15, hd: 11.5 }, COR = { x: 400, z0: 96, z1: -80, hw: 4.6, gaps: [[84, 70], [44, 30], [10, -8], [-30, -46]] }, THR = { x: 400, z: -96, r: 19.5 };
// The way out of the lair: a tunnel east, most of it a chasm bridged only by stones that sink.
const ESC = { x0: THR.x + 15, x1: 502, hw: 4.6, gap: [434, 474], exit: 494 };
const L3 = {
  chapter: 'Chapter the Third', title: 'The Oasis', bounds: [-46, 514, -232, 106], cell: 2, start: [0, -6, 0, -1], ambience: NIGHT,
  height(x, z) {
    if (Math.abs(x - TAV.x) < TAV.hw && Math.abs(z - TAV.z) < TAV.hd) return 6.5;
    if (Math.abs(x - COR.x) < COR.hw && z < COR.z0 && z > COR.z1) return COR.gaps.some(([p, q]) => z < p && z > q) ? -60 : 6.5;
    if (Math.hypot(x - THR.x, z - THR.z) < THR.r) return 6.5;
    if (Math.abs(z - THR.z) < ESC.hw && x > ESC.x0 && x < ESC.x1) return x > ESC.gap[0] && x < ESC.gap[1] ? -60 : 6.5;
    if (x > 110) return -60;
    const t = T3.locate(x, z), a = Math.abs(t.d); if (a > 30) return -60;
    return 6.5 + (a < 9 ? n2(x * 1.7, z * 1.7) * 0.3 : 0) + edge(a - 9, 'wall', x, z, 20);
  },
  ice(x, z) { if (x > 110) return false; const t = T3.locate(x, z); return Math.abs(t.d) < 9 && ((t.s > 34 && t.s < 56) || (t.s > 84 && t.s < 104) || (t.s > 150 && t.s < 172)); },
  tint(c, x, z, h, ny) {
    if (Math.abs(x - TAV.x) < TAV.hw + 2 && Math.abs(z) < TAV.hd + 2) return void c.set(0x7a5a3a);
    if (x > 300) return void c.set(Math.hypot(x - THR.x, z - THR.z) < 7 ? 0x6a2a2a : 0x4c4854);
    const t = T3.locate(x, z);
    if (ny < 0.72) c.set(0x5a6274); else if (L3.ice(x, z)) c.set(0x7fb4dc); else c.set(Math.abs(t.d) < 2.4 ? 0xb9c4d4 : 0xd8e0ea);
  },
  build(E) {
    const { THREE, Models, M } = E, at = (s, lat = 0) => T3.at(s, lat), timber = E.lam(0xffffff, E.rep(M.tex.wood, 6, 2)), rock = E.lam(0x3a3640);
    const wall = (x0, x1, z0, z1, h, mat) => { E.mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), mat, (x0 + x1) / 2, 6.5 + h / 2, (z0 + z1) / 2); const b = E.addBox(x0, x1, z0, z1, -5, 6.5 + h, false); b.occlude = true; return b; };
    // The frozen dark.
    { const f = Models.buildCampfire(); E.put(f, 4, -3, 0, 0); E.light(4, 8.5, -3, 0xff9a40, 40, 30); }
    pines(E, T3, 6, 208, 9, { seed: 21, snow: true, back: true, step: 8 });
    rocks(E, [[-5, -24, 1.2], [6, -60, 1.5], [10, -96, 1.1], [30, -118, 1.4], [21, -146, 1.6], [30, -152, 1.2], [14, -172, 1.5], [4, -190, 1.1]], 0x7a8496);
    for (const [s, n, type] of [[12, 4, 'taco'], [38, 3, 'burger'], [64, 4, 'taco'], [90, 3, 'taco'], [124, 4, 'burger'], [152, 4, 'taco'], [180, 3, 'burger']]) for (let i = 0; i < n; i++) { const [x, z] = at(s + i * 4.5, Math.sin(s + i * 2) * 4.5); E.item(type, x, z); }
    for (const [s, rad, sp] of [[30, 6, 5], [76, 6, -5.5], [112, 6, 5.5], [146, 6, -5], [176, 5, 5.5]]) { const [x, z] = at(s); E.crow(x, z, rad, sp); }
    for (const sf of [66, 138]) { const [x, z] = at(sf); E.flag(x, z, -4); }
    { const [x, z] = at(176, -6.5); E.put(Models.buildHangingSign(['THE OASIS'], { palms: true }), x, z, 0.5, 0.1); E.addCyl(x, z, 0.5, 0.5, -5, 40, false); E.light(x, 12, z, 0xffc060, 30, 26); E.trigger(...at(170).slice(0, 2), 8, () => E.pages([19], () => E.objective('Reach the tavern door', DOOR3))); }
    E.put(Models.buildTavern(), DOOR3[0], DOOR3[1] - 6.8, 0, 0.3); E.light(DOOR3[0], 10, DOOR3[1] + 2, 0xffc060, 50, 34);
    E.trigger(DOOR3[0], DOOR3[1], 3.4, () => E.pages([20, 21], () => E.teleport(TAV.x, 7, 0, -1, () => { E.objective('Seek the keeper of the bar', [TAV.x, -8]); E.bark('hog', 'Without warning or logic, he found himself astride his hog once more. Indoors.', 4.5); }, TAVERN, true)));
    // The tavern.
    const [a, b, c, d] = [TAV.x - 13.5, TAV.x + 13.5, -10, 10];
    wall(a - 1, b + 1, c - 1, c, 9, timber); wall(a - 1, b + 1, d, d + 1, 9, timber); wall(a - 1, a, c, d, 9, timber); wall(b, b + 1, c, d, 9, timber);
    E.mesh(new THREE.BoxGeometry(16, 1.5, 1.5), E.lam(0xffffff, E.rep(M.tex.wood, 4, 1)), TAV.x, 7.25, -5.3); E.addBox(TAV.x - 8, TAV.x + 8, -6.05, -4.55, 5, 8, true);
    E.mesh(new THREE.BoxGeometry(14, 3, 0.6), E.M.woodDark, TAV.x - 2, 10, -9.6);
    for (let i = 0; i < 7; i++) { const m = Models.buildMug(); m.position.set(TAV.x - 8 + i * 2, 11.5, -9.5); E.world.g.add(m); }
    for (const [x, z] of [[TAV.x - 8, 3], [TAV.x + 7, 4.5], [TAV.x - 3, 6.5]]) { E.mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.2, 9), timber, x, 7.7, z); E.mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.1, 6), E.M.woodDark, x, 7.05, z); E.addCyl(x, z, 1.4, 1.4, 5, 7.8, true); candles(E, [[x, z]], 7.8); }
    E.light(TAV.x, 12, 0, 0xffb060, 110, 60); E.light(TAV.x - 9, 9, -7, 0xff9040, 40, 30);
    for (const [x, z, o] of [[TAV.x - 10, 4.2, { bald: true, beard: '#8a8a8a', coat: ['#4a5a3a', '#3e4c30', '#5a6c48'] }], [TAV.x + 9.2, 5.6, { hair: '#2a1c10', coat: ['#5a3a3a', '#4a2e2e', '#6c4848'] }]])
      E.npc({ m: Models.buildFolk(o), anim: Models.animFolk, spr: 'barkeep', name: 'A Patron', x, z, yaw: 1, lines: [['Is that a hog. In here. …It is a hog.'], ['He has been singing that one song since the door opened. Make it stop.']] });
    const ales = []; for (let i = 0; i < 5; i++) { const m = Models.buildMug(); m.position.set(TAV.x - 2 + i * 1.0, 8.0, -5.2); m.scale.setScalar(1.5); m.visible = false; E.world.g.add(m); ales.push(m); }
    const door = E.mesh(new THREE.BoxGeometry(1.7, 1.7, 0.3), new THREE.MeshBasicMaterial({ color: 0x2a1c10 }), TAV.x + 10.6, 7.5, -9.75);
    const sung = [
      [['hog', 'The Hog Man', '“I said maybe…”'], ['barkeep', 'The Barkeep', '…What will it be.']],
      [['hog', 'The Hog Man', '“I said maybe…”'], ['barkeep', 'The Barkeep', 'Sir. This is a tavern. You order, or you leave. Those are the two things.']],
      [['hog', 'The Hog Man', '“I said maaaybe…”'], ['barkeep', 'The Barkeep', 'Take them. Take all of them. Only stop. …And do not go through the little door.']],
    ];
    E.npc({ m: Models.buildFolk({ bald: true, beard: '#6a5a4a', apron: 0x2a2420, coat: ['#3a3a44', '#2e2e38', '#4a4a56'] }), anim: Models.animFolk, spr: 'barkeep', name: 'The Barkeep', x: TAV.x, z: -7.7, yaw: 0, reach: 6.5, verb: 'Sing to',
      onTalk(n) { const i = Math.min(n.i++, 2); E.pages(i === 0 ? [22] : i === 2 && !L3.ales ? [23] : [], () => E.say(sung[i], () => {
        if (i === 2 && !L3.ales) { L3.ales = true; ales.forEach(m => { m.visible = true; }); E.Sound.heal(); E.P.hp = E.P.maxHp; E.P.fuel = 1; door.material.color.set(0xffd45a); E.light(TAV.x + 10.6, 7.5, -8.6, 0xffd45a, 30, 16); E.objective('A small square door hums behind the bar', [TAV.x + 10.6, -8]); E.toast('A solemn row of ales. Hearts and gas restored.', 3.5); }
      })); } });
    E.trigger(TAV.x + 10.6, -7.9, 2.5, () => { if (L3.through) return; if (!L3.ales) return E.bark('barkeep', 'THE BARKEEP: Not that door. Nobody goes through that door.', 3); L3.through = true; E.pages([24], () => E.teleport(COR.x, COR.z0 - 6, 0, -1, () => E.objective("Into the mountain's belly", [THR.x, -76]), CAVE, true)); }, { repeat: true });
    // The candlelit corridor.
    for (const sd of [-1, 1]) wall(COR.x + sd * 4.1 - 0.5, COR.x + sd * 4.1 + 0.5, -79.2, COR.z0 + 1, 8.5, rock);   // right up to the lair's ring, so there is no way round it
    wall(COR.x - 4.6, COR.x + 4.6, COR.z0, COR.z0 + 1, 8.5, rock);
    for (let z = COR.z0 - 5; z > -76; z -= 9) { candles(E, [[COR.x - 3.4, z], [COR.x + 3.4, z]], 9.2); for (const sd of [-1, 1]) E.mesh(new THREE.BoxGeometry(0.6, 0.15, 0.5), E.M.woodDark, COR.x + sd * 3.4, 9.15, z); }
    for (const z of [82, 50, 20, -18, -58]) E.light(COR.x, 11, z, 0xffa850, 55, 38);
    stone(E, COR.x + 0.9, 80.2, 6.5, 1.8, rock); stone(E, COR.x - 0.9, 74.6, 6.5, 1.8, rock);        // first: two narrow pillars
    stone(E, COR.x - 0.8, 40, 6.5, 2.1, rock); stone(E, COR.x + 0.8, 34, 6.5, 2.1, rock);
    { const m = E.mesh(new THREE.BoxGeometry(4.8, 0.6, 5), timber, COR.x, 6.2, 1), s = E.addBox(COR.x - 2.4, COR.x + 2.4, -1.5, 3.5, 5.9, 6.5, true); s.dx = 0; s.dz = 0; s.cz = 1;
      s.update = () => { const z = 1 + Math.sin(E.time * 0.85) * 4.3; s.dz = z - s.cz; s.cz = z; s.z0 = z - 2.5; s.z1 = z + 2.5; m.position.z = z; }; E.movers.push(s); }
    for (const z of [-34.7, -41.3]) sinker(E, COR.x, z, 6.5, rock);
    E.flag(COR.x, COR.z0 - 8, 3.2); E.flag(COR.x, 56, 3.2); E.flag(COR.x, -54, 3.2);
    for (const [x, z, y, type] of [[COR.x + 0.9, 80.2, 8.2, 'taco'], [COR.x - 0.9, 74.6, 8.2, 'taco'], [COR.x, 62, 8, 'burger'], [COR.x, 48, 8, 'taco'], [COR.x - 0.8, 40, 8.2, 'taco'], [COR.x + 0.8, 34, 8.2, 'taco'], [COR.x, 22, 8, 'burger'], [COR.x, 14, 8, 'taco'], [COR.x, -14, 8, 'taco'], [COR.x, -22, 8, 'burger'], [COR.x, -34.7, 8.3, 'taco'], [COR.x, -41.3, 8.3, 'taco'], [COR.x, -62, 8, 'burrito']]) E.item(type, x, z, y);
    // The maiden's lair.
    // The wall is two arcs, leaving the corridor's mouth (south) and the way out (east) truly open. In a three.js cylinder θ = 0 is +z.
    const lairWall = new THREE.MeshLambertMaterial({ color: 0x3a3640, side: THREE.BackSide, flatShading: true });
    for (const [t0, t1] of [[0.27, Math.PI / 2 - 0.27], [Math.PI / 2 + 0.27, TAU - 0.27]]) E.mesh(new THREE.CylinderGeometry(THR.r - 1, THR.r - 1, 15, 22, 1, true, t0, t1 - t0), lairWall, THR.x, 14, THR.z);
    const slab = E.mesh(new THREE.BoxGeometry(1.4, 12, 10.5), rock, THR.x + 18.4, 12.5, THR.z);                 // the way out, until she is beaten
    for (const sd of [-1, 1]) wall(THR.x + 17.4, ESC.x1 + 1, THR.z + sd * 4.1 - 0.5, THR.z + sd * 4.1 + 0.5, 8.5, rock);
    wall(ESC.x1, ESC.x1 + 1, THR.z - 4.6, THR.z + 4.6, 8.5, rock);
    for (let x = 424; x < ESC.x1 - 2; x += 9) candles(E, [[x, THR.z - 3.4], [x, THR.z + 3.4]], 9.2);
    for (const x of [428, 455, 486]) E.light(x, 11, THR.z, 0xffa850, 55, 38);
    for (let i = 0; i < 7; i++) { const x = 437.5 + i * 5.6, z = THR.z + (i % 2 ? 1.1 : -1.1); sinker(E, x, z, 6.5, rock); if (i % 2 === 0) E.item('taco', x, z, 8.3); }
    E.item('burrito', 484, THR.z, 8);
    E.trigger(ESC.exit, THR.z, 4.5, () => E.pages([27], () => E.complete()));
    for (let i = 0; i < 8; i++) { const a2 = i / 8 * TAU + 0.39; E.mesh(new THREE.CylinderGeometry(0.9, 1.1, 14, 7), rock, THR.x + Math.cos(a2) * 17.6, 13.5, THR.z + Math.sin(a2) * 17.6); candles(E, [[THR.x + Math.cos(a2) * 16.2, THR.z + Math.sin(a2) * 16.2]], 6.5); }
    E.put(Models.buildThrone(), THR.x, THR.z - 14, 0, 0); E.addBox(THR.x - 2.3, THR.x + 2.3, THR.z - 16.2, THR.z - 12, 5, 9, false);
    E.light(THR.x, 14, THR.z, 0xffa050, 120, 60); E.light(THR.x, 9, THR.z - 12, 0xff7030, 50, 30);
    const arena = E.ring({ x: THR.x, z: THR.z, r: 18.2, gate: Math.PI / 2, gateW: 0.27 });
    const maiden = E.maiden({ x: THR.x, z: THR.z - 9, yaw: 0, hp: 3, arena: { x: THR.x, z: THR.z, r: 17 },
      onHit: A => E.objective(`Best the shield-maiden  ${pips(A.hp, 3)}`),
      onDefeat: () => E.later(0.9, () => {          // "…burst forth from the maiden's lair, their hog thundering into the gloom"
        E.gollum(true, { mode: 'ride' }); slab.visible = false; E.puff(slab.position.x, 9, THR.z, 0x6a6470, 22, 8, 1.0, 0.9, 3); E.Sound.thud(); arena.gate = 0;
        E.pages([26], () => { E.objective('Burst forth from the lair!', [ESC.exit, THR.z]); E.bark('gollum', 'THE GOLLUM MAN: Up! Up on the hog! East, Hog Man — and do not stop on the stones!', 5); });
      }) });
    L3.reset = () => { E.gollum(true, { mode: 'stay', x: THR.x - 3.5, z: THR.z - 12, hx: 0, hz: 1, frame: 'gol_crouch' }); };
    E.trigger(THR.x, THR.z + 13.5, 4, () => E.pages([25], () => E.say([
      ['maiden', 'The Shield-Maiden', 'You rode a hog through my door. Through my SMALL door. He is mine now, hog-rider. He carries things.'],
      ['gollum_crouch', 'The Gollum Man', 'It makes us carry the firewood. And the shield. The shield is HEAVY, Hog Man!'],
    ], () => { arena.gate = undefined; maiden.start(); E.objective('Best the shield-maiden  ●●●', null); E.bark('maiden', 'No charge breaks a shield from the front. Wait for her to tire — or get behind her.', 6); })));
  },
  begin(E) { L3.ales = false; L3.through = false; L3.reset(); E.pages([17, 18], () => E.objective('Find shelter from the cold', T3.at(176))); },
};

// ═════════════════════════════ Chapter the Fourth: The White Castle ═════════════════════════════
// Book pages 28–47: the checkerboard bastion, the WANTED parchment, the endless spiral, the Food of the Lamp,
// the villains, the window, the pork knuckle, and Juli's wings.
const T4 = makeTrail([[8, 118], [-12, 60], [0, 0], [0, -60], [-22, -112], [0, -160]]);
const S4 = Math.hypot(20, 58) + Math.hypot(12, 60);  // the new first stretch: older placements along the trail are offset by this
const RIVER4 = [76, 104];                            // a frozen river across it, crossed on drifting floes
const K = { x: 0, z: -212, yard: 52, r0: 36, r1: 20, w: 4, sweep: TAU * 2, a0: Math.PI / 2, base: 6.5, top: 36.5, hall: 16 };   // r0 − r1 = 4w: each turn of the ramp butts against the next
const spiral = (u, lane = 0) => { const a = K.a0 + u * K.sweep, r = lerp(K.r0, K.r1, u) + lane; return [K.x + Math.cos(a) * r, K.z + Math.sin(a) * r]; };
// The keep is a spiral ramp, two turns round, each turn a wall's height above the last.
function keepH(x, z) {
  const d = Math.hypot(x - K.x, z - K.z); if (d > K.r0 + K.w) return null; if (d < K.hall) return K.top;
  let da = Math.atan2(z - K.z, x - K.x) - K.a0; da -= Math.floor(da / TAU) * TAU;
  const f = da / K.sweep, r0 = lerp(K.r0, K.r1, f);
  if (d > r0 + K.w) return null;                                   // outside the lowest turn: the courtyard
  for (let k = 0; k < 2; k++) { const u = f + k * 0.5; if (Math.abs(d - lerp(K.r0, K.r1, u)) <= K.w) return lerp(K.base, K.top, u); }
  return K.top;                                                    // inside the highest turn: the hall
}
const L4 = {
  chapter: 'Chapter the Fourth', title: 'The White Castle', bounds: [-74, 74, -288, 136], cell: 1.5, start: [7, 113, -0.33, -0.94], ambience: FROST,
  height(x, z) {
    const kh = keepH(x, z); if (kh !== null) return kh;
    const t = T4.locate(x, z), river = sstep(RIVER4[0], RIVER4[0] + 3, t.s) * sstep(RIVER4[1], RIVER4[1] - 3, t.s);
    return Math.min(6.5 - 4.2 * river + edge(Math.abs(t.d) - 9, 'wall', x, z, 20), 6.5 + 24 * sstep(K.yard, K.yard + 8, Math.hypot(x - K.x, z - K.z)));
  },
  tint(c, x, z, h, ny) {
    const d = Math.hypot(x - K.x, z - K.z);
    if (d < K.r0 + K.w + 1.5 && keepH(x, z) !== null) {
      if (ny < 0.7) { const a = Math.atan2(z - K.z, x - K.x); c.set((Math.floor(a / TAU * 40 + 40) + Math.floor(h / 3)) % 2 ? 0xf2f4f8 : 0x3f74c9); }
      else if (d < K.hall) c.set(d < 5 || Math.abs(x - K.x) < 2.2 ? 0xa83a34 : 0xcdd3dc); else c.set(0xd8dde4);
    } else if (d < K.yard + 1) c.set(0xcfd6de); else if (h < 5) c.set(0x8fb4cc); else if (ny < 0.72) c.set(0x7a8292); else c.set(Math.abs(T4.locate(x, z).d) < 2.4 ? 0xd4dbe4 : 0xeef2f6);
  },
  build(E) {
    const { THREE, Models, M, P } = E, at = (s, lat = 0) => T4.at(s + S4, lat), chk = Models.checkerMat;
    // The snowfield and the frozen river.
    pines(E, T4, 6, 140 + S4, 9, { seed: 41, snow: true, back: true, step: 8, skip: (x, z) => { const q = T4.locate(x, z).s; return q > RIVER4[0] - 4 && q < RIVER4[1] + 4; } });
    for (const [s0, n, type] of [[10, 4, 'taco'], [34, 3, 'burger'], [54, 4, 'taco'], [108, 3, 'taco']]) for (let i = 0; i < n; i++) { const [x, z] = T4.at(s0 + i * 4.5, Math.sin(s0 + i * 2) * 4.5); E.item(type, x, z); }
    { const [x, z] = T4.at(40); E.crow(x, z, 6, 5); } { const [x, z] = T4.at(66); E.flag(x, z, -4); } { const [x, z] = T4.at(110); E.flag(x, z, -4); }
    { const [x, z] = T4.at(70); E.trigger(x, z, 7, () => E.bark('gollum', 'THE GOLLUM MAN: A river! Frozen, and not frozen enough. Mind the floes, Hog Man — they wanders.', 4.5)); }
    const ice = E.lam(0xcfe8f6);
    { const [x, z] = T4.at(90); stone(E, x, z, 6.3, 2.3, ice); E.item('burrito', x, z, 8.2); }
    [[83.4, 0.75, 0], [96.6, 0.9, 2.2]].forEach(([sf, rate, phase]) => {            // two floes drifting from bank to bank
      const [cx, cz] = T4.at(sf), m = E.mesh(new THREE.BoxGeometry(5.4, 1.2, 5.4), ice, cx, 5.7, cz), b = E.addBox(cx - 2.7, cx + 2.7, cz - 2.7, cz + 2.7, 5.1, 6.3, true); b.dx = 0; b.dz = 0; b.cx = cx;
      b.update = () => { const x = cx + Math.sin(E.time * rate + phase) * 4.4; b.dx = x - b.cx; b.cx = x; b.x0 = x - 2.7; b.x1 = x + 2.7; m.position.x = x; }; E.movers.push(b);
    });
    // The approach.
    rocks(E, [[5, -28, 1.2], [-6, -74, 1.5], [-26, -98, 1.1]], 0x8f96a4);
    for (const [s, n, type] of [[12, 4, 'taco'], [40, 4, 'taco'], [70, 3, 'burger'], [110, 4, 'taco'], [136, 3, 'burger']]) for (let i = 0; i < n; i++) { const [x, z] = at(s + i * 4.5, Math.sin(s + i * 2) * 4.5); E.item(type, x, z); }
    for (const [s, rad, sp] of [[34, 6, 5], [100, 6, -5.5], [128, 6, 5.5]]) { const [x, z] = at(s); E.crow(x, z, rad, sp); }
    { const [x, z] = at(94, 6.5); E.put(Models.buildHangingSign(['WANTED', 'JULIE', 'NOEL', 'GOLLUM'], { bg: '#efe2bd' }), x, z, -0.5, 0.1); E.addCyl(x, z, 0.5, 0.5, -5, 40, false); E.trigger(...at(90).slice(0, 2), 7, () => E.pages([29, 30], () => E.bark('gollum', 'THE GOLLUM MAN: Wanted! By whom, none can say. We has done so many things.', 4))); }
    // The walls: checkerboard, blue-capped, and curiously unguarded.
    const R = K.yard + 3.5, gateA = Math.PI / 2;
    for (let i = 0; i < 30; i++) { const a = i / 30 * TAU; if (Math.abs(((a - gateA + Math.PI * 3) % TAU) - Math.PI) < 0.2) continue; const w = E.mesh(new THREE.BoxGeometry(TAU * R / 30 + 0.5, 15, 2.4), chk(4, 5), K.x + Math.cos(a) * R, 15.5, K.z + Math.sin(a) * R); w.rotation.y = -a - Math.PI / 2; }
    for (const a of [gateA - 0.22, gateA + 0.22, 0, Math.PI, -Math.PI / 2, Math.PI / 4, Math.PI * 3 / 4, -Math.PI / 4, -Math.PI * 3 / 4]) { const x = K.x + Math.cos(a) * R, z = K.z + Math.sin(a) * R, gate = Math.abs(a - gateA) < 0.3; E.put(Models.buildCastleTower(gate ? 24 : 28, gate ? 4 : 5), x, z, 0, 2); E.addCyl(x, z, gate ? 4.3 : 5.3, gate ? 4.3 : 5.3, -5, 60, false); }
    E.mesh(new THREE.BoxGeometry(16, 4, 2.6), chk(5, 1), K.x, 26, K.z + R);
    for (const sx of [-1, 1]) { const b = E.mesh(new THREE.BoxGeometry(2.2, 9, 0.2), E.lam(0x3f74c9), sx * 5.2, 17, K.z + R - 1.5); b.material.side = THREE.DoubleSide; }
    { const [x, z] = at(160 - 0.01); E.trigger(x, z, 6, () => E.pages([31], () => E.objective('Climb the endless spiral', spiral(0.02)))); E.flag(x, z - 8, -4); }
    { const [x, z] = spiral(0.015); E.trigger(x, z, 5, () => E.pages([32], () => { E.objective('Climb the endless spiral', [K.x, K.z]); E.toast('Barrels! Step out of their lane — or charge them.', 3.5); })); }
    // The endless spiral, and what rolls down it.
    // Barrels come down in three lanes: the middle is safe from the side ones, and the sides from the middle ones.
    let hall = false;
    E.rollers({ curve: spiral, u0: 0.955, u1: 0.03, length: K.sweep * (K.r0 + K.r1) / 2, speed: 9.5, period: 4.6, lanes: [-2.4, 0, 2.4, 0], radius: 1.05, colour: 0x8a6238, make: Models.buildBarrel, active: () => !hall && Math.hypot(P.x - K.x, P.z - K.z) < 64 });
    for (let u = 0.05; u < 0.94; u += 0.045) { const [x, z] = spiral(u, Math.round(u * 22) % 2 ? 1.8 : -1.8); E.item(Math.abs(u - 0.5) < 0.03 || Math.abs(u - 0.86) < 0.03 ? 'burrito' : Math.round(u * 22) % 3 ? 'taco' : 'burger', x, z); }
    for (const u of [0.26, 0.52, 0.78]) { const [x, z] = spiral(u), [px, pz] = spiral(u, -2.6); E.flag(x, z, px - x); E.world.flags[E.world.flags.length - 1].f.position.z = pz; }
    // The hall at the top: the Lamp, the table, the window.
    const top = K.top, tblZ = K.z - 9, W = [K.x, K.z - 14.6];
    E.put(Models.buildLampTable(), K.x, tblZ, 0, 0); E.addBox(K.x - 2.2, K.x + 2.2, tblZ - 1.4, tblZ + 1.4, top - 1, top + 1.6, false);
    E.light(K.x, top + 6, tblZ, 0xffd890, 140, 55);
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + 0.31; if (Math.abs(((a - Math.PI * 1.5 + Math.PI * 3) % TAU) - Math.PI) < 0.5) continue; E.mesh(new THREE.CylinderGeometry(0.8, 0.9, 9, 8), chk(3, 4), K.x + Math.cos(a) * 15.6, top + 4.5, K.z + Math.sin(a) * 15.6); }
    for (const sx of [-1, 1]) E.mesh(new THREE.BoxGeometry(5, 10, 1.4), chk(3, 5), K.x + sx * 5.4, top + 5, K.z - 15.6);
    E.mesh(new THREE.BoxGeometry(15.8, 3, 1.4), chk(8, 2), K.x, top + 11.5, K.z - 15.6); E.mesh(new THREE.BoxGeometry(6, 0.6, 2), E.lam(0xf2f4f8), K.x, top + 1.1, K.z - 15.6);
    E.addBox(K.x - 8, K.x + 8, K.z - 16.4, K.z - 14.9, top - 1, top + 1.4, false);
    const arena = E.ring({ x: K.x, z: K.z, r: 15.4, on: false }), spots = [0.4, 1.5, 2.6, 3.7, 5.4].map(a => [K.x + Math.cos(a) * 10.5, K.z + Math.sin(a) * 10.5]);
    const say = (who, text) => E.bark(who, text, 4);
    // The three who come for the food, one after another.
    const maidenWave = () => { const A = E.maiden({ x: K.x, z: K.z + 9, yaw: Math.PI, hp: 2, arena: { x: K.x, z: K.z, r: 14.5 }, onHit: Z => E.objective(`The shield-maiden  ${pips(Z.hp, 2)}`), onDefeat: () => E.later(1, flee) });
      A.start(); E.objective('The shield-maiden  ●●', null); say('maiden', 'THE SHIELD-MAIDEN: That pet was MINE. And so, now, is that burger.'); };
    const wizardWave = () => { const m = Models.buildMiller({ staff: true }); E.world.g.add(m.g); const A = E.caster({ x: spots[1][0], z: spots[1][1], y: top, m, hp: 3, spots, onHit: Z => E.objective(`The wizard  ${pips(Z.hp, 3)}`), onDefeat: () => E.later(1, maidenWave) });
      A.on = true; E.objective('The wizard  ●●●', null); say('wizard', 'THE WIZARD: I warned you of the mountain, hog-rider. I did not say I wished you to reach the top of it.'); };
    const towerWave = () => { const m = Models.buildFolk({ angry: true, bareArms: true, hair: '#6a4a2a', coat: ['#6b5a3a', '#5a4a2e', '#7c6a48'] }); E.world.g.add(m.g);
      const A = E.thrower({ x: spots[3][0], z: spots[3][1], y: top, m, hp: 2, period: 1.9, first: 1.4, src: Z => [Z.x, Z.y + 4.4, Z.z], onHit: Z => { E.objective(`The man from the tower  ${pips(Z.hp, 2)}`); const s = spots[(Math.random() * spots.length) | 0]; Z.x = s[0]; Z.z = s[1]; }, onDefeat: () => E.later(1, wizardWave) });
      A.on = true; E.objective('The man from the tower  ●●', null); say('towerman', 'THE MAN FROM THE TOWER: "You come me!" …I have brought the bucket.'); };
    // "Suddenly, the Gollum man flew through the window."
    const flee = () => E.pages([40, 41], () => {
      arena.on = false; E.gollum(true, { mode: 'stay', x: W[0], z: W[1] + 0.6, hx: 0, hz: -1, frame: 'gol_jump' }); E.GOL.y = top + 1.4;
      const clock = { t: 9 }; E.objective('CATCH HIM!  9', W); E.Sound.gust();
      E.actor({ step(dt) {
        if (clock.done) return; clock.t -= dt; E.GOL.y = top + 1.4 + Math.sin(E.time * 9) * 0.12; E.objective(`CATCH HIM!  ${Math.max(0, Math.ceil(clock.t))}`);
        if (Math.hypot(P.x - W[0], P.z - W[1]) < 3.6) { clock.done = true; E.Sound.heal(); E.pages([42, 43, 44, 45], takeWing); }
        else if (clock.t <= 0) { clock.t = 9; E.toast('He slips — and the storm blows him back onto the sill. Again!', 3); E.Sound.gust(); }
      }, draw() {} });
    });
    // "No longer a simple hog, she had become a swine of glory."
    const takeWing = () => {
      E.ambience(SUNSET, true); E.gollum(true, { mode: 'ride' });
      const rings = []; for (let i = 0; i < 16; i++) rings.push([Math.sin(i * 0.85) * 34, top + 16 + Math.sin(i * 0.6 + 1) * 13, K.z - 160 - i * 58]);
      // The scene: she stands in the lamp-light; the wings come; a run at the window; out, and away over the cloud.
      const wz = K.z - 15.6, cam = E.camera, bez = (a, b, c, k) => (1 - k) * (1 - k) * a + 2 * (1 - k) * k * b + k * k * c, V = (x, y, z) => new THREE.Vector3(x, y, z);
      E.toast('ENTER skips', 2.5);
      E.cutscene({ dur: 11.5, step(t, dt, c) {
        if (t < 0.2) c.s1 = c.s2 = c.s3 = false;
        const run = sstep(4.8, 6.8, t), k = run * run, lift = sstep(6.2, 7.0, t), away = sstep(6.9, 11.5, t);
        c.wing = sstep(2.2, 4.4, t); c.run = t > 4.8 && t < 6.5; c.fly = t >= 6.5; c.pitch = -0.32 * sstep(2.3, 3.3, t) * (1 - sstep(4.3, 4.9, t)) - 0.3 * lift * (1 - sstep(8, 10, t));
        P.x = K.x + bez(7, 5.8, 0, k); P.z = away > 0 ? wz - 1.9 - 86 * away : K.z + bez(-3, -12.5, -17.5, k); P.y = top + 3.4 * lift + 14 * sstep(7.4, 11.5, t);
        const tx = bez(7, 5.8, 0, Math.min(1, k + 0.05)) - bez(7, 5.8, 0, k), tzz = bez(-3, -12.5, -17.5, Math.min(1, k + 0.05)) - bez(-3, -12.5, -17.5, k), tl = Math.hypot(tx, tzz);
        if (away > 0 || tl < 1e-4) { P.dirX = 0; P.dirZ = -1; } else { P.dirX = tx / tl; P.dirZ = tzz / tl; } if (t < 4.8) { P.dirX = -0.5; P.dirZ = -0.87; }
        if (t > 2.2 && t < 4.6 && Math.random() < dt * 60) E.puff(P.x + (Math.random() - 0.5) * 5, P.y + 1 + Math.random() * 3.5, P.z + (Math.random() - 0.5) * 3, 0xffe27a, 1, 1.5, 0.3, 0.7, 2.5);
        if (!c.s1 && t > 2.2) { c.s1 = true; E.flash('#fff6d0', 800); E.Sound.heal(); }
        if (!c.s2 && t > 4.8) { c.s2 = true; E.Sound.charge(); }
        if (!c.s3 && t > 6.5) { c.s3 = true; E.Sound.whoosh(); E.Sound.gust(); }
        // Camera: round her as the wings come; from the side for the run; from inside as she goes out; then swinging in behind.
        // (Each is placed so that neither a column nor the lamp table comes between it and the hog.)
        const hx = P.x, hy = P.y + 2, hz = P.z, a = 0.9 + t * 0.2;
        const c1 = V(hx + Math.sin(a) * 6.5, hy + 1.4, hz + Math.cos(a) * 6.5), c2 = V(K.x + 13, top + 4, K.z - 10.5), c3 = V(K.x - 6.5, top + 2.6, K.z - 6), c4 = V(hx + 16 * (1 - sstep(8.4, 11.5, t)), hy + 3, hz + 15);
        const p = c1.lerp(c2, sstep(4.4, 5.2, t)).lerp(c3, sstep(6.0, 6.7, t)).lerp(c4, sstep(7.6, 9.2, t));
        cam.position.copy(p); cam.lookAt(hx, hy, hz - 6 * sstep(9, 11.5, t));
      }, done: () => { E.flight({ x: P.x, y: P.y, z: P.z, rings, done: () => E.pages([46, 47], () => E.complete()) }); } });
    };
    { const [x, z] = spiral(0.985); E.trigger(x, z, 5, () => { hall = true; E.pages([33, 34], () => E.objective('Approach the sacred table', [K.x, tblZ + 4])); }, { y: top }); E.flag(K.x, K.z + 11, -4); }
    E.trigger(K.x, tblZ + 4.5, 4.2, () => { hall = true; E.pages([35, 36, 37, 38], () => { P.hp = P.maxHp; P.fuel = 1; E.Sound.heal(); E.toast('Conquest is crowned in cheddar and grease.', 3.5); E.later(2.6, () => E.pages([39], () => { arena.on = true; towerWave(); })); }); }, { y: top });
    L4.onRespawn = () => { /* the villains wait for the hog to climb back; nothing to reset */ };
    L4.wing = takeWing;                                 // for tests: play the take-off scene directly
  },
  begin(E) { E.gollum(true, { mode: 'ride' }); E.pages([28], () => E.objective('Ride to the White Castle', T4.at(160 + S4))); },
};

export const LEVELS = [L1, L2, L3, L4];
// For test bots and the console: the geometry the chapters are built on.
export const GEO = { T1, T2, T3, T4, GLADE, POND, FORDS, BANK1, GAPS2, LEDGE2, EDGE2, END2, DOOR3, TAV, COR, THR, ESC, K, S4, RIVER4, spiral, AMB: { DAY, DUSK, SNOW, NIGHT, TAVERN, CAVE, BRIGHT, FROST, SUNSET } };
