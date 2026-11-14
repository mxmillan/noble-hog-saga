// Saved progress, shared by the two pages of the game: the windmill country (hog3d.html, which is both the
// prologue and the hub the chapters open off) and the chapters themselves (index.html).
// The chapters unlock in order, so three small values say everything.
const KEY = 'hogSaga.progress';

// The golden food each chapter's keeper gives up, and what it does for the hog in the windmill country.
export const RELICS = [
  { id: 'churro', name: 'The Golden Churro', power: 'The charge now smashes great boulders.' },
  { id: 'popper', name: 'The Golden Jalapeño Popper', power: 'The charge now burns, and melts ice.' },
  { id: 'chimichanga', name: 'The Golden Chimichanga', power: 'Q in mid-air is now a ground-pound. It breaks hatches.' },
  { id: 'lamp', name: 'The Food of the Lamp', power: 'The quest is done. The windmill country is yours to roam.' },
];
export const CHAPTERS = ['The Darkling Trail', 'The Cold Mountain', 'The Oasis', 'The White Castle'];
// The side roads: not in the book. Each opens once enough golden foods are held, and hides five bottles of hot sauce.
export const SIDES = [
  { id: 'ferry', title: 'The Long Water', need: 1 },
  { id: 'mill', title: 'The Belly of the Mill', need: 2 },
  { id: 'molcajete', title: 'Mount Molcajete', need: 3 },
  { id: 'market', title: 'The Night Market', need: 1 },
];
export const BOTTLES = 5;
const bits = n => { let c = 0; for (; n; n >>= 1) c += n & 1; return c; };
export const sauceIn = (p, id) => bits(p.sauce[id] || 0);
export const sauceAll = p => SIDES.reduce((n, s) => n + sauceIn(p, s.id), 0);

const int = (v, a, b) => Math.min(b, Math.max(a, parseInt(v, 10) || 0));
// pro: the prologue is behind you. done: chapters finished, which is also how many golden foods are held.
// open: how many of the hub's doors are unsealed (the first always is).
// sides: ids of side roads finished. sauce: for each side road, a bitmask of the bottles found.
export function load() {
  const p = { pro: false, done: 0, open: 1, sides: [], sauce: {} };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) {
      p.pro = !!s.pro; p.done = int(s.done, 0, 4); p.open = int(s.open, 1, 4);
      if (Array.isArray(s.sides)) p.sides = s.sides.filter(id => SIDES.some(q => q.id === id));
      for (const q of SIDES) if (s.sauce && s.sauce[q.id]) p.sauce[q.id] = int(s.sauce[q.id], 0, 31);
    }
    else {                                                  // a save from before there was a hub: the chapter reached
      const old = int(localStorage.getItem('hogSaga.chapter'), 0, 3);
      if (old > 0) { p.pro = true; p.done = old; p.open = old + 1; }
    }
  } catch { /* a private window: nothing is kept */ }
  return p;
}
export function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* fine */ } return p; }
