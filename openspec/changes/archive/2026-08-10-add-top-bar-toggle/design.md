# Design: Quick settings toggle for ring mode

## Context

The ring is currently binary: it follows camera activity (`Shell.CameraMonitor` + a v4l2 `/dev/videoX` poll), with a permanent-on fallback if the camera monitor can't be created. There is no user-facing control to force it on or off. The user wants a control in GNOME's Quick Settings menu — the popover with wifi, bluetooth, and do not disturb — modeled on the Caffeine extension.

Constraints from AGENTS.md: ESM GJS, no build system, extension shell-version range 45–50, schema changes require recompiling the committed `gschemas.compiled`, full shell restart to test.

## Goals / Non-Goals

**Goals:**
- One Quick Settings toggle exposing three modes: Automatic / Always On / Off.
- Mode persisted in GSettings, applied live, default `auto` (byte-for-byte current behavior).
- Minimal change to the existing activate/deactivate machinery.

**Non-Goals:**
- A permanent icon in the top bar panel (Quick Settings toggle only).
- A mode selector in the settings window (`prefs.js` untouched — the Quick Settings menu is the control surface; a prefs row can be a follow-up).
- Ring style/layout changes of any kind.
- Support for GNOME < 45 (matches current `shell-version`).

## Decisions

### D1: Control lives in Quick Settings, not the top bar panel
"Where wifi, bluetooth, do not disturb are" is the Quick Settings popover (GNOME 45+), not the panel. Use `QuickSettings.QuickToggle` registered via `QuickSettings.addQuickSettingsItems([toggle])`, imported from `resource:///org/gnome/shell/ui/quickSettings.js`.

- Alternative: `QuickSettings.SystemIndicator` — adds a permanent icon to the top bar. Rejected: permanent chrome the user didn't ask for; Caffeine's current design uses the Quick Settings toggle too.

### D2: Three-state UI = toggle with attached menu, not a cycling toggle
The `QuickToggle` gets the three modes as popup menu items (`toggle.addMenuItem(item)`, chevron appears automatically when items exist — same pattern as Night Light's schedule picker). Each item is a `PopupMenu.PopupMenuItem`; the active mode shows a check ornament. Toggle title stays "Ring Light"; subtitle shows the mode label ("Automatic" / "Always On" / "Off"). Icon: `camera-video-symbolic` (exists in Adwaita; no new icon assets).

- Alternative: single toggle that cycles auto → always → off on each click. Rejected: undiscoverable (which state comes next?), two clicks to reach a neighbor state, and the toggle's checked visual is meaningless across three states.

### D3: Mode as string GSettings key `ring-mode`
New schema key `ring-mode` (`s`, default `'auto'`, values `auto|always|off`), consistent with the existing `width-mode` string key. One settings object already exists (`this.getSettings()`) — the toggle, the prefs window (unused for this), and the ring logic all read the same key, so external changes via `dconf` flow through the same `changed` signal.

- Alternative: int index. Rejected: opaque in `dconf`; string matches existing style.

### D4: One `_refresh()` chokepoint for ring visibility
Keep `_setActive()` as the only place that builds/removes chrome (unchanged). Add a `_cameraInUse` field and a single `_refresh()` that computes visibility:

```
active = mode !== 'off' && (mode === 'always' || _cameraInUse)
```

All three inputs funnel into it: camera `notify::cameras-in-use` → sets `_cameraInUse` → `_refresh()`; v4l2 poll → same; `changed::ring-mode` → `_refresh()` + toggle update. `_setActive()` already no-ops when the state didn't change, so `always` mode gets no rebuild churn when cameras toggle. This is the root-cause pattern: gating lives in exactly one place instead of being duplicated in every caller.

Camera-monitor-unavailable fallback: set `_cameraInUse = true` and warn instead of the current early `return` from `enable()`, so the toggle and mode listener still get set up and `off` mode is honored. `always`/`auto` behave exactly as today (permanent ring + warning).

### D5: v4l2 poll skipped outside `auto` mode
`_v4l2Poll()` early-returns unless mode is `auto`. The per-second `/dev` + `/proc` scan is pointless when the camera can't affect visibility. Cheap one-line guard; the timeout stays alive so switching back to `auto` resumes polling without recreating it.

## Risks / Trade-offs

- **GNOME 45 vs 50 QuickSettings API drift** (`addQuickSettingsItems`, `QuickToggle.addMenuItem`, menu chevron) → API is stable since 45 and matches the existing cross-version dance in this repo; manual test on the host's GNOME 50.3 covers the top of the range, `node --check` covers syntax.
- **Forgotten `glib-compile-schemas`** → unknown-key errors at runtime (`get_settings()` throws for undeclared keys). Mitigation: tasks list recompile + commit of `gschemas.compiled` as an explicit step; runtime manual test catches it immediately.
- **Toggle/menu desync after external `dconf` change** → single `changed` handler updates both ring and toggle; no second source of truth.
- **`always` mode hides real camera use** (ring can't reflect a camera that's off) → inherent to the feature; user asked for it.

## Migration Plan

- Schema: additive `ring-mode` key with default `'auto'`; old installs behave identically until the user touches the toggle. Recompile `schemas/gschemas.compiled` and commit.
- Rollback: revert extension.js + schema, recompile binary; default behavior is unchanged from pre-feature.
- Testing (per AGENTS.md manual checklist): camera on/off, monitor add/remove, disable while active — plus: toggle each mode, restart shell with mode `always`/`off`, `dconf write` the key while running.

## Open Questions

- Toggle icon choice (`camera-video-symbolic` proposed) — cosmetic, adjustable in one line during implementation.
