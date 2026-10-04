# Settings neon background

Preferences uses a quiet purple and mako-green LED contour illustration behind the settings
form. It follows the supplied rear-view figure and sword reference and the selected darker
S7 icon. Personal instructions uses a contrasting translucent dark field with a purple border.
Controls stay above the artwork; it ignores pointer events, stays stationary while
the form scrolls, uses lower opacity on mobile, and disappears in forced-colors mode.

The canonical transparent PNG and exact prompt are in `docs/stylesheet/settings/`.
The app loads the smaller 800x1200 WebP with alpha from `public/sector-7-settings-neon.webp`.
Generated through the authorized Azure Foundry `gpt-image-2` CLI fallback, then keyed from
black with the bundled soft-matte helper (thresholds 8/90) to preserve the LED bloom.

## Verification

Transparency verified with alpha spanning 0-255 and dark open interiors. Browser checks
cover desktop/mobile form readability, input hit targets, bounded internal scrolling and
forced colors. Claude approved the styles and a focused modal-height follow-up.
