## 1. Schema

- [x] 1.1 Add `width-mode` string key (enum values `pixels`, `resolution`, default `pixels`) to `schemas/org.gnome.shell.extensions.ringlight.gschema.xml`
- [x] 1.2 Add `available-width` and `available-height` int keys (range 1–16384, defaults 1920 / 1080) to the schema
- [x] 1.3 Recompile and commit `schemas/gschemas.compiled` with `glib-compile-schemas schemas/`

## 2. Extension

- [x] 2.1 In `_build()`, read `width-mode`; in `pixels` mode keep single `BORDER` for all strips (current behavior)
- [x] 2.2 In `resolution` mode compute per-axis margins: top/bottom `Math.max(1, Math.round((height − available-height) / 2))`, left/right `Math.max(1, Math.round((width − available-width) / 2))`
- [x] 2.3 Use the computed per-axis thicknesses for the four strip geometries instead of the single `BORDER` where applicable
- [x] 2.4 Syntax check: `node --check extension.js`

## 3. Prefs

- [x] 3.1 Add `Adw.ComboRow` for `width-mode` (two options: pixels, resolution)
- [x] 3.2 Add SpinRows bound to `available-width` and `available-height`
- [x] 3.3 Toggle row visibility on settings change: pixel row hidden in resolution mode, resolution rows hidden in pixel mode
- [x] 3.4 Syntax check: `node --check prefs.js`

## 4. Manual verification

- [ ] 4.1 Full shell restart, ring activates with camera on: pixel mode default looks identical to before
- [ ] 4.2 Switch to resolution mode in prefs with e.g. 1920×1080 available on a larger monitor: ring thicker on the sides, work area shrinks to the configured available resolution
- [ ] 4.3 Change available-width/height while ring active: ring rebuilds live without restart
- [ ] 4.4 Switch back to pixels mode: ring returns to `border-width` behavior
- [ ] 4.5 Regression: camera on/off, monitor add/remove, disable while active still behave per `camera-triggered-ring` spec
