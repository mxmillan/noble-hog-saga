# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

Open `index.html` directly in a browser — no build step, no server required. The game works on `file://` protocol. Target 60fps via `requestAnimationFrame`.

## File Structure

- `index.html` — minimal shell; loads `intro-text.js` then `game.js`
- `game.js` — all game logic (~2800 lines, single file by design)
- `intro-text.js` — editable story crawl text (`INTRO_LINES` array); edit this file to change the intro narrative
- `style.css` — centers canvas, dark background (`#1a0a00`), golden border
- `assets/sprites/` — PNG sprites; missing files fall back to procedural drawing (see SpriteLoader)
- `assets/backgrounds/` — splash/character/intro screens + `level1_tiles/` and `level2_tiles/` tilesets

## Architecture

### State Machine

`state` is a string controlling which update/draw logic runs each frame:

```
SPLASH → CHARACTER_SELECT → INTRO → PLAYING ⇄ PAUSED → GAME_OVER
                                           └─────────────→ LEVEL_COMPLETE
```

The `gameLoop()` function at the bottom of `game.js` dispatches per-state logic. `gameState.selectedCharacter` (`'hogman'` | `'gollum'`) persists across screens.

On LEVEL_COMPLETE, pressing Enter advances to the next level (`initLevel(2)` → PLAYING), or returns to SPLASH if already on level 2.

### Canvas Size

The canvas **changes dimensions** depending on state — this is intentional:
- Menu states (`SPLASH`, `CHARACTER_SELECT`, `INTRO`): **520×780** (portrait, to match splash art)
- Gameplay states (`PLAYING`, `PAUSED`): **1024×576** (landscape)
- End states (`GAME_OVER`, `LEVEL_COMPLETE`): **1040×780**

`syncCanvasSize()` is called each frame before drawing.

### Input System

Two maps, both keyed by `e.code` (e.g. `'ArrowLeft'`, `'Enter'`, `'Escape'`):
- `keys` — currently held keys (use for movement)
- `justPressed` — keys pressed this frame only (use for one-shot actions); cleared at end of each frame via `clearJustPressed()`

**DEV shortcuts (in PLAYING state):** Press `1` or `2` to instantly jump to that level.

### SpriteLoader

Async PNG loader with procedural fallback. All draw functions should follow the pattern:
```js
if (SpriteLoader.ready('key')) {
  SpriteLoader.blit('key', x, y, w, h);
} else {
  // procedural fallback drawing
}
```
API: `SpriteLoader.ready(key)`, `SpriteLoader.blit(key, x, y, w, h)`, `SpriteLoader.size(key)` → `{w, h}`.

### SoundManager

Web Audio API, all sounds procedural (no audio files). Key methods: `playJump()`, `playCollect()`, `playHit()`, `playDefeat()`, `playLampGet()`, `playGameOver()`, `playLevelWin()`, `startMusic()`, `stopMusic()`. The AudioContext is lazily created on first use to work around browser autoplay policies.

### Gameplay Systems (all in game.js)

- **`initLevel(level = 1)`** — resets player, platforms, collectibles, enemies, powerups, boss for a fresh run; sets `currentLevel`
- **`updatePlayer()`** — physics (gravity 0.5/frame, terminal velocity 15), platform collision, jump, invincibility timer, death animation
- **`updateEnemies()` / `checkEnemyCollisions()`** — patrol AI, stomp detection, player damage
- **`updateBoss()`** — Tile Troll boss at end of level 1; `boss.alive = false` triggers LEVEL_COMPLETE
- **`drawPlayingScene()`** — layered rendering pipeline (back to front): tiled background → world space (platforms, enemies, player, boss) → HUD
- **`drawPauseMenu()`** — dark overlay + parchment panel over frozen `drawPlayingScene()`
- **`drawCRTEffect()`** — called last every frame; scanlines, roll band, vignette, pixel noise
- **`drawTiledLayer(key, parallaxScrollX, anchorY, targetH)`** — tiles a sprite horizontally with parallax; anchored to canvas.height by default

### Key Constants

```js
GRAVITY          = 0.5          // px added to vy per frame (not dt-scaled)
TERMINAL_VEL     = 15           // max fall speed
LEVEL_PREAMBLE   = 1200         // px of empty ground before first platform/enemy
LEVEL_WIDTH      = 8500 + LEVEL_PREAMBLE  // total level width in px
BOSS_ARENA_LEFT  = 7100 + LEVEL_PREAMBLE  // world-x where arena locks behind player (level 1 only)
GROUND_Y         = 420          // top of ground surface (fallback; platforms may vary)
```

### Camera

`camera = { x, y, shakeFrames }`. Camera tracks player: `camera.x = player.x - 300` (clamped). `shakeFrames > 0` applies random pixel offsets to the world-space translate, applied per layer with scaling factors for depth.

### Timing

`dt` is time-delta in seconds (clamped to 100ms max to prevent physics explosions after tab switches). `elapsed` is total seconds since start, used to drive sine-wave animations (collectible bob, text pulse).

### Player Movement

- **Variable jump:** tap = short hop, hold = full arc (`player.jumpHeld`, reduced gravity on ascent)
- **Gollum double-jump:** `player.airJumpsLeft` resets on landing; Hogman has 0 air jumps
- **Crouch:** ArrowDown while grounded → `player.crouching`, reduced `player.height`
- **Slide:** ArrowDown while running fast → `player.sliding`, `slideTimer`, `slideVx` with decay

### Pause Menu

- `Escape` during PLAYING → `state = 'PAUSED'`, resets `pauseMenuIndex = 0`
- `Escape` during PAUSED → resume
- `↑/↓` moves cursor, `Enter` confirms (Resume or Quit to CHARACTER_SELECT)

### Platforms

- Active types: `'ground'` (grass tiles) and `'platform'`
- **Level 1:** continuous ground floor `y=420, height=80`; 11 elevated platforms, `type: 'platform'`, `height=32`, width `280–320px`; tiled with `tile_platform_wood_plank`
- **Level 2:** two ground segments (start runway + end runway only, no ground in the middle); 13 elevated platforms, `height=150`, width `380–440px`; drawn as a single stretched blit of `l2_platform` with `TOP_PULL = 75` upward offset so the visual surface aligns with the collision edge

### Backgrounds

- **Level 1:** `drawTiledLayer('tile_bg_green_hills', ...)` — fills the full canvas including sky; no separate sky layer
- **Level 2:** `drawTiledLayer('l2_bg', ...)` — dark forest background
- `drawSky()` and `drawBgTrees()` are procedural fallbacks only (when sprite not loaded)
- Background key is selected per frame: `const bgKey = currentLevel === 2 ? 'l2_bg' : 'tile_bg_green_hills'`

### Level System

- `currentLevel` (global, `1` or `2`) — set by `initLevel(level)`
- `drawPlatform()`, `drawPlayingScene()` all branch on `currentLevel` to swap visuals
- Level completion: `(!boss || !boss.alive) && player.x > LEVEL_WIDTH + 50` — works for both bossed (level 1) and bossless (level 2) levels
- `rightBound` in `updatePlayer` is `Infinity` when `!boss || !boss.alive`, allowing the player to run off the right edge

### Boss — The Tile Troll (Level 1 only)

States: `'drinking'` → `'waking'` → `'attacking'` ⇄ `'lapping'` ⇄ `'charging'` → `'crouching'` → `'recovering'` → `'lapping'`

- **Vulnerable only in `'crouching'` state** — boss periodically crouches after wall bounces (55% chance per bounce, guaranteed after 2 bounces)
- **`'recovering'`** — post-stomp: boss stays crouched (~1.2s) so player can escape before boss stands up, then transitions to `'lapping'`
- **Sprite:** `troll_drink` sprite used for `'drinking'`, `'crouching'`, and `'recovering'` states; `troll_stand` for upright; `troll_attack` during beam salvos
- **Defeat:** `boss.alive = false` → `drawBoss()` renders `troll_defeat` sprite at ground level (`GROUND_Y - standH + 55`)
- **Troll sign:** `drawTrollSign()` renders `troll_sign` at `BOSS_ARENA_LEFT - 400` (level 1 only)
- **Phase 2** triggers at `hp <= maxHp / 2`; charge speed increases from 3.5 → 5.5

### Characters

- `gameState.selectedCharacter`: `'hogman'` | `'gollum'`
- Gollum sprites in `assets/sprites/gollum/`: `gollum_idle.png`, `gollum_crawling.png`, `gollum_jump.png`, `gollum_crouching.png`, `gollum_hurt.png`
- `drawGollumInGame` renders at visual height `VISUAL_H = 92` regardless of hitbox; facing handled by parent `ctx.scale(-1,1)`

### Adding a New Enemy or Obstacle Type

1. Add its data shape to the array initialized in `initLevel()`
2. Add an `update*()` function (follow pattern of `updateEnemies()`)
3. Add a `draw*()` function with `SpriteLoader.ready` / procedural fallback
4. Call both from the PLAYING block in `gameLoop()` and from `drawPlayingScene()` respectively

### Intro Text

Edit `intro-text.js` to change the story crawl. Lines starting with `—` render in gold; the line `'They were WANTED.'` renders larger in red. Use `''` for blank spacing lines.
