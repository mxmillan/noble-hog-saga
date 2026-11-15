// The chapters of The Hog Man Cometh, Part the First.
//
// Each chapter is an object the engine (saga.js) loads in turn:
//   bounds, cell     the ground grid
//   height(x, z)     the ground. Below -30 is "void": not drawn, and a fall into it costs a heart
//   tint(c, x, z, h, ny)   the colour of a patch of ground (ny is how flat it is: 1 = level)
//   ice(x, z)        optional: where the hog cannot grip
//   start            [x, z, dirX, dirZ]
//   ambience         sky, fog, light, weather (see setAmbience in saga.js)
//   music            the tune it opens with (a name from hog-music.js); E.music(name) changes it part-way
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
  chapter: 'Chapter the First', title: 'The Darkling Trail', music: 'town', bounds: [-72, 78, -498, 34], start: [0, -6, 0, -1], ambience: DAY,
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
    E.trigger(...at(86).slice(0, 2), 8, () => E.pages([6], () => { E.ambience(DUSK); E.music('trail'); E.objective('Follow the darkling trail', [GLADE.x, GLADE.z + 20]); }));
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
        E.flash('#fff', 1100); E.music('trail'); T.state = 'gone'; E.puff(T.x, T.y + 3, T.z, 0xffe9a0, 30, 12, 1.2, 1.2, 5); E.Sound.bolt(); E.GOL.cower = false;
        E.pages([8], () => E.say([['wizard', 'The Wizard', 'Exile! Staff blazing, pint untouched. Onward, hog-rider — the cold mountain will not climb itself.'], ['gollum', 'The Gollum Man', 'It is gone! The square-man is gone! We wept. We is not ashamed.']], () => E.complete([T.x, T.y + 3, T.z])));
      }) });
    E.trigger(-5, GLADE.z - 1, 20, () => E.pages([7], () => { troll.wake(); E.music('boss'); E.GOL.cower = true; E.objective('Fell the Tile Troll  ●●●', null); E.bark('troll', 'TILE TROLL: Who disturbs my supper? I shall GROUT you where you stand! (Charge him — and mind the tiles.)', 6); }));
  },
  begin(E) { E.gollum(true); E.pages([4], () => E.objective('Seek the wizard in the town', [L1.wizard.x, L1.wizard.z])); },
};

// ═════════════════════════════ Chapter the Second: The Cold Mountain ═════════════════════════════
// Book pages 9–16: the climb, the bent tower and its slop bucket, the icy pass, the shadow that bars the way.
const T2 = makeTrail([[0, 0], [0, -85], [-32, -150], [8, -215], [44, -270], [44, -350], [12, -410], [12, -450], [-22, -506], [-22, -572], [6, -628]]);
const END2 = 666;                                   // where the shadow waits
// Above the pass: a knife-edge (a drop on both sides, s 500–600), then a last gully with snowballs.
const EDGE2 = [500, 600];
const GATE2 = 251;                                   // the wall and portcullis across the pass, past the man in the tower
// Each chasm in the pass is cut wide in the ground, then given two stone ledges whose edges set the real gap.
// (The ground grid is too coarse to place a chasm's lip exactly: cut by the grid alone, these were unjumpable.)
const GAPS2 = [[338, 346], [398, 406], [546, 554]], LEDGE2 = [[334.5, 349.5], [394.5, 409.5], [542.5, 557.5]];
const half2 = s => lerp(lerp(lerp(8, 15, sstep(142, 156, s)), 4.8, sstep(238, 256, s)), 6.5, sstep(596, 612, s));
const iceAt2 = s => (s > 58 && s < 84) || (s > 112 && s < 138) || (s > 262 && s < 328) || (s > 352 && s < 390) || (s > 412 && s < 440) || (s > 508 && s < 536) || (s > 566 && s < 592);
const L2 = {
  chapter: 'Chapter the Second', title: 'The Cold Mountain', music: 'snow', bounds: [-70, 82, -660, 34], start: [0, -6, 0, -1], ambience: SNOW,
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
    for (const s of [146, GATE2 + 11, 352, 412, 486, 562, 606]) { const [x, z] = at(s, s > 480 ? 0 : -1.5); E.flag(x, z, -2.2); }
    // The ruin, and the man in the tower. The pass beyond is barred by a portcullis with a gap beneath it: too low for a hog,
    // too tight for a dry Gollum Man. He must be slicked with the man's slop three times over (a bucket on him that misses the
    // hog, or a second sat in the puddle one leaves), and then he squeezes under and winds the gate up from the far side.
    // Trailing through a puddle, or a bucket that hits the pair of them, does not count: with either, the first version slimed
    // him on the way up to the gate without the player trying.
    const [tx, tz] = at(202, 13), [px, pz] = at(202, 0), ty = E.ground(tx, tz), tyaw = Math.atan2(px - tx, pz - tz), fx = Math.sin(tyaw), fz = Math.cos(tyaw);
    E.put(Models.buildBentTower(), tx, tz, tyaw, 0.6); E.addCyl(tx, tz, 4.1, 3.2, -99, 99, false).occlude = true;
    rocks(E, [[tx - 9, tz + 9, 1.4], [tx + 2, tz + 12, 1.1], [tx - 12, tz - 6, 1.7]], 0x8f96a4);
    const man = Models.buildFolk({ angry: true, bareArms: true, hair: '#6a4a2a', coat: ['#6b5a3a', '#5a4a2e', '#7c6a48'] }); E.world.g.add(man.g);
    const G = E.GOL, muck = { n: 0, need: 3, pools: [], done: false, how: [] }, [gx, gz, gdx, gdz] = at(GATE2), gy = E.ground(gx, gz), gyaw = Math.atan2(gdx, gdz);
    const slop = E.lam(0x5a4020), poolG = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2);
    // He leans from the window, which sits off-centre because the tower itself leans.
    const tower = E.thrower({ x: tx + fx * 2.3 - Math.cos(tyaw) * 1.4, z: tz + fz * 2.3 + Math.sin(tyaw) * 1.4, y: ty + 7.6, m: man, yaw: tyaw, period: 2.5, first: 99, src: A => [A.x + fx * 1.4, A.y + 4.6, A.z + fz * 1.4],
      active: () => { const s = sOf(); return s > 158 && s < GATE2 + 6; },
      splash(x, y, z) {                                  // every bucket that misses leaves a puddle for a while
        let p = muck.pools.find(q => q.life <= 0); if (!p) { p = { m: E.mesh(poolG, new THREE.MeshLambertMaterial({ color: 0x5a4020, transparent: true, depthWrite: false })) }; muck.pools.push(p); }
        Object.assign(p, { x, z, y, life: 5, used: false, soak: 0 }); p.m.visible = true; p.m.position.set(x, y + 0.06, z); p.m.scale.setScalar(2.3);
        // Straight onto him counts only if it misses the hog: the trick is to ride out from under the ring and let him trail into it.
        const hogHit = Math.hypot(E.P.x - x, E.P.z - z) < 2.7 && E.P.y - y < 2.5;
        if (!hogHit && Math.hypot(G.x - x, G.z - z) < 2.3) { p.used = true; muck.how.push('hit'); coat(); }
      } });
    const pip = () => pips(muck.n, muck.need), gateAt = [gx, gz];
    L2.muck = muck; L2.tower = tower; L2.gateScene = () => gateScene();          // for test bots
    const coat = (quiet) => {
      if (muck.done || muck.n >= muck.need) return;
      muck.n++; E.muck(muck.n / muck.need); E.Sound.splat(); E.puff(G.x, G.y + 1.2, G.z, 0x5a4020, 14, 5, 0.5, 0.6, 2, 12);
      if (quiet) return;
      if (muck.n < muck.need) { E.objective(`Slime the Gollum Man  ${pip()}`, gateAt); E.bark('gollum_hurt', 'THE GOLLUM MAN: Slicker… slicker… Once more, Hog Man, and we slides like an eel.', 4); }
      else E.later(0.6, () => E.say([
        ['gollum', 'The Gollum Man', 'Foul. FOUL. Foul to the bone, Hog Man… and slick. Slick fits through small places. Watch us.'],
        ['hog', 'Juli the Hog', 'Oink.'],
      ], gateScene));
    };
    E.actor({ step(dt) {
      for (const p of muck.pools) if (p.life > 0) {
        p.life -= dt; p.m.material.opacity = Math.min(0.85, p.life * 0.8); p.m.scale.setScalar(2.3 * (0.75 + 0.25 * Math.min(1, p.life)));
        if (p.life <= 0) { p.m.visible = false; continue; }
        const inIt = !p.used && muck.n > 0 && Math.hypot(G.x - p.x, G.z - p.z) < 2.3 && Math.abs(G.y - p.y) < 2;
        p.soak = inIt ? p.soak + dt : Math.max(0, p.soak - dt * 2);
        if (inIt && Math.random() < dt * 14) E.puff(G.x + (Math.random() - 0.5) * 1.4, G.y + 0.2, G.z + (Math.random() - 0.5) * 1.4, 0x5a4020, 1, 2.5, 0.3, 0.4, 2, 14);
        if (p.soak >= 1) { p.used = true; muck.how.push('soak'); coat(); }
      }
      if (G.muck && Math.random() < dt * 5 * G.muck) E.puff(G.x + (Math.random() - 0.5) * 0.8, G.y + 0.9 + Math.random() * 0.6, G.z + (Math.random() - 0.5) * 0.8, 0x5a4020, 1, 0.3, 0.22, 0.6, 0, 14);   // he drips
    }, draw() {} });
    // The wall across the pass, the gate in it, and the winch that raises it from the far side.
    const stoneW = (len) => E.lam(0xffffff, E.rep(M.tex.wall, len / 3, 2.6)), iron = E.lam(0x4a4640);
    for (const [l0, l1] of [[-10.5, -2.3], [2.3, 8.5]]) { const [x, z] = at(GATE2, (l0 + l1) / 2), w = E.mesh(new THREE.BoxGeometry(l1 - l0, 9.4, 1.5), stoneW(l1 - l0), x, gy + 1.7, z); w.rotation.y = gyaw; }
    for (const l of [-2.6, 2.6]) { const [x, z] = at(GATE2, l); E.mesh(new THREE.BoxGeometry(1.4, 7.8, 1.9), stoneW(1.4), x, gy + 3.9, z).rotation.y = gyaw; }
    E.mesh(new THREE.BoxGeometry(6.6, 1.3, 1.9), stoneW(6.6), gx, gy + 6.95, gz).rotation.y = gyaw;
    const port = new THREE.Group(); port.position.set(gx, gy + 0.95, gz); port.rotation.y = gyaw; E.world.g.add(port);
    for (let i = -3; i <= 3; i++) E.mesh(new THREE.BoxGeometry(0.17, 5.3, 0.17), iron, i * 0.6, 2.65, 0, port);
    for (const y of [1.0, 2.4, 3.8, 5.0]) E.mesh(new THREE.BoxGeometry(4.2, 0.15, 0.15), iron, 0, y, 0, port);
    for (let i = -3; i <= 3; i++) E.mesh(new THREE.ConeGeometry(0.13, 0.4, 4), iron, i * 0.6, -0.2, 0, port).rotation.x = Math.PI;
    const wall = [], bars = []; for (let l = -11; l <= 9; l += 0.9) { const [x, z] = at(GATE2, l), c = E.addCyl(x, z, 0.75, 0.75, gy - 3, gy + 13, false); (Math.abs(l) < 2.4 ? bars : wall).push(c); }
    // The winch sits just behind the opening, so the scene's camera sees it through the gate.
    const [wx, wz] = at(GATE2 + 4.4, -2.9), wy = E.ground(wx, wz), winch = new THREE.Group(); winch.position.set(wx, wy, wz); winch.rotation.y = gyaw; E.world.g.add(winch);
    for (const sx of [-0.85, 0.85]) E.mesh(new THREE.BoxGeometry(0.25, 1.6, 0.25), M.woodDark, sx, 0.8, 0, winch);
    const drum = new THREE.Group(); drum.position.set(0, 1.35, 0); winch.add(drum);
    E.mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 8).rotateZ(Math.PI / 2), M.wood, 0, 0, 0, drum); E.mesh(new THREE.BoxGeometry(0.15, 0.9, 0.15), iron, 1.0, 0.45, 0, drum);
    E.addCyl(wx, wz, 1.0, 1.0, wy - 1, wy + 1.8, false);
    // The scene: he crawls to the gap, flattens, slides under, winds the gate up, and the man in the tower laughs.
    const gateScene = () => {
      const a0 = [G.x, G.z], [bx, bz] = at(GATE2 - 1.8, 0), [cx2, cz2] = at(GATE2 + 1.9, 0), [dx2, dz2] = at(GATE2 + 3.1, -1.7), [ex, ez] = at(GATE2 + 1.2, 1.4), cam = E.camera;
      const [cpx, cpz] = at(GATE2 - 9, 3), [lkx, lkz] = at(GATE2, 0), [fpx, fpz] = at(GATE2 + 13, -1.5), [flx, flz] = at(GATE2 + 1.5, -0.6), legs = [[0, 1.6, a0, [bx, bz]], [1.6, 3.4, [bx, bz], [cx2, cz2]], [3.4, 4.3, [cx2, cz2], [dx2, dz2]], [7.6, 9, [dx2, dz2], [ex, ez]]];
      let said = false, clank = 0;
      E.toast('ENTER skips', 2.5);
      E.cutscene({ dur: 9, step(t, dt) {
        const leg = legs.find(([t0, t1]) => t >= t0 && t < t1);
        if (leg) {
          const [t0, t1, [ax, az], [qx, qz]] = leg, k = sstep(t0, t1, t), nx = lerp(ax, qx, k), nz = lerp(az, qz, k), hl = Math.hypot(qx - ax, qz - az) || 1;
          G.x = nx; G.z = nz; G.y = E.ground(nx, nz); G.hx = (qx - ax) / hl; G.hz = (qz - az) / hl; G.frame = t0 === 1.6 ? 'gol_crouch' : 'gol_crawl';
          if (t0 === 1.6 && Math.random() < dt * 30) E.puff(G.x, G.y + 0.5, G.z, 0x5a4020, 1, 2, 0.35, 0.5, 1, 8);
        } else if (t >= 4.3 && t < 7.6) {                  // winding
          const [qx, qz] = [wx - dx2, wz - dz2], ql = Math.hypot(qx, qz) || 1; G.hx = qx / ql; G.hz = qz / ql; G.frame = Math.floor(t * 4) % 2 ? 'gol_crouch' : 'gol_idle';
          drum.rotation.x -= dt * 5; port.position.y = gy + 0.95 + 4.9 * sstep(4.6, 7.3, t);
          if ((clank -= dt) <= 0 && t < 7.3) { clank = 0.42; E.Sound.clang(); }
          if (!said && t > 5) { said = true; E.bark('towerman', 'THE MAN IN THE TOWER: HA! HAA! HAAAAA!', 3.5); }
        }
        if (Math.abs(t - 1.62) < dt || Math.abs(t - 3.42) < dt) E.Sound.splat();
        // Camera: from behind the hog as he crawls to the gap; then a cut to the far side, looking back, as he comes through,
        // so the winding and the gate going up are in plain view with the hog waiting behind the bars.
        if (t < 1.7) { cam.position.set(cpx, gy + 8, cpz); cam.lookAt(lkx, gy + 1, lkz); }
        else { cam.position.set(fpx, gy + 7.4 + Math.sin(t * 0.4) * 0.2, fpz); cam.lookAt(flx, gy + 2.2, flz); }
      }, done() {
        muck.done = true; tower.on = false; port.position.y = gy + 5.85; for (const c of bars) c.off = true;
        for (const p of muck.pools) { p.life = 0; p.m.visible = false; }
        E.pages([13], () => { E.objective('Climb the icy pass', at(END2)); E.toast('Ice: the hog cannot grip. Lean into the wind.', 4); });
      } });
    };
    { const [x, z] = at(166); E.trigger(x, z, 10, () => E.pages([10, 11], () => {
      tower.on = true; E.bark('towerman', 'THE MAN IN THE TOWER: "You come me!"', 3.5);
      E.later(1.0, () => tower.lob(G.x, G.z, () => {         // the first bucket is for the Gollum Man. It always is.
        coat(true); E.pages([12], () => {
          tower.t = 2.4; E.objective(`Slime the Gollum Man  ${pip()}`, gateAt);
          E.bark('gollum_hurt', 'THE GOLLUM MAN: Its contents foul! Its purpose unknown! …But the gate, Hog Man. A gap beneath it. Slick enough, we slips through. Lead us under his buckets, or sit us in his slop!', 7);
        });
      }));
    })); }
    { const [x, z] = at(GATE2 - 6); E.trigger(x, z, 7, () => { if (muck.n < muck.need) E.toast('Shut fast. When the ring is under you, ride on and let the Gollum Man walk into it, or stop with him sat in a puddle.', 6); }); }
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
    ], () => { E.gollum(false); shade.g.visible = false; E.puff(mx, E.ground(mx, mz) + 2, mz, 0x333340, 18, 6, 0.9, 0.8, 2); E.pages([16], () => E.complete([mx, E.ground(mx, mz) + 3, mz])); })));
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
  chapter: 'Chapter the Third', title: 'The Oasis', music: 'night', bounds: [-46, 514, -232, 106], cell: 2, start: [0, -6, 0, -1], ambience: NIGHT,
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
    E.trigger(DOOR3[0], DOOR3[1], 3.4, () => E.pages([20, 21], () => E.teleport(TAV.x, 7, 0, -1, () => { E.music('tavern'); E.objective('Seek the keeper of the bar', [TAV.x, -8]); E.bark('hog', 'Without warning or logic, he found himself astride his hog once more. Indoors.', 4.5); }, TAVERN, true)));
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
    E.trigger(TAV.x + 10.6, -7.9, 2.5, () => { if (L3.through) return; if (!L3.ales) return E.bark('barkeep', 'THE BARKEEP: Not that door. Nobody goes through that door.', 3); L3.through = true; E.pages([24], () => E.teleport(COR.x, COR.z0 - 6, 0, -1, () => { E.music('lair'); E.objective("Into the mountain's belly", [THR.x, -76]); }, CAVE, true)); }, { repeat: true });
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
        // She gives up the chapter's golden food here, where she falls; the chapter itself ends at the tunnel's mouth.
        E.relic([maiden.x, maiden.y + 3, maiden.z], () => E.pages([26], () => { E.objective('Burst forth from the lair!', [ESC.exit, THR.z]); E.bark('gollum', 'THE GOLLUM MAN: Up! Up on the hog! East, Hog Man — and do not stop on the stones!', 5); }));
      }) });
    L3.reset = () => { E.gollum(true, { mode: 'stay', x: THR.x - 3.5, z: THR.z - 12, hx: 0, hz: 1, frame: 'gol_crouch' }); };
    E.trigger(THR.x, THR.z + 13.5, 4, () => E.music('boss') || E.pages([25], () => E.say([
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
  chapter: 'Chapter the Fourth', title: 'The White Castle', music: 'castle', bounds: [-74, 74, -288, 136], cell: 1.5, start: [7, 113, -0.33, -0.94], ambience: FROST,
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
    // After the last ring: on into the sunset. The Food of the Lamp comes down out of the sky to hang over him, the camera
    // swings round to the book's picture of them side-on (page 46), then holds while they fly away into the sun. Then the
    // last two pages, and back to the windmill country (the hub lands them on the Great Windmill: see 'flew' in hog3d.js).
    const homeward = (got, n) => {
      const F = E.flyer, h = F.yaw, dx = Math.sin(h), dz = Math.cos(h), sx = dz, sz = -dx, S = { x: F.x, y: F.y, z: F.z }, cam = E.camera;
      const lamp = Models.buildRelic('lamp'); E.world.g.add(lamp);
      const L0 = { x: S.x + dx * 150, y: S.y + 40, z: S.z + dz * 150 }, hold = new THREE.Vector3();
      let s1 = false, s2 = false, s3 = false;
      P.dirX = dx; P.dirZ = dz;
      E.cutscene({ dur: 13, step(t, dt, c) {
        c.fly = true; c.wing = 1; c.pitch = -0.08 - 0.1 * Math.sin(t * 0.9);
        const d = 24 * t - 2.2 * t * t / 2 * sstep(0, 13, t);                     // easing off a little as the scene goes on
        P.x = S.x + dx * d; P.z = S.z + dz * d; P.y = S.y + 9 * sstep(0, 13, t) + Math.sin(t * 1.3) * 0.6;
        const k = sstep(1.0, 5.4, t), lx = lerp(L0.x + dx * 24 * t, P.x, k), ly = lerp(L0.y, P.y + 5.6, k) + Math.sin(k * Math.PI) * 6, lz = lerp(L0.z + dz * 24 * t, P.z, k);
        lamp.position.set(lx, ly + Math.sin(t * 3) * 0.15, lz); lamp.rotation.y = t * 2.4;
        if (k > 0.05 && Math.random() < dt * 18) E.puff(lx + (Math.random() - 0.5) * 2, ly + (Math.random() - 0.5) * 1.5, lz + (Math.random() - 0.5) * 2, 0xffe27a, 1, 0.6, 0.3, 0.6, 1);
        if (!s1 && t > 0.4) { s1 = true; E.toast(`Rings: ${got} of ${n}`, 3); }
        if (!s2 && t > 5.4) { s2 = true; E.Sound.win(); E.flash('#fff0c8', 700); E.toast('The Food of the Lamp! The quest is done.', 4.5); }
        if (!s3 && t > 9.6) { s3 = true; E.Sound.gust(); }
        // Camera: chasing from behind and above; round to the side for the book's picture; then it stops and they fly on.
        const behind = new THREE.Vector3(P.x - dx * 15, P.y + 5, P.z - dz * 15), side = new THREE.Vector3(P.x + sx * 13 + dx * 3, P.y + 1.5, P.z + sz * 13 + dz * 3);
        if (t < 9.4) hold.copy(behind).lerp(side, sstep(4.2, 7.2, t));
        cam.position.copy(hold); cam.lookAt(P.x + dx * 4 * (1 - sstep(4.2, 7.2, t)), P.y + 2, P.z + dz * 4 * (1 - sstep(4.2, 7.2, t)));
      }, done: () => E.pages([46, 47], () => E.complete()) });
    };
    const takeWing = () => {
      E.ambience(SUNSET, true); E.music('flight'); E.gollum(true, { mode: 'ride' });
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
      }, done: () => { E.flight({ x: P.x, y: P.y, z: P.z, rings, done: homeward }); } });
    };
    { const [x, z] = spiral(0.985); E.trigger(x, z, 5, () => { hall = true; E.pages([33, 34], () => E.objective('Approach the sacred table', [K.x, tblZ + 4])); }, { y: top }); E.flag(K.x, K.z + 11, -4); }
    E.trigger(K.x, tblZ + 4.5, 4.2, () => { hall = true; E.pages([35, 36, 37, 38], () => { P.hp = P.maxHp; P.fuel = 1; E.Sound.heal(); E.toast('Conquest is crowned in cheddar and grease.', 3.5); E.later(2.6, () => E.pages([39], () => { arena.on = true; E.music('boss'); towerWave(); })); }); }, { y: top });
    L4.onRespawn = () => { /* the villains wait for the hog to climb back; nothing to reset */ };
    L4.wing = takeWing;                                 // for tests: play the take-off scene directly
  },
  begin(E) { E.gollum(true, { mode: 'ride' }); E.pages([28], () => E.objective('Ride to the White Castle', T4.at(160 + S4))); },
};

// ═════════════════════════════ The side roads ═════════════════════════════
// Four levels that are not in the book. Each has a door in the windmill country (hog3d.js), opens once enough
// golden foods are held, hides five bottles of hot sauce (E.sauce), and ends by handing back to the hub.
// The Gollum Man rides throughout: these are all places a creature on a leash would come to grief.
const MILLDARK = { bg: 0x120c08, fog: 0x120c08, near: 30, far: 115, hemi: [0xc8a880, 0x3a2a1c, 1.3], sun: [0xffd8a8, 0.75] };
const MOLTEN = { bg: 0x2a1410, fog: 0x3a1c14, near: 40, far: 270, hemi: [0xffc8a0, 0x4a1a10, 1.35], sun: [0xffb070, 1.25], water: [6, 0xd23a1e] };
const LANTERNS = { bg: 0x0a0f24, fog: 0x0a0f24, near: 30, far: 150, hemi: [0xa8b4ff, 0x30243a, 1.3], sun: [0xffd8a0, 0.75] };
// The way out: a door like the ones in the hub. Riding into it finishes the level.
function exitDoor(E, x, z, yaw, y) {
  const p = E.Models.buildPortal({ colour: 0xffd27a }), gy = y ?? E.ground(x, z); p.g.position.set(x, gy - 0.1, z); p.g.rotation.y = yaw; E.world.g.add(p.g);
  const sx = Math.cos(yaw), sz = -Math.sin(yaw); for (const k of [1, -1]) E.addCyl(x + sx * k * 2.65, z + sz * k * 2.65, 0.75, 0.75, gy - 2, gy + 7, false);
  E.actor({ step() {}, draw() { p.film.material.map.offset.y = E.time * 0.22; } });
  E.trigger(x, z, 2.1, () => E.complete(), { y: gy });
}

// ───────────────────────────── The Long Water ─────────────────────────────
// A raft ride. The river carries the raft; the hog has only to stay on it. Rocks sweep him off unless he
// steps round them, beams knock him off unless he jumps them. A fall puts him back on the raft, a heart poorer.
const TF = makeTrail([[0, 0], [0, -60], [14, -120], [14, -190], [-10, -250], [-10, -330], [0, -380], [0, -436]]);
const RIVERF = [10, 406], RAFT = { r: 3.5, top: 6.45, s0: 12.6, s1: 406.5, speed: 7.5, rapids: [196, 256] };      // at each end it is drawn up over the bank, so there is no gap to step across
const ROCKSF = [[44, 2.2], [62, -2.2], [80, 2.4], [92, -2.4], [104, 2.2], [132, -2], [141, 2.2], [160, -2.4], [186, 2.2], [204, -2.4], [214, 2.4], [228, -2.2], [240, 2.2],
  [262, -2.4], [272, 2.4], [300, -2.2], [330, 2.2], [346, -2.4], [356, 2.4], [372, -2.2], [382, 2.4]];
const BEAMSF = [50, 150, 172, 286, 310, 320, 394];       // all on stretches that run due north: a beam is an axis-aligned box
const wetF = s => sstep(RIVERF[0], RIVERF[0] + 4, s) * sstep(RIVERF[1] + 2, RIVERF[1] - 2, s);
const LF = {
  side: true, id: 'ferry', chapter: 'A Side Road', title: 'The Long Water', music: 'river', bounds: [-42, 46, -458, 28], start: [0, -3, 0, -1], ambience: DAY,
  height(x, z) { const t = TF.locate(x, z); return 6.5 - 5.5 * wetF(t.s) + edge(Math.abs(t.d) - 10, 'wall', x, z, 17); },
  tint(c, x, z, h, ny) { const t = TF.locate(x, z); if (h < 5.5) c.set(0x5a6a58); else if (ny < 0.74) c.set(0x7a7468); else c.set((t.s < 12 || t.s > 404) && Math.abs(t.d) < 9.5 ? 0xd9c48a : 0x6fa84a); },
  build(E) {
    const { THREE, Models, M, P } = E, at = (s, lat = 0) => TF.at(s, lat);
    // The raft: a round deck of planks on barrels. It sets off when the hog steps aboard and stops at the far shore.
    const g = new THREE.Group(), [rx, rz] = at(RAFT.s0); E.world.g.add(g);
    E.mesh(new THREE.CylinderGeometry(RAFT.r, RAFT.r, 0.5, 10), E.lam(0xffffff, E.rep(M.tex.wood, 2, 2)), 0, -0.25, 0, g);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; E.mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.7, 8).rotateZ(Math.PI / 2), M.woodDark, Math.cos(a) * 2.3, -0.8, Math.sin(a) * 2.3, g).rotation.y = -a; }
    const raft = E.addCyl(rx, rz, RAFT.r, RAFT.r, RAFT.top - 0.9, RAFT.top, true); raft.dx = 0; raft.dz = 0; raft.u = RAFT.s0; raft.going = false;
    raft.update = dt => {
      if (!raft.going && P.grounded && P.ground === raft) {
        raft.going = true; E.safe({ get x() { return raft.x; }, get z() { return raft.z; }, y: RAFT.top }); E.objective('Stay on the raft', at(RAFT.s1)); E.toast('Step round the rocks. Jump the beams.', 4);
      }
      const fast = raft.u > RAFT.rapids[0] && raft.u < RAFT.rapids[1], u = raft.going ? Math.min(RAFT.s1, raft.u + (fast ? 10 : RAFT.speed) * dt) : raft.u, [x, z] = at(u);
      raft.dx = x - raft.x; raft.dz = z - raft.z; raft.x = x; raft.z = z; raft.u = u; g.position.set(x, RAFT.top + Math.sin(E.time * 2) * 0.04, z); if (raft.going && u < RAFT.s1) g.rotation.y += dt * 0.06;
      if (u >= RAFT.s1 && !raft.done) { raft.done = true; E.objective('Step ashore', at(432)); }
    };
    E.movers.push(raft); LF.raft = raft;
    // Rocks standing in the stream, to one side or the other.
    for (const [s, lat] of ROCKSF) { const [x, z] = at(s, lat), m = E.mesh(new THREE.CylinderGeometry(1.2, 1.9, 9.5, 7), M.rock, x, 5.2, z); m.rotation.y = s; E.addCyl(x, z, 1.5, 1.5, 0, 12, false); }
    // Fallen trunks across it from bank to bank, a little above the deck.
    for (const s of BEAMSF) {
      const [x, z] = at(s); E.mesh(new THREE.CylinderGeometry(0.55, 0.6, 25, 7).rotateZ(Math.PI / 2), M.trunk, x, 8.1, z); E.addBox(x - 12.5, x + 12.5, z - 0.5, z + 0.5, 7.5, 8.7, false);
      for (const sd of [-1, 1]) E.mesh(new THREE.CylinderGeometry(0.5, 0.6, 9, 6), M.trunk, x + sd * 10.4, 4.4, z);
      E.item('burger', x, z, 10.9);
    }
    pines(E, TF, 18, 402, 11.5, { seed: 5, step: 12 });
    for (const [s, sp] of [[118, 3.2], [352, -3.2]]) { const [x, z] = at(s); E.crow(x, z, 3.3, sp, 7.3); }
    for (const [s, lat] of [[22, 0], [26, 0], [36, 0], [68, 2.2], [72, 2.2], [86, -2.2], [98, 2.2], [124, 0], [128, 0], [146, -1], [166, 1], [180, 0], [198, 2], [220, -2], [246, -2], [268, 2], [278, -2], [294, 0], [304, 1.5], [336, -2], [364, -2], [378, 2]]) { const [x, z] = at(s, lat); E.item('taco', x, z, 8.2); }
    for (const s of [190, 340]) { const [x, z] = at(s, -1.5); E.item('burrito', x, z, 8.3); }
    // Hot sauce: a hop, a quick step back across, a boosted jump over a beam, a squeeze in the rapids, and a climb ashore.
    { const [x, z] = at(30); E.sauce(0, x, z, 11.7); } { const [x, z] = at(110, 2.9); E.sauce(1, x, z, 8.4); } { const [x, z] = at(172); E.sauce(2, x, z, 14.3); } { const [x, z] = at(234, -2.9); E.sauce(3, x, z, 8.4); }
    { const [x, z] = at(426, 4.6), [x2, z2] = at(426, 7.2), wood = E.lam(0xffffff, E.rep(M.tex.wood, 1, 1));
      E.mesh(new THREE.BoxGeometry(2.4, 1.7, 2.4), wood, x, 7.35, z); E.addBox(x - 1.2, x + 1.2, z - 1.2, z + 1.2, 5, 8.2, true);
      E.mesh(new THREE.BoxGeometry(2.6, 3.4, 2.6), wood, x2, 8.2, z2); E.addBox(x2 - 1.3, x2 + 1.3, z2 - 1.3, z2 + 1.3, 5, 9.9, true); E.sauce(4, x2, z2, 11.6); }
    // The two shores.
    { const [x, z] = at(6, 5.5); E.put(Models.buildHangingSign(['RAFT', 'NO', 'REFUNDS']), x, z, -0.4, 0.1); E.addCyl(x, z, 0.5, 0.5, -5, 40, false); }
    { const [x, z] = at(414); E.flag(x, z, -4); } { const [x, z] = at(420, -5.5); E.put(Models.buildCampfire(), x, z, 0, 0); }
    { const [x, z] = at(436); exitDoor(E, x, z, 0); }
  },
  begin(E) { E.gollum(true, { mode: 'ride' }); E.objective('Board the raft', TF.at(RAFT.s0)); E.later(4, () => E.bark('gollum', 'THE GOLLUM MAN: A raft. It goes where the river goes, piggy-man. We cannot swim. We has tried.', 5)); },
};

// ───────────────────────────── The Belly of the Mill ─────────────────────────────
// Straight up the inside of the Great Windmill: brackets round the wall, a gear with a sweeping arm, a hoist,
// rotten boards, and the windshaft at the top. A drop of more than a few yards (drop:) costs a heart.
const MB = { r: 16, floor: 6.5, landA: [-1.97, -11.33, 21], landB: [-10.63, 4.39, 33.2], landC: [-2.8, 11.15, 47.4], hoist: [-4.58, 10.0], top: [11.2, 1.0, 55.4] };
const ringM = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
const LM = {
  side: true, id: 'mill', chapter: 'A Side Road', title: 'The Belly of the Mill', music: 'mill', bounds: [-21, 21, -21, 21], cell: 1.5, start: [7.1, -4.9, 0.57, 0.82], ambience: MILLDARK, drop: 10,      // the start must have nothing overhead: the hog is set on the highest floor at that spot
  height(x, z) { return Math.hypot(x, z) < 17.3 ? MB.floor : -110; },
  tint(c, x, z) { c.set((Math.floor(x / 3) + Math.floor(z / 9)) % 2 ? 0x8a6a44 : 0x7a5c3a); },
  build(E) {
    const { THREE, Models, M, P } = E, wood = E.lam(0xffffff, E.rep(M.tex.wood, 1.5, 1.5)), rotten = E.lam(0x6a7a4a, E.rep(M.tex.wood, 1.5, 1.5)), iron = E.lam(0x4a4640);
    E.ring({ x: 0, z: 0, r: MB.r });
    // The shell is drawn from the inside only, so the camera can stand outside it and still see in.
    E.mesh(new THREE.CylinderGeometry(16.7, 16.7, 64, 24, 1, true), new THREE.MeshLambertMaterial({ map: E.rep(M.tex.wall, 12, 8), side: THREE.BackSide, flatShading: true }), 0, 37.5, 0);
    E.mesh(new THREE.ConeGeometry(17, 12, 24, 1, true), new THREE.MeshLambertMaterial({ color: 0x5a3c28, side: THREE.BackSide, flatShading: true }), 0, 75.5, 0);
    E.mesh(new THREE.CylinderGeometry(1.2, 1.2, 43.8, 9), M.woodDark, 0, 28.4, 0); E.addCyl(0, 0, 1.2, 1.2, MB.floor, 50.3, false);       // the main shaft
    E.light(0, 17, 6, 0xffc080, 90, 48); E.light(6, 36, -6, 0xffc080, 80, 44); E.light(-5, 54, 5, 0xffd8a0, 80, 44);
    // A round platform, with a bracket back to the wall if it is near one.
    const pad = (x, z, top, r = 2.3, mat = wood) => {
      const m = E.mesh(new THREE.CylinderGeometry(r, r, 0.5, 9), mat, x, top - 0.25, z), d = Math.hypot(x, z), a = Math.atan2(z, x);
      if (d > 6) { const b = E.mesh(new THREE.BoxGeometry(16.6 - d, 0.3, 0.5), M.woodDark, Math.cos(a) * (d + 16.6) / 2, top - 0.6, Math.sin(a) * (d + 16.6) / 2); b.rotation.y = -a; }
      const s = E.addCyl(x, z, r, r, top - 0.5, top, true); s.mesh = m; return s;
    };
    // A rotten board: it gives way under the hog and springs back when he has gone.
    const board = (x, z, top) => { const s = pad(x, z, top, 2.3, rotten); s.dx = 0; s.dz = 0;
      s.update = dt => { const on = P.grounded && P.ground === s; s.y1 = clamp(s.y1 + (on ? -2.3 : 1.6) * dt, top - 9, top); s.y0 = s.y1 - 0.5; s.mesh.position.y = s.y1 - 0.25; }; E.movers.push(s); return s; };
    // An arm turning about (cx, cz) just above a floor at y. It has to be jumped.
    const sweeper = (cx, cz, y, len, speed, phase = 0) => {
      const m = E.mesh(new THREE.BoxGeometry(len * 2, 0.7, 0.7), iron, cx, y + 0.75, cz);
      E.actor({ step() {
        const a = E.time * speed + phase, ca = Math.cos(a), sa = Math.sin(a), dx = P.x - cx, dz = P.z - cz, along = dx * ca + dz * sa, off = -dx * sa + dz * ca; m.rotation.y = -a;
        if (Math.abs(along) < len && Math.abs(along) > 1 && Math.abs(off) < 1.15 && P.y < y + 1.15 && P.y > y - 1.6) { const k = Math.sign(speed) * Math.sign(along); E.hurt(1, -sa * k, ca * k); }
      }, draw() {} });
    };
    // 1. Brackets round the wall, up to the first landing.
    for (let i = 0; i < 9; i++) { const [x, z] = ringM(0.2 + i * 0.48, 12.5); pad(x, z, 8 + i * 1.5); if (i % 2) E.item('taco', x, z, 9.6 + i * 1.5); }
    pad(MB.landA[0], MB.landA[1], MB.landA[2], 4.5); E.flag(MB.landA[0], MB.landA[1], 2.6, MB.landA[2]);
    // 2. The great gear, the lesser gear, and the hoist.
    const gear = (x, z, top, r) => { E.mesh(new THREE.CylinderGeometry(r, r, 0.9, 16), iron, x, top - 0.45, z); for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; E.mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), iron, x + Math.cos(a) * (r + 0.25), top - 0.5, z + Math.sin(a) * (r + 0.25)).rotation.y = -a; }
      E.mesh(new THREE.CylinderGeometry(r - 0.6, r - 0.6, 0.06, 16), wood, x, top + 0.01, z); return E.addCyl(x, z, r, r, top - 0.9, top, true); };
    gear(0, 0, 22.2, 7); sweeper(0, 0, 22.2, 6.6, 1.1);
    gear(5.13, 8.0, 24.4, 4); E.item('burger', 5.13, 8.0, 26);
    { const [hx, hz] = MB.hoist, m = E.mesh(new THREE.BoxGeometry(4.6, 0.6, 4.6), wood, hx, 24, hz), b = E.addBox(hx - 2.3, hx + 2.3, hz - 2.3, hz + 2.3, 23.6, 24.2, true); b.dx = 0; b.dz = 0;
      for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) E.mesh(new THREE.BoxGeometry(0.12, 40, 0.12), iron, cx * 2.1, 20.3, cz * 2.1, m);
      b.update = () => { b.y1 = 28.5 + 4.3 * Math.sin(E.time * 0.6); b.y0 = b.y1 - 0.6; m.position.y = b.y1 - 0.3; }; E.movers.push(b); LM.hoist = b; }
    pad(MB.landB[0], MB.landB[1], MB.landB[2], 4.2); E.flag(MB.landB[0], MB.landB[1], 2.2, MB.landB[2]); E.item('burrito', MB.landB[0] - 1.5, MB.landB[1] - 1.5, MB.landB[2] + 1.5);
    // 3. A second turn of brackets, wider apart, two of them rotten, with bats about.
    for (let i = 0; i < 8; i++) { const [x, z] = ringM(3.35 + i * 0.6, 12.5), top = 34.8 + i * 1.6; if (i === 2 || i === 5) board(x, z, top); else { pad(x, z, top); if (i % 2 === 0) E.item('taco', x, z, top + 1.6); } }
    E.crow(0, 0, 12.5, 4, 38.6); E.crow(0, 0, 12.5, -4.4, 44.8);
    pad(MB.landC[0], MB.landC[1], MB.landC[2], 4.2); E.flag(MB.landC[0], MB.landC[1], 2.4, MB.landC[2]); E.item('burrito', MB.landC[0] - 1.6, MB.landC[1] + 1.4, MB.landC[2] + 1.5);
    // 4. The windshaft: a beam across the tower with an arm turning over it, and the last few brackets to the cap.
    E.mesh(new THREE.BoxGeometry(3.2, 0.6, 17), wood, -2.8, 48.7, -0.5); E.addBox(-4.4, -1.2, -9, 8, 48.4, 49, true); sweeper(0, 0, 49, 6.5, 1.25, 1);
    pad(-2.8, -11.6, 50.6, 3.4); pad(4.2, -11.2, 52.2); pad(9.8, -6.6, 53.8); pad(MB.top[0], MB.top[1], MB.top[2], 4);
    E.item('taco', 4.2, -11.2, 53.8); E.item('taco', 9.8, -6.6, 55.4);
    exitDoor(E, 13.3, MB.top[1], -Math.PI / 2, MB.top[2]);
    // Wheels on the wall, turning for the look of the thing.
    const wheels = [[2.4, 14, 3.4], [5.2, 30, 2.6], [0.6, 42, 3.8], [3.9, 58, 3]].map(([a, y, r], k) => { const [x, z] = ringM(a, 15.6), w = E.mesh(new THREE.CylinderGeometry(r, r, 0.7, 10).rotateX(Math.PI / 2), k % 2 ? iron : M.woodDark, x, y, z);
      for (let q = 0; q < 4; q++) E.mesh(new THREE.BoxGeometry(r * 2.3, 0.5, 0.75), iron, 0, 0, 0, w).rotation.z = q * Math.PI / 4; w.rotation.y = Math.PI / 2 - a; return w; });
    E.actor({ step() {}, draw(dt) { wheels.forEach((w, k) => w.rotateZ((k % 2 ? -0.5 : 0.4) * dt)); } });
    // Hot sauce: on the floor behind the shaft, on the great gear, on a ledge off the hoist, over a rotten board, over the windshaft.
    E.sauce(0, 9, -9, 8.3); E.sauce(1, -4.6, 2.4, 24.1);
    pad(1.5, 12.6, 29, 1.9); E.sauce(2, 1.5, 12.6, 30.8);
    { const [x, z] = ringM(3.35 + 5 * 0.6, 12.5); E.sauce(3, x, z, 46.8); } E.sauce(4, -2.8, 0, 54.4);
  },
  begin(E) { E.gollum(true, { mode: 'ride' }); E.objective('Climb to the cap of the mill', null); E.later(4, () => E.bark('gollum', 'THE GOLLUM MAN: Up, it says. Always up. Mind the arm, Hog Man, it turns for nobody.', 5)); },
};

// ───────────────────────────── Mount Molcajete ─────────────────────────────
// A crater lake of salsa that rises and falls. The low causeways drown at high tide; the pools are crossed on
// tortilla chips; and the last climb, to the great stone bowl on the rim, has tomatoes rolling down it.
const TV = makeTrail([[0, 0], [0, -50], [30, -90], [30, -150], [-10, -190], [-10, -250], [20, -300], [20, -362]]);
const LOWV = [[40, 56], [150, 176], [290, 300]], POOLV = [[90, 124], [200, 250]], CLIMBV = [322, 384], TIDEV = { mid: 6.0, swing: 1.3, rate: 0.5 };
const inV = (list, s) => list.reduce((w, [p, q]) => Math.max(w, sstep(p, p + 2, s) * sstep(q, q - 2, s)), 0);
const pathV = s => lerp(lerp(8, 6.4, inV(LOWV, s)), 2, inV(POOLV, s)) + 14 * clamp((s - CLIMBV[0]) / (CLIMBV[1] - CLIMBV[0]), 0, 1);
const halfV = s => lerp(6.5, 10.5, sstep(380, 386, s));
// [s, lat, kind]: 0 an ordinary chip, 1 one that sinks, 2 one that drifts from side to side
const CHIPSV = [[94.5, 1.2, 0], [100.7, -1.2, 0], [106.9, 1.2, 0], [113.1, -1.2, 0], [119.3, 0, 0],
  [204.5, 0, 0], [210.7, 1, 1], [216.9, -0.5, 0], [223.1, 0, 0], [229.5, 0, 2], [235.9, 0, 0], [242.1, 0, 1], [247.4, 0, 0]];
const LV = {
  side: true, id: 'molcajete', chapter: 'A Side Road', title: 'Mount Molcajete', music: 'salsa', bounds: [-76, 96, -436, 70], cell: 2, start: [0, -4, 0, -1], ambience: MOLTEN,
  height(x, z) { const t = TV.locate(x, z), a = Math.abs(t.d), p = pathV(t.s), hw = halfV(t.s); return Math.max(lerp(p, Math.min(p, 2), sstep(hw, hw + 3.5, a)), 36 * sstep(44, 60, a)); },
  tint(c, x, z, h, ny) { const t = TV.locate(x, z), a = Math.abs(t.d); if (a > 42) c.set(ny < 0.8 ? 0x3a2c28 : 0x4a3a34); else if (h < 7.6) c.set(0x2c2220); else if (ny < 0.74) c.set(0x3a302c); else c.set(t.s > 384 ? 0x7a6a60 : 0x64544c); },
  nosafe(x, z) { const s = TV.locate(x, z).s; return LOWV.some(([p, q]) => s > p - 2 && s < q + 2); },       // never put him back on a causeway: it may be under
  build(E) {
    const { THREE, Models, M, P } = E, at = (s, lat = 0) => TV.at(s, lat), r = seeded(23);
    E.actor({ step() { E.tide(TIDEV.mid + TIDEV.swing * Math.sin(E.time * TIDEV.rate)); }, draw() {} });
    // Tortilla chips. A triangle to look at, a disc to stand on.
    const corn = E.lam(0xe8b84a), burnt = E.lam(0xb07a2a), TOP = 7.9;
    for (const [s, lat, kind] of CHIPSV) {
      const [x, z] = at(s, lat), m = E.mesh(new THREE.CylinderGeometry(3.0, 2.7, 0.5, 3), kind === 1 ? burnt : corn, x, TOP - 0.25, z), c = E.addCyl(x, z, 1.9, 1.9, TOP - 0.6, TOP, true); m.rotation.y = r() * 6;
      if (kind === 1) { c.dx = 0; c.dz = 0; c.update = dt => { const on = P.grounded && P.ground === c; c.y1 = clamp(c.y1 + (on ? -2 : 1.3) * dt, 4.4, TOP); c.y0 = c.y1 - 0.6; m.position.y = c.y1 - 0.25; }; E.movers.push(c); }
      if (kind === 2) { c.dx = 0; c.dz = 0; c.update = () => { const nx = x + Math.sin(E.time * 0.8) * 3; c.dx = nx - c.x; c.x = nx; m.position.x = nx; }; E.movers.push(c); }
      if (kind === 0) E.item('taco', x, z, TOP + 1.5);
    }
    // A rock to wait out the tide on, half-way along the long causeway.
    { const [x, z] = at(163, 0.5); stone(E, x, z, 8.3, 2.1); E.sauce(0, x, z, 10.1); }
    for (const [s, n] of [[8, 4], [60, 4], [128, 4], [180, 3], [254, 4], [304, 3]]) for (let i = 0; i < n; i++) { const [x, z] = at(s + i * 4.5, Math.sin(s + i * 2) * 3); E.item(i === 2 ? 'burger' : 'taco', x, z); }
    for (const s of [134, 262]) { const [x, z] = at(s, -3); E.item('burrito', x, z); }
    for (const [s, sp] of [[72, 5], [272, -5.5]]) { const [x, z] = at(s); E.crow(x, z, 5, sp); }
    for (const s of [128, 186, 256, 312]) { const [x, z] = at(s); E.flag(x, z, -3.5); }
    rocks(E, [[6, -22, 1.3], [26, -112, 1.5], [-6, -214, 1.2], [15, -296, 1.4]], 0x3a302c);
    { const [x, z] = at(34); E.trigger(x, z, 6, () => E.bark('gollum', 'THE GOLLUM MAN: Salsa. A whole lake of it. It comes up and it goes down, piggy-man. Cross when it is down.', 5.5)); }
    { const [x, z] = at(86); E.trigger(x, z, 6, () => E.toast('Tortilla chips float. The dark ones sink.', 4)); }
    // The climb, and what comes down it.
    const tomato = () => { const g = new THREE.Group(), b = E.mesh(new THREE.IcosahedronGeometry(1.25, 1), E.lam(0xd8382c), 0, 0, 0, g); E.mesh(new THREE.ConeGeometry(0.5, 0.4, 5), E.lam(0x3f8a2a), 0, 1.25, 0, b); return g; };
    E.rollers({ curve: (u, lane) => at(CLIMBV[0] + 2 + u * 60, lane).slice(0, 2), u0: 1, length: 60, speed: 9, period: 2.5, lanes: [-3.2, 0, 3.2, 0], radius: 1.25, make: tomato, colour: 0xd8382c,
      active: () => TV.locate(P.x, P.z).s > 296 && !E.world.finishing });
    { const [x, z] = at(318); E.trigger(x, z, 6, () => { E.objective('Climb to the great bowl', at(392)); E.toast('Tomatoes! Step out of their lane, or charge them.', 3.5); }); }
    // The molcajete: a stone mortar on three legs, full to the brim.
    { const [x, z] = at(391), y = E.ground(x, z), basalt = E.lam(0x4a4442);
      E.mesh(new THREE.CylinderGeometry(4.3, 3.1, 2.2, 10), basalt, x, y + 1.1, z); E.mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.12, 10), E.lam(0x7fae3a), x, y + 2.22, z);
      for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.5; E.mesh(new THREE.CylinderGeometry(0.7, 0.5, 1.4, 6), basalt, x + Math.cos(a) * 3.6, y + 0.5, z + Math.sin(a) * 3.6); }
      E.addCyl(x, z, 4.3, 3.6, y - 1, y + 2.2, true); E.trigger(x, z, 2.6, () => E.complete(), { y: y + 2.2 }); LV.bowl = [x, z, y + 2.2]; }
    // Hot sauce: on the waiting rock (above), a chip off to one side, over a sinking chip, an islet in the lake, and in the tomatoes' path.
    { const [x, z] = at(106.9, -6.3); E.mesh(new THREE.CylinderGeometry(3.0, 2.7, 0.5, 3), corn, x, TOP - 0.25, z); E.addCyl(x, z, 1.9, 1.9, TOP - 0.6, TOP, true); E.sauce(1, x, z, TOP + 1.8); }
    { const [x, z] = at(242.1); E.sauce(2, x, z, 13.4); }
    { const [x, z] = at(270, -12.6); stone(E, x, z, 8.2, 2.6); E.sauce(3, x, z, 10); }
    { const [x, z] = at(356); E.sauce(4, x, z, E.ground(x, z) + 5.4); }
  },
  begin(E) { E.gollum(true, { mode: 'ride' }); E.objective('Cross the salsa lake', TV.at(128)); },
};

// ───────────────────────────── The Night Market ─────────────────────────────
// A square of stalls, five by five, with alleys between. A thief has the market's hot sauce and must be run
// down three times: he bolts when the hog comes near, and at each corner turns whichever way leads away.
const MK = { cells: [-44, -22, 0, 22, 44], half: 7, low: 4.2, tall: 8, roads: [-33, -11, 11, 33] };
const ROUTEK = [[11, 33], [11, 11], [33, 11], [33, -11], [11, -11], [11, -33], [-11, -33], [-11, -11], [-33, -11], [-33, 11], [-11, 11], [-11, 33]];
const AWNINGS = [0xc83a2c, 0xe8b23a, 0x3f8a5a, 0x7a4a9a, 0x2f6aa8, 0xd8703a];
const LK = {
  side: true, id: 'market', chapter: 'A Side Road', title: 'The Night Market', music: 'market', bounds: [-72, 72, -72, 72], start: [11, 56, 0, -1], ambience: LANTERNS,
  height(x, z) { return 6.5 + edge(Math.max(Math.abs(x), Math.abs(z)) - 59, 'wall', x, z, 14); },
  tint(c, x, z, h, ny) { if (ny < 0.74) c.set(0x3a3440); else c.set((Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0x6a6470 : 0x5c5664); },
  build(E) {
    const { THREE, Models, M, P } = E, r = seeded(31), wood = E.lam(0xffffff, E.rep(M.tex.wood, 3, 1)), lamp = new THREE.MeshBasicMaterial({ color: 0xffc860 }), lampG = new THREE.BoxGeometry(0.5, 0.6, 0.5);
    const tall = (cx, cz) => (cx === 22 && cz === -22) || (cx === -44 && cz === 44), roofOf = (cx, cz) => 6.5 + (tall(cx, cz) ? MK.tall : MK.low);
    // The stalls. Every roof can be stood on, and the alleys are narrow enough to leap from one to the next.
    let n = 0;
    for (const cx of MK.cells) for (const cz of MK.cells) {
      if (!cx && !cz) continue;                             // the middle of the market is an open square
      const top = roofOf(cx, cz), hgt = top - 6.5, col = AWNINGS[n++ % AWNINGS.length];
      E.mesh(new THREE.BoxGeometry(13.4, hgt - 0.3, 13.4), wood, cx, 6.5 + (hgt - 0.3) / 2, cz); E.mesh(new THREE.BoxGeometry(14.6, 0.4, 14.6), E.lam(col), cx, top - 0.2, cz);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { E.mesh(new THREE.BoxGeometry(dx ? 0.3 : 9, 1.1, dx ? 9 : 0.3), E.lam(col), cx + dx * 7.3, top - 0.95, cz + dz * 7.3); E.mesh(lampG, lamp, cx + dx * 7.6, 9.2, cz + dz * 7.6); }
      E.addBox(cx - MK.half, cx + MK.half, cz - MK.half, cz + MK.half, -5, top, true);
      if (r() < 0.55 && !tall(cx, cz)) E.item('burger', cx + (r() - 0.5) * 6, cz + (r() - 0.5) * 6, top + 1.5);
    }
    // A balcony on the tall stall's north side: the way up to its roof from the roof next door.
    E.mesh(new THREE.BoxGeometry(14, 0.4, 2.2), E.lam(0x8a6238), 22, 12.2, -13.9); E.addBox(15, 29, -15, -12.8, 11.8, 12.4, true);
    // The square: a fountain with a lamp on a post, and stall-keepers who have seen it all before.
    E.mesh(new THREE.CylinderGeometry(2.4, 2.6, 1.8, 10), M.stone, 0, 7.4, 0); E.mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.1, 10), E.lam(0x3f93cf), 0, 8.32, 0); E.addCyl(0, 0, 2.4, 2.4, 5, 8.3, true);
    E.mesh(new THREE.CylinderGeometry(0.35, 0.45, 4.2, 6), M.stone, 0, 10.4, 0); E.addCyl(0, 0, 0.5, 0.5, 8.3, 12.4, false); E.mesh(new THREE.BoxGeometry(1, 1.1, 1), lamp, 0, 12.9, 0);
    E.light(0, 13, 0, 0xffc060, 160, 60); for (const [x, z] of [[33, 33], [-33, 33], [33, -33], [-33, -33]]) E.light(x, 11, z, 0xffb050, 70, 46);
    const folk = [];
    for (const [x, z, yaw, look] of [[7.8, 22, Math.PI / 2, { coat: ['#8a3a2a', '#6a2a1e', '#a04a36'], apron: 0xe8e0c8 }], [-22, 7.8, 0, { coat: ['#3a5a7a', '#2c4660', '#4a6c8e'], bald: true }],
      [29.8, -22, -Math.PI / 2, { coat: ['#5a7a3a', '#4a6830', '#6c8c48'], hair: '#8a5a2a' }], [-44, -29.8, Math.PI, { coat: ['#7a5a8a', '#5c4468', '#8e6c9e'], beard: '#3a2a1a' }], [0, -36.2, Math.PI, { coat: ['#a87a3a', '#8a622c', '#c08e4a'], apron: 0x5a3c20 }]]) {
      const m = Models.buildFolk(look); m.g.position.set(x, 6.5, z); m.yaw = yaw; E.world.g.add(m.g); folk.push([m, yaw]);
    }
    E.actor({ step() {}, draw(dt) { for (const [m, yaw] of folk) Models.animFolk(m, { yaw, time: E.time, walk: false, pose: 'idle' }, dt); } });
    // Crates in the alleys, off the middle of the road, and food down every one of them.
    const crate = (x, z, s = 2.2, y = 6.5) => { E.mesh(new THREE.BoxGeometry(s, s, s), E.lam(0xffffff, E.rep(M.tex.wood, 1, 1)), x, y + s / 2, z).rotation.y = 0; E.addBox(x - s / 2, x + s / 2, z - s / 2, z + s / 2, y - 1, y + s, true); };
    for (let i = 0; i < ROUTEK.length; i++) { const [ax, az] = ROUTEK[i], [bx, bz] = ROUTEK[(i + 1) % ROUTEK.length], mx = (ax + bx) / 2, mz = (az + bz) / 2, along = ax === bx;
      if (i % 2 === 0) crate(mx + (along ? (i % 4 ? 2.6 : -2.6) : 0), mz + (along ? 0 : (i % 4 ? 2.6 : -2.6)));
      for (const k of [-6, 6]) E.item('taco', mx + (along ? 0 : k), mz + (along ? k : 0)); }
    for (const q of MK.roads) { E.item('taco', q, 55); E.item('taco', q, -55); E.item('taco', 55, q); E.item('taco', -55, q); }
    for (const [x, z] of [[55, 55], [-55, 55], [55, -55]]) E.item('burrito', x, z);
    // The thief.
    const tgt = [ROUTEK[5][0], ROUTEK[5][1]], speeds = [10, 11.2, 12.3];
    const T = E.actor({ i: 5, dir: 1, x: tgt[0], z: tgt[1], y: 6.5, yaw: 0, run: false, caught: 0, gone: 0, m: Models.buildFolk({ coat: ['#2a2a34', '#1c1c24', '#3a3a48'], hair: '#1a1a1a', legs: 0x1c1c24, angry: true, scale: 0.92 }) });
    E.world.g.add(T.m.g); const sack = E.mesh(new THREE.IcosahedronGeometry(0.55, 0), E.lam(0xd8281c), 0, 2.6, -0.5, T.m.g), shadow = E.makeShadow(0.9); LK.thief = T;
    const far = () => { let best = 0, bd = -1; ROUTEK.forEach(([x, z], k) => { const d = Math.hypot(x - P.x, z - P.z); if (d > bd) { bd = d; best = k; } }); return best; };
    const pick = () => { const N = ROUTEK.length, a = ROUTEK[(T.i + 1) % N], b = ROUTEK[(T.i + N - 1) % N]; T.dir = Math.hypot(a[0] - P.x, a[1] - P.z) >= Math.hypot(b[0] - P.x, b[1] - P.z) ? 1 : -1; };
    T.step = dt => {
      if (T.caught >= 3) return;
      if (T.gone > 0) { if ((T.gone -= dt) <= 0) { T.i = far(); [T.x, T.z] = ROUTEK[T.i]; T.run = false; T.m.g.visible = shadow.visible = true; E.puff(T.x, 8, T.z, 0x555566, 12, 5, 0.7, 0.6, 2); } return; }
      const d = Math.hypot(P.x - T.x, P.z - T.z), N = ROUTEK.length;
      if (!T.run && d < 21) { T.run = true; pick(); E.Sound.whoosh(); } else if (T.run && d > 34) T.run = false;
      if (T.run) {
        const [wx, wz] = ROUTEK[(T.i + T.dir + N) % N], dx = wx - T.x, dz = wz - T.z, l = Math.hypot(dx, dz), v = speeds[T.caught] * dt;
        if (l <= v) { T.x = wx; T.z = wz; T.i = (T.i + T.dir + N) % N; pick(); } else { T.x += dx / l * v; T.z += dz / l * v; T.yaw = Math.atan2(dx, dz); }
      } else T.yaw = Math.atan2(P.x - T.x, P.z - T.z);
      tgt[0] = T.x; tgt[1] = T.z;
      if (P.dead <= 0 && Math.abs(P.y - T.y) < 3 && d < (P.charge > 0 ? 2.9 : 2.0)) {
        T.caught++; E.puff(T.x, 8, T.z, 0xffe27a, 16, 7, 0.6, 0.6, 3); E.Sound.stomp(); E.Sound.heal(); P.charge = 0; E.objective(`Catch the sauce thief  ${pips(T.caught, 3)}`, tgt);
        if (T.caught >= 3) { T.run = false; E.say([['gollum', 'The Gollum Man', 'It has him! Sit on him, Hog Man. We wants a word with him about the sauce.'], ['hog', 'Juli the Hog', 'Oink.']], () => E.complete()); }
        else { T.gone = 1.6; T.m.g.visible = shadow.visible = false; E.puff(T.x, 8, T.z, 0x555566, 14, 6, 0.8, 0.7, 2); E.toast(T.caught === 1 ? 'He slips the hog and is gone. Twice more.' : 'Slippery! Once more. He is faster now: charge him, or head him off.', 4); }
      }
    };
    T.draw = dt => { Models.animFolk(T.m, { yaw: T.yaw, time: E.time, walk: T.run, pose: T.run ? 'idle' : 'shout' }, dt); T.m.g.position.set(T.x, T.y, T.z); sack.rotation.y += dt; shadow.position.set(T.x, T.y + 0.07, T.z); };
    LK.tgt = tgt;
    // Hot sauce: a low roof (by the crate), behind the barrels in a corner, the fountain's lamp, the tall roof, and in mid-air between two roofs.
    crate(-13.8, 22); E.sauce(0, -22, 22, roofOf(-22, 22) + 1.7);
    for (const [dx, dz] of [[2, 0], [0, 2], [1.5, 1.5], [-0.4, 2.4], [2.4, -0.4]]) { E.mesh(new THREE.CylinderGeometry(0.85, 0.75, 1.9, 9), wood, -56 + dx, 7.45, -56 + dz); E.mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.14, 9), E.lam(0x3a3a3e), -56 + dx, 7.8, -56 + dz); E.addCyl(-56 + dx, -56 + dz, 0.85, 0.85, 5, 8.4, true); } E.sauce(1, -56.3, -56.3, 8.3);
    E.sauce(2, 0, 0, 14.2); E.sauce(3, 22, -22, roofOf(22, -22) + 1.7); E.sauce(4, -22, -33, 12.9);
    crate(13.8, 0); E.item('burger', 22, 0, roofOf(22, 0) + 1.5);
  },
  begin(E) {
    E.gollum(true, { mode: 'ride' }); E.cam.pitch = 0.62; E.objective('Catch the sauce thief  ○○○', LK.tgt);
    E.later(4, () => E.bark('gollum', 'THE GOLLUM MAN: Thief! That one, with the red sack. He has ALL the sauce. After him, piggy-man!', 5.5));
  },
};

// The book's four chapters first (saga.js counts on that), then the side roads, in the order of SIDES in hog-progress.js.
export const LEVELS = [L1, L2, L3, L4, LF, LM, LV, LK];
// For test bots and the console: the geometry the chapters are built on.
export const GEO = { T1, T2, T3, T4, GLADE, POND, FORDS, BANK1, GAPS2, LEDGE2, EDGE2, END2, GATE2, DOOR3, TAV, COR, THR, ESC, K, S4, RIVER4, spiral, TF, RAFT, ROCKSF, BEAMSF, MB, TV, CHIPSV, LOWV, POOLV, CLIMBV, MK, ROUTEK, AMB: { DAY, DUSK, SNOW, NIGHT, TAVERN, CAVE, BRIGHT, FROST, SUNSET } };
