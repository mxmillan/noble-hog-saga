NOBLE HOG SAGA — Backgrounds Directory
========================================

Background layers are drawn procedurally by default — no image files are
needed. To replace a procedural background with a real image, place it here
and the SpriteLoader will detect and use it automatically.

Expected filenames:

  splash_screen.png    — Splash / title screen background
                         683x1024px portrait, medieval book-cover style
                         (currently in use)

  character screen.png — Character select screen background
                         683x1024px portrait, same book style
                         Two empty portrait boxes for character sprites
                         (currently in use — note: filename has a space)

  intro_screen.png     — Story intro / text crawl background
                         683x1024px portrait, same book style
                         Should be a blank open-page interior — no text,
                         no portrait boxes. The text crawl is rendered on
                         top by the engine at runtime.
                         (drop this file in to activate)

  level1_bg.png        — Full scrolling background for Level 1
                         "The Road to White Castle"
                         4000x500px landscape (or tileable strip)
                         Dark fantasy night sky, silhouetted mountains,
                         trees, earthy ground — procedural version active
                         until this file is present.

Art notes for level1_bg.png (if painting manually):
  - Dark fantasy night sky (#1a1a2e to #2d1b00 gradient)
  - Distant mountains — dark silhouettes, two depth layers
  - Midground silhouetted trees
  - Earthy ground strip at bottom
  - White Castle silhouette faintly visible on far right

Recommended format: PNG-24, 72dpi, optimised for web.
