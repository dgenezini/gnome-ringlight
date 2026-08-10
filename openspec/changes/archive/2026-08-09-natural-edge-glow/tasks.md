## 1. Schema & prefs

- [x] 1.1 ~~Add `border-opacity` key~~ — added during development, then removed per user request (no transparency beside glow radius); final schema has no new key
- [x] 1.2 Schema recompiled during development; final schema identical to original (key removed)
- [x] 1.3 ~~Bind `border-opacity` slider~~ — added then removed; prefs.js unchanged in final state

## 2. Cairo ring rendering

- [x] 2.1 Replace the CSS-border `St.Widget` ring in `extension.js` `_build()` with an `St.DrawingArea` painted via Cairo (`Clutter.Canvas` removed in mutter-18; DrawingArea is the current shell API)
- [x] 2.2 Implement the draw callback: scale by `St.ThemeContext.get_for_stage(global.stage).scale_factor` for HiDPI (surface size is physical px; draw in logical px)
- [x] 2.3 Small edge gradient via real `Shell.BlurEffect` (ACTOR mode), `GLOW_RADIUS = 2` → ~3px soft fade at inner + outer band edges, flat colored center. Wide radius (∝ W) rejected: bled too far into the screen. (Downscale-upscale trick rejected: low-res artifacts.)
- [x] 2.4 Fix clipped ring: band spans exactly `[PADDING, PADDING + W]` (W = `max(marginX, marginY)`) — widget enlarged by `GLOW_M = radius × 3` so stroke + glow both fit inside; stroke centered on path inset `GLOW_M + W/2`. Ring thickness = configured width, glow not cut.
- [x] 2.5 Color from `temperatureToRGB`, stroke alpha 1.0 (fully opaque); blur isotropic → no corner/diagonal fade.
- [x] 2.6 Rebuild path repaints: `_build()` creates fresh DrawingAreas, each repaints once on allocation; settings/monitor/camera changes already route through `_build()`
- [x] 2.7 Keep ring below panel via `set_child_below_sibling(panelBox)`; strut strips unchanged

## 3. Verify

- [x] 3.1 `node --check extension.js prefs.js`
- [x] 3.2 Manual test (shell restart, `journalctl -f /usr/bin/gnome-shell`): camera on/off shows gradient + glow ring, content visible through it, clicks pass through
- [x] 3.3 Manual test: change `border-color-temperature` in prefs while active → ring rebuilds live
- [x] 3.4 Manual test: monitor add/remove and disable-while-active still behave (struts, work area) exactly as before
- [x] 3.5 Manual test on HiDPI monitor if available; else confirm scale-factor path doesn't error
