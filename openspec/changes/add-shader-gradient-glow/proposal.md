## Why

Current ring is an opaque Cairo stroke with a fixed, near-imperceptible blur. It looks like a border rather than a diffuse ring light and cannot be tuned for display brightness or softness.

## What Changes

- Replace Cairo stroke and fixed blur with one shader-rendered ring per monitor.
- Render long, multi-stop edge falloff with rounded radial corners from signed distance to the rounded rectangle.
- Add brightness, softness, and glow controls.
- Use configurable core, medium, and outer glow extents, defaulting to 20, 50, and 100 logical pixels.
- Preserve existing color-temperature, width, corner-radius, work-area reservation, click-through, monitor, and activation behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `edge-glow-rendering`: Replace fixed Cairo/blur rendering with configurable shader gradients and layered glow.
- `ring-appearance`: Add brightness, softness, and glow preferences while preserving color and geometry behavior.

## Impact

- `extension.js`: replace drawing-area repaint/blur implementation with Clutter shader rendering and live setting use.
- `prefs.js` and GSettings schema: expose and persist new appearance settings.
- `schemas/gschemas.compiled`: recompile after schema update.
- GNOME Shell 45–50 compatibility must remain intact; no dependency additions.
