## Context

`extension.js` currently paints one opaque rounded Cairo stroke in an `St.DrawingArea` and blurs it at a fixed 2px radius. The existing transparent strut actors reserve work area; they must remain independent from visual rendering. GNOME Shell versions 45–50 are supported, so rendering must use stable Clutter/St APIs and retain logical-pixel/HiDPI handling.

## Goals / Non-Goals

**Goals:**
- Paint every monitor's ring with one GPU shader effect using rounded-rectangle signed-distance fields and `smoothstep` falloff.
- Produce a bright core plus medium and outer glow without stacking actors.
- Make brightness, softness, and glow live preferences while retaining current temperature, radius, and width modes.
- Keep struts, click-through, monitor rebuilds, and panel stacking unchanged.

**Non-Goals:**
- Separate per-layer controls, arbitrary RGB colors, animation, or changes to camera activation.
- New dependencies or a normal GTK/Wayland overlay window.

## Decisions

### One Clutter shader effect on one visual actor

Replace the Cairo `St.DrawingArea` and `Shell.BlurEffect` with an `St.Widget` carrying one `Clutter.ShaderEffect`. Shader uniforms receive actor size, device scale, ring bounds, per-axis thickness, corner radius, Kelvin-derived RGB, brightness, softness, and glow strength. The effect computes all visual layers in one fragment pass.

This replaces four painted gradient widgets and multiple effect layers, avoiding seams at corners and extra chrome actors. Cairo gradients plus blur was considered but cannot provide continuous radial corner falloff or adjustable glow cheaply.

### Signed distance fields define ring and rounded corners

Shader computes signed distance to outer and inner rounded rectangles. Their difference creates an annular ring with independent horizontal and vertical thicknesses. Minimum distance to either boundary drives a five-stop alpha profile—opaque core, then approximately 80%, 40%, 10%, and zero—using chained `smoothstep` calls. Distance-field contours make corner falloff radial/rounded rather than overlap from rectangular side gradients.

### Three visual zones, controlled by two sliders

Core, medium, and outer zones use logical-pixel extents of 20px, 50px, and 100px at default softness/glow. Brightness multiplies final alpha. Softness widens/narrows transition intervals; glow scales medium/outer opacity and spread together. This provides requested controls without exposing nine per-layer settings. Default brightness preserves current visible intensity; default glow produces ring-light diffusion.

### Geometry and struts remain separate

Visual actor grows by maximum shader glow extent so fading pixels are not clipped. Four existing transparent `affectsStruts` actors continue to reserve exact per-side margins. The visual actor remains `reactive: false`, non-strut, in `uiGroup`, and below `panelBox`.

## Risks / Trade-offs

- [Shader API or GLSL differences across Shell 45–50] → verify syntax and uniforms on oldest supported Shell before removing Cairo path; keep shader source within Clutter's baseline GLSL subset.
- [Glow clipped near work-area bounds or panel] → pad visual actor by outer extent and keep it below panel.
- [Large widths and HiDPI reveal coordinate mismatch] → pass physical-pixel uniforms and convert all logical settings with actor scale before shader calculations.
- [Brightness 0 leaves invisible active struts] → retain valid 0–100 control because it is explicit user intent; mode Off remains removal path.

## Migration Plan

1. Add schema defaults for brightness, softness, and glow; existing installations receive defaults.
2. Compile schemas and replace visual rendering while preserving existing settings and struts.
3. Restart Shell, manually test camera transitions, monitor add/remove, disable while active, all width modes, and scaled displays.
4. Roll back by restoring prior extension and schema files, then restart Shell. No user data migration required.

## Open Questions

None. Default core/medium/outer extents are 20/50/100 logical pixels; implementation validation decides exact `smoothstep` breakpoints needed to achieve their intended visible profile.
