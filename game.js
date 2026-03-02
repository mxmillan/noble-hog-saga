// THE NOBLE HOG SAGA
// game.js — all game logic lives here
// Canvas: 1024x576px (gameplay)

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ---------------------------------------------------------------------------
// State machine
// States: 'SPLASH' | 'CHARACTER_SELECT' | 'INTRO' | 'PLAYING' | 'PAUSED' | 'GAME_OVER' | 'LEVEL_COMPLETE'
// ---------------------------------------------------------------------------
let state = 'SPLASH';

// ---------------------------------------------------------------------------
// Game state — persists across screens
// ---------------------------------------------------------------------------
const gameState = {
  selectedCharacter: 'hogman', // 'hogman' | 'gollum'
};

// ---------------------------------------------------------------------------
// CHUNK 5 — Game engine constants & world objects
// ---------------------------------------------------------------------------
const GRAVITY      = 0.5;    // px added to vy per frame (not dt-scaled, per spec)
const TERMINAL_VEL = 15;     // px/frame max fall speed
const LEVEL_PREAMBLE    = 1200; // px of empty ground before first platform/enemy
const LEVEL_WIDTH       = 8500 + LEVEL_PREAMBLE;
const BOSS_ARENA_LEFT   = 7100 + LEVEL_PREAMBLE; // world-x where arena locks behind player
const GROUND_Y     = 420;    // fallback ground surface (Chunk 6 replaces with platforms)

const camera = { x: 0, y: 0, shakeFrames: 0 };

let player       = null;
let platforms    = [];   // populated by Chunk 6
let collectibles    = [];   // populated by Chunk 7
let enemies         = [];   // populated by Chunk 8
let powerups        = [];   // populated by Chunk 9
let boss            = null; // Pond Brute boss object
let projectiles     = [];   // boss beam projectiles
let currentLevel    = 1;    // which level is active
let ringRevealTimer = 0;    // drives the ONE_RING_TEXT full-screen overlay
let tacoRainTimer   = 0;    // countdown between boss-fight taco drops (Hogman only)

// ---------------------------------------------------------------------------
// CHUNK 10 — SoundManager (Web Audio API, procedural sounds + background music)
// ---------------------------------------------------------------------------
const SoundManager = (() => {
  let ctx = null;
  let musicNodes = []; // refs to keep music oscillators stoppable

  function getCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Shared helper — plays a single tone burst
  function tone(freq, type, gainPeak, duration, startOffset = 0) {
    const ac = getCtx(); if (!ac) return;
    try {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = type;
      const t = ac.currentTime + startOffset;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(gainPeak, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.start(t); osc.stop(t + duration);
    } catch(e) {}
  }

  // Arpeggio helper — plays a sequence of tones
  function arpeggio(freqs, type, gainPeak, noteDur, spacing) {
    freqs.forEach((f, i) => tone(f, type, gainPeak, noteDur, i * spacing));
  }

  return {
    // Short ascending sine beep — player jumps
    playJump() {
      const ac = getCtx(); if (!ac) return;
      try {
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.type = 'sine';
        const t = ac.currentTime;
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.linearRampToValueAtTime(520, t + 0.12);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t); osc.stop(t + 0.18);
      } catch(e) {}
    },

    // Quick ascending two-tone jingle — collectible picked up
    playCollect() {
      const ac = getCtx(); if (!ac) return;
      try {
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.type = 'sine';
        const t = ac.currentTime;
        osc.frequency.setValueAtTime(523, t);
        osc.frequency.setValueAtTime(1047, t + 0.07);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t); osc.stop(t + 0.22);
      } catch(e) {}
    },

    // Low buzz/thud — player takes a hit
    playHit() {
      const ac = getCtx(); if (!ac) return;
      try {
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.type = 'sawtooth';
        const t = ac.currentTime;
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.18);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t); osc.stop(t + 0.22);
      } catch(e) {}
    },

    // Descending thud — enemy stomped/defeated
    playDefeat() {
      const ac = getCtx(); if (!ac) return;
      try {
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.type = 'square';
        const t = ac.currentTime;
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.2);
        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.start(t); osc.stop(t + 0.25);
      } catch(e) {}
    },

    // Short bass whoosh — Hogman launches a charge
    playCharge() {
      const ac = getCtx(); if (!ac) return;
      try {
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.type = 'sawtooth';
        const t = ac.currentTime;
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(55, t + 0.28);
        gain.gain.setValueAtTime(0.38, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        osc.start(t); osc.stop(t + 0.32);
      } catch(e) {}
    },

    // Magical shimmering chord — magic lamp collected
    playLampGet() {
      const notes = [523, 659, 784, 1047, 1319]; // C5 E5 G5 C6 E6
      arpeggio(notes, 'sine', 0.2, 0.25, 0.09);
    },

    // Slow descending chromatic scale — game over
    playGameOver() {
      const notes = [494, 466, 440, 415, 392, 370, 349, 294]; // descending
      arpeggio(notes, 'triangle', 0.2, 0.35, 0.22);
    },

    // Triumphant ascending fanfare — level complete
    playLevelWin() {
      // Arpeggio burst then a held chord
      const ac = getCtx(); if (!ac) return;
      try {
        const run   = [392, 523, 659, 784, 1047];
        run.forEach((f, i) => tone(f, 'square', 0.15, 0.18, i * 0.1));
        // Held chord after the run
        [523, 659, 784].forEach((f, i) => tone(f, 'sine', 0.12, 0.7, 0.6 + i * 0.02));
      } catch(e) {}
    },

    // Background ambient music — bass drone + simple looping melody
    startMusic() {
      const ac = getCtx(); if (!ac) return;
      if (musicNodes.length) return; // already playing
      try {
        // Bass drone (low sine, very quiet)
        const droneOsc  = ac.createOscillator();
        const droneGain = ac.createGain();
        droneOsc.connect(droneGain); droneGain.connect(ac.destination);
        droneOsc.type = 'sine';
        droneOsc.frequency.setValueAtTime(82.4, ac.currentTime); // E2
        droneGain.gain.setValueAtTime(0.06, ac.currentTime);
        droneOsc.start();
        musicNodes.push(droneOsc);

        // Mid drone (fifth above, very quiet)
        const mid  = ac.createOscillator();
        const midG = ac.createGain();
        mid.connect(midG); midG.connect(ac.destination);
        mid.type = 'triangle';
        mid.frequency.setValueAtTime(123.5, ac.currentTime); // B2
        midG.gain.setValueAtTime(0.04, ac.currentTime);
        mid.start();
        musicNodes.push(mid);

        // Simple repeating melody using scheduled notes
        const melody = [330, 370, 392, 440, 392, 370, 330, 294]; // E4 F#4 G4 A4...
        const melGain = ac.createGain();
        melGain.connect(ac.destination);
        melGain.gain.setValueAtTime(0.07, ac.currentTime);

        const noteLen = 0.55;
        const totalLen = melody.length * noteLen;
        let loopCount = 0;

        function scheduleLoop() {
          const loopStart = ac.currentTime + (loopCount === 0 ? 0.5 : 0);
          melody.forEach((freq, idx) => {
            const t = loopStart + idx * noteLen;
            const osc = ac.createOscillator();
            osc.connect(melGain);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t);
            osc.start(t);
            osc.stop(t + noteLen * 0.8);
            musicNodes.push(osc);
          });
          loopCount++;
          // Schedule next loop just before this one ends
          const nextAt = (loopStart + totalLen - 0.1) * 1000 - ac.currentTime * 1000;
          const timerId = setTimeout(scheduleLoop, Math.max(nextAt, 100));
          musicNodes.push({ stop: () => clearTimeout(timerId) });
        }

        scheduleLoop();
      } catch(e) {}
    },

    stopMusic() {
      musicNodes.forEach(n => { try { n.stop(); } catch(e) {} });
      musicNodes = [];
    },
  };
})();

// ---------------------------------------------------------------------------
// CHUNK 12 — SpriteLoader (PNG sprites with procedural fallback)
// ---------------------------------------------------------------------------
const SpriteLoader = (() => {
  const PATHS = {
    hogman_idle:       'assets/sprites/hogman/hogman_idle.png',
    hogman_run:        'assets/sprites/hogman/hogman_run.png',
    hogman_death:      'assets/sprites/hogman/hogman_death.png',
    hogman_charge_gas:      'assets/sprites/hogman/hog_charge_gas.png',
    hogman_charge_gas_jump: 'assets/sprites/hogman/hog_charge_gas_jump.png',
    gollum_idle:      'assets/sprites/gollum/gollum_idle.png',
    gollum_run:       'assets/sprites/gollum/gollum_crawling.png',
    gollum_jump:      'assets/sprites/gollum/gollum_jump.png',
    gollum_crouching: 'assets/sprites/gollum/gollum_crouching.png',
    gollum_hurt:      'assets/sprites/gollum/gollum_hurt.png',
    enemy_crow:        'assets/sprites/enemies/enemy_crow.png',
    troll_drink:        'assets/sprites/enemies/tile_troll.png',
    troll_stand:        'assets/sprites/enemies/tile_troll_stand.png',
    troll_attack:       'assets/sprites/enemies/tile_troll_attack.png',
    troll_defeat:       'assets/sprites/enemies/tile_troll_defeated.png',
    troll_sign:         'assets/sprites/enemies/tile_troll_sign.png',
    burger:        'assets/sprites/collectibles/burger.png',
    taco:          'assets/sprites/collectibles/taco.png',
    burrito:       'assets/sprites/collectibles/burrito.png',
    one_ring:      'assets/sprites/collectibles/one_ring.png',
    one_ring_text: 'assets/sprites/collectibles/one_ring_text.png',
    background_1:      'assets/backgrounds/level1_bg.png',
    splash_screen:     'assets/backgrounds/splash_screen.png',
    character_screen:  'assets/backgrounds/character_screen.png',
    intro_screen:      'assets/backgrounds/intro_screen.png',
    // Level 2 tile assets
    l2_bg:       'assets/backgrounds/level2_tiles/bg_dark_forest.png',
    l2_ground:   'assets/backgrounds/level2_tiles/ground_grass_forest.png',
    l2_platform: 'assets/backgrounds/level2_tiles/platform_dark_forest.png',
    // Level 3 tile assets
    l3_bg:                  'assets/backgrounds/level3_tiles/bg_strange_city.png',
    l3_ground:              'assets/backgrounds/level3_tiles/platform_cobble_street.png',
    l3_platform_red:        'assets/backgrounds/level3_tiles/platform_red.png',
    l3_platform_blue:       'assets/backgrounds/level3_tiles/platform_blue.png',
    l3_platform_red_double: 'assets/backgrounds/level3_tiles/platform_red_double.png',
    l2_city_gate:           'assets/backgrounds/level2_tiles/city_gate.png',
    // Level 1 tile assets
    tile_bg_green_hills:          'assets/backgrounds/level1_tiles/bg_green_hills.png',
    tile_ground_grass:            'assets/backgrounds/level1_tiles/ground_grass_standard.png',
    tile_ground_grass_alt:        'assets/backgrounds/level1_tiles/ground_grass_alt.png',
    tile_ground_edge_left:        'assets/backgrounds/level1_tiles/ground_edge_left.png',
    tile_ground_edge_right:       'assets/backgrounds/level1_tiles/ground_edge_right.png',
    tile_platform_wood_plank:     'assets/backgrounds/level1_tiles/platform_wood_plank.png',
  };

  const loaded = {}; // key → Image when successfully loaded

  function load() {
    Object.entries(PATHS).forEach(([key, path]) => {
      const img = new Image();
      img.onload  = () => { loaded[key] = img; };
      img.onerror = () => { /* file missing — procedural fallback stays active */ };
      img.src = path;
    });
  }

  // Draw sprite at (x, y, w, h). Returns true if drawn, false if not loaded.
  function blit(key, x, y, w, h) {
    const img = loaded[key];
    if (!img) return false;
    ctx.drawImage(img, x, y, w, h);
    return true;
  }

  // Check if a sprite is loaded (useful for conditional logic)
  function ready(key) { return !!loaded[key]; }

  // Return natural pixel dimensions of a loaded image, or null
  function size(key) {
    const img = loaded[key];
    return img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
  }

  // Expose raw Image object for pixel sampling
  function getImg(key) { return loaded[key] || null; }

  return { load, blit, ready, size, getImg };
})();

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------
let lastTime = 0;
let elapsed = 0; // total seconds since start — drives animations

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = {};
const justPressed = {};

window.addEventListener('keydown', (e) => {
  if (!keys[e.code]) justPressed[e.code] = true;
  keys[e.code] = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// Click / tap advances the intro screen or confirms character select
canvas.addEventListener('pointerdown', () => {
  if (state === 'INTRO' || state === 'CHARACTER_SELECT') justPressed['Enter'] = true;
});

function clearJustPressed() {
  for (const k in justPressed) delete justPressed[k];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Dark parchment background used on menu screens
function drawParchmentBg() {
  const W = canvas.width;
  const H = canvas.height;

  const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.75);
  bgGrad.addColorStop(0, '#2a1500');
  bgGrad.addColorStop(0.5, '#1a0d00');
  bgGrad.addColorStop(1, '#0d0600');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.04;
  for (let y = 0; y < H; y += 4) {
    const grain = ctx.createLinearGradient(0, y, W, y);
    grain.addColorStop(0, '#c8a060');
    grain.addColorStop(0.5, '#e0b870');
    grain.addColorStop(1, '#c8a060');
    ctx.fillStyle = grain;
    ctx.fillRect(0, y, W, 2);
  }
  ctx.restore();

  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

function drawGoldenBorder(W, H) {
  const GOLD = '#c9a84c';
  const GOLD_DIM = '#7a5c1e';
  const PAD = 12;
  const PAD2 = 20;

  ctx.save();

  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD - 2, PAD - 2, W - (PAD - 2) * 2, H - (PAD - 2) * 2);

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(PAD, PAD, W - PAD * 2, H - PAD * 2);

  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD2, PAD2, W - PAD2 * 2, H - PAD2 * 2);

  const corners = [
    { cx: PAD + 18, cy: PAD + 18, startAngle: Math.PI,       endAngle: Math.PI * 1.5 },
    { cx: W-PAD-18, cy: PAD + 18, startAngle: Math.PI * 1.5, endAngle: Math.PI * 2   },
    { cx: PAD + 18, cy: H-PAD-18, startAngle: Math.PI * 0.5, endAngle: Math.PI       },
    { cx: W-PAD-18, cy: H-PAD-18, startAngle: 0,             endAngle: Math.PI * 0.5 },
  ];

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  corners.forEach(({ cx, cy, startAngle, endAngle }) => {
    ctx.beginPath();
    ctx.arc(cx, cy, 14, startAngle, endAngle);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 7, startAngle, endAngle);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

// ---------------------------------------------------------------------------
// SPLASH SCREEN
// ---------------------------------------------------------------------------
function drawSplash() {
  const W = canvas.width;
  const H = canvas.height;

  // Dark background fill (visible as side bars when image is portrait)
  ctx.fillStyle = '#1a0a00';
  ctx.fillRect(0, 0, W, H);

  if (SpriteLoader.ready('splash_screen')) {
    // Canvas is already sized 2:3 to match the image — fill it directly
    SpriteLoader.blit('splash_screen', 0, 0, W, H);
  }

  // Pulsing pixel-art prompt — drawn over the image (or fallback) every frame
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.5);
  ctx.save();
  ctx.globalAlpha = 0.4 + 0.6 * pulse;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '11px "Press Start 2P", monospace';
  // Dark shadow for readability against the parchment background
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('PRESS ENTER TO BEGIN YOUR QUEST', W / 2, H * 0.80);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// CHARACTER SELECT SCREEN
// ---------------------------------------------------------------------------

// Track which card is highlighted (0 = hogman, 1 = gollum)
let charSelectIndex   = 0;
let pauseMenuIndex    = 0; // 0 = Resume, 1 = Quit to Menu
let gameOverMenuIndex   = 0;   // 0 = Try Harder, 1 = Choose a Different Loser
let levelCompleteScroll = 0;   // px scrolled so far on the level complete right panel

const CHARACTERS = [
  {
    id: 'hogman',
    name: 'Hogman',
    tagline: 'Rides his noble hog.',
    desc: 'Slow but powerful.',
    stats: [
      { label: 'Hunger',      stars: 5 },
      { label: 'Agility',     stars: 1 },
      { label: 'Drunkenness', stars: 4 },
    ],
  },
  {
    id: 'gollum',
    name: 'Gollum Man',
    tagline: 'Crawls on all fours.',
    desc: 'Fast and sneaky. Small hitbox.',
    stats: [
      { label: 'Pathetic-ness', stars: 5 },
      { label: 'Sneakiness',    stars: 5 },
      { label: 'Backbone',      stars: 0 },
    ],
  },
];

// Portrait box positions — pixel-scanned from character_screen.png (607×941 → canvas 520×780)
const CHAR_BOX_Y       = 210;
const CHAR_BOX_W       = 152;
const CHAR_BOX_H       = 212;
const CHAR_BOX_LEFT_X  = 88;
const CHAR_BOX_RIGHT_X = 276;

function drawCharacterSelect() {
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  if (SpriteLoader.ready('intro_screen')) {
    SpriteLoader.blit('intro_screen', 0, 0, W, H);
  } else {
    ctx.fillStyle = '#2a0a00';
    ctx.fillRect(0, 0, W, H);
  }

  // Heading
  ctx.save();
  ctx.font = '14px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.shadowBlur = 4;
  const headingY = CHAR_BOX_Y - 55;
  ctx.fillText('CHOOSE YOUR LOSER', W / 2, headingY);
  // Underline just 'LOSER'
  const fullW   = ctx.measureText('CHOOSE YOUR LOSER').width;
  const prefixW = ctx.measureText('CHOOSE YOUR ').width;
  const loserW  = fullW - prefixW;
  const loserX  = W / 2 - fullW / 2 + prefixW;
  ctx.fillRect(loserX, headingY + 11, loserW, 2);
  ctx.restore();

  const boxXs = [CHAR_BOX_LEFT_X, CHAR_BOX_RIGHT_X];
  const sprKeys = ['hogman_idle', 'gollum_idle'];
  const fallbackColors = ['#8b5e2a', '#8a9a7a'];

  CHARACTERS.forEach((char, i) => {
    const bx = boxXs[i];
    const selected = (i === charSelectIndex);
    // Black background for every box
    ctx.fillStyle = '#000000';
    ctx.fillRect(bx, CHAR_BOX_Y, CHAR_BOX_W, CHAR_BOX_H);
    // Sprite on top; fall back to a coloured square so missing assets are obvious
    // Gollum sprite has extra whitespace — scale it up and centre within the box
    const isGollum = (i === 1);
    const sprScale = isGollum ? 1.1 : 1.0;
    const sw = CHAR_BOX_W * sprScale;
    const sh = CHAR_BOX_H * sprScale;
    const sx = bx  + (CHAR_BOX_W - sw) / 2 + (isGollum ? -4 : 0);
    const sy = CHAR_BOX_Y + (CHAR_BOX_H - sh) / 2;
    // Clip to box bounds so the larger sprite doesn't overflow
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, CHAR_BOX_Y, CHAR_BOX_W, CHAR_BOX_H);
    ctx.clip();
    if (!SpriteLoader.blit(sprKeys[i], sx, sy, sw, sh)) {
      ctx.fillStyle = fallbackColors[i];
      ctx.fillRect(bx, CHAR_BOX_Y, CHAR_BOX_W, CHAR_BOX_H);
    }
    // Dim overlay on unselected card
    if (!selected) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, CHAR_BOX_Y, CHAR_BOX_W, CHAR_BOX_H);
    }
    ctx.restore();
    // Border: thick gold glow on selected, faint grey on unselected
    if (selected) {
      const pulse = 0.7 + 0.3 * Math.sin(elapsed * 3);
      ctx.save();
      ctx.strokeStyle = `rgba(255,215,80,${pulse})`;
      ctx.lineWidth = 6;
      ctx.shadowColor = `rgba(255,200,50,${pulse})`;
      ctx.shadowBlur = 28;
      ctx.strokeRect(bx - 1, CHAR_BOX_Y - 1, CHAR_BOX_W + 2, CHAR_BOX_H + 2);
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = 'rgba(120,100,60,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, CHAR_BOX_Y, CHAR_BOX_W, CHAR_BOX_H);
      ctx.restore();
    }
  });

  // Bouncing arrow above the selected card
  const selX = boxXs[charSelectIndex] + CHAR_BOX_W / 2;
  const bounce = Math.sin(elapsed * 5) * 5;
  const arrowTip = CHAR_BOX_Y - 14 + bounce;
  ctx.save();
  ctx.fillStyle = '#ffd84a';
  ctx.shadowColor = 'rgba(255,200,50,0.9)';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(selX,      arrowTip);
  ctx.lineTo(selX - 12, arrowTip - 16);
  ctx.lineTo(selX + 12, arrowTip - 16);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Stat boxes below each character portrait
  const STAT_BW    = CHAR_BOX_W + 20;  // wider to fit label + stars on one row
  const STAT_Y     = CHAR_BOX_Y + CHAR_BOX_H + 8;
  const STAT_PAD   = 8;
  const STAT_ROW_H = 38;
  const STAT_H     = STAT_PAD * 2 + CHARACTERS[0].stats.length * STAT_ROW_H;

  CHARACTERS.forEach((char, i) => {
    // Hogman: right-align stat box to character box right edge
    // Gollum: left-align stat box to character box left edge
    const sbx = i === 0
      ? boxXs[i] + CHAR_BOX_W - STAT_BW
      : boxXs[i];
    const selected = (i === charSelectIndex);

    ctx.save();

    // Dark background panel
    ctx.fillStyle = selected ? 'rgba(0,0,0,0.80)' : 'rgba(0,0,0,0.50)';
    ctx.fillRect(sbx, STAT_Y, STAT_BW, STAT_H);

    // Border — matches card style
    if (selected) {
      const pulse = 0.7 + 0.3 * Math.sin(elapsed * 3);
      ctx.strokeStyle = `rgba(255,215,80,${pulse})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = `rgba(255,200,50,${pulse})`;
      ctx.shadowBlur = 14;
    } else {
      ctx.strokeStyle = 'rgba(120,100,60,0.45)';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
    }
    ctx.strokeRect(sbx, STAT_Y, STAT_BW, STAT_H);

    // Stat rows — label left, stars right, same row
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 0;

    char.stats.forEach(({ label, stars }, j) => {
      const ty = STAT_Y + STAT_PAD + j * STAT_ROW_H + STAT_ROW_H / 2;

      ctx.font      = '8px "Press Start 2P", monospace';
      ctx.fillStyle = selected ? '#d4b870' : '#6a5828';
      ctx.textAlign = 'left';
      ctx.fillText(label, sbx + STAT_PAD, ty);

      ctx.font      = '16px "Press Start 2P", monospace';
      ctx.fillStyle = selected ? '#ffd84a' : '#7a6030';
      ctx.textAlign = 'right';
      ctx.fillText('★'.repeat(stars) + '☆'.repeat(5 - stars), sbx + STAT_BW - STAT_PAD, ty);
    });

    ctx.restore();
  });

  // Blinking prompt below stat boxes
  const promptY  = STAT_Y + STAT_H + 30;
  const blink    = (Math.sin(elapsed * 1.8) + 1) / 2;  // slow 0→1 pulse
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.75 * blink;
  ctx.font        = '8px "Press Start 2P", monospace';
  ctx.fillStyle   = '#ffffff';
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur  = 3;
  ctx.fillText('PRESS ENTER TO', W / 2, promptY);
  ctx.fillText('BEGIN YOUR QUEST', W / 2, promptY + 20);
  ctx.restore();

}

// ---------------------------------------------------------------------------
// INTRO SCROLL SCREEN  (Star Wars–style crawl)
// ---------------------------------------------------------------------------

// INTRO_LINES is defined in intro-text.js — edit that file to change the story text.

const INTRO_LINE_HEIGHT  = 26;   // px between lines
const INTRO_SCROLL_SPEED = 28;   // px per second upward
const INTRO_TEXT_TOTAL_H = INTRO_LINES.length * INTRO_LINE_HEIGHT;

// scrollY = y-position of the FIRST line (starts below canvas, moves up)
let introScrollY   = 0;
let introComplete  = false; // true once all text has scrolled through

function resetIntro() {
  // Start with the first line already ~1/3 up the screen
  introScrollY  = canvas.height * 0.65;
  introComplete = false;
}

function updateIntro(dt) {
  if (introComplete) return; // hold position once done
  introScrollY -= INTRO_SCROLL_SPEED * dt;
  // Stop when the last line settles just inside the top of the parchment.
  // All lines above it (spaced 26px apart) will have already scrolled past
  // the clip boundary and disappeared.
  const clipTop   = Math.round(canvas.height * 0.13);
  const restY     = clipTop + 18;  // last line rests just inside the parchment edge
  const lastLineY = introScrollY + (INTRO_LINES.length - 1) * INTRO_LINE_HEIGHT;
  if (lastLineY <= restY) {
    introScrollY  = restY - (INTRO_LINES.length - 1) * INTRO_LINE_HEIGHT;
    introComplete = true;
  }
}

function drawIntro() {
  const W = canvas.width;
  const H = canvas.height;

  // --- Background ---
  ctx.fillStyle = '#1a0a00';
  ctx.fillRect(0, 0, W, H);
  if (SpriteLoader.ready('intro_screen')) {
    SpriteLoader.blit('intro_screen', 0, 0, W, H);
  } else {
    drawParchmentBg();
    drawGoldenBorder(W, H);
  }

  // --- Clipped text zone — inset to sit inside the parchment border ---
  const CLIP_TOP    = Math.round(H * 0.13);
  const CLIP_BOTTOM = Math.round(H * 0.88);
  const CLIP_LEFT   = Math.round(W * 0.18);
  const CLIP_RIGHT  = Math.round(W * 0.82);

  ctx.save();
  ctx.beginPath();
  ctx.rect(CLIP_LEFT, CLIP_TOP, CLIP_RIGHT - CLIP_LEFT, CLIP_BOTTOM - CLIP_TOP);
  ctx.clip();

  // Draw each line
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'top';

  INTRO_LINES.forEach((line, i) => {
    const lineY = introScrollY + i * INTRO_LINE_HEIGHT;

    // Skip lines fully off-screen
    if (lineY > CLIP_BOTTOM || lineY + INTRO_LINE_HEIGHT < CLIP_TOP) return;

    const isTitle  = line.startsWith('\u2014');
    const isWanted = line === 'They were WANTED.';

    if (line === '') return; // blank line — just spacing

    ctx.shadowBlur    = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    if (isTitle) {
      ctx.font      = '9px "Press Start 2P", monospace';
      ctx.fillStyle = '#7a4800';
    } else if (isWanted) {
      ctx.font      = '11px "Press Start 2P", monospace';
      ctx.fillStyle = '#cc2200';
    } else {
      ctx.font      = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#2a1200';
    }

    ctx.fillText(line, W / 2, lineY);
  });

  ctx.restore();

  // --- Small hint at the bottom ---
  const promptTx = introComplete ? 'PRESS ENTER TO CONTINUE' : 'PRESS ENTER TO SKIP';
  const pulse    = 0.4 + 0.6 * Math.sin(elapsed * 2);
  ctx.save();
  ctx.globalAlpha   = pulse;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.font          = '7px "Press Start 2P", monospace';
  ctx.fillStyle     = '#2a1200';
  ctx.shadowBlur    = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillText(promptTx, W / 2, H - 22);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// CHUNK 5 — Player physics, controls & in-game drawing
// ---------------------------------------------------------------------------

function initLevel(level = 1) {
  currentLevel = level;
  const isHogman = gameState.selectedCharacter === 'hogman';

  player = {
    x:          80,
    y:          GROUND_Y - (isHogman ? 80 : 30),
    vx:         0,
    vy:         0,
    width:      isHogman ? 70  : 50,
    height:     isHogman ? 80  : 30,
    isOnGround: false,
    isJumping:  false,
    lives:            3,
    invincibleTimer:  0,  // seconds remaining of post-hit invincibility
    ringTimer:        0,  // seconds remaining of One Ring invincibility
    dying:           false, // death crumple animation active
    deathRestTimer:  0,    // seconds to rest on ground before game over
    speed:      isHogman ? 3   : 4.5,
    jumpForce:  isHogman ? 6 : 8,
    facing:     1,  // 1 = right, -1 = left
    coyoteFrames: 0, // frames remaining after walking off a ledge where jump is still allowed
    // Variable jump
    jumpHeld:     false,
    airJumpsLeft: isHogman ? 0 : 1, // Gollum gets a mid-air double-jump
    // Crouch / slide
    crouching:    false,
    normalHeight: isHogman ? 80  : 30,
    crouchHeight: isHogman ? 42  : 18,
    sliding:      false,
    slideTimer:   0,
    slideVx:         0,
    chargeFuel:      0,   // 0.0–1.0 gauge filled by collectibles; Hogman charges at 1.0
    chargeUp:        false, // true when the active charge is an upward boost
    doubleJumpFlash: 0,   // seconds remaining of double-jump burst (Gollum only)
    prevBottom:      GROUND_Y, // actual bottom-edge last frame; tracked to fix height-change collision misses
    // Collectible counts toward extra life thresholds
    burgersCollected:  0,  // 3 → +1 life
    tacosCollected:    0,  // 5 → +1 life
    extraLifeTimer:    0,  // seconds to show "+1 UP!" flash
  };

  camera.x = 0;
  camera.y = 0;
  camera.shakeFrames = 0;

  if (level === 2) {
    // CHUNK 6 — Level 2 platform layout — dark forest, no ground in the middle
    platforms = [
      // Start runway — extended under first platform so Hogman can charge straight up
      {x: 0,                      y: 420, width: LEVEL_PREAMBLE + 700, height: 80, type: 'ground'},
      // End runway — extended to provide solid ground under the city gate approach
      {x: LEVEL_WIDTH - 1600,     y: 420, width: 1600,                 height: 80, type: 'ground'},

      {x:  500, y: 340, width: 400, height: 150, type: 'platform'},  // low
      {x: 1050, y: 270, width: 420, height: 150, type: 'platform'},  // mid
      {x: 1700, y: 210, width: 380, height: 150, type: 'platform'},  // high
      {x: 2300, y: 330, width: 440, height: 150, type: 'platform'},  // low
      {x: 2950, y: 230, width: 400, height: 150, type: 'platform'},  // high (was 185 — unreachable by Hogman charge)
      {x: 3550, y: 250, width: 420, height: 150, type: 'platform'},  // mid
      {x: 4150, y: 355, width: 380, height: 150, type: 'platform'},  // lowest
      {x: 4750, y: 255, width: 440, height: 150, type: 'platform'},  // high (was 200 — unreachable by Hogman charge)
      {x: 5400, y: 290, width: 400, height: 150, type: 'platform'},  // mid-low
      {x: 6000, y: 225, width: 420, height: 150, type: 'platform'},  // mid-high
      {x: 6600, y: 315, width: 380, height: 150, type: 'platform'},  // mid-low
    ];

    // CHUNK 7 — Level 2 collectibles
    // Burritos on start runway give Hogman fuel for first jump.
    // Burritos before big upward jumps (plat 4→5, plat 7→8).
    // Tacos on every platform to keep gauge topped up.
    // All x values are pre-preamble (shifted +1200 in init).
    collectibles = [
      // ── Start runway — give Hogman charge fuel before any platforming ─────
      {x:  200, y: 398, type: 'burger',  collected: false},
      {x:  400, y: 393, type: 'burrito', collected: false},
      // ── Platform tacos (y = platY - 22) ──────────────────────────────────
      {x:  700, y: 318, type: 'taco',    collected: false}, // plat 1
      {x: 1260, y: 248, type: 'taco',    collected: false}, // plat 2
      {x: 1890, y: 188, type: 'taco',    collected: false}, // plat 3
      // Burrito on plat 4 — Hogman needs full fuel for the jump up to plat 5
      {x: 2520, y: 308, type: 'burrito', collected: false}, // plat 4
      {x: 3150, y: 208, type: 'taco',    collected: false}, // plat 5
      {x: 3760, y: 228, type: 'taco',    collected: false}, // plat 6
      // Burrito on plat 7 — Hogman needs full fuel for the jump up to plat 8
      {x: 4340, y: 333, type: 'burrito', collected: false}, // plat 7
      {x: 4970, y: 233, type: 'taco',    collected: false}, // plat 8
      {x: 5600, y: 268, type: 'taco',    collected: false}, // plat 9
      {x: 6210, y: 203, type: 'taco',    collected: false}, // plat 10
      {x: 6790, y: 293, type: 'taco',    collected: false}, // plat 11
    ];

    // CHUNK 8 — Level 2 enemies (none for now)
    enemies = [];

    boss = null;

  } else if (level === 3) {
    // CHUNK 6 — Level 3 platform layout — city streets, solid ground
    // Platforms are chunky blocks whose bottom sits flush with the ground (y+h=470).
    // Heights: ~50 (low/easy), ~80-100 (mid), ~125-135 (high — charge-up or double-jump).
    platforms = [
      // Continuous cobblestone ground (lowered to y=470 for more visible floor)
      {x: 0, y: 470, width: LEVEL_WIDTH, height: 80, type: 'ground'},

      // Street block platforms (variant selects which tile asset to draw)
      {x:  450, y: 420, width: 200, height:  50, type: 'platform', variant: 'red'},
      {x:  900, y: 395, width: 220, height:  75, type: 'platform', variant: 'blue'},
      {x: 1400, y: 355, width: 200, height: 115, type: 'platform', variant: 'red_double'},
      {x: 1950, y: 425, width: 240, height:  45, type: 'platform', variant: 'red'},
      {x: 2500, y: 335, width: 200, height: 135, type: 'platform', variant: 'blue'},
      {x: 3100, y: 410, width: 220, height:  60, type: 'platform', variant: 'red_double'},
      {x: 3700, y: 380, width: 200, height:  90, type: 'platform', variant: 'red'},
      {x: 4300, y: 345, width: 220, height: 125, type: 'platform', variant: 'blue'},
      {x: 4900, y: 420, width: 200, height:  50, type: 'platform', variant: 'red_double'},
      {x: 5500, y: 390, width: 240, height:  80, type: 'platform', variant: 'red'},
      {x: 6150, y: 335, width: 200, height: 135, type: 'platform', variant: 'blue'},
      {x: 6800, y: 405, width: 220, height:  65, type: 'platform', variant: 'red_double'},
      {x: 7500, y: 370, width: 200, height: 100, type: 'platform', variant: 'red'},
    ];

    // Collectibles — tacos above each platform, burgers to guide the start, burritos floating high
    collectibles = [
      // Ground burgers — ease players into the level (22px above ground surface y=470)
      {x:  200, y: 448, type: 'burger',  collected: false},
      {x:  400, y: 448, type: 'burger',  collected: false},
      {x:  750, y: 448, type: 'burger',  collected: false},
      // Tacos — centred above each platform (y = platY - 22)
      {x:  545, y: 398, type: 'taco',    collected: false}, // plat 1
      {x:  985, y: 373, type: 'taco',    collected: false}, // plat 2
      {x: 1490, y: 333, type: 'taco',    collected: false}, // plat 3
      {x: 2065, y: 403, type: 'taco',    collected: false}, // plat 4
      {x: 2595, y: 313, type: 'taco',    collected: false}, // plat 5
      {x: 3205, y: 388, type: 'taco',    collected: false}, // plat 6
      {x: 3795, y: 358, type: 'taco',    collected: false}, // plat 7
      {x: 4405, y: 323, type: 'taco',    collected: false}, // plat 8
      {x: 4995, y: 398, type: 'taco',    collected: false}, // plat 9
      {x: 5615, y: 368, type: 'taco',    collected: false}, // plat 10
      {x: 6245, y: 313, type: 'taco',    collected: false}, // plat 11
      {x: 6905, y: 383, type: 'taco',    collected: false}, // plat 12
      {x: 7595, y: 348, type: 'taco',    collected: false}, // plat 13
      // Burritos — high floaters between tall platforms (charge-up or double-jump reward)
      {x: 2180, y: 280, type: 'burrito', collected: false},
      {x: 4640, y: 285, type: 'burrito', collected: false},
      {x: 6540, y: 275, type: 'burrito', collected: false},
    ];

    enemies = [];
    boss = null;

  } else {
    // CHUNK 6 — Level 1 platform layout — 8500px, three zones + boss approach
    platforms = [
      // ── CONTINUOUS GROUND FLOOR (y:420, height:80) — no gaps ─────────────
      {x: 0, y: 420, width: LEVEL_WIDTH, height: 80, type: 'ground'},

      // ── ELEVATED PLATFORMS (wood plank, spread across full level) ─────────
      {x:  520, y: 290, width:  280, height: 32, type: 'platform'},
      {x: 1150, y: 265, width:  300, height: 32, type: 'platform'},
      {x: 1780, y: 300, width:  280, height: 32, type: 'platform'},
      {x: 2300, y: 275, width:  320, height: 32, type: 'platform'},
      {x: 3050, y: 240, width:  300, height: 32, type: 'platform'},
      {x: 3800, y: 270, width:  280, height: 32, type: 'platform'},
      {x: 4450, y: 285, width:  320, height: 32, type: 'platform'},
      {x: 5250, y: 250, width:  300, height: 32, type: 'platform'},
      {x: 5950, y: 275, width:  300, height: 32, type: 'platform'},
      {x: 6700, y: 265, width:  320, height: 32, type: 'platform'},
      {x: 7450, y: 240, width:  300, height: 32, type: 'platform'},
    ];

    // CHUNK 7 — Collectibles
    // Burgers:  small clusters near first 3 platform approaches (ground guides, teaching phase)
    // Tacos:    one per platform, centred on surface (reward for jumping up)
    // Burritos: floating mid-gap above crow height in gaps 4, 7, 8 (risky optional reward)
    // Ring:     floating in gap 5
    collectibles = [
      // ── Ground burgers — guide player through first 3 platforms then stop ──
      {x:  300, y: 400, type: 'burger',  collected: false},
      {x:  500, y: 400, type: 'burger',  collected: false},
      {x: 1050, y: 400, type: 'burger',  collected: false},
      {x: 1200, y: 400, type: 'burger',  collected: false},
      {x: 1650, y: 400, type: 'burger',  collected: false},
      // ── Tacos — one per platform, centred on surface ─────────────────────
      {x:  660, y: 268, type: 'taco',    collected: false}, // plat 1
      {x: 1300, y: 243, type: 'taco',    collected: false}, // plat 2
      {x: 1920, y: 278, type: 'taco',    collected: false}, // plat 3
      {x: 2460, y: 253, type: 'taco',    collected: false}, // plat 4
      {x: 3200, y: 218, type: 'taco',    collected: false}, // plat 5
      {x: 3940, y: 248, type: 'taco',    collected: false}, // plat 6
      {x: 4610, y: 263, type: 'taco',    collected: false}, // plat 7
      {x: 5400, y: 228, type: 'taco',    collected: false}, // plat 8
      {x: 6100, y: 253, type: 'taco',    collected: false}, // plat 9
      {x: 6860, y: 243, type: 'taco',    collected: false}, // plat 10
      {x: 7600, y: 218, type: 'taco',    collected: false}, // plat 11
      // ── Burritos — mid-gap floaters, requires risky jump from platform edge
      {x: 2835, y: 245, type: 'burrito', collected: false}, // gap 4: 2620→3050
      {x: 5010, y: 245, type: 'burrito', collected: false}, // gap 7: 4770→5250
      {x: 5750, y: 240, type: 'burrito', collected: false}, // gap 8: 5550→5950
      // ── Ring — gap 5 ──────────────────────────────────────────────────────
      {x: 3420, y: 220, type: 'ring',    collected: false},
    ];

    // CHUNK 8 — Enemies: one crow per inter-platform gap, patrolling mid-air only.
    // x values are pre-LEVEL_PREAMBLE; +1200 is applied below. Gap extents listed for reference.
    const ENEMY_DEFS = [
      {x:  850, y: 340, type: 'crow', patrolRange: 250}, // gap 1: 2000→2350
      {x: 1500, y: 330, type: 'crow', patrolRange: 220}, // gap 2: 2650→2980
      {x: 2080, y: 335, type: 'crow', patrolRange: 150}, // gap 3: 3260→3500
      {x: 2650, y: 340, type: 'crow', patrolRange: 340}, // gap 4: 3820→4250
      {x: 3380, y: 335, type: 'crow', patrolRange: 360}, // gap 5: 4550→5000
      {x: 4110, y: 330, type: 'crow', patrolRange: 280}, // gap 6: 5280→5650
      {x: 4800, y: 340, type: 'crow', patrolRange: 390}, // gap 7: 5970→6450
      {x: 5580, y: 335, type: 'crow', patrolRange: 310}, // gap 8: 6750→7150
    ];
    enemies = ENEMY_DEFS.map(def => ({
      ...def,
      startX: def.x,
      dir:    1,
      alive:  true,
      width:  56,
      height: 42,
      speed:  2.0,
    }));

    initBoss();
  }

  // Give each collectible a random bob phase and reset ring reveal
  collectibles.forEach(c => { c.bobOffset = Math.random() * Math.PI * 2; });
  ringRevealTimer = 0;

  // CHUNK 9 — Power-ups
  powerups = [];

  // Shift all non-ground content right by LEVEL_PREAMBLE
  platforms.forEach(p => { if (p.type !== 'ground') p.x += LEVEL_PREAMBLE; });
  collectibles.forEach(c => c.x += LEVEL_PREAMBLE);
  enemies.forEach(e => { e.x += LEVEL_PREAMBLE; e.startX += LEVEL_PREAMBLE; });
}

// Physics & controls — called every frame in PLAYING state
// Uses per-frame (non-dt-scaled) values as specified
function updatePlayer() {
  if (!player) return;

  // --- Death crumple animation — skip all normal physics ---
  if (player.dying) {
    if (player.deathRestTimer > 0) {
      // Resting on the ground — count down then trigger game over
      player.deathRestTimer -= 1 / 60;
      if (player.deathRestTimer <= 0) {
        SoundManager.playGameOver();
        gameOverMenuIndex = 0;
        state = 'GAME_OVER';
      }
      return;
    }
    // Falling — heavier gravity for a fast crumple feel
    player.vy = Math.min(player.vy + 0.9, TERMINAL_VEL * 1.5);
    player.y += player.vy;
    // Land on ground and start rest timer
    if (player.y + player.height >= GROUND_Y) {
      player.y = GROUND_Y - player.height;
      player.vy = 0;
      player.deathRestTimer = 1.5;
    }
    return;
  }

  // --- Screen shake countdown ---
  if (camera.shakeFrames > 0) camera.shakeFrames--;

  // --- Boost multipliers from active power-ups ---

  // --- Hogman Charge / Gollum Crouch+Slide ---
  const isHogman = gameState.selectedCharacter === 'hogman';

  if (isHogman) {
    // F key launches a charge; hold F to sustain it — fuel drains while held
    if (player.sliding) {
      if (!player.chargeUp) player.vx = player.slideVx; // horizontal: hold speed constant
      if (keys['KeyF'] && player.chargeFuel > 0) {
        player.chargeFuel = Math.max(0, player.chargeFuel - 1 / (60 * 2.5)); // drains over ~2.5s at full fuel
      } else {
        player.sliding  = false;
        player.chargeUp = false;
      }
    } else {
      if (justPressed['KeyF'] && player.chargeFuel > 0) {
        player.sliding  = true;
        if (keys['ArrowUp']) {
          player.chargeUp = true;
          player.vy       = -(player.speed * 3.5); // strong upward burst
          player.slideVx  = player.facing * player.speed * 0.8; // slight horizontal carry
        } else {
          player.chargeUp = false;
          player.slideVx  = player.facing * player.speed * 3.5; // strong horizontal
        }
        SoundManager.playCharge();
      }
    }
  } else {
    // Gollum: crouch (hold Down) + slide (Down while running)
    if (player.sliding) {
      player.slideTimer -= 1 / 60;
      player.slideVx   *= 0.88;
      player.vx         = player.slideVx;
      player.height     = player.crouchHeight;
      if (player.slideTimer <= 0) {
        player.sliding   = false;
        player.crouching = keys['ArrowDown'];
        if (!player.crouching) player.height = player.normalHeight;
      }
    } else if (player.isOnGround) {
      const wantCrouch = keys['ArrowDown'];
      const wasRunning = Math.abs(player.vx) > player.speed * 0.5;
      if (justPressed['ArrowDown'] && wasRunning) {
        player.sliding    = true;
        player.slideTimer = 0.30;
        player.slideVx    = player.vx * 1.3;
        player.crouching  = false;
        player.height     = player.crouchHeight;
      } else if (wantCrouch && !player.crouching) {
        player.crouching = true;
        player.y        += player.normalHeight - player.crouchHeight; // keep feet planted
        player.height    = player.crouchHeight;
      } else if (!wantCrouch && player.crouching) {
        player.crouching = false;
        player.y        -= player.normalHeight - player.crouchHeight;
        player.height    = player.normalHeight;
      }
    }
  }

  // --- Horizontal input (inertia) ---
  // vx lerps toward the target speed; separate rates for accelerating vs stopping
  const maxVx = (!isHogman && player.crouching) ? player.speed * 0.35 : player.speed;
  let targetVx = 0;
  if (!player.sliding) {
    if (keys['ArrowLeft'])  { targetVx = -maxVx; player.facing = -1; }
    if (keys['ArrowRight']) { targetVx =  maxVx; player.facing =  1; }
  }
  if (!player.sliding) {
    const moveRate = targetVx !== 0 ? 0.45 : 0.55;
    player.vx += (targetVx - player.vx) * moveRate;
    if (Math.abs(player.vx) < 0.1) player.vx = 0;
  }

  // --- Jump (coyote time: jump allowed for a few frames after walking off a ledge) ---
  const canJump = (player.isOnGround || player.coyoteFrames > 0) && !player.crouching && !player.sliding;
  const wantJump = justPressed['Space'] || justPressed['ArrowUp'];
  if (wantJump && canJump) {
    player.vy           = -player.jumpForce;
    player.isOnGround   = false;
    player.isJumping    = true;
    player.jumpHeld     = true;
    player.coyoteFrames = 0;
    SoundManager.playJump();
  } else if (wantJump && !player.isOnGround && !canJump && player.airJumpsLeft > 0) {
    // Gollum double-jump
    player.vy              = -player.jumpForce;
    player.doubleJumpFlash = 0.25;
    player.jumpHeld        = true;
    player.airJumpsLeft--;
    SoundManager.playJump();
  }

  // --- Variable jump: release early for short hop, hold for full arc ---
  if (player.jumpHeld && player.vy < 0 && !(keys['Space'] || keys['ArrowUp'])) {
    player.vy       *= 0.45;
    player.jumpHeld  = false;
  }
  if (player.vy >= 0) player.jumpHeld = false;

  // --- Gravity (reduced while holding jump on ascent) ---
  const gravMult = (player.jumpHeld && player.vy < 0) ? 0.4 : 1;
  player.vy = Math.min(player.vy + GRAVITY * gravMult, TERMINAL_VEL);

  // --- Apply velocity ---
  player.x += player.vx;
  player.y += player.vy;

  // --- Horizontal level bounds ---
  // Left wall: locked to viewport edge once boss is fighting
  const arenaLocked = boss && boss.alive && boss.arenaLeft !== null && boss.state !== 'drinking' && boss.state !== 'waking';
  const leftBound   = arenaLocked ? boss.arenaLeft : 0;
  // Right bound: removed after boss dies so player can run off screen
  const rightBound  = (!boss || !boss.alive) ? Infinity : LEVEL_WIDTH - player.width;
  player.x = Math.max(leftBound, Math.min(player.x, rightBound));

  // --- Platform collisions ---
  player.isOnGround = false;
  for (const plat of platforms) {
    resolvePlatformCollision(player, plat);
  }
  // --- Coyote time tracking ---
  // Reset window when grounded; count down when airborne so the window expires naturally
  if (player.isOnGround) {
    player.coyoteFrames  = 6;
    // Restore Gollum air-jump on landing
    if (gameState.selectedCharacter === 'gollum') player.airJumpsLeft = 1;
  } else if (player.coyoteFrames > 0) {
    player.coyoteFrames--;
  }

  // --- Fallback ground plane (only used before Chunk 6 platforms are loaded) ---
  if (platforms.length === 0 && player.y + player.height >= GROUND_Y) {
    player.y        = GROUND_Y - player.height;
    player.vy       = 0;
    player.isOnGround = true;
    player.isJumping  = false;
  }

  // --- Invincibility countdown ---
  if (player.invincibleTimer > 0) player.invincibleTimer -= 1 / 60;
  if (player.ringTimer       > 0) player.ringTimer       -= 1 / 60;

  // --- Power-up countdowns ---
  if (player.doubleJumpFlash  > 0) player.doubleJumpFlash  -= 1 / 60;

  // --- Fell into a pit — lose a life and respawn ---
  if (player.y > canvas.height + 60) {
    if (player.invincibleTimer <= 0) {
      player.lives--;
      SoundManager.playHit();
      camera.shakeFrames = 20;
      if (player.lives <= 0) {
        SoundManager.stopMusic();
        player.dying = true; player.vy = -8; player.vx = 0;
        return;
      }
    }
    player.x             = 80;
    player.y             = GROUND_Y - player.height;
    player.vx            = 0;
    player.vy            = 0;
    player.chargeFuel    = 0;
    player.invincibleTimer = 2.0;
    camera.x             = 0;
    collectibles.forEach(c => { c.collected = false; });
  }

  // --- Camera ---
  const cameraLeftMin = (arenaLocked && boss.arenaLeft !== null) ? boss.arenaLeft : 0;
  camera.x = Math.max(cameraLeftMin, Math.min(player.x - 300, LEVEL_WIDTH - canvas.width));

  // Record actual bottom position for next frame's collision check (height may change mid-frame)
  player.prevBottom = player.y + player.height;
}

// Solid platform collision — blocks landing on top and jumping up through the underside
function resolvePlatformCollision(p, plat) {
  // Quick horizontal rejection
  if (p.x + p.width <= plat.x || p.x >= plat.x + plat.width) return;

  // Where was the player's bottom the previous frame?
  // Use the explicitly tracked value so height changes (crouch/slide end) don't corrupt it.
  const prevBottom = (p.prevBottom !== undefined) ? p.prevBottom : (p.y + p.height - p.vy);

  if (
    p.vy >= 0 &&                      // falling
    prevBottom <= plat.y + 1 &&       // was above (or flush with) platform top
    p.y + p.height >= plat.y          // now overlapping
  ) {
    p.y          = plat.y - p.height;
    p.vy         = 0;
    p.isOnGround = true;
    p.isJumping  = false;
  } else if (
    p.vy < 0 &&                             // rising
    p.y - p.vy >= plat.y + plat.height - 1 && // prev top was at or below platform underside
    p.y < plat.y + plat.height              // current top has entered the platform from below
  ) {
    p.y  = plat.y + plat.height;            // push head to just below the platform
    p.vy = 0;
  }
}

// ---------------------------------------------------------------------------
// In-game player drawing (simpler than character-select silhouettes)
// ---------------------------------------------------------------------------

function drawPlayerInGame() {
  if (!player) return;
  ctx.save();
  if (player.ringTimer > 0) ctx.globalAlpha = 0.38;

  // Death crumple — draw sprite as-is, no rotation
  if (player.dying) {
    if (gameState.selectedCharacter === 'hogman') drawHogmanInGame(player.x, player.y, player.width, player.height);
    else                                           drawGollumInGame(player.x, player.y, player.width, player.height);
    ctx.restore();
    return;
  }

  // Flash every ~8 frames while invincible (ring overrides — stays translucent instead)
  if (player.invincibleTimer > 0 && player.ringTimer <= 0 &&
      Math.floor(player.invincibleTimer * 60) % 16 < 8) { ctx.restore(); return; }

  ctx.save();

  // Flip horizontally when facing left
  if (player.facing === -1) {
    ctx.translate(player.x + player.width / 2, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(player.x + player.width / 2), 0);
  }

  if (gameState.selectedCharacter === 'hogman') {
    drawHogmanInGame(player.x, player.y, player.width, player.height);
  } else {
    drawGollumInGame(player.x, player.y, player.width, player.height);
  }

  ctx.restore();

  if (gameState.selectedCharacter === 'gollum' && player.doubleJumpFlash > 0) {
    const t   = player.doubleJumpFlash / 0.25; // 1.0 → 0.0
    const pcx = player.x + player.width  / 2;
    const pcy = player.y + player.height / 2;
    const r   = 8 + (1 - t) * 40;   // blooms from 8px → 48px
    const a   = t * 0.85;            // fades 0.85 → 0
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#aaddff';
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.arc(pcx, pcy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore(); // outer ring-translucency save
}

// Hogman: hog mount + rider body + head + hat
function drawHogmanInGame(x, y, w, h) {
  // Gas cloud during a charge — sprite if loaded, green lines as fallback
  if (player && player.sliding) {
    if (SpriteLoader.ready('hogman_charge_gas')) {
      const sz2    = SpriteLoader.size('hogman_charge_gas');
      const cloudH = h * 1.7;
      const cloudW = sz2 ? (sz2.w / sz2.h) * cloudH : cloudH;
      if (player.chargeUp) {
        // Dedicated jump asset — wider, shorter than the horizontal cloud
        const jumpW = cloudW * 1.5;
        const jumpH = cloudH * 0.65;
        SpriteLoader.blit('hogman_charge_gas_jump', x + w / 2 - jumpW / 2, y + h, jumpW, jumpH);
      } else {
        // Trailing behind, nested closer — parent ctx handles the facing flip
        SpriteLoader.blit('hogman_charge_gas', x - cloudW + w * 0.45, y + h / 2 - cloudH / 2, cloudW, cloudH);
      }
    } else {
      // Fallback: green lines
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = '#77dd11';
      ctx.lineCap = 'round';
      if (player.chargeUp) {
        for (let i = 0; i < 5; i++) {
          const lx  = x + w * (0.15 + i * 0.175);
          const len = 14 + i * 11;
          ctx.lineWidth = 2.5 - i * 0.35;
          ctx.beginPath();
          ctx.moveTo(lx, y + h);
          ctx.lineTo(lx, y + h + len);
          ctx.stroke();
        }
      } else {
        const backEdge = player.facing === 1 ? x : x + w;
        for (let i = 0; i < 5; i++) {
          const ly  = y + h * (0.22 + i * 0.13);
          const len = 16 + i * 14;
          ctx.lineWidth = 2.5 - i * 0.35;
          ctx.beginPath();
          ctx.moveTo(backEdge, ly);
          ctx.lineTo(backEdge - player.facing * len, ly);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  const sprKey = (player && player.dying) ? 'hogman_death'
               : (player && Math.abs(player.vx) > 0.1) ? 'hogman_run' : 'hogman_idle';
  const sz = SpriteLoader.size(sprKey);
  if (sz) {
    let drawW, drawH, drawY;
    if (sprKey === 'hogman_idle') {
      // Idle: scale up to match run sprite visual size, feet kept at same ground position
      drawH = h * 1.3;
      drawW = (sz.w / sz.h) * drawH;
      drawY = y + h + 18 - drawH; // anchor bottom — sprite grows upward
    } else {
      // Run: contain-fit scaled up, bottom-aligned
      const scale = Math.min(w / sz.w, h / sz.h) * 1.55;
      drawW = sz.w * scale;
      drawH = sz.h * scale;
      drawY = y + h - drawH + 32;
    }
    SpriteLoader.blit(sprKey, x, drawY, drawW, drawH);
    return;
  }
  ctx.fillStyle = '#8b5e2a';
  ctx.fillRect(x, y, w, h);
}

// Gollum Man: hunched pale body + knuckle-walking arm + head + glasses
function drawGollumInGame(x, y, w, h) {
  let sprKey;
  if (player && player.invincibleTimer > 0) {
    sprKey = 'gollum_hurt';
  } else if (player && (player.crouching || player.sliding)) {
    sprKey = 'gollum_crouching';
  } else if (player && !player.isOnGround) {
    sprKey = 'gollum_jump';
  } else if (player && Math.abs(player.vx) > 0.1) {
    sprKey = 'gollum_run';
  } else {
    sprKey = 'gollum_idle';
  }
  if (SpriteLoader.ready(sprKey)) {
    // Render at Hogman-equivalent visual height regardless of Gollum's smaller hitbox,
    // bottom-aligned to the player's feet (y + h).
    const VISUAL_H = 92;
    const sz = SpriteLoader.size(sprKey);
    const drawH = VISUAL_H;
    const drawW = sz ? (sz.w / sz.h) * drawH : drawH;
    const drawX = x + (w - drawW) / 2; // horizontally centre on hitbox
    // Each sprite has different transparent padding at the bottom of the 1024px source image.
    // Idle/run: ~177px gap → ~16px at VISUAL_H=92, offset 14 keeps feet grounded.
    // Crouching: ~261px gap → ~24px at VISUAL_H=92, needs offset 22 to stay grounded.
    const sinkOffset = (sprKey === 'gollum_crouching') ? 22 : 14;
    const drawY = y + h - drawH + sinkOffset;

    SpriteLoader.blit(sprKey, drawX, drawY, drawW, drawH);
    return;
  }

  ctx.fillStyle = '#8a9a7a';
  ctx.fillRect(x, y, w, h);
}

// ---------------------------------------------------------------------------
// CHUNK 6 — Background layers, platform styling, White Castle
// ---------------------------------------------------------------------------

// Cached sky colour sampled from the top of bg_green_hills.png
let _hillsSkyColor = null;
function getHillsSkyColor() {
  if (_hillsSkyColor) return _hillsSkyColor;
  const img = SpriteLoader.getImg('tile_bg_green_hills');
  if (!img) return '#8ab4c8'; // fallback until image loads
  try {
    // Sample the top 15% of the image at reduced size, then pick the brightest pixel
    // — this naturally lands on a cloud or sky highlight rather than a dark area
    const sampleW = Math.min(img.naturalWidth, 128);
    const sampleH = Math.max(1, Math.floor(img.naturalHeight * 0.15));
    const oc = document.createElement('canvas');
    oc.width = sampleW; oc.height = sampleH;
    const octx = oc.getContext('2d');
    octx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight * 0.15, 0, 0, sampleW, sampleH);
    const data = octx.getImageData(0, 0, sampleW, sampleH).data;
    let maxL = -1, bestR = 138, bestG = 180, bestB = 200;
    for (let i = 0; i < data.length; i += 4) {
      const l = data[i] + data[i + 1] + data[i + 2]; // sum as brightness proxy
      if (l > maxL) { maxL = l; bestR = data[i]; bestG = data[i + 1]; bestB = data[i + 2]; }
    }
    _hillsSkyColor = `rgb(${bestR},${bestG},${bestB})`;
  } catch (e) {
    _hillsSkyColor = '#8ab4c8'; // CORS fallback
  }
  return _hillsSkyColor;
}

function drawSky() {
  ctx.fillStyle = getHillsSkyColor();
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Drawn in parallax space with ctx already translated by -camera.x * 0.2
function drawBgMountains() {
  const BASE = GROUND_Y + 5;

  // Back layer — dark purple silhouettes
  const BACK = [
    [-150,180,140],[80,130,110],[250,200,160],[460,150,125],[640,195,150],
    [840,120,100],[970,235,175],[1190,155,130],[1360,100,85],
    [1460,210,160],[1640,145,115],[1800,175,140],[1990,115,95],
  ]; // [cx, h, halfWidth]
  ctx.fillStyle = '#1a1428';
  BACK.forEach(([x, h, hw]) => {
    ctx.beginPath();
    ctx.moveTo(x - hw, BASE);
    ctx.lineTo(x, BASE - h);
    ctx.lineTo(x + hw, BASE);
    ctx.closePath();
    ctx.fill();
  });

  // Front layer — slightly lighter, closer
  const FRONT = [
    [-60,90,80],[130,110,90],[320,75,65],[510,100,85],[700,85,75],
    [880,115,95],[1060,80,70],[1240,105,88],[1420,70,62],[1580,95,82],[1730,85,74],
  ];
  ctx.fillStyle = '#22183a';
  FRONT.forEach(([x, h, hw]) => {
    ctx.beginPath();
    ctx.moveTo(x - hw, BASE);
    ctx.lineTo(x, BASE - h);
    ctx.lineTo(x + hw, BASE);
    ctx.closePath();
    ctx.fill();
  });
}

// Drawn in parallax space with ctx already translated by -camera.x * 0.5
function drawBgTrees() {
  const BASE = GROUND_Y;
  // [x, height, crownRadius]
  const TREES = [
    [50,85,26],[120,70,22],[195,100,30],[280,75,23],[360,95,28],[440,65,20],
    [510,90,27],[580,75,24],[660,105,32],[740,80,25],[820,70,22],[900,95,29],
    [975,85,26],[1050,75,23],[1130,100,30],[1210,65,20],[1290,90,28],
    [1370,80,25],[1450,95,29],[1530,70,22],[1610,85,26],[1690,100,31],
    [1770,75,24],[1850,90,27],[1930,80,25],[2010,95,29],[2090,70,22],
    [2170,85,26],[2250,100,30],[2330,75,23],[2410,90,28],[2490,65,21],[2560,85,26],
  ];
  ctx.fillStyle = '#0d0800';
  TREES.forEach(([tx, th, cr]) => {
    // Trunk
    ctx.fillRect(tx - 5, BASE - th * 0.45, 10, th * 0.45);
    // Foliage — three overlapping circles
    ctx.beginPath(); ctx.arc(tx,              BASE - th * 0.52, cr,        0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(tx - cr * 0.35,  BASE - th * 0.68, cr * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(tx + cr * 0.3,   BASE - th * 0.64, cr * 0.65, 0, Math.PI * 2); ctx.fill();
  });
}

// ---------------------------------------------------------------------------
// CHUNK 8 — Enemies: patrol, collision, drawing, lives system, Game Over
// ---------------------------------------------------------------------------

function updateEnemies() {
  for (const e of enemies) {
    if (!e.alive) continue;
    e.x += e.speed * e.dir;
    // Reverse at patrol bounds
    if (e.x <= e.startX) {
      e.x   = e.startX;
      e.dir = 1;
    }
    if (e.x + e.width >= e.startX + e.patrolRange) {
      e.x   = e.startX + e.patrolRange - e.width;
      e.dir = -1;
    }
  }
}

function checkEnemyCollisions() {
  if (!player || player.dying) return;

  for (const e of enemies) {
    if (!e.alive) continue;

    // AABB overlap check
    if (player.x + player.width  <= e.x ||
        player.x                  >= e.x + e.width  ||
        player.y + player.height  <= e.y ||
        player.y                  >= e.y + e.height) continue;

    // Stomp: player falling, and player's bottom was above enemy top last frame
    const prevPlayerBottom = player.y + player.height - player.vy;
    if (player.vy > 0 && prevPlayerBottom <= e.y + 8) {
      e.alive            = false;
      player.vy          = -7;  // bounce
      camera.shakeFrames = 12;
      SoundManager.playDefeat();
    } else if (player.sliding && gameState.selectedCharacter === 'hogman') {
      // Hogman charge — destroys enemy on contact, no damage to player
      e.alive            = false;
      camera.shakeFrames = 8;
      SoundManager.playDefeat();
    } else if (gameState.selectedCharacter === 'gollum' && (player.crouching || player.sliding)) {
      // Gollum sneak — crouching or sliding squeezes past, enemy unaware
    } else if (player.invincibleTimer <= 0 && player.ringTimer <= 0) {
      // Side/head-on hit — lose a life
      player.lives--;
      player.invincibleTimer = 2.0;
      SoundManager.playHit();
      camera.shakeFrames = 20;
      if (player.lives <= 0) {
        SoundManager.stopMusic();
        player.dying = true; player.vy = -8; player.vx = 0;
      }
    }
  }
}

function drawCrow(x, y, w, h, dir) {
  ctx.save();
  if (dir === 1) {
    ctx.translate(x + w / 2, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(x + w / 2), 0);
  }
  if (SpriteLoader.blit('enemy_crow', x, y, w, h)) { ctx.restore(); return; }
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawEnemies() {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.type === 'crow') {
      const bob = Math.sin(elapsed * 4 + e.startX * 0.05) * 4;
      drawCrow(e.x, e.y + bob, e.width, e.height, e.dir);
    }
  }
}

// ---------------------------------------------------------------------------
// POND BRUTE BOSS
// ---------------------------------------------------------------------------

function initBoss() {
  // Troll drinks at far right. drinkW/drinkH = crouched sprite dims.
  // standW/standH = upright fight dims.
  boss = {
    // tile_troll.png is 1024×1024 with ~20% padding top+bottom.
    // Visual base sits at 80.4% of image height, so y offset = height * 0.804.
    x:          8250 + LEVEL_PREAMBLE,
    y:          GROUND_Y - Math.round(150 * 0.804),  // anchors to ground
    width:      150,   // drinking pose — square source (1024×1024)
    height:     150,
    standW:     161,   // upright pose width  (825/1024 × standH)
    standH:     200,   // upright pose height
    hp: 5, maxHp: 5,
    arenaLeft:   null,         // set to camera.x when boss wakes
    state:            'drinking',  // 'drinking'|'waking'|'lapping'|'charging'|'attacking'|'recovering'
    stateTimer:       0,
    dir:              -1,   // faces left toward player
    phase:            1,
    chargeCount:      0,
    standingUp:       false,  // true once we've swapped to standing dims mid-waking
    attackSalvoTimer: 0,      // countdown between beam salvos in 'attacking' state
    alive:            true,
  };
  projectiles    = [];
  tacoRainTimer  = 5 + Math.random() * 3; // first taco drops 5–8 s into the fight
}

function fireBeams() {
  if (!boss || !player) return;
  const handY     = boss.y + boss.height * 0.18;
  const greenOffX = boss.dir === 1 ? boss.width * 0.88 : boss.width * 0.12;
  const redOffX   = boss.dir === 1 ? boss.width * 0.12 : boss.width * 0.88;
  const gx = boss.x + greenOffX;
  const rx = boss.x + redOffX;
  const tx = player.x + player.width  / 2;
  const ty = player.y + player.height / 2;
  const shoot = (ox, oy, color) => {
    const dx   = tx - ox, dy = ty - oy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    projectiles.push({ x: ox, y: oy, vx: dx / dist * 10, vy: dy / dist * 10, alive: true, color, isBeam: true });
  };
  shoot(gx, handY,     '#00ff66');
  shoot(rx, handY,     '#ff3333');
  shoot(gx, handY + 6, '#00ff66');
  shoot(rx, handY + 6, '#ff3333');
}

function updateBoss() {
  if (!boss || !boss.alive) return;
  const dt = 1 / 60;

  // Arena left / right bounds for the fight
  const arenaRight = LEVEL_WIDTH - 20;

  // ── Drinking idle — wait for player to enter arena ──────────────────────
  if (boss.state === 'drinking') {
    if (player && player.x >= BOSS_ARENA_LEFT) {
      // Player crossed the threshold — troll notices
      // Lock the arena to the current viewport edges
      boss.arenaLeft  = camera.x;
      boss.state      = 'waking';
      boss.stateTimer = 5.0;
    }
    return;
  }

  // ── Waking — troll stands up, then immediately attacks ──────────────────
  if (boss.state === 'waking') {
    boss.stateTimer -= dt;
    // At the 2.5s mark switch to standing dimensions so the sprite swap
    // happens mid-waking with no abrupt position jump at state end.
    if (!boss.standingUp && boss.stateTimer < 2.5) {
      boss.width      = boss.standW;
      boss.height     = boss.standH;
      boss.y          = GROUND_Y - boss.standH;
      boss.standingUp = true;
    }
    if (boss.stateTimer <= 0) {
      // First action: an attack salvo before chasing begins
      boss.state            = 'attacking';
      boss.stateTimer       = 3.5;
      boss.attackSalvoTimer = 0;   // fire first salvo immediately
    }
    return;
  }

  // Phase 2 threshold
  if (boss.phase === 1 && boss.hp <= boss.maxHp / 2) {
    boss.phase = 2;
  }

  const chargeSpeed = boss.phase === 2 ? 5.5 : 3.5;

  if (boss.state === 'lapping') {
    boss.stateTimer -= dt;
    if (boss.stateTimer <= 0) {
      if (Math.random() < 0.25) {
        // Spontaneous crouch — vulnerable window without a charge first
        boss.chargeCount = 0;
        boss.width       = 150;
        boss.height      = 150;
        boss.y           = GROUND_Y - Math.round(150 * 0.804);
        boss.state       = 'crouching';
        boss.stateTimer  = 1.8 + Math.random() * 1.4; // 1.8–3.2s
      } else {
        boss.state = 'charging';
        boss.dir   = player && player.x < boss.x + boss.width / 2 ? -1 : 1;
      }
    }

  } else if (boss.state === 'charging') {
    boss.x += chargeSpeed * boss.dir;
    const hitWall = boss.x <= boss.arenaLeft || boss.x + boss.width >= arenaRight;
    if (hitWall) {
      boss.x  = boss.x <= boss.arenaLeft ? boss.arenaLeft : arenaRight - boss.width;
      boss.dir = boss.x <= boss.arenaLeft ? 1 : -1;
      boss.chargeCount++;
      // After 1st bounce: 55% chance to crouch. After 2nd: always crouch.
      const shouldCrouch = boss.chargeCount >= 2 || Math.random() < 0.55;
      if (shouldCrouch) {
        boss.chargeCount = 0;
        boss.width       = 150;
        boss.height      = 150;
        boss.y           = GROUND_Y - Math.round(150 * 0.804);
        boss.state       = 'crouching';
        boss.stateTimer  = 1.8 + Math.random() * 1.4; // 1.8–3.2s
      } else {
        boss.state      = 'lapping';
        boss.stateTimer = 1.5 + Math.random() * 0.8;  // 1.5–2.3s
      }
    }

  } else if (boss.state === 'attacking') {
    boss.stateTimer       -= dt;
    boss.attackSalvoTimer -= dt;
    if (boss.attackSalvoTimer <= 0) {
      boss.attackSalvoTimer = 1.4;  // new salvo every 1.4s
      fireBeams();
    }
    if (boss.stateTimer <= 0) {
      boss.state      = 'lapping';
      boss.stateTimer = 1.5;
    }

  } else if (boss.state === 'recovering') {
    boss.stateTimer -= dt;
    if (boss.stateTimer <= 0) {
      // Stand back up, then resume
      boss.width      = boss.standW;
      boss.height     = boss.standH;
      boss.y          = GROUND_Y - boss.standH;
      boss.state      = 'lapping';
      boss.stateTimer = 2.0;
    }

  } else if (boss.state === 'crouching') {
    boss.stateTimer -= dt;
    if (boss.stateTimer <= 0) {
      // Stand back up, resume attacking
      boss.width            = boss.standW;
      boss.height           = boss.standH;
      boss.y                = GROUND_Y - boss.standH;
      boss.state            = 'attacking';
      boss.stateTimer       = 3.5;
      boss.attackSalvoTimer = 0;
    }
  }
}

function checkBossCollision() {
  if (!boss || !boss.alive || !player || player.dying) return;

  // AABB overlap check
  if (player.x + player.width  <= boss.x ||
      player.x                  >= boss.x + boss.width  ||
      player.y + player.height  <= boss.y ||
      player.y                  >= boss.y + boss.height) return;

  const prevPlayerBottom = player.y + player.height - player.vy;

  if (player.vy > 0 && prevPlayerBottom <= boss.y + 8) {
    // Stomp
    if (boss.state === 'crouching') {
      // Vulnerable — take damage and stand back up
      boss.hp--;
      player.vy = -9;
      SoundManager.playDefeat();
      if (boss.hp <= 0) {
        boss.alive = false;
      } else {
        // Stay crouched briefly so player can get clear before boss stands up
        boss.state      = 'recovering';
        boss.stateTimer = 1.2;
      }
    } else {
      player.vy = -7; // bounce off — not vulnerable right now
    }
  } else if (player.sliding && gameState.selectedCharacter === 'hogman') {
    // Hogman charge — damages boss if vulnerable, bounces otherwise
    if (boss.state === 'crouching') {
      boss.hp--;
      SoundManager.playDefeat();
      camera.shakeFrames = 18;
      if (boss.hp <= 0) {
        boss.alive = false;
      } else {
        boss.state      = 'recovering';
        boss.stateTimer = 1.2;
      }
    }
    // End the charge and knock Hogman back; invincibility prevents immediate follow-up hit
    player.sliding        = false;
    player.vx             = -player.facing * 5;
    player.invincibleTimer = 0.5;
  } else if (player.invincibleTimer <= 0 && player.ringTimer <= 0) {
    // Side hit
    player.lives--;
    player.invincibleTimer = 2.0;
    SoundManager.playHit();
    camera.shakeFrames = 20;
    if (player.lives <= 0) {
      SoundManager.stopMusic();
      player.dying = true; player.vy = -8; player.vx = 0;
    }
  }
}


function drawTrollSign() {
  const SIGN_W = 80, SIGN_H = 120;
  const sx = BOSS_ARENA_LEFT - 400;
  const sy = GROUND_Y - SIGN_H + 16;
  if (SpriteLoader.ready('troll_sign')) {
    SpriteLoader.blit('troll_sign', sx, sy, SIGN_W, SIGN_H);
  } else {
    // Fallback: brown post + dark sign board
    ctx.fillStyle = '#6b3a10';
    ctx.fillRect(sx + 35, sy + 60, 10, 60);
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(sx, sy, SIGN_W, 55);
  }
}

function drawBoss() {
  if (!boss) return;

  // Draw defeat sprite while player runs off screen after kill
  if (!boss.alive) {
    const dw = boss.standW, dh = boss.standH;
    const dx = boss.x, dy = GROUND_Y - dh + 55;
    if (!SpriteLoader.blit('troll_defeat', dx, dy, dw, dh)) {
      ctx.fillStyle = '#5a2a0a';
      ctx.fillRect(dx, dy, dw, dh);
    }
    return;
  }

  const {x, y, width: w, height: h, state: bs} = boss;

  const drinking = bs === 'drinking' || bs === 'crouching' || bs === 'recovering' || (bs === 'waking' && !boss.standingUp);
  const sprKey   = drinking      ? 'troll_drink'
                 : bs === 'attacking' ? 'troll_attack'
                 : 'troll_stand';

  ctx.save();

  // Flip horizontally when facing right (for standing states)
  if (!drinking && boss.dir === 1) {
    ctx.translate(x + w / 2, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(x + w / 2), 0);
  }

  if (!SpriteLoader.blit(sprKey, x, y, w, h)) {
    // Fallback block
    ctx.fillStyle = drinking ? '#4a7a3a' : '#8b4a1a';
    ctx.fillRect(x, y, w, h);
  }

  // Flash red only in the last second of waking (ominous ramp-up).
  // Composited through an offscreen canvas so the tint follows the sprite shape
  // rather than filling the whole bounding box.
  if (bs === 'waking' && boss.stateTimer < 1.0) {
    const flash = 0.25 + 0.25 * Math.sin(elapsed * 18);
    const img = SpriteLoader.getImg(sprKey);
    if (img) {
      const ofc = new OffscreenCanvas(w, h);
      const ofCtx = ofc.getContext('2d');
      ofCtx.drawImage(img, 0, 0, w, h);
      ofCtx.globalCompositeOperation = 'source-atop';
      ofCtx.fillStyle = `rgba(200,50,50,${flash})`;
      ofCtx.fillRect(0, 0, w, h);
      ctx.drawImage(ofc, x, y);
    } else {
      ctx.fillStyle = `rgba(200,50,50,${flash})`;
      ctx.fillRect(x, y, w, h);
    }
  }

  ctx.restore();
}

function drawBossHPBar() {
  if (!boss || !boss.alive || !player) return;
  if (!boss.arenaLeft) return;
  const W = canvas.width;
  const barW = 320, barH = 16;
  const barX = (W - barW) / 2;
  const barY = 18;
  ctx.fillStyle = '#3a1a0a';
  ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
  ctx.fillStyle = '#cc1a1a';
  ctx.fillRect(barX, barY, barW * (boss.hp / boss.maxHp), barH);
  ctx.strokeStyle = '#7a3a1a';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barW, barH);
  ctx.fillStyle = '#ffffff';
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 4;
  ctx.fillText('THE TILE TROLL', W / 2, barY + barH / 2);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}



function updateProjectiles() {
  if (!player || player.dying) return;
  for (const p of projectiles) {
    if (!p.alive) continue;
    p.vy += 0.35;
    p.x  += p.vx;
    p.y  += p.vy;
    if (p.x < -200 || p.x > LEVEL_WIDTH + 200 || p.y > 600) { p.alive = false; continue; }
    const chargingHogman = player.sliding && gameState.selectedCharacter === 'hogman';
    if (player.invincibleTimer <= 0 && player.ringTimer <= 0 && !chargingHogman &&
        p.x + 4 > player.x && p.x - 4 < player.x + player.width &&
        p.y + 4 > player.y && p.y - 4 < player.y + player.height) {
      p.alive = false;
      player.lives--;
      player.invincibleTimer = 2.0;
      SoundManager.playHit();
      camera.shakeFrames = 20;
      if (player.lives <= 0) { SoundManager.stopMusic(); player.dying = true; player.vy = -8; player.vx = 0; }
    }
  }
  for (let i = projectiles.length - 1; i >= 0; i--) {
    if (!projectiles[i].alive) projectiles.splice(i, 1);
  }
}

function drawProjectiles() {
  for (const p of projectiles) {
    if (!p.alive) continue;
    ctx.save();
    const spd      = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
    const nx       = p.vx / spd, ny = p.vy / spd;
    const trailLen = 28;
    const tx       = p.x - nx * trailLen, ty = p.y - ny * trailLen;
    // Outer glow
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty);
    ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.strokeStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 18;
    ctx.stroke();
    // White core
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty);
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.shadowBlur = 6;
    ctx.stroke();
    // Tip orb
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 10; ctx.fill();
    ctx.restore();
  }
}

function drawGameOver() {
  const { MID, H } = drawInterstitialPanel('YOU CHOSE', 'A LOSER');

  // ── RIGHT PANEL: menu options centred ─────────────────────────────────
  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  const cx = MID + MID / 2;

  const LABELS     = [['TRY HARDER'], ['CHOOSE A', 'DIFFERENT LOSER']];
  const FONT_SIZE  = 12;
  const LINE_H     = FONT_SIZE + 8;   // spacing between wrapped lines within one option
  const menuRowH   = 70;              // gap between the two options
  const menuStartY = H * 0.44;

  LABELS.forEach((lines, i) => {
    const oy  = menuStartY + i * menuRowH;
    const sel = (i === gameOverMenuIndex);
    ctx.shadowColor = sel ? 'rgba(255,200,50,0.8)' : 'rgba(0,0,0,0.8)';
    ctx.shadowBlur  = sel ? 12 : 4;
    ctx.fillStyle   = sel ? '#ffd84a' : '#7a6030';
    ctx.font        = `${FONT_SIZE}px "Press Start 2P", monospace`;

    lines.forEach((line, li) => {
      ctx.fillText(line, cx, oy + li * LINE_H);
    });

    // Bouncing arrow — just to the left of the text block
    if (sel) {
      const bounce   = Math.sin(elapsed * 5) * 3;
      const blockW   = Math.max(...lines.map(l => ctx.measureText(l).width));
      ctx.textAlign  = 'left';
      ctx.shadowBlur = 14;
      ctx.fillText('▶', cx - blockW / 2 - 22, oy + bounce);
      ctx.textAlign  = 'center';
    }
  });

  ctx.restore();
}

// ---------------------------------------------------------------------------
// CHUNK 11 — Level Complete screen
// ---------------------------------------------------------------------------

// Scrolling flavour lines for the level complete right panel
const LEVEL_COMPLETE_LINES = [
  'THE TILE TROLL IS SLAIN',
  '',
  'Thou hast bested the Tile Troll',
  'and emerged reeking of pond water',
  'and misguided heroism.',
  '',
  'The nobles of the land whisper',
  'thy name... mostly in confusion.',
  '',
  'Press ENTER',
  'to continue thy shameful quest.',
];

const LEVEL2_COMPLETE_LINES = [
  'ONWARD',
  '',
  'The forest ends abruptly,',
  'as forests often do when',
  "they've made their point.",
  '',
  'Ahead: a city. Loud, crooked,',
  'and absolutely teeming with',
  'people who have no idea',
  'what a Hogman is.',
  '',
  'Somewhere in this mess',
  'lives a wizard. He knows',
  'where the lamp is. Probably.',
  'He seemed very confident',
  'in his letter, which was',
  'written in gravy.',
  '',
  'The hog snorts.',
  'The Gollum Man licks',
  'a cobblestone.',
  '',
  'Time to find a wizard.',
  '',
  'Press ENTER',
  'to continue your quest.',
];

function drawInterstitialPanel(heading1, heading2) {
  const W = canvas.width, H = canvas.height;
  const MID = 520;

  // Background: two full-size intro_screen copies side by side
  if (SpriteLoader.ready('intro_screen')) {
    SpriteLoader.blit('intro_screen', 0,   0, MID, H);
    SpriteLoader.blit('intro_screen', MID, 0, MID, H);
  } else {
    ctx.fillStyle = '#1a0e06';
    ctx.fillRect(0, 0, W, H);
  }

  // Gold divider
  ctx.save();
  ctx.strokeStyle = 'rgba(180,140,60,0.7)';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(MID, 24);
  ctx.lineTo(MID, H - 24);
  ctx.stroke();
  ctx.restore();

  // ── LEFT PANEL: heading + character ───────────────────────────────────
  const isHogman = gameState.selectedCharacter === 'hogman';
  const sprKey   = isHogman ? 'hogman_idle' : 'gollum_idle';
  const lcx      = MID / 2;

  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(180,0,0,0.55)';
  ctx.shadowBlur   = 14;
  ctx.fillStyle    = '#cc2200';

  ctx.font = '11px "Press Start 2P", monospace';
  ctx.fillText(heading1, lcx, H * 0.20);

  ctx.font = '18px "Press Start 2P", monospace';
  const h2Y = H * 0.20 + 32;
  ctx.fillText(heading2, lcx, h2Y);

  // Underline last word of heading2
  const h2Full   = ctx.measureText(heading2).width;
  const lastWord = heading2.split(' ').pop();
  const lastW    = ctx.measureText(lastWord).width;
  const lastX    = lcx - h2Full / 2 + (h2Full - lastW);
  ctx.fillRect(lastX, h2Y + 13, lastW, 2);
  ctx.restore();

  // Portrait
  const PORT_W = 168, PORT_H = 230;
  const portX  = lcx - PORT_W / 2;
  const portY  = h2Y + 28;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(portX, portY, PORT_W, PORT_H);
  ctx.beginPath();
  ctx.rect(portX, portY, PORT_W, PORT_H);
  ctx.clip();
  const isGollum = !isHogman;
  const sprScale = isGollum ? 1.1 : 1.0;
  const sw = PORT_W * sprScale, sh = PORT_H * sprScale;
  const sx = portX + (PORT_W - sw) / 2 + (isGollum ? -4 : 0);
  const sy = portY + (PORT_H - sh) / 2;
  if (!SpriteLoader.blit(sprKey, sx, sy, sw, sh)) {
    ctx.fillStyle = isHogman ? '#8b5e2a' : '#8a9a7a';
    ctx.fillRect(portX, portY, PORT_W, PORT_H);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(180,140,60,0.85)';
  ctx.lineWidth   = 3;
  ctx.strokeRect(portX, portY, PORT_W, PORT_H);
  ctx.restore();

  return { MID, H };
}

function drawLevelComplete() {
  const { MID, H } = drawInterstitialPanel('LEVEL', 'COMPLETE');

  // ── RIGHT PANEL: scrolling flavour text ──────────────────────────────
  const cx         = MID + MID / 2;
  const PANEL_T    = 60;
  const PANEL_B    = H - 60;
  const PANEL_H    = PANEL_B - PANEL_T;
  const LINE_H     = 28;
  const lines      = currentLevel === 2 ? LEVEL2_COMPLETE_LINES : LEVEL_COMPLETE_LINES;
  // Ensure scroll goes far enough that the last line is fully visible
  const baseScroll = PANEL_T + PANEL_H - (H * 0.20 + 32);
  const MAX_SCROLL = Math.max(baseScroll, (lines.length - 1) * LINE_H + PANEL_T + LINE_H);

  // Advance scroll only until the text has reached the top
  if (levelCompleteScroll < MAX_SCROLL) levelCompleteScroll += 0.6;

  ctx.save();

  // Clip to right panel area so text doesn't bleed outside
  ctx.beginPath();
  ctx.rect(MID, PANEL_T, MID, PANEL_H);
  ctx.clip();

  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur   = 6;

  const startY = PANEL_T + PANEL_H - levelCompleteScroll;

  lines.forEach((line, i) => {
    const y = startY + i * LINE_H;
    if (y < PANEL_T - LINE_H || y > PANEL_B + LINE_H) return;

    if (i === 0) {
      ctx.font = '11px "Press Start 2P", monospace';
      const prefix    = currentLevel === 2 ? '' : 'THE TILE TROLL IS ';
      const highlight = currentLevel === 2 ? 'ONWARD' : 'SLAIN';
      const fullW     = ctx.measureText(prefix + highlight).width;
      const prefixW   = ctx.measureText(prefix).width;
      const highlightW = ctx.measureText(highlight).width;
      const startX    = cx - fullW / 2;

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd84a';
      ctx.fillText(prefix, startX, y);

      ctx.fillStyle   = '#cc2200';
      ctx.shadowColor = 'rgba(180,0,0,0.7)';
      ctx.shadowBlur  = 10;
      ctx.fillText(highlight, startX + prefixW, y);
      ctx.fillRect(startX + prefixW, y + 8, highlightW, 2); // underline

      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur  = 6;
      ctx.textAlign   = 'center';
    } else {
      ctx.font      = '9px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      const bodyColour = line === 'Press ENTER' ? '#ffffff' : '#000000';
      const wizIdx = line.toLowerCase().indexOf('wizard');
      if (wizIdx !== -1) {
        const before  = line.slice(0, wizIdx);
        const keyword = line.slice(wizIdx, wizIdx + 6);
        const after   = line.slice(wizIdx + 6);
        const totalW  = ctx.measureText(line).width;
        const beforeW = ctx.measureText(before).width;
        const keyW    = ctx.measureText(keyword).width;
        const startX  = cx - totalW / 2;
        ctx.textAlign = 'left';
        ctx.fillStyle = bodyColour;
        ctx.fillText(before, startX, y);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth   = 2;
        ctx.strokeText(keyword, startX + beforeW, y);
        ctx.fillStyle = '#4a90d9';
        ctx.fillText(keyword, startX + beforeW, y);
        ctx.fillStyle = bodyColour;
        ctx.fillText(after, startX + beforeW + keyW, y);
      } else {
        ctx.fillStyle = bodyColour;
        ctx.fillText(line, cx, y);
      }
    }
  });

  ctx.restore();
}

// ---------------------------------------------------------------------------
// CHUNK 7 — Collectible drawing, collision & sound beep
// ---------------------------------------------------------------------------

const COLL_HALF = 11; // half-size of collectible hitbox (px)

// Burger: bun dome + filling strips + bun dome
function drawBurger(cx, cy, s) {
  if (s === undefined) s = COLL_HALF;
  if (SpriteLoader.blit('burger', cx - s, cy - s, s * 2, s * 2)) return;
  ctx.fillStyle = '#d89040';
  ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
}

// Taco: golden U-shell with coloured filling visible at the open top
function drawTaco(cx, cy, s) {
  if (s === undefined) s = COLL_HALF;
  if (SpriteLoader.blit('taco', cx - s, cy - s, s * 2, s * 2)) return;
  ctx.fillStyle = '#e8c020';
  ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
}

// Burrito: brown oval with end caps and wrap crease lines
function drawBurrito(cx, cy, s) {
  if (s === undefined) s = COLL_HALF;
  if (SpriteLoader.blit('burrito', cx - s, cy - s, s * 2, s * 2)) return;
  ctx.fillStyle = '#a85c28';
  ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
}

function drawRing(cx, cy) {
  const s    = 20;
  const bobY = cy;
  // Golden rotating aura
  ctx.save();
  const spin = elapsed * 2.5;
  const r    = s + 6 + 3 * Math.sin(elapsed * 4);
  const grd  = ctx.createRadialGradient(cx, bobY, 2, cx, bobY, r);
  grd.addColorStop(0,   'rgba(255,215,0,0.7)');
  grd.addColorStop(0.5, 'rgba(255,160,0,0.3)');
  grd.addColorStop(1,   'rgba(255,100,0,0)');
  ctx.fillStyle   = grd;
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur  = 18;
  ctx.beginPath();
  ctx.arc(cx, bobY, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Sprite (or fallback golden ring shape)
  ctx.save();
  if (!SpriteLoader.blit('one_ring', cx - s, bobY - s, s * 2, s * 2)) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth   = 5;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur  = 12;
    ctx.beginPath();
    ctx.arc(cx, bobY, s - 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCollectibles() {
  for (const c of collectibles) {
    if (c.collected) continue;
    ctx.save();
    const bobY = c.y + Math.sin(elapsed * 3 + (c.bobOffset || 0)) * 4;
    if      (c.type === 'ring')    drawRing(c.x, bobY);
    else if (c.type === 'burger')  drawBurger(c.x, bobY);
    else if (c.type === 'taco')    drawTaco(c.x, bobY);
    else                           drawBurrito(c.x, bobY);
    ctx.restore();
  }
}

function updateCollectibles() {
  if (!player) return;
  const pcx = player.x + player.width  / 2;
  const pcy = player.y + player.height / 2;
  const rw  = player.width  / 2 + COLL_HALF;
  const rh  = player.height / 2 + COLL_HALF;
  for (const c of collectibles) {
    if (c.collected) continue;
    if (c.falling) {
      c.vy = Math.min(c.vy + 0.5, 15);
      c.y += c.vy;
      if (c.y >= GROUND_Y - COLL_HALF) {
        c.y       = GROUND_Y - COLL_HALF;
        c.vy      = 0;
        c.falling = false;
        c.bobOffset = Math.random() * Math.PI * 2;
      }
    }
    if (Math.abs(pcx - c.x) < rw && Math.abs(pcy - c.y) < rh) {
      c.collected = true;
      if (c.type === 'ring') {
        player.ringTimer = 10;
        ringRevealTimer  = 4.5;   // 0.8s fade in, 2.9s hold, 0.8s fade out
        SoundManager.playLampGet();
      } else {
        SoundManager.playCollect();
        // Hogman charge fuel — taco smallest, burger mid, burrito most
        if (gameState.selectedCharacter === 'hogman') {
          const fuelGain = c.type === 'burrito' ? 0.50 : c.type === 'burger' ? 0.25 : 0.15;
          player.chargeFuel = Math.min(1, player.chargeFuel + fuelGain);
        }
        if (c.type === 'burger') {
          player.burgersCollected++;
          if (player.burgersCollected >= 3) {
            player.burgersCollected = 0;
            player.lives++;
            player.extraLifeTimer = 2.5;
            SoundManager.playLampGet();
          }
        } else if (c.type === 'taco') {
          player.tacosCollected++;
          if (player.tacosCollected >= 5) {
            player.tacosCollected = 0;
            player.lives++;
            player.extraLifeTimer = 2.5;
            SoundManager.playLampGet();
          }
        } else if (c.type === 'burrito') {
          player.lives++;
          player.extraLifeTimer = 2.5;
          SoundManager.playLampGet();
        }
      }
    }
  }
}

function drawPlatform(plat) {
  const {x, y, width: w, height: h, type} = plat;

  if (type === 'ground') {
    if (currentLevel === 3) {
      const GROUND_TOP_PAD = 8;
      const tileY = y - GROUND_TOP_PAD;
      const TILE_H = canvas.height - tileY;
      if (SpriteLoader.ready('l3_ground')) {
        const sz = SpriteLoader.size('l3_ground');
        const tileW = sz ? (sz.w / sz.h) * TILE_H : 120;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, canvas.height - y); ctx.clip();
        for (let tx = x; tx < x + w; tx += tileW) {
          SpriteLoader.blit('l3_ground', tx, tileY, tileW, TILE_H);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = '#4a4a5a';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#6a6a7a';
        ctx.fillRect(x, y, w, 6);
      }
    } else if (currentLevel === 2) {
      const GROUND_TOP_PAD = 10;
      const tileY = y - GROUND_TOP_PAD;
      const TILE_H = canvas.height - tileY;
      if (SpriteLoader.ready('l2_ground')) {
        const sz = SpriteLoader.size('l2_ground');
        const tileW = sz ? (sz.w / sz.h) * TILE_H : 124;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, canvas.height - y); ctx.clip();
        for (let tx = x; tx < x + w; tx += tileW) {
          SpriteLoader.blit('l2_ground', tx, tileY, tileW, TILE_H);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = '#2a3820';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#3a5828';
        ctx.fillRect(x, y, w, 6);
      }
    } else if (SpriteLoader.ready('tile_ground_grass')) {
      const hasEdgeL = SpriteLoader.ready('tile_ground_edge_left');
      const hasEdgeR = SpriteLoader.ready('tile_ground_edge_right');
      const hasAlt   = SpriteLoader.ready('tile_ground_grass_alt');
      const edgeLSize = SpriteLoader.size('tile_ground_edge_left');
      const edgeRSize = SpriteLoader.size('tile_ground_edge_right');
      const grassSize  = SpriteLoader.size('tile_ground_grass');

      // Tile is drawn from tileY (with top-pad offset) and must reach canvas bottom
      const GROUND_TOP_PAD = 10;
      const tileY = y - GROUND_TOP_PAD;
      const TILE_H = canvas.height - tileY; // fills all the way to canvas bottom

      const edgeLW = (hasEdgeL && edgeLSize) ? (edgeLSize.w / edgeLSize.h) * TILE_H : 0;
      const edgeRW = (hasEdgeR && edgeRSize) ? (edgeRSize.w / edgeRSize.h) * TILE_H : 0;
      const grassW  = grassSize  ? (grassSize.w  / grassSize.h)  * TILE_H : 124;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, canvas.height - y);
      ctx.clip();

      // Left/right edge caps (only if sprites available)
      if (hasEdgeL) SpriteLoader.blit('tile_ground_edge_left',  x, tileY, edgeLW, TILE_H);
      if (hasEdgeR) SpriteLoader.blit('tile_ground_edge_right', x + w - edgeRW, tileY, edgeRW, TILE_H);
      // Fill — alternate with alt tile only when it's loaded, otherwise repeat base tile
      let tileIdx = 0;
      for (let tx = x + edgeLW; tx < x + w - edgeRW; tx += grassW) {
        const key = (hasAlt && tileIdx % 2 === 1) ? 'tile_ground_grass_alt' : 'tile_ground_grass';
        SpriteLoader.blit(key, tx, tileY, grassW, TILE_H);
        tileIdx++;
      }

      ctx.restore();
    } else {
      // Procedural fallback — mossy stone
      ctx.fillStyle = '#363c2e';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#3a5828';
      ctx.fillRect(x, y, w, 6);
      ctx.strokeStyle = '#2a2e22';
      ctx.lineWidth = 1;
      for (let ry = y + 26; ry < y + h; ry += 22) {
        ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x + w, ry); ctx.stroke();
      }
      for (let row = 0; row * 22 < h; row++) {
        const off = (row % 2) * 30;
        for (let bx = x + off; bx < x + w; bx += 60) {
          ctx.beginPath(); ctx.moveTo(bx, y + row * 22); ctx.lineTo(bx, y + (row + 1) * 22); ctx.stroke();
        }
      }
    }

  } else if (currentLevel === 3) {
    // Level 3: tall city-block platforms, drawn full height down to ground.
    // h is designed so y + h = 420 (ground surface), so h IS the visual height.
    const platKeys = {
      red:        'l3_platform_red',
      blue:       'l3_platform_blue',
      red_double: 'l3_platform_red_double',
    };
    const sprKey = platKeys[plat.variant] || 'l3_platform_red';
    if (SpriteLoader.ready(sprKey)) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      SpriteLoader.blit(sprKey, x, y, w, h);
      ctx.restore();
    } else {
      const colours = { red: '#8b2020', blue: '#1a3a8b', red_double: '#7a1a5a' };
      ctx.fillStyle = colours[plat.variant] || '#5a5a5a';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, y, w, 4);
    }

  } else if (currentLevel === 2) {
    // Level 2: single stretched sprite per platform.
    // Draw sprite starting above y so the visual surface aligns with the collision edge.
    const TOP_PULL = 75;
    if (SpriteLoader.ready('l2_platform')) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      SpriteLoader.blit('l2_platform', x, y - TOP_PULL, w, h + TOP_PULL);
      ctx.restore();
    } else {
      ctx.fillStyle = '#2a3820';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#1a2810';
      ctx.fillRect(x, y, w, 4);
    }

  } else {
    // Level 1: tiled wood planks
    if (SpriteLoader.ready('tile_platform_wood_plank')) {
      const TILE_H = h;
      const plankSize = SpriteLoader.size('tile_platform_wood_plank');
      const plankW = plankSize ? (plankSize.w / plankSize.h) * TILE_H : 124;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, canvas.height - y);
      ctx.clip();

      for (let tx = x; tx < x + w; tx += plankW) {
        SpriteLoader.blit('tile_platform_wood_plank', tx, y, plankW, TILE_H);
      }

      ctx.restore();
    } else {
      // Procedural fallback — wooden planks
      ctx.fillStyle = '#7a4a1e';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#9a6230';
      ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = '#4a2a0e';
      ctx.fillRect(x, y + h - 4, w, 4);
      ctx.strokeStyle = '#4a2a0e';
      ctx.lineWidth = 2;
      for (let px = x + 25; px < x + w; px += 25) {
        ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke();
      }
      ctx.strokeStyle = '#6a3a14';
      ctx.lineWidth = 1;
      for (let gy = y + 5; gy < y + h - 2; gy += 6) {
        ctx.beginPath(); ctx.moveTo(x + 2, gy); ctx.lineTo(x + w - 2, gy); ctx.stroke();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// drawTiledLayer — horizontally tiles a background sprite across the canvas.
// parallaxScrollX: already-computed horizontal offset (camera.x * factor).
// Drawn at natural pixel size, anchored to the bottom of the canvas (horizon).
// Falls back silently if the sprite is not yet loaded.
// ---------------------------------------------------------------------------
function drawTiledLayer(key, parallaxScrollX, anchorY = canvas.height, targetH = null) {
  const img = SpriteLoader.size(key);
  if (!img) return; // sprite not loaded — silent fallback
  const drawH = targetH !== null ? targetH : img.h;
  const drawW = Math.round((img.w / img.h) * drawH); // round to whole pixels to avoid seams
  const yPos  = Math.round(anchorY - drawH);
  const offset = ((parallaxScrollX % drawW) + drawW) % drawW;
  const startX = -Math.ceil(offset) - drawW; // extra tile left so horizontal shake can't expose edge
  for (let tx = startX; tx < canvas.width + drawW; tx += drawW) {
    SpriteLoader.blit(key, tx, yPos, drawW, drawH);
  }
}

// ---------------------------------------------------------------------------
// Zone detection (used by drawPlayingScene for background layer switching)
// ---------------------------------------------------------------------------
function getZone(cx) {
  if (cx < 2000)  return 'green';
  if (cx < 4200)  return 'forest';
  if (cx < 6500)  return 'ruins';
  return 'castle';
}

// Returns 0–1 blend from zoneA toward zoneB over a 400px window at boundary
function getZoneBlend(cx, boundary) {
  const BLEND_HALF = 200;
  const d = cx - boundary;
  if (d < -BLEND_HALF) return 0;
  if (d >  BLEND_HALF) return 1;
  return (d + BLEND_HALF) / (BLEND_HALF * 2);
}

// ---------------------------------------------------------------------------
// Playing scene & HUD
// ---------------------------------------------------------------------------

function drawPlayingScene() {
  // Screen shake offset
  const sx = camera.shakeFrames > 0 ? (Math.random() - 0.5) * 7 : 0;
  const sy = camera.shakeFrames > 0 ? (Math.random() - 0.5) * 5 : 0;

  // Layer 0+1: Green hills image fills the full canvas (it includes its own sky)
  // Falls back to drawSky() + drawBgTrees() if the sprite isn't loaded
  ctx.save();
  ctx.translate(Math.round(sx * 0.6), Math.round(sy * 0.6)); // integer px to avoid sub-pixel tile seams
  const bgKey = currentLevel === 3 ? 'l3_bg' : currentLevel === 2 ? 'l2_bg' : 'tile_bg_green_hills';
  if (SpriteLoader.ready(bgKey)) {
    drawTiledLayer(bgKey, camera.x * 0.5, canvas.height + 4, canvas.height + 8);
  } else {
    drawSky();
    ctx.translate(-camera.x * 0.5, 0);
    drawBgTrees();
  }
  ctx.restore();

  // Layer 3: World space — platforms, enemies, player
  ctx.save();
  ctx.translate(-camera.x + sx, sy);

  // Earth base fill — solid dark strip covering canvas bottom so sky never bleeds
  // through gaps below thin ground platforms (drawn before platforms so tiles sit on top)
  ctx.fillStyle = currentLevel === 3 ? '#1a1a2a' : '#1a0e06';
  ctx.fillRect(0, GROUND_Y + 48, LEVEL_WIDTH, 200);

  for (const plat of platforms) {
    drawPlatform(plat);
  }

  // City gate — drawn AFTER platforms so it overlays the ground
  if (currentLevel === 2 && SpriteLoader.ready('l2_city_gate')) {
    const sz = SpriteLoader.size('l2_city_gate');
    const gateH = canvas.height * 1.2;
    const gateW = sz ? (sz.w / sz.h) * gateH : gateH;
    const drawY = 420 - gateH * 0.84;
    SpriteLoader.blit('l2_city_gate', LEVEL_WIDTH - gateW * 0.85, drawY, gateW, gateH);
  }

  // Fallback ground strip (only visible before Chunk 6 platforms loaded)
  if (platforms.length === 0) {
    ctx.fillStyle = '#3a2810';
    ctx.fillRect(0, GROUND_Y, LEVEL_WIDTH, canvas.height - GROUND_Y);
    ctx.fillStyle = '#2a4020';
    ctx.fillRect(0, GROUND_Y, LEVEL_WIDTH, 6);
  }

  drawCollectibles();
  drawEnemies();
  if (currentLevel === 1) drawTrollSign();
  drawBoss();
  drawProjectiles();
  drawPlayerInGame();

  ctx.restore();

  // ONE RING TEXT — full-screen overlay, screen space
  if (ringRevealTimer > 0) {
    const TOTAL = 4.5, FADE = 0.8;
    let alpha;
    if (ringRevealTimer > TOTAL - FADE) {
      alpha = (TOTAL - ringRevealTimer) / FADE;          // fade in
    } else if (ringRevealTimer < FADE) {
      alpha = ringRevealTimer / FADE;                    // fade out
    } else {
      alpha = 1;                                         // hold
    }
    const W = canvas.width, H = canvas.height;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Dark backing so text pops on any background
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    // The image
    const sz = SpriteLoader.size('one_ring_text');
    if (sz && sz.w > 0 && sz.h > 0) {
      const scale = Math.min(W / sz.w, H / sz.h) * 0.85;
      const dw = sz.w * scale, dh = sz.h * scale;
      SpriteLoader.blit('one_ring_text', (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else if (SpriteLoader.ready('one_ring_text')) {
      // Dimensions not yet available — fill canvas
      SpriteLoader.blit('one_ring_text', 0, 0, W, H);
    }
    ctx.restore();
  }

  // HUD — screen space, not scrolling
  drawHUD();
  drawBossHPBar();
}

function drawHUD() {
  if (!player) return;
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.shadowBlur   = 4;
  ctx.shadowColor  = 'rgba(0,0,0,0.8)';

  // Lives — top left
  let livesBottom = 36; // y below lives block, used to anchor progress row
  const isHogmanChar = gameState.selectedCharacter === 'hogman';
  const liveSprKey   = isHogmanChar ? 'hogman_idle' : 'gollum_idle';
  if (SpriteLoader.ready(liveSprKey)) {
    const ICO_H = 48;
    const sz    = SpriteLoader.size(liveSprKey);
    const ICO_W = sz ? (sz.w / sz.h) * ICO_H : ICO_H;

    // Icons — no box, just floating
    for (let i = 0; i < player.lives; i++) {
      SpriteLoader.blit(liveSprKey, 12 + i * (ICO_W + 6), 10, ICO_W, ICO_H);
    }

    // Label — tight box just behind the text
    ctx.font = '9px "Press Start 2P", monospace';
    const label  = 'LIVES REMAINING';
    const labelW = ctx.measureText(label).width;
    const lx = 12, ly = 10 + ICO_H + 6;
    const PAD = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(lx - PAD, ly - PAD, labelW + PAD * 2, 9 + PAD * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.shadowBlur = 0;
    ctx.fillText(label, lx, ly);
    livesBottom = ly + 9 + PAD + 8;
  } else {
    ctx.font      = '18px "UnifrakturMaguntia", serif';
    ctx.fillStyle = '#cc2200';
    let livesStr  = '';
    for (let i = 0; i < player.lives; i++) livesStr += '\u2665 ';
    ctx.fillText(livesStr.trim(), 16, 12);
  }

  // Collectible progress — burger and taco counts toward next extra life
  const ICO = 9; // icon half-size → 18×18px
  const CPPAD = 4;
  // 1. Background box
  ctx.shadowBlur = 0;
  ctx.fillStyle  = 'rgba(0,0,0,0.55)';
  ctx.fillRect(14 - CPPAD, livesBottom - CPPAD, 120 + CPPAD * 2, ICO * 2 + CPPAD * 2);
  // 2. Icons (drawn before text; each wrapped so fillStyle changes don't leak)
  ctx.save(); drawBurger(14 + ICO, livesBottom + ICO, ICO); ctx.restore();
  ctx.save(); drawTaco(76 + ICO, livesBottom + ICO, ICO);   ctx.restore();
  // 3. Text drawn last — definitely on top
  ctx.font        = '8px "Press Start 2P", monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur  = 3;
  ctx.shadowColor = 'rgba(0,0,0,1)';
  ctx.fillText(`${player.burgersCollected}/3`, 14 + ICO * 2 + 4, livesBottom + 5);
  ctx.fillText(`${player.tacosCollected}/5`,   76 + ICO * 2 + 4, livesBottom + 5);

  // Hogman charge fuel bar
  if (isHogmanChar) {
    const BAR_W  = 120 + CPPAD * 2;
    const BAR_H  = 5;
    const barX   = 14 - CPPAD;
    const barY   = livesBottom + ICO * 2 + CPPAD + 8;
    const filled = player.chargeFuel || 0;
    const ready  = filled >= 1;
    const pulse  = ready ? 0.75 + 0.25 * Math.sin(elapsed * 5) : 1;
    ctx.shadowBlur = 0;
    // Backing panel (wider to fit F key)
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(barX - CPPAD, barY - CPPAD, BAR_W + CPPAD * 2 + 22, BAR_H + 11 + CPPAD * 3);
    // Track
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(barX, barY, BAR_W, BAR_H);
    // Fill — bright green always, pulsing toxic green when ready
    ctx.fillStyle = ready ? `rgba(80,220,15,${pulse})` : '#3aaa0a';
    ctx.fillRect(barX, barY, BAR_W * filled, BAR_H);
    // Label
    ctx.font        = '7px "Press Start 2P", monospace';
    ctx.fillStyle   = ready ? `rgba(100,230,40,${pulse})` : 'rgba(100,200,50,0.9)';
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'left';
    ctx.fillText('HOG CHARGE', barX, barY + BAR_H + 3);
    // F keycap — always visible, toxic green when ready
    const KEY_X = barX + BAR_W + 6;
    const KEY_Y = barY + BAR_H + 1;
    const KEY_W = 13, KEY_H = 12;
    ctx.fillStyle = ready ? `rgba(70,210,10,${pulse * 0.95})` : 'rgba(30,100,15,0.85)';
    ctx.fillRect(KEY_X, KEY_Y, KEY_W, KEY_H);
    ctx.strokeStyle = ready ? `rgba(160,255,80,${pulse * 0.55})` : 'rgba(100,200,50,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(KEY_X + 0.5, KEY_Y + 0.5, KEY_W - 1, KEY_H - 1);
    ctx.font        = '7px "Press Start 2P", monospace';
    ctx.fillStyle   = ready ? '#051200' : 'rgba(180,255,100,0.85)';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('F', KEY_X + KEY_W / 2, KEY_Y + KEY_H / 2 + 1);
  }

  // "+1 UP!" flash — centred on screen, fades out over last 0.8s
  if (player.extraLifeTimer > 0) {
    const alpha = player.extraLifeTimer < 0.8 ? player.extraLifeTimer / 0.8 : 1;
    ctx.save();
    ctx.globalAlpha  = alpha;
    ctx.font         = '16px "Press Start 2P", monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
    ctx.lineWidth    = 2;
    ctx.lineJoin     = 'round';
    ctx.shadowBlur   = 0;
    ctx.strokeText('+1 UP!', canvas.width / 2, 16);
    ctx.fillStyle    = '#ffd700';
    ctx.shadowColor  = '#ffd700';
    ctx.shadowBlur   = 18;
    ctx.fillText('+1 UP!', canvas.width / 2, 16);
    ctx.restore();
  }

  ctx.restore();
}

function drawPauseMenu() {
  const W = canvas.width;
  const H = canvas.height;

  ctx.save();

  // Black panel
  const pw = 260, ph = 130;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  ctx.fillStyle = '#000000';
  ctx.fillRect(px, py, pw, ph);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Title
  ctx.font = '11px "Press Start 2P", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('PAUSED', W / 2, py + 24);

  // Menu options
  const options = ['RESUME', 'QUIT TO MENU'];
  options.forEach((label, i) => {
    const oy = py + 56 + i * 30;
    const selected = (i === pauseMenuIndex);
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = selected ? '#ffffff' : 'rgba(255,255,255,0.4)';
    ctx.fillText(label, W / 2, oy);
    // Arrow drawn separately at the panel's left edge so it doesn't offset the centred label
    if (selected) {
      ctx.textAlign = 'left';
      ctx.fillText('>', px + 14, oy);
      ctx.textAlign = 'center';
    }
  });

  // Controls hint
  ctx.font = '6px "Press Start 2P", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('UP/DOWN  ENTER  ESC', W / 2, py + ph - 14);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Utility: rounded rectangle path
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Main game loop
// ---------------------------------------------------------------------------
// Resize canvas based on current game state.
// SPLASH uses a portrait canvas matching the splash image aspect ratio (2:3).
// All other states use the standard gameplay canvas (1024×576).
function syncCanvasSize() {
  const target = (state === 'SPLASH' || state === 'CHARACTER_SELECT' || state === 'INTRO')
    ? { w: 520, h: 780 }
    : (state === 'GAME_OVER' || state === 'LEVEL_COMPLETE')
    ? { w: 1040, h: 780 }
    : { w: 1024, h: 576 };
  if (canvas.width !== target.w || canvas.height !== target.h) {
    canvas.width  = target.w;
    canvas.height = target.h;
  }
}

// ── CRT television screen overlay ─────────────────────────────────────────────
function drawCRTEffect() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();

  // 1. Scanlines — one faint dark line every 3px
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  for (let y = 0; y < h; y += 3) {
    ctx.fillRect(0, y, w, 1);
  }

  // 2. Slow-rolling horizontal brightness band (CRT refresh artifact)
  //    Completes one pass top-to-bottom every ~10 seconds
  const rollY = ((elapsed / 10) % 1) * (h + 80) - 40;
  const rollGrad = ctx.createLinearGradient(0, rollY - 40, 0, rollY + 40);
  rollGrad.addColorStop(0,   'rgba(255,255,255,0)');
  rollGrad.addColorStop(0.5, 'rgba(255,255,255,0.045)');
  rollGrad.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = rollGrad;
  ctx.fillRect(0, rollY - 40, w, 80);

  // 3. Vignette — dark edges / corners
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  // 4. Subtle pixel static noise
  for (let i = 0; i < 50; i++) {
    const a = Math.random() * 0.07;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 1);
  }

  ctx.restore();
}

function gameLoop(timestamp) {
  // Clamp dt to 100ms max — prevents huge jump on first frame or after tab switch
  const dt = lastTime === 0 ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  elapsed += dt;

  syncCanvasSize();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state === 'SPLASH') {
    drawSplash();
    if (justPressed['Enter']) {
      charSelectIndex = 0;
      state = 'CHARACTER_SELECT';
    }

  } else if (state === 'CHARACTER_SELECT') {
    if (justPressed['ArrowLeft'])  charSelectIndex = 0;
    if (justPressed['ArrowRight']) charSelectIndex = 1;
    if (justPressed['Enter']) {
      gameState.selectedCharacter = CHARACTERS[charSelectIndex].id;
      resetIntro();
      state = 'INTRO';
    }

    drawCharacterSelect();

  } else if (state === 'INTRO') {
    updateIntro(dt);
    drawIntro();

    if (justPressed['Enter']) {
      initLevel();
      state = 'PLAYING';
      SoundManager.startMusic();
    }

  } else if (state === 'PLAYING') {
    if (justPressed['Escape']) {
      pauseMenuIndex = 0;
      state = 'PAUSED';
    }
    // DEV: jump to level with number keys
    if (justPressed['Digit1']) { initLevel(1); SoundManager.startMusic(); }
    if (justPressed['Digit2']) { initLevel(2); SoundManager.startMusic(); }
    if (justPressed['Digit3']) { initLevel(3); SoundManager.startMusic(); }
    if (ringRevealTimer > 0) ringRevealTimer -= dt;
    if (player && player.extraLifeTimer > 0) player.extraLifeTimer -= dt;
    updatePlayer();
    updateEnemies();
    checkEnemyCollisions();
    updateCollectibles();
    if (boss && boss.alive) updateBoss();

    // Taco rain — Hogman only, active while boss is alive
    if (boss && boss.alive && gameState.selectedCharacter === 'hogman') {
      tacoRainTimer -= dt;
      if (tacoRainTimer <= 0) {
        const arenaL = boss.arenaLeft !== null ? boss.arenaLeft : BOSS_ARENA_LEFT;
        const arenaR = LEVEL_WIDTH - 20;
        const visL   = Math.max(arenaL, camera.x + 50);
        const visR   = Math.min(arenaR, camera.x + canvas.width - 50);
        if (visR > visL) {
          const spawnX = visL + Math.random() * (visR - visL);
          collectibles.push({ x: spawnX, y: -COLL_HALF, type: 'taco', collected: false, vy: 0, falling: true, bobOffset: 0 });
        }
        tacoRainTimer = 5 + Math.random() * 4; // next drop in 5–9 s
      }
    }

    updateProjectiles();
    if (boss && boss.alive) checkBossCollision();
    drawPlayingScene();

    // Level complete — boss dead (or no boss), player runs off the right edge
    if ((!boss || !boss.alive) && !player.dying) {
      if (player.x > LEVEL_WIDTH + 50) {
        SoundManager.stopMusic();
        SoundManager.playLevelWin();
        levelCompleteScroll = 0;
        state = 'LEVEL_COMPLETE';
      }
    }

  } else if (state === 'PAUSED') {
    // Draw frozen game world underneath
    drawPlayingScene();
    // Draw pause overlay on top
    drawPauseMenu();

    if (justPressed['Escape']) {
      state = 'PLAYING';
    }
    if (justPressed['ArrowUp'])   pauseMenuIndex = 0;
    if (justPressed['ArrowDown']) pauseMenuIndex = 1;
    if (justPressed['Enter']) {
      if (pauseMenuIndex === 0) {
        // Resume
        state = 'PLAYING';
      } else {
        // Quit to character select
        SoundManager.stopMusic();
        charSelectIndex = 0;
        state = 'CHARACTER_SELECT';
      }
    }

  } else if (state === 'GAME_OVER') {
    drawGameOver();
    if (justPressed['ArrowUp'] || justPressed['ArrowDown']) {
      gameOverMenuIndex = gameOverMenuIndex === 0 ? 1 : 0;
    }
    if (justPressed['Enter']) {
      if (gameOverMenuIndex === 0) {
        // TRY HARDER — restart the level
        initLevel();
        SoundManager.startMusic();
        state = 'PLAYING';
      } else {
        // CHOOSE A DIFFERENT LOSER — back to character select
        charSelectIndex = 0;
        state = 'CHARACTER_SELECT';
      }
    }

  } else if (state === 'LEVEL_COMPLETE') {
    drawLevelComplete();
    if (justPressed['Enter']) {
      if (currentLevel === 1) {
        initLevel(2);
        SoundManager.startMusic();
        state = 'PLAYING';
      } else if (currentLevel === 2) {
        initLevel(3);
        SoundManager.startMusic();
        state = 'PLAYING';
      } else {
        state = 'SPLASH';
      }
    }
  }

  drawCRTEffect();

  clearJustPressed();
  requestAnimationFrame(gameLoop);
}

SpriteLoader.load();
requestAnimationFrame(gameLoop);
