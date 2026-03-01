# THE NOBLE HOG SAGA — Claude Code Build Spec
## Instructions for Claude Code
Work through this document **one chunk at a time**. Complete each chunk fully before moving to the next. After each chunk, confirm what was built and wait for the user to say "next chunk" before continuing.

---

## CHUNK 1 — Project Scaffold & Folder Structure

Create the following folder structure in the current directory:

```
noble-hog-saga/
├── index.html
├── game.js
├── style.css
└── assets/
    ├── sprites/
    │   └── README.txt   ← explain what sprites go here
    ├── sounds/
    │   └── README.txt   ← explain what sounds go here
    └── backgrounds/
        └── README.txt   ← explain what backgrounds go here
```

`index.html` should:
- Load style.css and game.js
- Have a single `<canvas>` element with id="gameCanvas"
- Have a div id="ui" for overlays (splash, character select, HUD, game over)
- Be otherwise minimal — all logic goes in game.js

`style.css` should:
- Set background to #1a0a00 (dark parchment/night)
- Center the canvas on screen
- Style the canvas with a subtle golden border
- Hide scrollbars
- Use a fantasy/gothic Google Font (UnifrakturMaguntia or MedievalSharp)

Confirm folder structure is created and show the file tree.

---

## CHUNK 2 — Splash Screen

In `game.js`, build the splash screen rendered on the canvas. No gameplay yet — just the opening screen.

The splash screen should:
- Fill the canvas (800x500px) with a dark parchment texture (draw it procedurally with gradients — no image required yet)
- Draw a decorative golden border (nested rectangles with corner flourishes drawn with canvas arcs/lines)
- Display "THE NOBLE HOG SAGA" in large gothic font, dark red color (#8B0000)
- Display "A Sacred Chronicle" in smaller gold italic text below
- Display "PRESS ENTER TO BEGIN" pulsing gently (opacity oscillates with sine wave)
- Play state = 'SPLASH'

Keyboard: pressing ENTER moves to CHUNK 3's character select screen.

Use `requestAnimationFrame` for the game loop from the start — all future screens will plug into this loop.

---

## CHUNK 3 — Character Select Screen

Add a character select screen (state = 'CHARACTER_SELECT').

Show two character cards side by side:
- Left: **HOGMAN** — "Rides his noble hog. Slow but powerful."
- Right: **GOLLUM MAN** — "Crawls on all fours. Fast and sneaky. Small hitbox."

Each card should:
- Have a parchment-colored background with gold border
- Show a placeholder sprite (draw a simple pixel-art silhouette procedurally):
  - Hogman: a round figure sitting on a wide low rectangle (hog)
  - Gollum Man: a small hunched figure low to the ground
- Highlight when selected (golden glow border)

Controls:
- LEFT/RIGHT arrow to switch selection
- ENTER to confirm and move to state = 'INTRO'

Store selected character in a `gameState.selectedCharacter` variable ('hogman' or 'gollum').

---

## CHUNK 4 — Intro Scroll & Level Start

Add an intro text scroll screen (state = 'INTRO').

Slowly scroll the following text upward (like a Star Wars crawl) on a dark parchment background:

```
Before the gate of the White Castle,
the Hogman and his companion halted.

A strange parchment hung from stone —
trembling, sacred, bureaucratic.

They were WANTED.
By whom, none could say...
but surely some unspeakable power
behind those checkerboard walls.

Their quest: to find the magic lamp.
Their reward: the food of the lamp.

The Noble Hog Saga begins.
```

After scroll completes (or player presses ENTER to skip), transition to state = 'PLAYING' and initialize Level 1.

---

## CHUNK 5 — Core Game Engine & Player Physics

Build the core platformer engine in game.js.

**Canvas:** 800x500px. Camera scrolls horizontally. Level is 4000px wide.

**Player object with these properties:**
- x, y, vx, vy
- width, height (Hogman: 60x50, Gollum: 50x30 — he's low to the ground)
- isOnGround, isJumping
- lives: 3, score: 0
- speed, jumpForce (Hogman: speed=3, jump=12 | Gollum: speed=4.5, jump=8)

**Physics:**
- Gravity: 0.5 applied every frame to vy
- Terminal velocity: vy max 15
- On ground collision: vy = 0, isOnGround = true

**Controls:**
- LEFT/RIGHT arrows: move
- SPACE or UP arrow: jump (only when isOnGround)
- No double jump

**Draw player procedurally for now:**
- Hogman: brown rectangle body, darker rectangle below (hog), small circle head with hat
- Gollum: small pale rectangle, hunched, tiny circle head with glasses

Camera follows player: camera.x = player.x - 300 (clamped to level bounds)

---

## CHUNK 6 — Level 1 Layout & Platforms

Build Level 1: "The Road to White Castle"

**Background layers (draw procedurally):**
- Sky: dark gradient (#1a1a2e to #2d1b00)
- Distant mountains: simple dark triangles
- Midground: silhouetted trees (vertical rectangles with rounded tops)
- Ground: earthy brown/green strip

**Platform layout (array of {x, y, width, height, type}):**

```javascript
const platforms = [
  // Ground sections (with gaps)
  {x: 0, y: 420, width: 600, height: 80, type: 'ground'},
  {x: 700, y: 420, width: 400, height: 80, type: 'ground'},
  {x: 1200, y: 420, width: 500, height: 80, type: 'ground'},
  {x: 1800, y: 420, width: 300, height: 80, type: 'ground'},
  {x: 2200, y: 420, width: 600, height: 80, type: 'ground'},
  {x: 2900, y: 420, width: 800, height: 80, type: 'ground'},
  {x: 3800, y: 420, width: 400, height: 80, type: 'ground'},
  
  // Elevated platforms
  {x: 400, y: 320, width: 150, height: 20, type: 'platform'},
  {x: 650, y: 270, width: 120, height: 20, type: 'platform'},
  {x: 900, y: 310, width: 180, height: 20, type: 'platform'},
  {x: 1100, y: 240, width: 100, height: 20, type: 'platform'},
  {x: 1400, y: 300, width: 200, height: 20, type: 'platform'},
  {x: 1700, y: 250, width: 150, height: 20, type: 'platform'},
  {x: 2000, y: 320, width: 120, height: 20, type: 'platform'},
  {x: 2400, y: 280, width: 200, height: 20, type: 'platform'},
  {x: 2700, y: 220, width: 150, height: 20, type: 'platform'},
  {x: 3000, y: 300, width: 180, height: 20, type: 'platform'},
  {x: 3300, y: 250, width: 200, height: 20, type: 'platform'},
  {x: 3600, y: 320, width: 150, height: 20, type: 'platform'},
];
```

Ground platforms: draw as mossy stone (dark grey with green tinge).
Elevated platforms: draw as wooden planks (brown).

At x=3800, draw the **White Castle** in the background: a checkerboard-patterned castle silhouette (alternating light/dark squares on the walls). This is the level end goal.

**Level end trigger:** when player reaches x > 3750, show level complete screen.

---

## CHUNK 7 — Collectibles (Fast Food)

Add collectibles scattered across Level 1.

**Types:**
- 🍔 Burger — worth 100 points (most common)
- 🌮 Taco — worth 150 points
- 🌯 Burrito — worth 200 points (rarest)

**Draw them procedurally** (simple colored shapes):
- Burger: two brown semicircles with yellow/green fill
- Taco: yellow triangle with fill
- Burrito: brown oval/rectangle

**Collectible positions** (spread across level):
Place ~25 total collectibles along the level, mix of on-ground and on platforms.

```javascript
// Generate collectibles array with {x, y, type, value, collected: false}
// Spread them roughly every 150px across the 4000px level
// Some on platforms, some just above ground level
```

**Collection:** when player overlaps a collectible (AABB collision), mark as collected, add to score, play a collect sound (oscillator beep for now).

**HUD** (draw on canvas, fixed position — not scrolling):
- Top left: ❤️❤️❤️ (lives)
- Top center: score number in gold font
- Top right: small burger icon + count of burgers collected

---

## CHUNK 8 — Enemies

Add enemies to Level 1.

**Enemy Type 1: Cursed Knight**
- Patrols back and forth on platforms/ground
- Draw as: dark armored figure (grey rectangles, helmet)
- Speed: 1.5px/frame, reverses at platform edges
- On player contact: player loses a life, brief invincibility (2 seconds, player flashes)

**Enemy Type 2: Swamp Rat**
- Faster, smaller, stays on ground
- Draw as: low brown rectangle with pointy ears
- Speed: 2.5px/frame
- On player contact: same as above

**Enemy positions** (8-10 total across level):
```javascript
const enemies = [
  {x: 500, y: 390, type: 'knight', patrolRange: 200},
  {x: 950, y: 280, type: 'knight', patrolRange: 150},  // on platform
  {x: 1300, y: 390, type: 'rat', patrolRange: 300},
  {x: 1600, y: 390, type: 'rat', patrolRange: 200},
  {x: 2100, y: 390, type: 'knight', patrolRange: 250},
  {x: 2500, y: 250, type: 'rat', patrolRange: 180},    // on platform
  {x: 2800, y: 390, type: 'knight', patrolRange: 200},
  {x: 3100, y: 390, type: 'rat', patrolRange: 300},
  {x: 3400, y: 390, type: 'knight', patrolRange: 200},
  {x: 3650, y: 390, type: 'rat', patrolRange: 100},
];
```

**Stomping:** if player lands on top of enemy (player vy > 0, player bottom hits enemy top), enemy is defeated. Player bounces up slightly. Score += 50.

**Lives system:** when lives = 0, go to state = 'GAME_OVER'.

---

## CHUNK 9 — Power-ups & Magic Lamp

**Power-up: The Magic Lamp**
- A glowing golden lamp object sitting at x=3500, y=390
- Draw as: a golden teapot/lamp shape with a flickering glow effect (animated radius shadow)
- When collected: temporary invincibility for 10 seconds (player glows gold, enemies bounce off)
- Display "THE LAMP IS YOURS" text briefly on screen

**Power-up: Speed Hog**
- A horseshoe icon at 2 locations in the level
- When Hogman collects: speed boost for 8 seconds
- When Gollum collects: jump boost for 8 seconds

**Active power-up indicator:** small icon in HUD top-right with a countdown timer bar

---

## CHUNK 10 — Sound Effects (Procedural Audio)

Use the Web Audio API to generate all sounds procedurally — no audio files needed.

Create a `SoundManager` object with these methods:

```javascript
SoundManager = {
  ctx: new AudioContext(),
  
  playJump()      // short ascending sine wave beep
  playCollect()   // quick ascending two-tone jingle  
  playHit()       // low buzz/thud
  playDefeat()    // descending tone (enemy stomp)
  playLampGet()   // magical shimmering chord
  playGameOver()  // slow descending chromatic scale
  playLevelWin()  // triumphant ascending fanfare
  
  // Background music: simple repeating bass drone + melody
  // Use oscillators with low gain for ambient fantasy feel
  startMusic()
  stopMusic()
}
```

Wire up all sounds to their game events.

---

## CHUNK 11 — Game Over, Level Complete & Polish

**Game Over screen (state = 'GAME_OVER'):**
- Dark parchment background
- "THOU HAST FALLEN" in gothic font
- Final score displayed
- "PRESS ENTER TO TRY AGAIN" — resets to character select

**Level Complete screen (state = 'LEVEL_COMPLETE'):**
- "THE WHITE CASTLE BECKONS" 
- Score tally with collectible count
- "A Sacred Chronicle... continues" 
- For now: pressing ENTER returns to splash (level 2 coming soon)

**Polish pass:**
- Player death animation: character spins and falls off screen
- Collectible bobbing animation (sin wave offset on y)
- Enemy slight squash/stretch walk cycle (scale oscillation)
- Screen shake on player hit (camera.shake for 20 frames)
- Parallax: background layers scroll at 0.2x and 0.5x speed relative to camera

---

## CHUNK 12 — Sprite Swap System

Make it easy to swap in real PNG sprites.

Create a `SpriteLoader` object:

```javascript
const SPRITE_PATHS = {
  hogman_idle:   'assets/sprites/hogman_idle.png',
  hogman_run:    'assets/sprites/hogman_run.png',
  gollum_idle:   'assets/sprites/gollum_idle.png',
  gollum_run:    'assets/sprites/gollum_run.png',
  enemy_knight:  'assets/sprites/enemy_knight.png',
  enemy_rat:     'assets/sprites/enemy_rat.png',
  burger:        'assets/sprites/burger.png',
  taco:          'assets/sprites/taco.png',
  burrito:       'assets/sprites/burrito.png',
  lamp:          'assets/sprites/lamp.png',
  background_1:  'assets/backgrounds/level1_bg.png',
}

// SpriteLoader.load() attempts to load each PNG
// If a PNG fails to load (file not found), fall back to procedural drawing
// This means the game always works, even without real sprites
```

Update all draw functions to: check if sprite is loaded → draw sprite, else → draw procedural fallback.

Update assets/sprites/README.txt with the exact filename each sprite should use.

---

## FINAL NOTES FOR CLAUDE CODE

- Test the game runs in a browser by opening index.html directly (file:// protocol)
- No server required — everything must work as local files
- Keep game.js as a single file for simplicity
- Target 60fps via requestAnimationFrame
- Canvas size: 800x500, centered in browser window
- All text rendering uses canvas fillText — no HTML overlays
- After completing all chunks, do a final review pass: check for console errors, make sure all state transitions work, and confirm the game is fully playable from splash to level complete
```
