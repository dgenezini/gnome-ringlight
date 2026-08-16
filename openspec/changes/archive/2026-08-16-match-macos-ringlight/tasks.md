## 1. Render macOS-style light profile

- [x] 1.1 Replace in-band `inside × glow` shader calculation with scaled white core plus smooth cool-white near/far halo, preserving rounded SDF corners and normal alpha compositing.
- [x] 1.2 Allocate and clip visible non-strut ring actor for halo geometry without crossing monitor bounds; keep transparent struts as sole work-area reservation.
- [x] 1.3 Keep existing width, brightness, temperature, padding, and optional cursor-avoidance settings rebuilding profile live.
- [x] 1.4 Clip the glow at the ring's inner band edge so the light never paints over window content; the usable area is set by the strut width alone.
- [x] 1.5 Remove `softness` and `glow` settings (schema keys, prefs rows, shader uniforms): on the fixed reference profile they only degrade the look.
- [x] 1.6 Make the glow tail fill the reserved band and reserve exactly the light footprint in pixel mode (no dead space); remove the `ring-width` setting, keep resolution mode deriving the band.
- [x] 1.7 Tint the halo cool blue after the reference light (blue-dominant, not white).
- [x] 1.8 Center the core in the reserved band with symmetric glow tails on both sides, matching the reference glow-core-glow profile.

## 2. Set continuous reference defaults

- [x] 2.1 Change schema defaults to 200 logical-pixel fixed ring width and disabled cursor transparency; update setting descriptions if behavior wording changed.
- [x] 2.2 Update preference labels/subtitles for core-and-halo rendering without adding controls.
- [x] 2.3 Recompile committed schema binary with `glib-compile-schemas schemas/`.

## 3. Verify supported behavior

- [x] 3.1 Run `node --check extension.js prefs.js`.
- [x] 3.2 Manually verify default light core/halo on dark and light wallpaper at scale factors 1 and 2, including panel/dock gaps and cursor transparency on/off.
- [x] 3.3 Manually verify camera on/off, monitor add/remove, and disable while active; confirm maximized/tiled work area remains strut-defined.
