## Context

Ring Light creates and removes visual ring and transparent strut actors directly in `_setActive()`. Activation comes from camera state or global ring-mode changes. Struts must exist while ring is visible so windows stay inside it; `disable()` must remove everything synchronously.

## Goals / Non-Goals

**Goals:**
- Fade ring visuals over one fixed, short transition.
- Keep layout reservation correct through transition.
- Handle a new state change during an in-flight fade without actor leaks.
- Preserve current final active/inactive behavior.

**Non-Goals:**
- User-configurable duration or easing.
- Animate geometry, width, color, or monitor-layout rebuilds.
- Delay extension disable.

## Decisions

### Animate only visual ring actors

Build current visual rings and struts together. On activation, set each visual ring opacity to zero and use St actor easing to opacity 255. Struts remain transparent and need no animation.

This uses existing GNOME actor animation support instead of adding shader time uniforms or a GLib frame loop.

### Retain struts until fade-out completion

On deactivation, ease visual rings to opacity zero, then remove their visual and strut actors in completion callback. This ensures ring remains paired with reserved work area until it disappears.

### Guard callbacks with transition generation

Increment a transition token for each state change. Completion callbacks act only if their token is current. A new activation cancels prior easing and rebuilds/reuses actors as needed; stale fade-out callbacks cannot remove newly active rings.

### Disable removes synchronously

`disable()` cancels active transitions, invalidates token, and removes all chrome immediately. The extension must not leave an animation callback after disable.

## Risks / Trade-offs

- [Windows resize only when struts change] → Activation still reserves work area at fade start; deactivation restores it at fade end, matching visible ring lifetime.
- [Fast camera flapping] → Token guard prevents stale callbacks from deleting current actors.
- [Animation API behavior differs across GNOME versions] → Use standard `St.Widget.ease()` available throughout supported GNOME 45–50 range.

## Migration Plan

No settings or stored state change. Rollback restores immediate actor creation/removal.
