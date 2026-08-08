## Context

The extension is a single-file GNOME Shell extension (`extension.js`) that draws a 150px white border per monitor via `Main.layoutManager.addChrome(actor, {affectsStruts: true})`. Struts make mutter shrink the work area on every workspace, so maximized/tiled/new windows stay inside the ring. Today the ring is permanent while the extension is enabled.

The ring's purpose is video calls, so it should only exist while a camera is in use. Camera in-use state is published by xdg-desktop-portal's Camera portal (`org.freedesktop.portal.Camera`, portal >= 1.18) — the same signal GNOME Shell's own camera indicator consumes.

## Goals / Non-Goals

**Goals:**
- Ring appears when the first camera turns on, disappears when the last camera turns off.
- While active, keep current behavior exactly: maximized/tiled windows on all workspaces resize to fit inside the ring.
- Graceful fallback if the portal is missing (ring stays always-on, logged).

**Non-Goals:**
- Manually resizing unmaximized windows (they are untouched today; struts only affect maximize/tiling/placement).
- A user toggle for camera-triggered vs always-on.
- Per-camera or per-monitor configuration.

## Decisions

### 1. Detect camera-in-use via the XDG Camera portal
Watch `IsCameraInUse` (readonly property) on object path `/org/freedesktop/portal/camera`, interface `org.freedesktop.portal.Camera`, session bus.

- Create a `Gio.DBusProxy` for that interface/path on the session bus. With default proxy flags, GIO caches properties and emits `g-properties-changed` when the portal emits `PropertiesChanged`.
- On `g-properties-changed` (and on `DevicesChanged` as a belt-and-suspenders signal), read `proxy.IsCameraInUse` and call `_setActive(bool)`.

**Alternatives considered:**
- PipeWire registry directly via D-Bus: no `IsCameraInUse` convenience property; the portal is exactly this wrapped in a stable API. Rejected as more surface for no gain.
- Polling `/dev/video*`: no in-use concept. Rejected.
- Mutter: no camera API. Rejected.

### 2. Gate ring lifecycle on camera state
`enable()` becomes: build the proxy, read initial state, hook signals. `_setActive(true)` runs the existing `_build()` and connects `monitors-changed`; `_setActive(false)` removes all chrome actors and disconnects `monitors-changed`. The `monitors-changed` handler rebuilds only while active.

`disable()` disconnects proxy signals, drops the proxy, and tears the ring down if active. All teardown paths already exist and are idempotent — the loop in `disable()`/`_build()` handles removal.

### 3. Fallback: no portal → always-on
If the portal interface can't be resolved (proxy creation fails, `IsCameraInUse` missing), log a warning and keep the current always-on behavior. Rationale: a user with an old xdg-desktop-portal silently losing the ring is worse than the ring staying visible.

## Risks / Trade-offs

- **Portal missing/old** → always-on fallback keeps the ring functional; logged warning explains why it's not camera-gated.
- **App uses camera outside the portal's visibility** (direct V4L2 without PipeWire) → ring may not appear. Accepted: matches GNOME Shell's own camera indicator behavior.
- **Portal name owner absent at startup** → `org.freedesktop.portal.Desktop` is D-Bus activatable; creating the proxy sync triggers activation. If it still fails, fallback (decision 3) applies.
- **Rapid camera toggling** → build/teardown is idempotent (removes before adding), no new state to corrupt.
- **State drift on monitors-changed** → handler only acts when active; geometry always rebuilt from `Main.layoutManager.monitors`, no cached positions.

## Migration Plan

No migration: client-side extension, no persisted state. Rollback = revert to previous commit; camera gating can be disabled by deleting the proxy wiring, leaving the always-on path.

## Open Questions

None blocking. Possible future follow-ups (out of scope): gsettings toggle for always-on vs camera-triggered; ring color/border config.
