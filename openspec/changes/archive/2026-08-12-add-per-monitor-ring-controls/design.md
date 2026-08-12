## Context

`_build()` currently creates a visual ring and four strut actors for every `Main.layoutManager.monitors` entry. All visual settings are global. GNOME monitor layouts can change while the ring is active, and Ring Light supports GNOME 45–50.

## Goals / Non-Goals

**Goals:**
- Let users enable or exclude each connected monitor.
- Persist selection through Shell restarts and monitor reconnects.
- Retain current all-monitors behavior until a user disables a monitor.
- Apply preference and monitor-layout changes live while active.

**Non-Goals:**
- Per-monitor color, width, padding, or other appearance overrides.
- Per-workspace or per-application selection.
- Managing display configuration.

## Decisions

### Store exclusions by connector name

Add a string-array GSettings key containing excluded monitor connector names. Resolve each layout monitor to its `Meta.Monitor` by index and use its connector name as identity. A missing entry means enabled.

Connector names survive output geometry changes and reconnects, unlike monitor indices. A full monitor fingerprint is unnecessary data model complexity; connector changes deliberately produce a newly enabled output.

### Make exclusion creation-time only

`_build()` skips excluded monitors entirely: no visual widget and no struts. Preferences changes reuse existing settings-change rebuild behavior; monitor changes use existing `monitors-changed` rebuild behavior.

Do not build transparent placeholder actors. Skipping them is smaller and guarantees excluded monitors retain their normal work area.

### Use one preference row per connected output

Render current monitor connector names in an Adw preferences group with an enabled switch. Write only connector names that are disabled. Rebuild rows when preferences open; display layout changes need not live-update an already-open preferences window.

## Risks / Trade-offs

- [Connector unavailable on a platform/version] → Treat monitor as enabled and log a warning; never hide a monitor without a stable identity.
- [Connector renamed after hardware or driver change] → It appears enabled, preserving current safe default; user can exclude it again.
- [No human-friendly monitor label] → Show connector name, which is unambiguous and useful for physical output mapping.

## Migration Plan

1. Add empty `excluded-monitors` default and recompile schemas.
2. Existing installations read an empty array, so every monitor remains enabled.
3. Rollback removes preference UI and ignores stored keys; no window geometry data needs migration.
