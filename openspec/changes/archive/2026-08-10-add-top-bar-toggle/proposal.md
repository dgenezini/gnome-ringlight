# Proposal: Quick settings toggle for ring mode

## Why

The ring currently has one behavior: it follows the camera. There is no way to force it on (e.g. keep the ring as a visual boundary even with no camera) or force it off (e.g. an app that opens a v4l2 device triggers the ring unexpectedly). Users must edit settings or disable the whole extension to change this. A control in GNOME's Quick Settings menu — the same place wifi, bluetooth, and do not disturb live — matches how the Caffeine extension works and makes the ring controllable in one click, with no settings window visit.

## What Changes

- New setting `ring-mode` (`'auto' | 'always' | 'off'`, default `'auto'`) persisted in GSettings.
  - `auto`: current behavior — ring follows camera (PipeWire monitor + v4l2 poll).
  - `always`: ring stays on regardless of camera state.
  - `off`: ring never shows.
- A Quick Settings toggle ("Ring Light") in the quick settings menu, like Caffeine's. The toggle opens a small menu with the three modes; the toggle state and subtitle reflect the current mode.
- Mode changes take effect immediately, no shell restart.
- The camera-monitor-unavailable fallback (currently "ring stays on permanently") now only applies in `auto` mode; explicit `always`/`off` are always respected.
- Extension must be enabled for the toggle to exist — the toggle cannot force the ring when the extension is disabled.

## Capabilities

### New Capabilities

- `ring-mode-control`: quick settings toggle in the GNOME Quick Settings menu exposing the three ring modes (auto / always on / off), with the mode persisted in settings and applied live.

### Modified Capabilities

- `camera-triggered-ring`: the fallback requirement ("ring stays on permanently when CameraMonitor is unavailable") becomes mode-aware — `off` disables the ring even without a camera monitor; `always`/`auto` keep the permanent ring.

## Impact

- `schemas/org.gnome.shell.extensions.ringlight.gschema.xml`: new `ring-mode` key (`s`, enum `auto|always|off`, default `'auto'`). `schemas/gschemas.compiled` must be recompiled and committed (per AGENTS.md).
- `extension.js`: gate `_setActive()` on mode; add Quick Settings toggle (GNOME 45+ `QuickSettings` API, in-range for shell-version 45–50).
- `prefs.js`: unchanged (control lives in quick settings, not the settings window).
- No new dependencies; no other systems affected.
