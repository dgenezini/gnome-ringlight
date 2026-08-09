## Context

Current state: ring thickness comes from a single `border-width` int setting (default 150). `_build()` in `extension.js` uses one `BORDER` constant for all four strips per monitor. `prefs.js` exposes a single SpinRow bound to it. Schema is one key; `gschemas.compiled` is a committed binary that must be recompiled after schema edits. The extension already rebuilds the ring on any settings change while active (`changed` → `_build()`), so no new plumbing is needed for live updates.

## Goals / Non-Goals

**Goals:**
- Let users define ring width in pixels (unchanged) or from an available area resolution.
- Resolution mode keeps a configured work area (e.g. 1920×1080) on any monitor, ring thickness derived per axis.
- Minimal diff; no new dependencies.

**Non-Goals:**
- Per-monitor resolution settings (one global pair of available-width/height applies to every monitor).
- Animated/responsive ring resizing.
- Tying available resolution to per-monitor detection automatically.

## Decisions

### Mode as a string setting, `width-mode` ∈ {pixels, resolution}, default `pixels`
String enum over a boolean because it reads clearly in schema and prefs and leaves room for future modes. Default keeps current behavior for existing installs (non-breaking).

### Per-axis margins in resolution mode
Vertical strips (left/right) get thickness `(monitor width − available-width) / 2`; horizontal strips (top/bottom) get `(monitor height − available-height) / 2`. Available area almost never shares the monitor's aspect ratio, so a single derived value can only satisfy one axis. Per-axis is the only option that actually yields the requested available resolution. Margins rounded to whole pixels (`Math.round`) and clamped to ≥ 1 px, matching the existing `Math.max(1, height − 2 * BORDER)` pattern — zero-size strut widgets are avoided.

Alternatives considered:
- Derive one thickness from the horizontal axis only → rejected: aspect-mismatched monitors get the vertical dimension wrong.
- Two pixel settings (per-axis fixed widths) → rejected: user asked for resolution semantics, not more pixel knobs.

### Prefs: ComboRow for mode, conditional rows
`Adw.ComboRow` (two options, `pixels`/`resolution`) plus SpinRows for `available-width`/`available-height` (range 1–16384 to cover up to 8K). A `changed` handler on settings toggles row visibility: `border-width` row hidden in resolution mode, resolution rows hidden in pixel mode. Same pattern the rest of the file uses (Gio settings binding), no framework.

### Edge case: available size ≥ monitor size
Margin computes to ≤ 0 → clamped to 1 px hairline. This is the user's configuration choice; the prefs subtitles note the available area should be smaller than the monitor.

## Risks / Trade-offs

- [Odd monitor/available differences round to 1 px asymmetry between opposite sides] → 1 px on a 50–1000 px ring is imperceptible; ignored.
- [Resolution mode with available area ≥ monitor yields a hairline ring] → clamp keeps geometry valid; prefs subtitle explains the constraint.
- [Forgotten `glib-compile-schemas` leaves new keys silently missing] → explicit task step; extension reads default for missing keys, schema default covers the base case.

## Migration Plan

No migration: `width-mode` defaults to `pixels`, no keys removed, existing saved `border-width` values keep working. Rollback is a settings toggle.

## Open Questions

None.
