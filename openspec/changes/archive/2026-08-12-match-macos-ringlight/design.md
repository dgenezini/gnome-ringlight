## Context

`RING_SHADER` currently derives alpha only inside the ring band. At defaults, its glow is 15 physical pixels wide inside a 90-pixel strut, and cursor transparency removes a 460-pixel-diameter section of it. macOS reference image instead has an approximately 50-pixel white core and a roughly 130-pixel blue-white tail within an approximately 200-pixel light footprint.

GNOME Shell chrome uses normal alpha compositing; it cannot produce true additive light over arbitrary wallpaper. Existing transparent struts must remain responsible for work-area reservation, while visible actor remains click-through and below panel.

## Goals / Non-Goals

**Goals:**
- Make default ring read as continuous macOS-style edge light: opaque white core, long soft cool-white halo, and roughly 200 logical-pixel footprint at scale 1.
- Keep configured strut geometry as only source of work-area reservation.
- Preserve live settings rebuilds, multi-monitor geometry, HiDPI scaling, top-panel/dock gaps, and optional cursor avoidance.

**Non-Goals:**
- Pixel-identical rendering across wallpapers, displays, compositors, or color profiles.
- True additive/HDR lighting, new dependencies, new user-facing appearance controls, or changes to camera triggering.

## Decisions

### Separate shader light profile from struts

Continue rendering one non-strut `St.Widget` per monitor and creating four transparent strut actors. Allocate enough actor area to contain halo, then pass inner/core/halo geometry to shader; only transparent actors affect struts. This permits halo around core without changing window placement.

Alternative: enlarge struts with glow. Rejected: maximized and tiled windows would lose extra space solely for translucent pixels.

### Use three smooth alpha regions in existing shader

Replace current `inside × glow` profile with core, near halo, and far halo regions having continuous smooth falloff. Core is opaque white. Halo is cool blue-white at defaults and transitions toward configured temperature for non-default color values. Clamp output alpha to normal compositor range.

Alternative: `Shell.BlurEffect` or a second actor. Rejected: one shader already handles rounded SDF geometry, opacity, color, and physical-pixel scaling; extra actors/effects add clipping and ordering failure modes.

### Match reference through defaults, retain current controls

Set the fixed pixel-mode light footprint near 100 logical pixels (50px core + 50px glow tail) and choose shader core/halo proportions from the reference. Set `cursor-transparency` default false. Existing width mode (fixed vs resolution), brightness, temperature, padding, and cursor settings remain available and continue rebuilding ring live. The former `softness`/`glow` knobs were removed: on a fixed reference profile they only degraded the look, and `ring-width` was removed once pixel mode reserved exactly the light footprint.

Alternative: add dedicated core-width, halo-width, and halo-color settings. Rejected: existing controls cover tuning; defaults solve requested visual mismatch.

### Glow confined to the reserved band

The glow tail fills the reserved band (from the 50px core to the band's inner edge) and fades out there, so it never paints over window content: the strut-reserved width defines both the usable area and the light's inner boundary. There is no dead reserved space — windows sit right at the glow's edge.

### Retain alpha-compositing limitation

Use high-opacity core and blue-white halo to approximate reference. Do not attempt values above alpha 1 or custom blending unavailable through normal Shell chrome.

Alternative: compositor-level additive blending. Rejected: unavailable to extension and incompatible with supported GNOME versions.

## Risks / Trade-offs

- [Halo can bleed into adjacent monitor space] → Clip each visual actor to its monitor rectangle and derive geometry from monitor/work-area bounds.
- [Large default ring shrinks workspace more] → State default footprint in schema and keep existing width/resolution controls for opt-out.
- [Halo varies with wallpaper] → Validate against dark and light wallpapers; alpha compositing limits are documented.
- [Shader regression on fractional/HiDPI scale] → Scale all geometry and validate at scale factors 1 and 2.
- [Cursor obscures pointer when default off] → Retain cursor transparency option unchanged for users who need it.

## Migration Plan

GSettings defaults apply only to new profiles; existing users keep stored settings. No data migration required. Reverting implementation and schema defaults restores prior visual behavior; recompile `schemas/gschemas.compiled` with either schema change.

## Open Questions

None. Reference match means approximate light profile within normal GNOME alpha compositing limits.
