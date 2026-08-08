## 1. Camera monitor

- [x] 1.1 Add `Shell` import to `extension.js`
- [x] 1.2 Create `_cameraMonitor`: `new Shell.CameraMonitor()`, connect `notify::cameras-in-use` to `_onCameraChanged` (same object as GNOME Shell's camera indicator)
- [x] 1.3 Add `_cameraInUse()` helper reading the `cameras-in-use` property, returning `false` when monitor is null

## 2. Ring lifecycle gating

- [x] 2.1 Split `enable()`: create monitor, read initial camera state, wire notify handler
- [x] 2.2 Add `_setActive(active)`: on true run `_build()` and connect `monitors-changed` (store id); on false remove all chrome strips and disconnect `monitors-changed`
- [x] 2.3 `_onCameraChanged()`: read `cameras-in-use`, call `_setActive()` only when state actually changed
- [x] 2.4 Gate `monitors-changed` handler: rebuild ring only while active
- [x] 2.5 Fallback: when monitor creation fails, log warning and call `_setActive(true)` permanently (no monitor to watch)
- [x] 2.6 Update `disable()`: disconnect notify, drop monitor reference, tear ring down if active (existing teardown loop covers it)

## 3. Verification

- [x] 3.1 Syntax-check `extension.js` (`node --check` or GJS parse) after changes
- [x] 3.2 Manual test: enable extension, open camera app → ring appears, maximized windows on all workspaces shrink; close camera app → ring disappears, windows restore
- [x] 3.3 Manual test: toggle monitors (add/remove) while ring active → ring rebuilds; while inactive → no ring
- [x] 3.4 Manual test: disable extension while camera in use → ring gone, work area restored, no errors in `journalctl -f /usr/bin/gnome-shell`
