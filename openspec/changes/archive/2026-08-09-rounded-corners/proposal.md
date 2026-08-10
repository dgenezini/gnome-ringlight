## Why

The ring is four plain rectangles per monitor, so corners are hard 90° cut into every monitor corner. Rounded corners look softer and more deliberate, and match the rounded corners of modern GNOME UI. Radius should be user-adjustable with a good default.

## What Changes

- Ring corners become rounded — both the outer corner (the monitor corner) and the inner corner of the band.
- New `border-radius` setting (logical pixels, 0–1000, default 100) in schema, prefs, and extension.
- Ring hugs the **work area**, not the monitor: the band starts below the top bar and ends above a task bar/dock instead of drawing behind them. Strut strips still reserve the full ring thickness plus the bars' own reserved space.
- Ring drawing splits into two layers per monitor: one rounded-border ring widget (visual only, `affectsStruts: false`) plus the existing four strips kept **only as transparent struts** (work-area shrinking unchanged). This is required because mutter's strut computation turns any actor that touches a monitor edge into a strut of that actor's full rect — a full-monitor ring widget would become a full-screen top strut and collapse the work area.
- Inner corner radius follows CSS border semantics: outer radius − border width (so the band stays constant thickness), clamped to 0 by CSS. At the default 100 radius and 150 width, inner corners are sharp (radius clamps to 0).

## Capabilities

### New Capabilities
- `ring-appearance`: visual look of the ring — rounded corners with a configurable radius.

### Modified Capabilities
<!-- none -->

## Impact

- `schemas/org.gnome.shell.extensions.ringlight.gschema.xml`: new `border-radius` key; **recompile `schemas/gschemas.compiled` and commit the binary** (AGENTS.md requirement).
- `prefs.js`: new spin row for border radius, same binding pattern as border-width.
- `extension.js` `_build()`: per monitor, one rounded ring widget + four transparent strut strips (replacing the four white strips). `addChrome`/struts logic, camera activation, v4l2 polling, monitor-changed handling all unchanged.
- No new APIs, no `shell-version` change, no dependency changes.
