# edge-glow-rendering

## Purpose

Render the ring as a continuous macOS-style light profile: opaque core plus cool halo. (TBD: expand)

## Requirements

### Requirement: Ring rendered with small edge gradient
The extension SHALL render each active ring with a shader-based rounded-rectangle light profile (Clutter.ShaderEffect). Each edge SHALL contain an opaque or near-opaque white core approximately 50 logical pixels wide plus a cool blue halo that fills the reserved band (approximately 100 logical pixels total), colored after the reference light. Core and halo transitions SHALL be continuous, anti-aliased, and scale by GNOME Shell's stage scale factor. The halo SHALL render on both sides of the core where monitor bounds permit, SHALL be clipped at its monitor boundary, and SHALL fade out at the ring's inner band edge so it never paints over window content.

#### Scenario: Ring active with default appearance
- **WHEN** the ring activates at scale factor 1 using default settings
- **THEN** every monitor edge shows a continuous bright white core about 50 logical pixels wide and a cool blue halo filling the reserved band (about 100 logical pixels total)

#### Scenario: Halo fades without hard bands
- **WHEN** the ring is active over a dark background
- **THEN** core, near halo, and far halo blend continuously with no hard alpha or color boundary

### Requirement: Gradient derives from existing color
The extension SHALL derive core color from the existing `ring-color-temperature` setting without adding a color setting. At default 6500 K, the core SHALL render white and the halo SHALL render cool blue after the reference light. At non-default temperatures, core and halo SHALL retain the configured light hue while maintaining the same core-to-halo falloff profile.

#### Scenario: Default color profile
- **WHEN** the extension uses the default 6500 K temperature
- **THEN** the core is effectively white and its surrounding halo is visibly cool blue

#### Scenario: Temperature changed
- **WHEN** `ring-color-temperature` changes while the ring is active
- **THEN** the core and halo update immediately with the corresponding hue and unchanged geometry

### Requirement: Halo does not reserve extra workspace
The visible halo SHALL be rendered by non-strut click-through chrome. Transparent strut actors SHALL reserve the fixed ring footprint (`LIGHT_W`) and SHALL NOT expand to reserve additional halo-only area.

#### Scenario: Halo visible around active ring
- **WHEN** the ring activates with the default glow profile
- **THEN** maximized and tiled windows are constrained by the ring footprint, not by extra halo-only pixels

#### Scenario: Ring active over interactive windows
- **WHEN** the pointer moves or clicks over the visible core or halo
- **THEN** pointer events pass through to the windows below

### Requirement: No softness or glow settings
The ring SHALL use a fixed reference profile: no `softness` or `glow` settings SHALL exist in the schema or preferences.

#### Scenario: Preferences show no glow controls
- **WHEN** the user opens preferences
- **THEN** there is no softness or glow control; the profile is fixed

### Requirement: HiDPI monitors render sharply
The extension SHALL scale all core and halo shader geometry by the shell scale factor so profile dimensions and rounded edges remain sharp on scaled monitors.

#### Scenario: Ring on a scaled monitor
- **WHEN** the ring activates on a monitor with a scale factor greater than 1
- **THEN** core, halo, and rounded corners render at physical resolution with proportional logical-pixel dimensions and no jagged steps
