## Why

The extension currently draws the ring permanently while enabled, reserving 150px of work area on every monitor even when no camera is in use. The ring only matters during video calls — permanent struts waste screen space the rest of the time. Users want the ring to appear exactly when the camera is on and disappear when it's off.

## What Changes

- Ring activation becomes camera-driven: borders appear when any camera turns on, disappear when the last camera turns off.
- Camera state is monitored via the XDG Camera portal (`org.freedesktop.portal.Camera`), the same mechanism GNOME Shell uses for its camera indicator.
- When active, behavior is unchanged from today: struts shrink the work area so maximized/tiled windows on every workspace resize to stay inside the ring. Non-maximized windows are not touched.
- `monitors-changed` still rebuilds the ring, but only while the ring is active.
- Fallback: if the portal is unavailable, keep the current always-on behavior (logged), so no user silently loses the ring.

## Capabilities

### New Capabilities
- `camera-triggered-ring`: Ring visibility driven by camera in-use state from the XDG Camera portal; ring only affects the work area while active.

### Modified Capabilities
<!-- None: openspec/specs/ is empty, no existing capabilities -->

## Impact

- `extension.js`: add camera state watcher, gate `_build()`/teardown on camera-in-use.
- New D-Bus dependency: `org.freedesktop.portal.Desktop` / `org.freedesktop.portal.Camera` (session bus, xdg-desktop-portal >= 1.18). No new runtime deps, no schema changes.
- No behavior change while a camera is active; change only affects when the ring shows.
