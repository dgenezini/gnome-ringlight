## Context

Ring today = `St.Widget` per monitor with a CSS `border-*` (solid hex color, `border-radius`). Struts that shrink the work area come from separate transparent strips, unaffected by the ring's look. Camera activation/monitor-following logic in `camera-triggered-ring` spec stays as-is; only the visible ring changes.

Constraint: GJS + St, no build system, GNOME 45–50. St theming cannot express what we need: CSS borders take a single solid color (no gradient, no alpha gradient), and St supports only *linear* `background-gradient` fills — a fill cannot be constrained to the border band, and radial gradients don't exist in St.

## Goals / Non-Goals

**Goals:**
- Ring painted with anti-aliasing (no jagged corners at low widths).
- Small edge gradient: flat opaque colored center, ~3px soft fade at the inner and outer band edges (blur radius 2).
- Band thickness exactly matches the configured width (`border-width` or resolution-derived margin).
- Strut/work-area behavior byte-identical to today.

**Non-Goals:**
- Per-frame animation (ring is static while active).
- Any transparency setting: the ring is fully opaque; the only softness is the edge fade. A `border-opacity` setting was added then removed per user request.
- Directional (top-bright / radial) gradients: alpha varies along the ring path, which reads as a diagonal fade on rounded corners. Rejected in manual testing.
- Wide gradients / outer halos: they bled too far into the screen. Rejected in manual testing.
- Knobs for gradient strength.

## Decisions

### 1. Paint the ring with Cairo on an `St.DrawingArea`, not St CSS
St cannot do gradient borders, alpha-fading borders, or soft edges. `Clutter.Canvas` was removed in mutter 18 (GNOME 50); the current shell API is `St.DrawingArea` (`repaint` signal, `get_context()`, `get_surface_size()`).

Ring actor: `new St.DrawingArea({reactive: false})` with the same geometry as today: work-area rect inset by `PADDING`, corner radius `RADIUS`. Anti-aliasing is free (Cairo AA).

### 2. Small edge gradient via real blur filter, not upscaling
The downscale-upscale trick produced ugly low-res artifacts, and wide gradients (blur radius ∝ band width) bled too far into the screen — both rejected in manual testing. The ring actor now carries a real `Shell.BlurEffect` (default `SHELL_BLUR_MODE_ACTOR`, blurs the actor's own content) over a single crisp full-res stroke. `GLOW_RADIUS = 2` → ~3px soft fade at the inner and outer band edges, flat colored center. Isotropic blur keeps corners uniform — no directional fade.

### 3. Widget sized to band + glow margin (fixes the clipped ring)
The old stroke was centered on the widget-edge path, so half the band fell outside the widget and was clipped — the ring looked half-thickness. Now: band spans exactly `[PADDING, PADDING + W]` relative to the work area (W = `max(marginX, marginY)`), the widget is enlarged by `GLOW_M = BLUR_RADIUS × 3` on every side so the blur's gaussian tail fades out *inside* the widget, and the stroke is drawn centered on a path inset by `GLOW_M + W/2`. Ring thickness always equals the configured width; the glow extends beyond it without being cut. The enlarged widget overlaps the reserved strip region, but it stays non-strut and the strips are transparent, so nothing conflicts.

### 4. Fully opaque ring
The band is painted with alpha 1.0. No opacity setting — a `border-opacity` key existed during development and was removed per user request; the only softness is the `GLOW_RADIUS` edge fade.

### 5. Corner radius constant thickness
The stroke path uses `RADIUS`; band inner corner = `RADIUS - W/2`, outer = `RADIUS + W/2` — constant band thickness along the rounded arc.

### 6. Struts untouched
Transparent strips keep doing the work-area reservation. The ring stays `reactive: false` and non-strut, and still `set_child_below_sibling(panelBox)`.

### 7. HiDPI
Multiply logical coordinates by `St.ThemeContext.get_for_stage(global.stage).scale_factor` inside the draw callback so 4K/hidpi monitors don't get soft edges.

## Risks / Trade-offs

- [Blur effect cost on huge monitors] → Shell.BlurEffect internally downscales for radii > 12 (Firefox-style) and caches its framebuffers; ring repaints only on rebuild, never per-frame. Radius 3 stays full-res, still one pass per rebuild.
- [Glow headroom fixed at 3× radius] → `GLOW_RADIUS` and `GLOW_M` follow each other; both are module constants.
- [New setting needs schema recompile] → `glib-compile-schemas schemas/` + commit binary, or settings silently ignored (existing repo rule).
- [Opacity 255 still fades toward band edges] → removed: no opacity setting; the ring is fully opaque, only the edge fade applies.

## Migration Plan

- No schema changes land in this change: `border-opacity` was added and removed during development, so the final schema is untouched and no recompile is needed.
- Existing installs: unchanged settings, color temperature behavior unchanged.
- Rollback: revert extension.js, shell restart (same as any change here — no extra steps).

## Open Questions

- None blocking. Gradient strength left as fixed constants; if the user wants it tunable later it becomes one more int key — cheap to add, YAGNI now.
