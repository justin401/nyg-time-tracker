ICON GENERATION INSTRUCTIONS
=============================

The SVG source icons (icon-192.svg, icon-512.svg) are included as reference.
Safari and Android require PNG files. To generate them:

OPTION A - Sharp (Node.js, recommended for CI):
  npm install -g sharp-cli
  sharp -i icon-192.svg -o icon-192.png
  sharp -i icon-512.svg -o icon-512.png

OPTION B - Squoosh / Figma / Sketch:
  Open the SVG, export as PNG at the correct dimensions.

OPTION C - Browser dev tool (quick):
  Open the SVG in Chrome, open DevTools > Rendering > Capture screenshot.

OPTION D - imagemagick (if installed):
  magick icon-192.svg icon-192.png
  magick icon-512.svg icon-512.png

Place the resulting icon-192.png and icon-512.png in this same /public/icons/ folder.
The manifest.json already points to these paths.

MASKABLE ICONS
==============
For Android Adaptive Icons, the safe zone is the center 80% of the canvas.
The current SVG designs already keep content within that safe zone.
The manifest uses "purpose": "any maskable" which covers both use cases.
