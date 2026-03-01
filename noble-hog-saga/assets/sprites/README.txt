NOBLE HOG SAGA — Sprites Directory
====================================

Sprites are organised into subfolders by character / category.
The SpriteLoader automatically tries to load each PNG below.
If a file is missing, the game falls back to procedural canvas drawing.

FOLDER STRUCTURE
----------------

  hogman/
    hogman_idle.png     — Hogman standing still on his hog
                          Draw size in-game: 60×50 px
    hogman_run.png      — Hogman running animation (single frame or strip)
                          Draw size in-game: 60×50 px
    hogman_defeat.png   — Death animation frame (not yet wired in code)
    Hogman_03-07.jpg    — Source reference images

  gollum/
    gollum_idle.png     — Gollum Man crouched still
                          Draw size in-game: 50×30 px
                          NOTE: sprite faces LEFT by default (code flips it)
    gollum_run.png      — Gollum Man crawling (add here when ready)
                          Draw size in-game: 50×30 px
    gollum_sprites.png  — Full sprite reference sheet
    gollum_dle_weapon.png — Alternate idle with weapon

  enemies/
    enemy_knight.png    — Cursed Knight patrol sprite
                          Draw size in-game: 24×30 px
                          Faces RIGHT by default; code flips for leftward patrol
    enemy_rat.png       — Swamp Rat patrol sprite
                          Draw size in-game: 32×30 px
                          Same flip convention as knight
    enemy_knight_attack.png  — Attack frame (not yet wired)
    enemy_knight_block.png   — Block frame (not yet wired)
    enemy_knight_flinch.png  — Flinch/hit frame (not yet wired)

  collectibles/
    burger.png          — Burger collectible (100 pts)  22×22 px bounding box
    taco.png            — Taco collectible (150 pts)    22×22 px bounding box
    burrito.png         — Burrito collectible (200 pts) 22×22 px bounding box
    lamp.png            — Magic Lamp power-up           32×32 px (add here)

NOTES
-----
- All sprites should face RIGHT by default unless noted otherwise
- Use transparent backgrounds (PNG-24 with alpha)
- Sprites are drawn scaled to fit — higher-resolution sources are fine
- Animation strips are not yet supported (single frame per file used)
