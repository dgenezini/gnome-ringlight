## Context

The ring is one `St.Widget` per monitor carrying a fragment shader (`RING_SHADER` in `extension.js`, an SDF rounded-rectangle that outputs color × alpha). Widgets are added as non-strut chrome, `reactive: false`, below the panel. Four transparent strut strips per monitor actually shrink the work area. Shader coordinates are the widget's texture space in physical pixels (logical size × `St.ThemeContext` scale factor); the cursor position must be converted into each ring's local space, same scaling.

## Goals / Non-Goals

**Goals:**
- Visible ring fades out smoothly inside a circle around the pointer (Apple-style), live, while pointer moves.
- Hole works on every monitor simultaneously and across monitor boundaries; correct on HiDPI.
- Radius and fade width user-configurable; `0` radius disables.
- Struts, click-through, activation, and all other appearance behavior unchanged.

**Non-Goals:**
- No hover/click interaction with the ring (stays `reactive: false`).
- No cursor *highlight* — only carving the hole.
- No per-monitor scale-factor plumbing beyond what the shader already uses.

## Decisions

### 1. Cursor hole lives in the fragment shader
Add `u_mouse_x/u_mouse_y/u_cursor_radius/u_cursor_fade` uniforms; in `main()`:

```glsl
if (u_cursor_radius > 0.0) {
    float d = distance(point, vec2(u_mouse_x, u_mouse_y));
    alpha *= smoothstep(u_cursor_radius - u_cursor_fade, u_cursor_radius, d);
}
```

`smoothstep(r − fade, r, d)` is 0 at the cursor (fully transparent) and 1 beyond the radius (fully opaque), with a smooth ramp across the fade width. The initial draft had the edges reversed — `smoothstep(r, r − fade, d)` evaluates to 1 at the cursor and 0 at the radius, which made the ring vanish everywhere except a fading blob around the pointer; the manual test caught it.

**Alternatives rejected:** full-screen mask actor (adds a second draw path and a second layer to keep aligned), Cairo redraw on a canvas (replaces the whole shader pipeline, slower, redraws on every motion), nested clip actors (Clutter clips are rectangles only). The shader is a few lines and inherits the existing HiDPI/rounding handling.

### 2. Pointer position from stage `motion-event`, stored once
Connect `global.stage.connect('motion-event')` in `enable()`, read `event.get_coords()` (stage/logical coordinates), store as `this._cursorPos`, then push to all rings. Motion events are delivered through mutter's input pipeline on both X11 and Wayland (cursor-hiding extensions rely on this) and fire at compositor rate — no polling timer, no lag.

Initial position before the first motion event: `global.display.get_pointer_info().get_position()` in `_build()`, so the hole is already correct the moment the ring appears; if that call fails on an older mutter, leave the hole disabled until the first real motion event (radius uniforms start at 0). `global.get_pointer()` avoided — deprecated and journals warnings.

### 3. Per-ring local coordinates
The shader samples `cogl_tex_coord_in[0].st * vec2(u_width, u_height)`, i.e. widget-local physical pixels. For each ring widget (logical origin `ring.x, ring.y`), the cursor uniform is

```js
u_mouse_x = (cursorGlobalX - ring.x) * scale;
u_mouse_y = (cursorGlobalY - ring.y) * scale;
```

using the same `scale` as `u_width/u_height`. Rings on other monitors naturally compute large local distances → smoothstep returns 1 → no hole; when the cursor crosses a monitor edge, each ring independently shows its own portion of the same global circle, so the hole stays continuous.

### 4. Uniform updates outside paint
`Clutter.ShaderEffect.set_uniform_value()` caches values applied at the next paint, so the `motion-event` handler can update `u_mouse_x/u_mouse_y` directly without touching the paint path. A tiny float-uniform helper mirrors the GObject.Value dance already in `vfunc_paint_target`.

### 5. Ring widget bookkeeping
Keep `this._rings = []` (the ring widgets, one per monitor) alongside `this._borders` (ring + strips). The motion handler walks only `_rings`; strips are never repainted. `_build()` already runs on any settings change, which rebuilds the shader with the new radius/fade for free; it also re-reads the stored `_cursorPos` so the hole position survives rebuilds.

### 6. Settings
- `cursor-radius`: int, 0–1000, default **230**. `0` disables the hole entirely (shader guard skips the multiply; motion handler skips uniform updates).
- `cursor-fade`: int, 0–1000, default **150** (soft ramp across the outer half of the hole; `0` → hard circle edge).

Both are logical pixels, bound in prefs as `Adw.SpinRow`s like the existing rows, and require recompiling `schemas/gschemas.compiled` (committed binary — see AGENTS.md).

## Risks / Trade-offs

- `motion-event` coverage on Wayland → fallback: 250 ms GLib timeout re-reading the pointer if manual testing shows the hole lagging or not moving; verify during manual test checklist.
- `get_pointer_info()` getter shape differs across 45–50 → wrap in try/catch; on failure, first motion event initializes the hole (worst case: hole pops in a frame late).
- Per-pixel cost of the hole → one `distance` + `smoothstep` per fragment, negligible next to the existing SDF work; disabled entirely at radius 0.
- Rebuild churn (settings spin) recreates shaders → re-initialized from stored `_cursorPos`; no visible flicker since rebuild already tears down/creates widgets.

## Open Questions

None blocking. Default-on (230) chosen because the hole is the point of the feature; `0` is the documented off switch.
