## Context

The extension is a single-file GNOME Shell extension (`extension.js`) that draws a 150px white border per monitor via `Main.layoutManager.addChrome(actor, {affectsStruts: true})`. Struts make mutter shrink the work area on every workspace, so maximized/tiled/new windows stay inside the ring. Today the ring is permanent while the extension is enabled.

The ring's purpose is video calls, so it should only exist while a camera is in use. Camera in-use state comes from mutter's `Shell.CameraMonitor` (`cameras-in-use` property) — the exact object GNOME Shell's own camera indicator binds to (`js/ui/status/camera.js`).

## Goals / Non-Goals

**Goals:**
- Ring appears when the first camera turns on, disappears when the last camera turns off.
- While active, keep current behavior exactly: maximized/tiled windows on all workspaces resize to fit inside the ring.
- Graceful fallback if the camera monitor is unavailable (ring stays always-on, logged).

**Non-Goals:**
- Manually resizing unmaximized windows (they are untouched today; struts only affect maximize/tiling/placement).
- A user toggle for camera-triggered vs always-on.
- Per-camera or per-monitor configuration.

## Decisions

### 1. Detect camera-in-use via mutter's `Shell.CameraMonitor`
`Shell.CameraMonitor` tracks camera usage over PipeWire (cameras acquired by apps) and exposes a readonly boolean property `cameras-in-use` with `notify`. It is the same object GNOME Shell's camera indicator binds to. This works on every shell that has the privacy indicator — no service, version, or activation dependency.

- Create `new Shell.CameraMonitor()` in `enable()`, connect `notify::cameras-in-use`, and on each notification read `cameras-in-use` and call `_setActive(bool)`.
- At enable, read the property once for the initial state (a camera already streaming before the extension enabled must still show the ring).

**Alternatives considered:**
- XDG camera portal (`org.freedesktop.portal.Camera`, `IsCameraInUse` property + `DevicesChanged` signal): the portal's camera object is **not exported by every xdg-desktop-portal build** — e.g. Arch Linux's build has no `/org/freedesktop/portal/camera` at all, so camera-triggering would silently degrade to the always-on fallback there. Additionally the portal emits no `PropertiesChanged` (state arrives only via `DevicesChanged`, payload `a{sa{sv}}`), and GJS can only connect that signal through `makeProxyWrapper`/embedded interface info — fragile plumbing for no gain. Rejected.
- PipeWire registry directly via D-Bus: `Shell.CameraMonitor` is exactly this, already wrapped by the shell. Rejected as more surface for no gain.
- Polling `/dev/video*`: no in-use concept. Rejected.

### 2. Gate ring lifecycle on camera state
`enable()` becomes: create the monitor, read initial state, hook the notify handler. `_setActive(true)` runs the existing `_build()` and connects `monitors-changed`; `_setActive(false)` removes all chrome actors and disconnects `monitors-changed`. The `monitors-changed` handler rebuilds only while active.

`disable()` disconnects the notify handler, drops the monitor, and tears the ring down if active. All teardown paths already exist and are idempotent — the loop in `disable()`/`_build()` handles removal.

### 3. Fallback: monitor unavailable → always-on
If `new Shell.CameraMonitor()` throws at enable time, log a warning and keep the current always-on behavior. Rationale: a user silently losing the ring is worse than the ring staying visible.

## Risks / Trade-offs

- **Monitor creation fails** → always-on fallback keeps the ring functional; logged warning explains why it's not camera-gated.
- **App uses camera outside PipeWire** (direct V4L2 without PipeWire) → ring may not appear. Accepted: matches GNOME Shell's own camera indicator behavior.
- **Rapid camera toggling** → build/teardown is idempotent (removes before adding), no new state to corrupt.
- **State drift on monitors-changed** → handler only acts when active; geometry always rebuilt from `Main.layoutManager.monitors`, no cached positions.

## Migration Plan

No migration: client-side extension, no persisted state. Rollback = revert to previous commit; camera gating can be disabled by deleting the monitor wiring, leaving the always-on path.

## Open Questions

None blocking. Possible future follow-ups (out of scope): gsettings toggle for always-on vs camera-triggered; ring color/border config.
