# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

There is no build step. Open `index.html` directly in a browser (file:// or a local HTTP server). Everything runs in-browser via the Canvas API.

```bash
# Simplest way to serve locally
python3 -m http.server 8080
# then open http://localhost:8080
```

## Architecture

The game is a single-page Canvas 2D platformer with no external dependencies or frameworks. All logic lives in two source files:

- **`intro-text.js`** — exports `INTRO_LINES` array only. Edit this to change the story crawl text. Loaded before `game.js`.
- **`game.js`** — the entire game engine (~2 800 lines, monolithic). No modules, no imports.

### State Machine

`state` is a string enum driving the main loop:

```
SPLASH → CHARACTER_SELECT → INTRO → PLAYING ↔ PAUSED
                                        ↓
                                  GAME_OVER / LEVEL_COMPLETE
```

Transitions happen via `justPressed` key events inside the `gameLoop` function near the bottom of `game.js`.

### Key Subsystems (all in `game.js`)

**SpriteLoader** (IIFE) — loads PNG assets at startup via `Image`. If a file is missing, `blit()` returns `false` and callers fall back to procedural canvas drawing. All asset paths are declared in the `PATHS` map at the top of `SpriteLoader`. Assets are PNG only.

**SoundManager** (IIFE) — generates all audio procedurally via Web Audio API. No sound files are required; optional `.wav`/`.ogg` replacements can be dropped into `assets/sounds/`. The `ctx` variable inside SoundManager is a local alias for `AudioContext` — it shadows the global canvas `ctx`.

**Input** — `keys` object for held state, `justPressed` for single-frame presses. `clearJustPressed()` must be called at the end of every frame.

**`initLevel(level)`** — populates `platforms`, `collectibles`, `enemies`, `powerups`, and `boss` for a given level number (1, 2, or 3). All non-ground content is offset right by `LEVEL_PREAMBLE` (1 200 px) after placement. Call this to reset/restart a level.

**Physics** — non-dt-scaled (runs at assumed 60 fps). `GRAVITY = 0.5`, `TERMINAL_VEL = 15`. `resolvePlatformCollision()` handles landing-on-top and head-bump-from-below. Awning platforms are pass-through from below (no head-bump check) — players jump up through them and land on top for the bounce. Coyote time is 6 frames.

**Characters** — `gameState.selectedCharacter` is `'hogman'` or `'gollum'`. Stats are defined in the `CHARACTERS` array. Hogman: slower, no air jump, `jumpForce=6`. Gollum: faster, 1 double-jump, smaller hitbox (`normalHeight=30`), `jumpForce=8`.

**Boss (Pond Brute)** — `boss` object with a state machine (`drinking → waking → idle → charge/beam/slam/stomp → dead`). `BOSS_ARENA_LEFT` locks the camera left bound once the player enters the arena. After defeat, the right-bound wall is removed so the player can run off-screen to trigger `LEVEL_COMPLETE`.

## Level 3 — City

Level 3 is a city-street platformer with four progressively taller tower obstacles.

### Platform types (level 3)

| type | sprite key | notes |
|------|-----------|-------|
| `ground` | `l3_ground` | Continuous cobblestone street |
| `tower_wall` | `l3_tower` | Tall city block; horizontal-only collision blocks player; clears when player bounces above tower top |
| `awning` | `l3_awning` | Bounce pad on tower face; pass-through from below; `bounceForce` launches player over tower |
| `low_building` | `l3_low_building` | Wide 1-storey building; sprite **tiled horizontally** (aspect-ratio preserved per tile) |
| `cart` | `l3_cart` | Small cart platform; sprite aspect-correct, centred on hitbox |
| `two_storey` | `l3_two_storey` | 2-storey building; sprite fills collision box |

### Level 3 layout (raw x before +LEVEL_PREAMBLE)

- Cart at x=700 (before T1)
- Low building x=1548, w=1212 — tiled between T1 and T2; drawn **before** T1 in array so tower renders on top
- Two-storey x=2080, w=250 — sits within low building footprint
- T1 tower x=1400; awning x=1310, **y=405**, drawOffsetY=10
- T2 tower x=2800; awning x=2625
- Two-storey x=3200 (between T2/T3)
- Cart x=4750 (between T3/T4)
- T3 tower x=4300; awning x=4120
- T4 tower x=5900; awning x=5710
- Two-storey x=6350 (after T4)

### Gollum sprite rendering

`drawGollumInGame` uses `VISUAL_H=92`. `sinkOffset` compensates for transparent bottom padding in the source sprite:
- Run/idle: `sinkOffset=26`
- Crouching: `sinkOffset=34`

Formula: `drawY = y + h - drawH + sinkOffset`

### Drawing order note

`low_building` and `two_storey` entries appear **before** `tower_wall` entries in the `platforms` array so that tower sprites render on top where they overlap.

## Asset Conventions

- **PNG only** — `SpriteLoader` only loads `.png`.
- Sprites default facing **right**; `game.js` flips the canvas context for left-facing movement.
- Tiles that repeat horizontally must have matching left/right edges.
- All sizes are draw sizes via `blit()`; source resolution can be higher.
- Missing sprites are silent (no console error thrown to players); the procedural fallback draws simple shapes.

## Known Issues (from DESIGN_NOTES.txt)

- **Zone boundary mismatch**: `getZone()` triggers at x=1800/4000/6300 but platform zones change at x≈2000/4200/6500. Sky/background shifts ~200 px too early.
- **Level 1 flat**: Elevated platforms are entirely optional; there's no incentive to use them in the first 2000 px.
- **`level1_tiles/` assets**: Most tile PNGs listed in `SpriteLoader.PATHS` are missing — the game renders procedural colour fallbacks. Adding these is the biggest visual upgrade available.
- **`lamp.png`**: The Magic Lamp power-up collectible has no sprite (path typo in DESIGN_NOTES: `lamp.pn`; correct path is `assets/sprites/collectibles/lamp.png`).
