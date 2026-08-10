## Context

Today `_build()` creates four white `St.Widget` strips per monitor (top/bottom full-width, left/right inset), each registered with `addChrome(a, {affectsStruts: true})`. Mutter shrinks the work area per strut; strips overlap in the corners, which is fine because they're plain white rects. Rounded corners can't come from these rects alone, so the drawing approach changes.

Key constraint discovered from `js/ui/layout.js` `_updateRegions()` (GNOME Shell 50.3): for each chrome actor with `affectsStruts`, mutter picks **one** side — if the actor spans the full monitor width and touches the top edge it becomes a TOP strut whose rect is the actor's **entire** rect. A full-monitor widget therefore becomes a single top strut the height of the screen and collapses the work area. Visual and strut concerns must be split into separate actors.

## Goals / Non-Goals

**Goals:**
- Rounded outer and inner ring corners, any radius, constant band thickness.
- `border-radius` setting (schema + prefs + extension), default 180, 0 = sharp.
- Work area shrinking identical to today for every radius value.

**Non-Goals:**
- Rounded work area / rounded window corners (struts are rect-based; maximized windows keep rectangular work area — a window corner poking into the corner cut is expected and looks natural).
- Non-uniform radius per monitor / per corner.
- Radius presets or per-mode radius.

## Decisions

**1. Two layers per monitor: one border ring widget + four transparent strut strips.**
- Visual: one `St.Widget` covering the full monitor rect, `style: 'border: <w>px solid #ffffff; border-radius: <r>px;'` (no background). CSS border semantics give outer corner radius `r` and inner corner radius `r − w` automatically (clamped to 0), so the band stays constant thickness — exactly the requested inner+outer rounding. `reactive: false`, `affectsStruts: false` (added via `addChrome(a)` without the affectsStruts flag).
- Struts: the existing four strips, same geometry, but `background-color: transparent` and still `affectsStruts: true`. Transparent so they never paint over the ring's rounded corner cuts.
- Alternatives rejected: (a) rounding corners on the four strips themselves via per-corner radii — CSS only rounds a widget corner centered on that widget's own corner; the ring's inner corner needs its arc centered on the *monitor* corner, so strip corners can't express it, and a rounded top strip would cut white away that the ring must keep. (b) Single full-monitor border widget with `affectsStruts: true` — collapsed work area, per `_updateRegions()` analysis above. (c) Cairo/`Clutter.Canvas` ring — arbitrary shape, but adds a draw path, repaint management, and still needs separate strut actors; CSS border on a plain widget is simpler and matches every other GNOME surface.

**2. Per-side border widths for resolution mode.**
- In resolution mode `marginX ≠ marginY`. Ring widget uses per-side widths (`border-left-width`/`border-right-width: marginX`, `border-top-width`/`border-bottom-width: marginY`) so the visual band matches the strut geometry. `border-radius` still applies to all corners.

**3. Inner radius = `r − w` follows CSS, not a separate key.**
- One knob matches user intuition ("corner radius" of the outer shape) and CSS/design-system convention. Inner rounding appears automatically once radius exceeds ring thickness; document the relation in the prefs subtitle.

**4. Default 100.**
- With default `border-width` 150 → inner radius clamps to 0: outer corner clearly rounded, inner corner sharp. If the user thins the ring or raises the radius, inner rounding appears once radius exceeds width (e.g. width 50 → inner 50; width 150 + radius 300 → inner 150). User's chosen default.

**5. Ring hugs the work area, not the monitor.**
- The ring band would draw behind the top panel and any dock/task bar if placed on the monitor rect. Instead the visual ring widget is allocated to the monitor's **work area** (`Main.layoutManager.getWorkAreaForMonitor(m.index)` — the monitor rect minus what bars/docks reserve via their own struts), so the band starts exactly after the bars.
- Strut strips must still shrink the work area by the full ring thickness *beyond* the bars. Mutter's strut algorithm (`_updateRegions` in `js/ui/layout.js`) only counts actors that touch a monitor edge, so each strip spans **from the monitor edge to the ring edge**: top strip = full width, from monitor top, height `(workArea.y − monitor.y) + marginY`; bottom/left/right analogous. The strip's strut rect then reserves bar space + ring thickness, and the work area becomes `workArea` inset by the ring thickness — exactly the rect inside the ring band.
- Race: `removeChrome()` only *queues* the strut recompute (`_queueUpdateRegions`, BEFORE_REDRAW late). Querying the work area in the same frame would still include the previous strips, and each rebuild would compound the error (runaway ring on spin-drag). Fix: call `Main.layoutManager._updateRegions()` synchronously after removing chrome — the same idempotent code the late handler runs (private, but stable across 45–50; verified present in 50.3 source). Guarded with a typeof check.
- Alternatives rejected: (a) caching bar-space at activation only — docks added/resized while active wouldn't be followed; (b) subtracting our own known struts from the queried inset — cannot distinguish stale from fresh query, breaks the no-bar case (would need `radius − width` style subtraction that under-reserves).

## Risks / Trade-offs

- [Full-monitor transparent ring widget sits above windows in `uiGroup`] → `reactive: false` passes all clicks through; middle stays transparent; `set_child_below_sibling(panelBox)` unchanged so the panel stays on top.
- [St/Clutter may not compute inner corner radius exactly per CSS spec] → worst case inner corner renders sharp (radius ≤ thickness case); visual still rounded. Manually verify one `r > w` and one `r < w` value during testing.
- [Extra actor per monitor] → one widget more than today; negligible cost, rebuilt only on activation/settings change/monitor change.
- [Very large radius vs small monitor] → CSS clamps `border-radius` to half the widget's smaller side automatically; no code needed.
- [Settings schema binary] → must recompile and commit `gschemas.compiled` or the new key is invisible to `getSettings()`.

## Migration Plan

New schema key ships with default; existing users get rounded corners automatically after shell restart (schema change requires restart per AGENTS.md). Rollback: set `border-radius` to 0 for sharp corners, no code revert needed.

## Open Questions

None.
