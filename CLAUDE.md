# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

There is no build step. **`index.html` is the 3D game of the book** (it needs an HTTP server; see below). The original 2D platformer described in the next sections is `classic.html`: open it directly in a browser (file:// or a local HTTP server). Everything runs in-browser via the Canvas API.

```bash
# One command: serves the folder on localhost:8137 and opens the game of the book (index.html, the root page)
./hogsaga            # --windmills for the prologue on its own, --2d for the original platformer, --no-open to skip the browser
```

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

**`initLevel(level)`** — populates `platforms`, `collectibles`, `enemies`, `powerups`, and `boss` for a given level number (1, 2, or 3). All non-ground content is offset right by `LEVEL_PREAMBLE` (1 200 px) after placement. Call this to reset/restart a level. **It defaults to level 1** — always pass an explicit level when restarting.

**Enemies** — `makeCrows([[x, y, patrolRange], …])` builds the patrolling crows; `x` is pre-preamble like everything else in `initLevel`. All three levels have crows. Level 1 puts them over the inter-platform gaps; level 2 over alternating platform surfaces (so an arriving jump can stomp them); level 3 at chest height in the open street stretches between towers.

**Physics** — written in per-frame units assuming 60 fps. `GRAVITY = 0.5`, `TERMINAL_VEL = 15`. `resolvePlatformCollision()` handles landing-on-top and head-bump-from-below. Awning platforms are pass-through from below (no head-bump check) — players jump up through them and land on top for the bounce. Coyote time is 6 frames.

**Fixed timestep** — `gameLoop` accumulates real time and calls `stepPlaying()` a whole number of times at exactly `FIXED_DT` (1/60 s), capped at `MAX_CATCHUP_STEPS`. Drawing happens once per animation frame. This is what keeps the per-frame physics correct on 120 Hz/144 Hz displays, where the game previously ran at double speed. Consequences when editing:
- Anything inside `stepPlaying()` advances by `FIXED_DT`, never by real dt.
- Anything that animates purely visually should use `elapsed` (real seconds) or `frameDt`.
- One-shot inputs (`justPressed`) are cleared after the *first* sim step of a frame, so a catch-up frame can't fire the same jump three times. Input arriving on a frame that produces zero steps is held over rather than dropped — `inputConsumed` in `gameLoop` governs this, and it must be computed before any input is read.

**Damage** — every damage source (enemy, boss, beam, pit) goes through `damagePlayer({invincibleFor, shake, ignoreIFrames})`. It handles i-frames, the Ring, life loss and the death transition. Don't re-inline that logic.

**Checkpoints** — `player.checkpointX/Y` records the last solid ground stood on. A pit fall costs a life and respawns there. Collectibles are deliberately **not** reset on respawn (doing so allowed farming +1-life burritos by repeatedly jumping into a pit).

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
- Low building x=1548, **w=1192** — tiled between T1 and T2; drawn **before** T1 in array so tower renders on top
- Two-storey x=2080, w=250 — sits within low building footprint
- T1 tower x=1410, w=178, y=162; awning x=1332, w=68, **y=405**, drawOffsetY=-40, wallOffset=45
- T2 tower x=2814, w=180, y=158; awning x=2737, w=67, y=412, drawOffsetY=-40, wallOffset=46
- Two-storey x=3200 (between T2/T3)
- Cart x=4750 (between T3/T4)
- T3 tower x=4318, w=182, y=154; awning x=4241, w=67, y=406, drawOffsetY=-40, wallOffset=46
- T4 tower x=5920, w=185, y=148; awning x=5836, w=74, y=400, drawOffsetY=-45, wallOffset=50, sprScale=1.1
- Two-storey x=6350 (after T4)

**The low building's width is pinned between two constraints — 1192 is the only
comfortable value.** Its right edge lands at world 3940:
- **Must be ≤ 3944** (`T2.x 4014 − Hogman's 70px width`). At the original 1212 the
  roof reached 3960, so a player running it got pinned against T2 while still
  standing on the final 16px — unable to fall off, with T2's awning 57px *below*
  them. Both characters were permanently stuck; **level 3 was uncompletable**.
- **Must be ≥ ~3937**, where T2's awning canopy starts. Any less and a visible gap
  opens between the building and the tower (1180 left a 76px hole).

At 3940 the building butts against the canopy, which tucks under the tower, so the
three read as one connected block — and the player still runs off the roof edge and
drops onto the awning.

**The low building's landing surface is the solid wall top (sprite row 21), not the
merlon tips (rows 5–18 are crenellations, only ~50–68% opaque).** Anchoring on the
merlons left the player perched on the battlement tips, visibly floating above the
wall-walk. The merlons now rise ~8px around their feet.

**Awning hitboxes sit under the painted canopy and stop at the tower's visible
wall.** They used to sit up to 126px to the *left* of the canopy (T2/T3/T4 did not
overlap their canopy at all) — you bounced off thin air and the visible awning did
nothing. `wallOffset` is re-solved as `0.882 × SPR_W − width` so the sprite stays
put when the hitbox moves.

### Tower sprite alignment (important)

`tower_obstacle.png` has large transparent margins **and** rooftop decoration, so its
bounding box is not its silhouette. Anchoring the sprite by its bounding box put the
collision surface ~70px above the painted roof — players stood on thin air above the
building. Measured from the PNG's alpha channel (1024×637):

| feature | pixel | fraction | constant |
|---------|-------|----------|----------|
| chimney tip (first opaque row — **not** a surface) | y=53 | 0.083 | — |
| parapet — full-width roof, the standing surface | y=132 | 0.207 | `TOWER_PARAPET_FRAC` |
| building base | y=622 | 0.976 | `TOWER_BASE_FRAC` |
| painted body left edge | x=388 | 0.379 | `TOWER_BODY_LEFT_FRAC` |
| painted body width | 264px | 0.258 | `TOWER_BODY_W_FRAC` |

`drawPlatform` solves for the draw rect that puts the **parapet on the collision top**
and the **base `TOWER_BURY` px under the street**, then anchors x by the painted body's
left edge (the body sits ~0.8% right of the PNG centre, so centring is not equivalent).
Each tower's collision `width` equals its painted body width, so the side-blocking wall
matches the visible facade.

**If `tower_obstacle.png` is ever redrawn, re-measure these five constants** — everything
else derives from them. `wallOffset` on each awning is tuned against the tower's *visible*
left face, so it must be re-checked too.

### The same rule applies to every level 3 building

`two_storey`, `cart` and `low_building` had the identical bug — the raw PNG was blitted
into the collision box, so the *painted* building ended up far smaller than the box:
players stood 38px above two-storey roofs and 12px above carts, with ~57px of invisible
platform hanging off each side of every two-storey. They now go through
`blitContentFit(key, x, y, w, h, metrics)`, which scales the sprite so its **painted
content exactly fills the collision box**. Metrics live in `SPRITE_METRICS`.

Rule of thumb for this project: **never anchor a sprite by its bounding box.** These PNGs
have 10–40% transparent margins and decorative bits (chimneys, eaves) outside the
silhouette. Anchor on measured features — the landing surface and the base.

### Verifying platform alignment

`drawPlatform` geometry is easy to get wrong and impossible to eyeball. Two tools
(kept out of the repo, in the session scratchpad — recreate if needed):

- **Screenshot harness** — a page that loads the real `game.js`, jumps to any level and
  world position, and optionally overlays every collision box on the rendered art, driven
  by headless Chromium. This is what makes misalignment obvious at a glance.
- **Numeric audit** — reads each sprite's alpha channel, replicates `drawPlatform`'s
  geometry, and reports the gap between each collision box and its painted content.
  Faster and more reliable than looking.
- **Playtest bot** — holds right and taps jump; reports how far each character gets and
  which towers they clear. This is what caught the low-building dead end; a static
  check never would have.

### Gollum sprite rendering

`drawGollumInGame` uses `VISUAL_H=92`. `sinkOffset` compensates for transparent bottom
padding in the source sprite. Formula: `drawY = y + h - drawH + sinkOffset`.

Every Gollum PNG (687×1024) has a **different** amount of padding below the figure, so
one shared offset cannot ground them all. Values in `GOLLUM_SINK` are measured, not
eyeballed — `sink = VISUAL_H × (1 − (contentBottom+1)/1024)` — plus a `PLANT` of 3px so
he reads as standing on the surface rather than hovering:

| sprite | content ends | sinkOffset |
|--------|--------------|-----------|
| `gollum_run` (crawling) | row 845 | 16 |
| `gollum_idle` | row 843 | 16 |
| `gollum_jump` | row 765 | 23 |
| `gollum_crouching` | row 759 | 24 |
| `gollum_hurt` | row 745 | 25 |

Re-measure if any Gollum sprite is redrawn or re-cropped.

### Drawing order note

`low_building` and `two_storey` entries appear **before** `tower_wall` entries in the `platforms` array so that tower sprites render on top where they overlap.

## Asset Conventions

- **PNG only** — `SpriteLoader` only loads `.png`.
- Sprites default facing **right**; `game.js` flips the canvas context for left-facing movement.
- Tiles that repeat horizontally must have matching left/right edges.
- All sizes are draw sizes via `blit()`; source resolution can be higher.
- Missing sprites are silent (no console error thrown to players); the procedural fallback draws simple shapes.

## Controls

| Key | Action |
|-----|--------|
| ←/→ | Move |
| Space / ↑ | Jump (hold for height; Gollum gets one air jump) |
| ↓ | Gollum: crouch / sneak past enemies. ↓ while running = slide |
| F | Hogman: hold to charge (needs fuel; +↑ launches upward) |
| Esc | Pause (the pause menu lists the active character's moves) |
| M | Mute |
| 1 / 2 / 3 | DEV: jump straight to that level while playing |

## Known Issues

- **Level 1 flat**: Elevated platforms are entirely optional; there's no incentive to use them in the first 2000 px.
- **`level1_tiles/` partially missing**: present — `bg_green_hills`, `bg_mountains_sky`, `ground_grass_standard`, `platform_wood_plank`. Still missing and falling back to procedural: `ground_grass_alt`, `ground_edge_left`, `ground_edge_right`. Adding these is the biggest remaining visual upgrade.
- **No score or timer** — collectibles only feed lives and Hogman's charge fuel.
- **DESIGN_NOTES.txt is largely historical** — it predates the level 2/3 art and its asset inventory is out of date. Treat this file as authoritative.

### Fixed (do not reintroduce)
- Physics ran at display refresh rate → double speed on 120 Hz. Now a fixed 60 Hz accumulator.
- `initLevel()` on Game Over restarted level 1 regardless of where you died — pass `currentLevel`.
- Pit respawn reset every collectible, allowing infinite lives off one burrito.
- Level 3 showed level 1's "TILE TROLL IS SLAIN" ending — endings now live in `COMPLETE_SCREENS`.
- `getZone()`/`getZoneBlend()` were dead code, so the documented "zone boundary mismatch" never actually affected rendering. Both removed.
- `lamp.png` is moot: no Magic Lamp exists anywhere in the code — no `PATHS` entry, no powerup, no collectible type. `powerups` is initialised empty and never read.

## The game of the book — `index.html` / `saga.js` / `saga-levels.js`

`index.html` is the game, so the site's root link opens it. `saga.html` is only a redirect, kept because
that link was shared before the game moved to the root. The 2D platformer lives at `classic.html`.

**This is the main game.** It follows the user's book, *The Hog Man Cometh, Part the First*
(`TheHogManComethPt1.pdf`, 47 illuminated pages), which is the guide for the whole game. The book's
own pages (`assets/book/p-NN.jpg`, exported from the PDF at 70 dpi) are shown as the story scenes
between stretches of play. Art style and mechanics are the ones worked out on the windmill level.

**The story, and what it changes from the earlier levels:** the Gollum Man is the Hog Man's
*companion, on a leash* — not a thief. The quest is for the Food of the Lamp. The hog is Juli. The
book's wizard is the old man in the cap with a staff and an untouched pint (`buildMiller({ staff })`),
not the pointy-hatted one. The villains are the wizard, the shield-maiden and the man from the tower.

| Chapter | Book pages | What happens |
|---|---|---|
| 1 The Darkling Trail | 4–8 | An opening scene: the trio ride up the road and in at the town's south gate (`GATE1`) as townsfolk turn to watch, then page 4; the wizard's warning; dark wood, fallen trunks, a ford; a bog of stepping stones (the mossy ones sink); a thorn bank climbed by a stair of logs; the Tile Troll at his pond (slams up close, hurls tiles at range); the wizard exiles him |
| 2 The Cold Mountain | 9–16 | Snowballs down the valley; the bent tower: a portcullis bars the pass until the Gollum Man is slimed three times with the tower man's slop, then he squeezes under and winds it up; the icy pass (ice, wind, two chasms); a knife-edge with a drop on both sides and a third chasm; a last gully of snowballs; the shield-maiden takes the Gollum Man |
| 3 The Oasis | 17–27 | Alone at night; the tavern (sing "I said maybe" to the barkeep three times for a row of ales); the small square door; candlelit corridor (narrow pillars, pillars, a drifting span, sinking stones); the shield-maiden in her lair; then the Gollum Man climbs up behind the rider and they dash out along a tunnel of sinking stones |
| 4 The White Castle | 28–47 | A snowfield and a frozen river crossed on drifting floes; the WANTED parchment; the endless spiral and its barrels; the Lamp and the feast; the three villains in turn; catch the Gollum Man at the window; a scripted scene of Juli's wings growing and the leap from the window; a flight through sixteen rings |

- **`saga.js` is the engine**: hog physics, camera, the companion, foes (`spawnTroll`, `spawnMaiden`,
  `spawnThrower`, `spawnCaster`, `spawnRollers`), HUD, pages/dialogue, chapter loading, the flight.
  Its generic sections (sound, input, collision, materials, particles) were lifted from `hog3d.js`;
  the two files are now separate; `hog3d.js` is the prologue, a page of its own (see below).
- **`saga-levels.js` is the chapters**: each is `{ bounds, cell, height, tint, ice?, start, ambience,
  build(E), begin(E) }`. `E` is the engine handle (see the `E` object near the end of `saga.js`).
  Ground is mostly a *trail* (`makeTrail`): `s` along it, `d` off to the right; `edge()` makes the
  banks and drops. Heights below −30 are void: not drawn, and a fall into them costs a heart.
- **Loading a chapter** throws away `world.g` and the entity lists and builds again; the hog, the
  Gollum Man, the leash and the HUD persist. Progress is no longer kept here: see the hub section
  (`hog-progress.js`). An old `hogSaga.chapter` save is read once and converted.
- **The Gollum Man has three modes** (`E.gollum(on, { mode })`): `follow` (on the leash), `stay` (holds a pose
  somewhere) and `ride` (up behind the rider: his model becomes a child of `hog.pillion`, see
  `mountGollum`). The user asked that he ride from the moment the shield-maiden is beaten, so he rides
  through the escape and all of chapter 4, getting down only for the window scene.
- **Scripted scenes** are `E.cutscene({ dur, step(t, dt, cine), done })`: `step` places the hog through `P`,
  sets `cine.wing / fly / run / pitch` for how he is drawn, and moves `E.camera` itself. ENTER skips to
  the end. `LEVELS[3].wing()` plays the take-off scene directly, for testing. Place each camera so no
  column or table sits between it and the hog: two of the first cut's angles were blocked.
- **The rider is deliberately portly** (the book: "a portly fellow"; the user asked for him fatter).
- **Older placements in chapter 4 are offset by `S4`**: the trail gained a first stretch, so inside
  `build` `at(s)` means `T4.at(s + S4)`; new content there uses `T4.at` directly.
- **Do not quote song lyrics.** The tavern joke is the book's own three words, "I said maybe".
- **Dev:** `?dev` gives keys 1–4 (jump to chapter) and N (finish chapter); `?level=3` starts there.
  `window.SAGA` is the test handle (`level`, `warp`, `tick`, `hold`, `press`, `skip`, `look`), and
  `saga-levels.js` exports `GEO` (trails, arenas, ambiences) for bots.
- **Hard-won lessons, each from a bot run — do not undo:**
  - *The ground grid cannot place a chasm's lip exactly.* A gap cut by `height()` alone came out
    2–6 units wider than intended and was unjumpable. Cut the void wide and set the real gap with
    solids (the pass's ice ledges `LEDGE2`; the corridor's pillars and stones).
  - *A ledge's lip is not a slope.* `stepPlayer` only slides the hog if the ground also rises behind
    him; before that he was pinned on the lip of any chasm he landed short of.
  - *A checkpoint must be on solid ground.* `E.flag(x, z, ox)`: the hog reappears at (x, z); the
    pole stands `ox` to the side. (Flags once respawned him inside a wall, over a void, forever.)
  - *Areas must overlap.* The corridor's floor stopped half a unit short of the lair's: a seam of
    void. Overlap rectangles and circles; `node` over `height()` along the centre line to check.
  - *Triggers are level-aware.* They fire only within 6 units of their own height, or a hog who has
    fallen off the pass finishes the chapter from underneath it.
  - *No wind at the chasms*, and it is announced 0.7 s before it bites.
  - *Bots carry momentum too.* A bot that jumps the instant it lands flies past zig-zag stones; give it a
    short pause before each hop (`pause` in the test `go()` helper) before deciding the level is at fault.
  - *Never append a `//` comment to the middle of a one-line statement with a patch.* It has
    silently commented out the rest of the line three times in this project; `node --check` on a
    `.mjs` copy catches it ("Unexpected strict mode reserved word").

## The windmill level (the prologue) — `hog3d.html` / `hog3d.js` / `hog3d-models.js`

The first 3D level built ("Tilting at Windmills"), before the book was the guide. It is now the
saga's prologue and tutorial: the origin of the Hog Man and Gollum Man team, which the book never
tells. `hog3d-models.js` is shared: it holds the cast and props for both games.

- **The two engines are joined by page navigation, not code.** NEW GAME in `saga.js`
  (`startPrologue`) shows book page 2, then goes to `hog3d.html?saga`, which skips its own title.
  Catching the Gollum Man and taking the ring back runs `win()`: a short dialogue (he bargains
  with what he knows of the Lamp), then `bindScene()`, a scripted scene in the saga's style
  (`startCine`/`stepCine`, cinema bars, ENTER skips): the hog rides a ring round him as three rope
  loops appear, a leash runs from the rider's hand to his head, cut to the road and the pair
  trotting to the city gate. It ends at `./?from=prologue`, where `boot()` in `saga.js` shows page
  3 and begins chapter 1. SKIP THE PROLOGUE on the title runs pages 2 and 3 straight into
  chapter 1. There is no win screen any more. Finishing chapter 1 lands in the hub (below).
- **Tutorial hints** are the `TIPS` list above `stepWorld`: each is a toast shown once, when its
  test first passes (near the hay bales, first food, first crow, the river, the mossy stones, the
  sails).
- **Arriving by navigation loses the click that unlocks audio**, so both pages call `Sound.wake()`
  on the first key or pointer press.
- **Staging the tying-up:** the deck is a 3.2 to 10.5 ring with burgers floating at four angles.
  `bindScene` hauls him to the nearest clear angle and ends the hog beside him, facing out; an
  earlier version parked the hog between him and the camera. It also marks food on the road as
  taken, or a taco floats in front of the hog for the whole ride.
- **Driving the scene from a bot:** `HOG.bind()` starts it and `HOG.cine.t` is its clock, but the
  page's own frame loop keeps running in real time and will finish the scene and leave the page.
  Set `window.requestAnimationFrame = () => 0` first, then step with `HOG.tick`.

### The hub — the same page, opened as `hog3d.html?hub`

After the prologue the windmill country is the hub the chapters open off (the user asked for it to
work like Mario 64's castle). `HUB` (the `?hub` query) switches `hog3d.js` from prologue to hub.

- **Progress is `hog-progress.js`**, imported by both pages: `{ pro, done, open }` in
  `localStorage['hogSaga.progress']`. `pro` = prologue finished, `done` = chapters finished (which
  is also the golden foods held), `open` = doors unsealed. Chapters unlock in order, so counts are
  enough. It also holds `RELICS` (the four golden foods and what each does).
- **Doors** are the `DOORS` list: city gate (chapter 1, never sealed), an arch by the quarry
  sealed by a great boulder (2), an arch in the hamlet sealed in ice (3), a hatch on the Great
  Windmill's deck (4). Riding into an open door goes to `./?level=n`. Finished doors carry their
  golden food above them.
- **Each seal needs the food of the chapter before** (`POWER = done`): the churro lengthens the
  charge and lets it smash the boulder, the popper sets the charge alight so it melts the ice, the
  chimichanga adds a ground-pound (Q or C in mid-air, pad B) that breaks the hatch. Without the
  food the Gollum Man barks a hint instead. **The powers exist only in the hub**; the chapters
  (`saga.js`) do not use them.
- **A chapter ends** in `saga.js` with `completeLevel(from)`: `awardRelic` flies the golden food
  from `from` (where the keeper fell) to the hog, then `finishLevel` saves and returns to
  `hog3d.html?hub&from=n&new`. `from` picks the door to arrive at; `new` plays the fanfare. Chapter
  3's food is given at the maiden's fall (`E.relic`), and the chapter still ends at the tunnel.
  Chapter 4 ends differently (the user asked for a cutscene after the rings and a return to the hub,
  in place of the old "And so ends Part the First" stats screen, which is gone): the flight's
  `done` runs `homeward` in `saga-levels.js`, a 13 s scene in which the Food of the Lamp comes down
  to the hog, the camera swings to the book's side-on picture and holds as they fly into the sun;
  then pages 46–47, then `hog3d.html?hub&from=4&new&flew`. `flew` makes the hub run `arrive()`:
  they glide in from the west on Juli's wings, land on the Great Windmill's deck, and the Gollum
  Man (on `hog.pillion` for the flight in) hops down; then the usual fanfare. The arrival camera
  starts south-west of the deck: from the north it looks through the Food of the Lamp floating over
  the hatch. `E.flyer` gives the scene where the flight left off.
- **Testing the flight end:** use `?level=4&dev`, `SAGA.LEVELS[3].wing()`, then `N` ends the flight.
  Watch it in real time: a scene skipped through with `SAGA.skip()` in a page whose frame loop is
  stopped leaves the take-off's white flash on screen (its fade-out runs on timers).
- **Arriving from a door**, the hog is put `out` units in front of it (19 by default) so the
  camera behind him is not inside the arch or the gate wall. The hamlet door uses 14: at 19 he
  landed on top of the well.
- **In the hub the Gollum Man is a pet on a leash** (`stepPet`): he heels, and when the hog stands
  idle he creeps round to the side the next door lies on. The bridge troll is gone and his
  burritos lie where he stood.
- **Title screen** (`saga.js`): NEW GAME wipes progress (asking twice if there is any) and starts
  the prologue; CONTINUE goes to the hub; H on a chapter's pause screen goes back to the hub.
- **Testing:** set `localStorage['hogSaga.progress']` by hand, then open `hog3d.html?hub&from=n`.
  `HOG.DOORS`, `HOG.prog` are exposed. `SAGA.E.complete()` finishes the current chapter.

### Camera

The user asked for the camera to track behind the hog by default. `updateCamera` (the same code in
`saga.js` and `hog3d.js`) swings the camera round behind his facing whenever he rides, at up to
1.6 radians a second. Steering is relative to the camera, so this is also what turns him when
left or right is held: he arcs round with the camera following. It does nothing while he rides
toward the camera (it would chase its own tail), while he stands still, or for 1.6 s (2.5 s after
a mouse drag) after the player turns the camera by hand. When testing it, measure the change in
`cam.yaw`, not the gap between camera and hog: while a sideways key is held they turn together
and the gap stays at 90°.

### The man in the tower (chapter 2)

The user asked that the Gollum Man be covered in muck before the hog can go on. A wall and
portcullis (`GATE2`) cross the pass past the bent tower; the hog cannot pass, jump or boost over it.

- **Three coats of slop** open it. The first bucket always lands on him (as in the book, page 12).
  After that a coat comes from a bucket that lands on him **and misses the hog**, or from him
  **sitting a full second** in the puddle a bucket leaves. The intended trick: when the target
  ring is under the hog, ride a few steps on so the Gollum Man trails into it.
- **Why those rules:** with "any bucket that touches him" or "walking through a puddle", a bot
  that just rode up to the gate and waited got him slimed three times without trying (he trails
  the hog through every dodge, and buckets that hit the hog often hit him too).
- **Then a scene** (`gateScene`, ENTER skips): he crawls to the gap, squeezes under, and winds
  the winch while the tower man laughs. The camera cuts to the far side looking back; from the
  near side, the wall hides the winch at any height.
- **He stays mucky** for the rest of the chapter: `E.muck(k)` in `saga.js` tints his materials
  toward brown (reset when a chapter loads), and he drips. The shadow's line "the small, damp
  one" now fits.
- The thrower takes `o.splash(x, y, z)`, called wherever a bucket lands that has no `onLand` of
  its own. `L2.muck`, `L2.tower`, `L2.gateScene` are left on the level for test bots. Buckets are
  pooled, so a bot must tell throws apart by their target, not by object.

### Music — `hog-music.js`

There are no audio files. Both pages import `makePlayer(tone, noise)` and hand it their own two
synth voices; `Sound.tune(name)` changes tune and `Sound.playing()` says which is on.

- **A tune is data** in `TUNES`: a step length, a bar length (8, or 6 for the jig and the
  boat-song), a bass note per bar, and a lead written one token per step (a MIDI note, `.` for a
  rest, `-` to hold). The header comment in the file has the format. The lead must be a whole
  number of bars; the check used when writing them is easy to redo in `node`.
- **Each level names its opening tune** (`music:` on the level object, set in `beginLevel`) and
  changes it with `E.music(name)`: chapter 1 goes town → trail → boss → trail; chapter 3 night →
  tavern → lair → boss; chapter 4 castle → boss → flight. The windmill country (prologue, hub and
  the saga's title) keeps the original Andalusian tune, with `boss` for the fight on the deck.
- **Nobody has listened to these.** They were composed as note lists and checked only by
  rendering each offline for level and clipping. Treat the melodies as a first draft.

### The side roads — four levels that are not in the book

`LF`, `LM`, `LV`, `LK` at the end of `saga-levels.js`: `LEVELS[4..7]`, opened as `./?level=5..8`,
in the order of `SIDES` in `hog-progress.js` (the hub's `DOORS[4..7]` follow the same order, and
`from=5..8` brings the hog back to the right door). `saga.js` counts the book's chapters as
`MAIN`; anything with `side: true` finishes without a golden food and just returns to the hub.

| Level | Door in the hub | Opens at | What it is |
|---|---|---|---|
| The Long Water (`ferry`) | by the raft jetty | 1 golden food | A raft ride: step round rocks, jump beams |
| The Belly of the Mill (`mill`) | foot of the Great Mill | 2 | A vertical climb: brackets, a gear with a sweeping arm, a hoist |
| Mount Molcajete (`molcajete`) | top of the quarry | 3 | A salsa lake with a tide, tortilla-chip stepping stones, rolling tomatoes |
| The Night Market (`market`) | the lake islet | 1 | Run a thief down three times in a grid of stalls |

- **Hot sauce:** five bottles a level (`E.sauce(k, x, z, y)`), saved the moment each is picked up
  as a bitmask in `progress.sauce[id]`. A bottle already found shows as a ghost. The hub's HUD
  shows the total out of 20. **Nothing spends them yet** (the plan was a secret boss, The Giants).
- **Engine hooks added for these** (all in `saga.js`): `E.safe(obj)` makes the respawn point an
  object read at the moment of the fall (the raft, which has moved on); `E.tide(y)` moves the
  water; level fields `drop` (how far is too far to fall, default 34) and `nosafe(x, z)` (ground
  never to respawn on); `E.flag(x, z, ox, y)` takes a height.
- **Anything placed by `groundBelow(x, z, 999)` lands on the highest floor at that spot.** In the
  mill, where floors stack, the start point, flags, items and triggers all need a clear spot or
  an explicit height. The first build started the hog on a landing 40 units up.
- **A raft or chip must overlap the bank it leaves from.** The ground grid blurs a shoreline over
  a cell or two, so a platform that merely touches the shore sits behind a dip the hog cannot
  step out of.
- **Beams are axis-aligned boxes**, so in The Long Water they sit only on the stretches of river
  that run due north.
- **Testing these:** a fall waits on a real-time fade (`fadeThen`), so a bot stepping with
  `SAGA.tick` alone leaves the hog frozen after his first fall. Yield to real time between
  batches of ticks (`await new Promise(r => setTimeout(r, 12))`). `GEO` exports each level's
  trail and lists; `LF.raft`, `LM.hoist`, `LV.bowl`, `LK.thief` are left on the level objects.

- **Needs an HTTP server, but no network.** WebGL will not texture from `file://`.
  three.js r170 is vendored at `vendor/three.module.min.js` (MIT, unmodified from the npm
  package) and wired up by the import map in `hog3d.html`. Only the two Google Fonts are
  remote; offline they fall back to system fonts.
  `./hogsaga` serves it (port 8137) with caching off. Add `?dev` for warp keys 1–9.
- **Stale scripts:** the stock `python3 -m http.server` let the browser keep old copies of the
  modules after an edit, which looks exactly like "my change did nothing". Use `./hogsaga`, which
  sends `Cache-Control: no-store`. The `?v=` on the script tag and on the models import is a
  belt-and-braces cache-buster; bump both if you ever serve it another way.
- **Both files are ES modules**, so `node --check hog3d.js` is not enough (it parses as sloppy-mode
  CommonJS and misses strict-mode errors). Copy to a `.mjs` and check that.
- **One file, no build.** Sections in order: world shape → renderer → assets → sound → input →
  collision → builders → entities → player → camera → loop.
- **Terrain** is the analytic `rawH(x, z)` baked into a grid; `terrainH()` interpolates the same
  triangles the mesh draws, so feet never float. Change hills/flats/river in `HILLS`, `FLATS`, `RIVER`.
  The grid is rectangular (`X0..X1`, `Z0..Z1`) because the island has a western lobe; `islandD()` is
  the coastline test (two overlapping ellipses).
- **Map:** city gate (south) → meadow, troll bridge and raft → north meadow → Great Windmill (north).
  West lobe: hamlet (`HAMLET`), lake with an islet and ruined mill (`LAKE`: stepping stones from the
  south, a broken plank bridge to the north), quarry hill (`QUARRY`: a 270° ramp cut by `rawH`,
  boulders rolling down it, a fifth heart at the top). The Gollum chase visits `PERCHES` in order:
  little mill → lake islet → east mill → Great Windmill deck.
- **Collision** is two shapes only — tapered cylinders and axis-aligned boxes (`addCyl`, `addBox`);
  `stand` makes the top a floor. Moving floors go in `movers` and expose `dx`/`dz`.
- **Everything in the world is a model, not a sprite.** `hog3d-models.js` builds the cast, food and
  props from boxes, cylinders and cones with small hand-pixelled canvas textures — the same recipe
  as the windmill, which is the look the user asked everything to match. There are no model files.
  Each character faces +Z with feet at y = 0 and has a `build*` and an `anim*` function; poses are
  tables of joint angles (`GOL_POSES`, the `p` objects in `animTroll`).
- **The 2D sprite art survives only as** dialogue portraits, HUD icons, the win card, and the
  lettering on the troll's sign (`SPRITE_FILES`). Do not reintroduce billboards for characters.
- **Simulation** runs in sub-steps of at most 1/90 s; visuals use real dt.
- **`window.HOG`** is a console/test handle: `HOG.warp(x, z, y)`, `HOG.tick(dt, n)`,
  `HOG.hold(code)`, `HOG.press(code)`, `HOG.skip()`, and `HOG.look(x, y, z, yaw, pitch, dist)` to
  park the camera on a point for inspecting a model (`HOG.spy = null` releases it).
- **Test with bots, not by eye.** Every route was proven by scripts driving `HOG.hold`/`HOG.tick`:
  stair, raft, stones (mossy ones sink), plank bridge (the middle span drifts — wait for it), quarry
  ramp (straight up the middle costs ~3 hearts, switching lanes costs none, a charge smashes rocks).
  Re-run that kind of bot after touching jump physics, gaps or timings.
- **Great Windmill sails** turn the way the stair climbs (negative `MILL.speed`) and exactly one
  step sits in their sweep. Turning them the other way, or widening the hit zone in `stepSails`,
  made that step impossible to cross — re-run a timing bot if you touch either.
