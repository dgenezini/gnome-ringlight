# Tasks: Quick settings toggle for ring mode

## 1. Schema

- [x] 1.1 Add `ring-mode` key (`s`, default `'auto'`, values `auto|always|off`) to `schemas/org.gnome.shell.extensions.ringlight.gschema.xml` with summary/description
- [x] 1.2 Recompile `glib-compile-schemas schemas/` and verify the new key validates (`glib-compile-schemas schemas/ --dry-run` or equivalent); commit the new `gschemas.compiled` binary

## 2. Ring visibility logic

- [x] 2.1 Add `this._cameraInUse = false` field and a `_refresh()` method computing `active = mode !== 'off' && (mode === 'always' || _cameraInUse)` and calling `_setActive(active)`
- [x] 2.2 Route the camera notify handler through `_refresh()`: `notify::cameras-in-use` sets `_cameraInUse` then calls `_refresh()` (replaces direct `_setActive`)
- [x] 2.3 Route the v4l2 poll through `_refresh()`: poll sets `_cameraInUse` from the streak logic, then calls `_refresh()`
- [x] 2.4 Restructure `enable()` camera-monitor fallback: on `new Shell.CameraMonitor()` failure, set `_cameraInUse = true`, log the warning, and continue setup instead of the early `return` — so the toggle and `changed::ring-mode` listener still exist and `off` mode is honored
- [x] 2.5 Connect `changed::ring-mode` to `_refresh()`
- [x] 2.6 Early-return from `_v4l2Poll()` when mode is not `auto` (skip the per-second /dev+/proc scan in `always`/`off`)

## 3. Quick Settings toggle

- [x] 3.1 Import `QuickSettings` (`resource:///org/gnome/shell/ui/quickSettings.js`) and `PopupMenu`; build a `QuickSettings.QuickMenuToggle` titled "Ring Light" with `camera-video-symbolic` icon
- [x] 3.2 Add three popup menu items — Automatic / Always On / Off — via `toggle.menu.addAction()`; mark the active mode with a check ornament (`setOrnament`)
- [x] 3.3 Wire toggle → settings: clicking a menu item sets `ring-mode` via `settings.set_string()`
- [x] 3.4 Wire settings → toggle: `changed::ring-mode` updates subtitle, icon, and ornament to the current mode (single `_updateToggle()` helper)
- [x] 3.5 Register the toggle via an invisible `SystemIndicator` + `addExternalIndicator()` in `enable()` (GNOME 45–50 stable API; `addQuickSettingsItems` was removed), call `toggle.destroy()` + `indicator.destroy()` in `disable()`
- [x] 3.6 Call `_updateToggle()` once in `enable()` after setup so the toggle shows the persisted mode at startup

## 4. Verification

- [x] 4.1 Syntax check: `node --check extension.js prefs.js`
- [ ] 4.2 Manual test (full shell restart first): toggle shows all three modes; `always` shows ring with no camera; `off` hides ring with camera in use; `auto` keeps old camera behavior; switching modes applies live with no restart; camera on/off; monitor add/remove while active; disable while active; disable removes toggle
- [ ] 4.3 Persistence test: set `always`, restart shell, toggle still shows Always On and ring is on; `dconf write /org/gnome/shell/extensions/ringlight/ring-mode off` while running updates toggle and ring live
- [ ] 4.4 Fallback test (optional, camera monitor unavailable path): `off` mode shows no ring, `auto` keeps the permanent ring + warning
- [ ] 4.5 Archive the change with `/opsx-archive` once specs are synced
