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
  - Duration scales with fuel: max(0.15s, 0.45s × fuel)
  - Hold ArrowUp + F → upward boost (vy = -(speed × 3.5)); plain F → horizontal charge
  - Works on ground AND in air
  - Kills regular enemies on contact (player.sliding && hogman check in checkEnemyCollisions)
  - Can damage boss when crouching/vulnerable; bounces Hogman back otherwise
  - Visual: green (#77dd11) speed-lines — horizontal trails for forward, downward for upward boost
  - HUD: green fuel bar + F keycap indicator
- Gollum has crouch + slide (slide sneaks past enemies, same as crouch)
- Gollum has 1 air jump (double-jump); Hogman has 0

## Lives HUD
- Both characters use sprite icons (hogman_idle / gollum_idle) + "LIVES REMAINING" label
- Falls back to red hearts if sprite not loaded
- liveSprKey selected by character, not hardcoded to gollum
