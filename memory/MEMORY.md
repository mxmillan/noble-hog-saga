# Noble Hog Saga — Session Memory

## Hogman Sprite Sizing (game.js: drawHogmanInGame)
- Idle: `drawH = h * 1.3`, anchored with `drawY = y + h + 18 - drawH` (grows upward, feet stay planted)
- Run: `scale = Math.min(w / sz.w, h / sz.h) * 1.55` — bumped from original 1.35 to match idle visual size
- These values were tuned and confirmed looking good by the user

## Hogman Charge Gas Sprites
- Horizontal charge: `hog_charge_gas.png` — drawn behind player at `x - cloudW + w * 0.45`, size `h * 1.7`
- Upward charge: `hog_charge_gas_jump.png` — drawn below feet, size `cloudW * 1.5` × `cloudH * 0.65` (wider, shorter)
- Parent ctx handles horizontal flip for left-facing — no extra transforms needed for horizontal cloud
- Do NOT use canvas rotation/scale transforms on these sprites — use dedicated assets for orientation variants

## Hogman vs Gollum Mechanics
- jumpForce: Hogman=6, Gollum=8
- Hogman has NO crouch — Down key does nothing
- Hogman charge: F key, fueled by collectibles (taco +0.15, burger +0.25, burrito +0.50, cap 1.0)
  - Duration scales with fuel: `max(0.40s, 1.10s × fuel)` (tuned over multiple sessions for feel)
  - Hold ArrowUp + F → upward boost (vy = -(speed × 3.5) = -10.5); plain F → horizontal charge
  - Upward charge max rise ≈ 115px; horizontal charge vx = speed × 3.5 = 10.5px/frame
  - Works on ground AND in air
  - Kills regular enemies on contact (player.sliding && hogman check in checkEnemyCollisions)
  - Can damage boss when crouching/vulnerable; bounces Hogman back otherwise
  - Visual: green (#77dd11) speed-lines — horizontal trails for forward, downward for upward boost
  - HUD: green fuel bar + F keycap indicator
- Gollum has crouch + slide (slide sneaks past enemies, same as crouch)
- Gollum has 1 air jump (double-jump); Hogman has 0
- On respawn (lose a life): all collectibles reset to uncollected, chargeFuel resets to 0

## Lives HUD
- Both characters use sprite icons (hogman_idle / gollum_idle) + "LIVES REMAINING" label
- Falls back to red hearts if sprite not loaded
- liveSprKey selected by character, not hardcoded to gollum

## Level Architecture
- LEVEL_WIDTH = 8500 + LEVEL_PREAMBLE (1200) = 9700px for all levels
- All non-ground platforms/collectibles/enemies shift +LEVEL_PREAMBLE in initLevel
- State machine progression: L1 → L2 → L3 → SPLASH (Enter on LEVEL_COMPLETE)
- Dev shortcuts: Digit1/2/3 jump directly to that level

## Level 2 — Dark Forest (gap-based platforming)
- No ground in middle — player must platform across gaps
- Start runway extends to x=1900 (LEVEL_PREAMBLE+700) so Hogman can charge-up under first platform
- End runway extended to 1600px wide with city_gate.png drawn at end
- Two platforms lowered for Hogman reachability (upward charge = 115px max):
  - Plat 5: y=185 → y=230 (was unreachable from plat 4 at y=330)
  - Plat 8: y=200 → y=255 (was unreachable from plat 7 at y=355)
- Collectibles added: burritos on runway + before big jumps; tacos on each platform
- Crow enemies patrol mid-air gaps (type: 'crow')

## Level 3 — Strange City (solid ground)
- Ground at y=470 (lower than L1/L2's y=420 — more visible street floor)
- Platforms have `variant` field ('red'|'blue'|'red_double') selecting tile sprite
- All platforms: y + h = 470 (bottom flush with ground — look like street blocks)
- Sprite keys: l3_bg, l3_ground, l3_platform_red, l3_platform_blue, l3_platform_red_double
- No boss or enemies yet

## City Gate (Level 2 end)
- Sprite: `l2_city_gate` → `assets/backgrounds/level2_tiles/city_gate.png`
- Drawn AFTER platforms (overlays ground), in world space
- Position: `LEVEL_WIDTH - gateW * 0.85` x, `420 - gateH * 0.84` y
- Size: `canvas.height * 1.2` tall, width from aspect ratio
- Fraction 0.84 anchors the castle wall base to ground — tuned and confirmed correct

## Splash Screen
- Procedural fallback removed from drawSplash() — shows only dark background (#1a0a00) until sprite loads
