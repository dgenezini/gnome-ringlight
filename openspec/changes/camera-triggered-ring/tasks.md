## 1. Camera portal proxy

- [ ] 1.1 Add `Gio` import to `extension.js`
- [ ] 1.2 Create `_createCameraProxy()`: `Gio.DBusProxy` for `org.freedesktop.portal.Camera` at `/org/freedesktop/portal/camera` on the session bus (sync proxy, `init()`), returning proxy or `null` on failure
- [ ] 1.3 Add `_cameraInUse()` helper reading `proxy.IsCameraInUse`, returning `false` when proxy is null

## 2. Ring lifecycle gating

- [ ] 2.1 Split `enable()`: build proxy, read initial camera state, wire `g-properties-changed` (and `DevicesChanged` signal) to `_onCameraChanged`
- [ ] 2.2 Add `_setActive(active)`: on true run `_build()` and connect `monitors-changed` (store id); on false remove all chrome strips and disconnect `monitors-changed`
- [ ] 2.3 `_onCameraChanged()`: read `IsCameraInUse`, call `_setActive()` only when state actually changed
- [ ] 2.4 Gate `monitors-changed` handler: rebuild ring only while active
- [ ] 2.5 Fallback: when proxy creation fails, log warning and call `_setActive(true)` permanently (no portal signals to watch)
- [ ] 2.6 Update `disable()`: disconnect proxy signals, drop proxy reference, tear ring down if active (existing teardown loop covers it)

## 3. Verification

- [ ] 3.1 Syntax-check `extension.js` (`node --check` or GJS parse) after changes
- [ ] 3.2 Manual test: enable extension, open camera app → ring appears, maximized windows on all workspaces shrink; close camera app → ring disappears, windows restore
- [ ] 3.3 Manual test: toggle monitors (add/remove) while ring active → ring rebuilds; while inactive → no ring
- [ ] 3.4 Manual test: disable extension while camera in use → ring gone, work area restored, no errors in `journalctl -f /usr/bin/gnome-shell`
