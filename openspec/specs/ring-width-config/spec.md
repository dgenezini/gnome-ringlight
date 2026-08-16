# ring-width-config

## Purpose

Ring thickness is a fixed light footprint; no width settings. (TBD: expand)

## Requirements

### Requirement: Ring reserves fixed light footprint
The extension SHALL reserve, on every edge, exactly the fixed light footprint defined by the `LIGHT_W` constant (~100 logical pixels: the ~50-logical-pixel opaque core plus its glow tail), so windows sit right at the glow's edge with no dead reserved space. No width or width-mode settings exist: `ring-width`, `width-mode`, `available-width`, and `available-height` are removed and never exposed.

#### Scenario: Ring active
- **WHEN** the extension activates
- **THEN** every ring strut reserves the ~100-logical-pixel light footprint on its configured edge, scaled by the stage scale factor, and the glow fills the reserved band

#### Scenario: No width controls in preferences
- **WHEN** the user opens preferences
- **THEN** there is no ring width, width mode, or available-resolution control; the band is fixed
