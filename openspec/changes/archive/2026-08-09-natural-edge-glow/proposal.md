## Why

The ring is a flat, fully opaque, hard-edged border. Next to macOS's edge light — a soft, semi-transparent glow with gradient falloff — it reads as artificial. The ring should look like ambient light around the monitor, not a UI rectangle.

## What Changes

- Replace the flat CSS-border ring with a Cairo-painted ring per monitor, anti-aliased by default (Cairo draws with AA; the current St border renders jagged edges on the rounded corners at low width).
- Add a small soft gradient at the band edges (~5px fade at inner and outer edges, flat opaque center) via a real `Shell.BlurEffect`; the ring stays fully opaque — no transparency setting.
- Keep activation, strut, and work-area logic untouched: transparent strips still reserve the space, the ring actor still is not a strut.

## Capabilities

### New Capabilities
- `edge-glow-rendering`: how the ring is painted — band thickness matching the configured width, small blur-based edge fade, anti-aliasing, driven by the existing color temperature.

### Modified Capabilities
<!-- none: camera-triggered-ring (activation, struts, monitor-following) behavior is unchanged -->

## Impact

- `extension.js`: `_build()` — the ring widget changes from an `St.Widget` with CSS `border-*` to an `St.DrawingArea` painting the ring via Cairo (one rounded-rect stroke) with a `Shell.BlurEffect` for the edge fade (`Clutter.Canvas` no longer exists in mutter 18). Strut strips unchanged.
- `schemas/org.gnome.shell.extensions.ringlight.gschema.xml`: no new keys — `border-opacity` was added then removed; only the existing temperature key drives color.
- `prefs.js`: unchanged (opacity row added then removed).
- No new dependencies.
