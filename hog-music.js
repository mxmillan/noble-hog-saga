// The music, for both pages. There are no audio files: every tune is a few lines of notes, played by the
// same two synth voices the sound effects use (the page's own tone() and noise()).
//
// A tune is:
//   step    seconds per step                 bar     steps to a bar (8, or 6 for a jig)
//   roots   the bass note of each bar (MIDI) lead    one token per step: a MIDI note, '.' a rest, '-' hold the last
//   bass    one character per step of a bar: x the root, 5 its fifth, 8 its octave
//   kick / snare / hat   one character per step of a bar, x where it sounds
//   arp     true to ripple the root, fifth and octave over the top
// Middle C is 60. The lead must be a whole number of bars long.
const notes = s => s.trim().split(/\s+/).map(t => (t === '.' ? 0 : t === '-' ? -1 : +t));

export const TUNES = {
  // The windmill country, and the title: an Andalusian cadence (Am G F E).
  windmill: { step: 0.2, bar: 8, roots: [45, 43, 41, 40], bass: 'x..x5.x.', hat: 'x.x.x.x.', leadVol: 0.022, lead: notes(`
    69 . 72 76 . 72 69 .   67 . 71 74 . 71 67 .   65 . 69 72 . 69 65 .   76 77 76 74 72 71 68 64
    76 . 76 77 76 . 72 .   74 . 74 76 74 . 71 .   72 . 72 74 72 . 69 .   71 72 71 68 64 . 64 .`) },
  // Chapter 1, the town: bright and bouncing, in G.
  town: { step: 0.19, bar: 8, roots: [43, 48, 50, 43, 40, 48, 50, 43], bass: 'x..x..5.', kick: 'x...x...', hat: 'x.x.x.x.', lead: notes(`
    67 . 71 74 . 71 67 .   72 . 76 79 . 76 72 .   74 . 78 81 . 78 74 72   71 - 74 - 67 - . .
    76 . 76 79 . 76 71 .   72 . 72 76 . 72 67 .   69 71 72 74 76 74 72 69   67 - - - 62 . 67 .`) },
  // Chapter 1, the darkling trail: D minor, slow and wary.
  trail: { step: 0.24, bar: 8, roots: [38, 38, 34, 33, 38, 41, 36, 33], bass: 'x...x.5.', hat: '..x...x.', leadWave: 'triangle', leadVol: 0.05, lead: notes(`
    62 . . 65 . . 69 .   67 . 65 . 62 - . .   65 . . 62 . . 58 .   57 . 61 . 64 - . .
    62 . . 65 . . 69 .   72 . 69 . 65 - . .   64 . . 67 . . 72 .   69 . 67 . 64 61 57 .`) },
  // Anything with hit points: E minor, fast.
  boss: { step: 0.15, bar: 8, roots: [40, 40, 36, 38, 40, 40, 36, 35], bass: 'x8x8x8x8', kick: 'x...x...', snare: '..x...x.', hat: 'xxxxxxxx', lead: notes(`
    76 . 76 79 76 . 74 .   71 . 74 . 76 - . .   72 . 72 76 72 . 79 .   78 . 74 . 69 - . .
    76 . 76 79 76 . 81 .   83 . 81 . 79 - 76 .   72 76 79 76 72 76 79 84   83 . 78 . 75 - 71 .`) },
  // Chapter 2, the cold mountain: high bells over a slow ripple.
  snow: { step: 0.26, bar: 8, roots: [40, 36, 43, 38, 40, 36, 45, 35], bass: 'x.......', arp: true, leadWave: 'sine', leadVol: 0.06, lead: notes(`
    83 . . 79 . . 76 .   79 . . 76 . . 72 .   74 . . 79 . . 83 .   81 . 78 . 74 - . .
    83 . . 79 . . 76 .   84 . . 79 . . 76 .   81 . 76 . 72 . 69 .   71 . 75 . 78 - . .`) },
  // Chapter 3, the trek by night: A minor, alone.
  night: { step: 0.25, bar: 8, roots: [45, 41, 36, 43, 45, 41, 40, 40], bass: 'x.....5.', leadWave: 'triangle', leadVol: 0.05, lead: notes(`
    69 . 72 . 76 - . .   77 . 76 . 72 - . .   67 . 72 . 76 - . 74   74 - . 71 . 67 . .
    69 . 72 . 76 - . .   81 . 77 . 72 - . .   71 . 68 . 64 . 68 .   71 - 76 - 80 - . .`) },
  // Chapter 3, the tavern: a jig in D, six to the bar.
  tavern: { step: 0.16, bar: 6, roots: [38, 45, 43, 45, 38, 43, 45, 38], bass: 'x..5..', kick: 'x.....', snare: '...x..', hat: 'x.xx.x', lead: notes(`
    74 . 78 81 78 74   76 . 73 69 73 76   74 . 71 67 71 74   73 76 73 69 . .
    74 . 78 81 78 74   79 . 83 79 76 74   73 76 81 76 73 69   74 - - 62 . .`) },
  // Chapter 3, under the mountain: low, Phrygian, with a pulse.
  lair: { step: 0.22, bar: 8, roots: [40, 40, 41, 40, 40, 40, 43, 41], bass: 'x.x...x.', kick: 'x..x....', leadWave: 'triangle', leadVol: 0.045, lead: notes(`
    64 . . 65 . . 64 .   . . 71 . 69 . 67 .   65 . . 69 . . 72 .   71 . 68 . 64 - . .
    64 . . 65 . . 64 .   . . 76 . 74 . 72 .   74 . . 71 . . 67 .   65 . 69 . 65 - 64 .`) },
  // Chapter 4, the White Castle: a march in C.
  castle: { step: 0.2, bar: 8, roots: [36, 43, 45, 41, 36, 43, 41, 43], bass: 'x.5.x.5.', kick: 'x...x...', snare: '..x...xx', lead: notes(`
    72 . 72 76 79 . 76 .   74 . 74 79 83 . 79 .   76 . 72 76 81 . 76 .   77 . 81 . 84 - 81 .
    79 . 76 72 76 . 79 .   83 . 79 74 79 . 83 .   81 . 77 72 77 . 81 .   79 - 74 - 71 - 67 .`) },
  // Chapter 4, on the wing: F, wide and rising.
  flight: { step: 0.18, bar: 8, roots: [41, 36, 38, 34, 41, 36, 34, 36], bass: 'x..x..x.', arp: true, hat: '..x...x.', leadVol: 0.03, lead: notes(`
    77 - - 81 84 - 81 .   79 - - 76 72 - 76 .   77 - - 81 86 - 81 .   82 - 81 - 77 - 74 .
    84 - - 81 77 - 81 .   79 - - 84 88 - 84 .   86 - 82 - 77 - 74 .   76 - 79 - 84 - - .`) },
  // The Long Water: a boat-song in G, six to the bar.
  river: { step: 0.2, bar: 6, roots: [43, 40, 36, 38, 43, 40, 36, 38], bass: 'x..5..', hat: '..x..x', leadWave: 'triangle', leadVol: 0.055, lead: notes(`
    74 . 71 74 . 79   79 . 76 71 . 76   76 . 72 76 . 79   78 . 74 69 . 74
    83 . 79 83 . 86   88 . 83 79 . 76   84 . 79 76 . 72   74 . 78 81 - .`) },
  // The Belly of the Mill: clockwork, in D.
  mill: { step: 0.17, bar: 8, roots: [38, 38, 43, 43, 38, 38, 36, 33], bass: 'x...5...', kick: 'x.......', hat: 'xxxxxxxx', leadVol: 0.02, lead: notes(`
    62 65 69 65 62 65 69 65   62 65 69 72 74 72 69 65   67 71 74 71 67 71 74 71   67 71 74 77 79 77 74 71
    62 65 69 65 62 65 69 65   74 72 69 65 62 65 69 72   72 67 64 67 72 76 79 76   73 69 64 69 73 76 81 .`) },
  // Mount Molcajete: E, F and G, hot, on a three-three-two beat.
  salsa: { step: 0.16, bar: 8, roots: [40, 41, 43, 41, 40, 41, 43, 40], bass: 'x..x..x.', kick: 'x..x..x.', snare: '....x...', hat: 'xxxxxxxx', lead: notes(`
    76 . 80 83 . 80 76 .   77 . 81 84 . 81 77 .   79 . 83 86 . 83 79 .   84 81 77 81 84 81 77 .
    83 . 80 76 . 80 83 .   84 . 81 77 . 81 84 .   86 . 83 79 . 83 86 88   88 86 84 83 81 80 77 76`) },
  // The Night Market: C minor, on tiptoe.
  market: { step: 0.19, bar: 8, roots: [36, 36, 32, 31, 36, 36, 29, 31], bass: 'x.5.x.5.', kick: 'x.......', hat: '..x...x.', leadWave: 'triangle', leadVol: 0.055, lead: notes(`
    72 . 75 . 79 . 78 79   75 . 72 . 67 . . .   72 . 75 . 80 . 79 80   79 . 74 . 71 . . .
    72 . 75 . 79 . 84 82   79 . 75 . 72 . . .   77 . 80 . 84 . 80 77   79 78 79 83 86 . . .`) },
};

// tone(freq, dur, wave, vol, slideTo, delay) and noise(dur, vol, cutoff, slideTo, delay) are the page's own.
export function makePlayer(tone, noise) {
  const f = m => 440 * Math.pow(2, (m - 69) / 12);
  let name = 'windmill', T = TUNES[name], nextT = 0, i = 0;
  return {
    get name() { return name; },
    // Change tune. The new one starts from its top after a breath.
    play(n) { if (n === name || !TUNES[n]) return; name = n; T = TUNES[n]; i = 0; nextT += 0.3; },
    // Call a few times a second with the audio clock: it queues whatever falls in the next third of a second.
    tick(now) {
      if (nextT < now) nextT = now + 0.05;
      while (nextT < now + 0.3) {
        const at = nextT - now, n = T.lead.length, k = i % n, s = k % T.bar, root = T.roots[Math.floor(k / T.bar) % T.roots.length], on = (p, q = s) => p && p[q] === 'x';
        const b = T.bass && T.bass[s];
        if (b === 'x') tone(f(root), T.step * 1.25, 'triangle', 0.09, 0, at); else if (b === '5') tone(f(root + 7), T.step, 'triangle', 0.06, 0, at); else if (b === '8') tone(f(root + 12), T.step, 'triangle', 0.06, 0, at);
        if (T.arp && s % 2 === 1) tone(f(root + 24 + [0, 7, 12, 7][(s >> 1) % 4]), T.step * 1.6, 'sine', 0.025, 0, at);
        if (T.lead[k] > 0) { let hold = 1; while (hold < T.bar * 2 && T.lead[(k + hold) % n] === -1) hold++; tone(f(T.lead[k]), T.step * (hold - 0.15), T.leadWave || 'square', T.leadVol || 0.024, 0, at); }
        if (on(T.kick)) tone(120, 0.13, 'sine', 0.11, 45, at);
        if (on(T.snare)) noise(0.09, 0.06, 3200, 0, at);
        if (on(T.hat)) noise(0.03, 0.02, 6500, 0, at);
        nextT += T.step; i++;
      }
    },
  };
}
