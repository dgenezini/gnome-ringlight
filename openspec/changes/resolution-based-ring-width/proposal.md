## Why

Ring width is a fixed pixel value, so the same `border-width` looks thin on a 4K monitor and thick on a small laptop screen. Users want to define the ring by the available work area resolution instead — e.g. always keep a 1920×1080 work area regardless of monitor — and have ring width derived from (monitor resolution − available resolution).

## What Changes

- New `width-mode` setting choosing how the ring width is defined: `pixels` (current behavior, `border-width`) or `resolution` (derived from the configured available area resolution).
- New `available-width` and `available-height` settings: the desired work area resolution in logical pixels.
- In resolution mode, ring width per axis is computed as `(monitor size − available size) / 2`: top/bottom strips sized by the vertical margin, left/right strips by the horizontal margin.
- Prefs window gains a mode selector; in resolution mode the pixel-width row hides and the resolution rows appear.
- Recompile `schemas/gschemas.compiled` after schema edits.

## Capabilities

### New Capabilities
- `ring-width-config`: configuration of ring width — either a fixed pixel width or a width derived from a configured available area resolution.

### Modified Capabilities
<!-- None: camera triggering, deactivation, monitor-change and disable behavior are unchanged. -->

## Impact

- `schemas/org.gnome.shell.extensions.ringlight.gschema.xml` and committed `schemas/gschemas.compiled`: three new keys.
- `extension.js`: `_build()` computes per-axis margins in resolution mode.
- `prefs.js`: mode selector + conditional rows.
- No new dependencies. Default mode is `pixels`, so existing installs keep current behavior (not breaking).
