## 1. Schema

- [x] 1.1 Add `border-radius` key (type `i`, default 100, range 0–1000) to `schemas/org.gnome.shell.extensions.ringlight.gschema.xml`
- [x] 1.2 Recompile `glib-compile-schemas schemas/` and commit the new `gschemas.compiled` binary

## 2. Preferences

- [x] 2.1 Add `border-radius` spin row in `prefs.js` (same pattern as border-width: 0–1000, step 10, `Gio.SettingsBindFlags.DEFAULT`), with subtitle explaining inner radius = radius − ring width
- [x] 2.2 `node --check prefs.js`

## 3. Extension

- [x] 3.1 In `_build()`, add radius read: `const RADIUS = this._settings.get_int('border-radius')`
- [x] 3.2 Add per-monitor ring widget: **work area** rect, `reactive: false`, style with per-side border widths (`marginX`/`marginY`) and `border-radius: <RADIUS>px`, no background; `addChrome(a)` **without** `affectsStruts` so it never contributes struts
- [x] 3.3 Change the four strips to `background-color: transparent` (keep `affectsStruts: true`, same geometry, `reactive: false`)
- [x] 3.4 `node --check extension.js`
- [x] 3.5 Size strut strips from monitor edge to ring edge: top/bottom heights and left/right widths include the bar's reserved space from work-area deltas (`workArea.y − monitor.y` etc.), so the ring reserves bar space + ring thickness
- [x] 3.6 After `removeChrome`, force fresh struts via guarded `Main.layoutManager._updateRegions()` so `getWorkAreaForMonitor` excludes the ring's own strips (prevents runaway on settings-change rebuilds)
- [x] 3.7 `node --check extension.js`

## 4. Manual verification

- [ ] 4.1 Shell restart; ring activates on camera use with rounded corners (outer 100 at default width; inner sharp since 100 < 150)
- [ ] 4.2 Change `border-radius` in prefs while ring active → ring redraws live, no camera toggle needed, no position drift (rebuild loop stays stable)
- [ ] 4.3 Set radius 0 → sharp corners; set radius 300 → clearly rounded inner corners; set radius 1000 on small monitor → clamped, no crash
- [ ] 4.4 Resolution mode → per-side thickness still correct with rounded corners
- [ ] 4.5 Regressions: camera on/off, second camera, v4l2 direct-open, monitor add/remove while active, disable while active, maximized windows shrink/restore, fullscreen keeps ring visible
- [ ] 4.6 `journalctl -f /usr/bin/gnome-shell` clean of new errors
- [ ] 4.7 Ring starts below the top bar (band visible, not hidden behind panel) and ends above the task bar; dock added/removed/resized while active → ring follows
