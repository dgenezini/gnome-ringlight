## Why

The ring is non-reactive chrome painted above every window, so during a call the cursor can sit invisibly under a thick bright band. macOS camera-indicator-style rings solve this by carving a hole around the pointer; the ring should do the same.

## What Changes

- The ring shader gains a circular exclusion zone around the pointer: `alpha *= smoothstep(cursorRadius, cursorRadius - fade, distance(mouse, pixel))`, so the light fades out smoothly around the cursor instead of covering it.
- The extension tracks pointer motion on the stage and pushes the cursor position into each monitor's ring shader uniforms, in that ring's own (scale-factor-corrected) coordinates, so the hole follows the pointer live and spans monitors correctly.
- New settings: `cursor-radius` (logical px, default 150, `0` disables the hole) and `cursor-fade` (logical px, default 150, soft edge width of the hole).
- Preferences gain two spin rows for the new settings; schema recompiled so they take effect.
- Hole only applies to the visible ring widget; strut strips, click-through, work-area shrinking, and activation behavior are unchanged.

## Capabilities

### New Capabilities
- `cursor-avoidance`: The visible ring fades to transparent in a configurable circular region around the pointer, with a soft smoothstep edge, while struts and click-through behavior stay intact.

### Modified Capabilities
<!-- None: strut reservation, glow, color, and mode behavior all remain unchanged. -->

## Impact

- `extension.js`: add cursor uniforms to `RING_SHADER`, track stage `motion-event`, push per-ring local cursor coordinates into shader uniforms, initialize cursor position when the ring builds.
- `schemas/org.gnome.shell.extensions.ringlight.gschema.xml`: add `cursor-radius` and `cursor-fade` keys.
- `schemas/gschemas.compiled`: recompile committed binary.
- `prefs.js`: two spin rows bound to the new keys.
- No new dependencies; GNOME Shell 45–50 compatibility maintained (stage motion events and shader uniforms are stable across the range).
