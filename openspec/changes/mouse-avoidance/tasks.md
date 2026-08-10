## 1. Schema and preferences

- [x] 1.1 Add `cursor-radius` (int 0–1000, default 150) and `cursor-fade` (int 0–1000, default 150) keys to `schemas/org.gnome.shell.extensions.ringlight.gschema.xml`
- [x] 1.2 Recompile and commit the binary: `glib-compile-schemas schemas/`
- [x] 1.3 Add two `Adw.SpinRow`s (radius, fade) bound to the new keys in `prefs.js`, following the existing row pattern

## 2. Shader

- [x] 2.1 Add `u_mouse_x`, `u_mouse_y`, `u_cursor_radius`, `u_cursor_fade` uniforms to `RING_SHADER`; in `main()`, when `u_cursor_radius > 0.0`, multiply `alpha` by `smoothstep(u_cursor_radius, u_cursor_radius - u_cursor_fade, distance(point, vec2(u_mouse_x, u_mouse_y)))`
- [x] 2.2 Pass the four uniforms from `_build()` (cursor local to each ring, in physical px: `(cursorGlobal − ring origin) * scale`; radius/fade `* scale`), reading the cursor from `this._cursorPos` if known

## 3. Pointer tracking

- [x] 3.1 Add `_cursorPos` (init null) and `_rings = []` tracking the ring widgets; push each ring into `_rings` in `_build()`
- [x] 3.2 In `enable()`, connect `global.stage` `motion-event`; handler stores `event.get_coords()` and, when the ring is active and `cursor-radius > 0`, updates `u_mouse_x/u_mouse_y` on every ring's effect via `set_uniform_value` (float GObject.Value helper like `vfunc_paint_target`); disconnect in `disable()`
- [x] 3.3 Initialize `_cursorPos` in `_build()` from `global.display.get_pointer_info().get_position()` inside a try/catch; leave null on failure (hole appears at first motion event)
- [x] 3.4 Re-read stored `_cursorPos` into uniforms when settings rebuild (`_build`) recreates ring effects

## 4. Verification

- [x] 4.1 Syntax check: `node --check extension.js prefs.js`
- [ ] 4.2 Manual test: hole follows cursor live, smooth edge, no hard line; cursor over ring lets clicks through; hole continuous across monitors; radius 0 disables; radius/fade changes apply live from prefs; HiDPI monitor renders hole sharp (no blurry circle)
- [ ] 4.3 Watch `journalctl -f /usr/bin/gnome-shell` during testing; confirm no warnings (incl. no `global.get_pointer` deprecation), no shader compile errors, no perf complaints
- [ ] 4.4 Regression: camera on/off, monitor add/remove, disable while active, fullscreen call — ring appears/disappears and struts behave as before
- [ ] 4.5 If the hole does not follow the pointer on Wayland (stage `motion-event` not firing), add a 250 ms GLib timeout fallback that re-reads the pointer and re-updates uniforms
