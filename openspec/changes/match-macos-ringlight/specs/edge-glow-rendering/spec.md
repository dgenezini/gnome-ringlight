## MODIFIED Requirements

### Requirement: Ring rendered with small edge gradient
The extension SHALL render each active ring with its existing shader-based rounded-rectangle geometry as a continuous macOS-style light profile. Each edge SHALL contain an opaque or near-opaque white core approximately 50 logical pixels wide plus a cool blue halo that fills the reserved band (approximately 100 logical pixels total at default), colored after the reference light. Core and halo transitions SHALL be continuous, anti-aliased, and scale by GNOME Shell's stage scale factor. The halo SHALL render on both sides of the core where monitor bounds permit, SHALL be clipped at its monitor boundary, and SHALL fade out at the ring's inner band edge so it never paints over window content.

#### Scenario: Ring active with default appearance
- **WHEN** the ring activates at scale factor 1 using default settings
- **THEN** every monitor edge shows a continuous bright white core about 50 logical pixels wide and a cool blue halo filling the reserved band (about 100 logical pixels total)

#### Scenario: Halo fades without hard bands
- **WHEN** the ring is active over a dark background
- **THEN** core, near halo, and far halo blend continuously with no hard alpha or color boundary

#### Scenario: Ring follows configured width
- **WHEN** the ring size configuration changes while the ring is active
- **THEN** the core and halo geometry rebuild from the new reserved band width without a stale visual actor

### Requirement: Gradient derives from existing color
The extension SHALL derive core color from existing `ring-color-temperature` setting without adding a color setting. At default 6500 K, core SHALL render white and halo SHALL render cool blue after the reference light. At non-default temperatures, core and halo SHALL retain configured light hue while maintaining same core-to-halo falloff profile.

#### Scenario: Default color profile
- **WHEN** the extension uses default 6500 K temperature
- **THEN** core is effectively white and its surrounding halo is visibly cool blue

#### Scenario: Temperature changed
- **WHEN** `ring-color-temperature` changes while ring is active
- **THEN** core and halo rebuild immediately with corresponding hue and unchanged geometry

### Requirement: HiDPI monitors render sharply
The extension SHALL scale all core and halo shader geometry by shell scale factor so profile dimensions and rounded edges remain sharp on scaled monitors.

#### Scenario: Ring on scaled monitor
- **WHEN** ring activates on a monitor with scale factor greater than 1
- **THEN** core, halo, and rounded corners render at physical resolution with proportional logical-pixel dimensions and no jagged steps

## ADDED Requirements

### Requirement: Halo does not reserve extra workspace
The visible halo SHALL be rendered by non-strut click-through chrome. Transparent strut actors SHALL reserve configured ring width and SHALL NOT expand to reserve additional halo-only area.

#### Scenario: Halo visible around active ring
- **WHEN** ring activates with default glow profile
- **THEN** maximized and tiled windows are constrained by configured ring width, not by extra halo-only pixels

#### Scenario: Ring active over interactive windows
- **WHEN** pointer moves or clicks over visible core or halo
- **THEN** pointer events pass through to windows below
