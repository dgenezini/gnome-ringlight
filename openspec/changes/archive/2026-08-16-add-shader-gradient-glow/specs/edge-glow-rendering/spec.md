## MODIFIED Requirements

### Requirement: Ring rendered with small edge gradient
The extension SHALL render each visible ring with one `Clutter.ShaderEffect` attached to one non-strut `St.Widget`; it SHALL NOT use Cairo painting or `Shell.BlurEffect` for ring appearance. The shader SHALL calculate distance to the inner and outer rounded ring edges and use `smoothstep` falloff to produce a long alpha gradient: opaque core, followed by approximately 80%, 40%, 10%, and 0% opacity. Rounded corners SHALL use distance-field geometry so their gradient is radial and continuous with adjacent edges.

#### Scenario: Ring active
- **WHEN** the ring is active
- **THEN** each monitor has one shader-rendered rounded ring with a continuous multi-stop falloff from its bright core to transparency and no seams at corners

#### Scenario: Ring follows configured width
- **WHEN** the ring is active
- **THEN** the shader uses configured per-axis width (`border-width`, or resolution-derived margins) for its inner and outer boundaries, and the core remains centered within each border band

#### Scenario: Rounded corner transition
- **WHEN** the ring has a non-zero corner radius
- **THEN** alpha contours around each corner follow rounded radial curves rather than intersecting rectangular side gradients

### Requirement: Gradient derives from existing color
The shader SHALL derive its RGB color from the existing `border-color-temperature` setting with no additional color setting. It SHALL multiply the final alpha by the configured `brightness` setting. `brightness` SHALL range from 0 to 100 percent and default to 100 percent; at 100 percent, the core SHALL be fully opaque before glow falloff.

#### Scenario: Temperature changed
- **WHEN** `border-color-temperature` changes while the ring is active
- **THEN** the ring rebuilds with the new hue applied across its core and glow while retaining current brightness, softness, and glow behavior

#### Scenario: Brightness changed
- **WHEN** the user changes brightness while the ring is active
- **THEN** the ring rebuilds with final alpha scaled to the selected percentage without changing ring geometry or struts

### Requirement: HiDPI monitors render sharply
The shader SHALL receive dimensions and distances in physical pixels derived from GNOME Shell's scale factor, while user-configured geometry remains in logical pixels. The ring and its multi-stop gradients SHALL render without clipping, jagged corners, or scale-dependent width changes on scaled monitors.

#### Scenario: Ring on a scaled monitor
- **WHEN** the ring is active on a monitor whose scale factor is greater than 1
- **THEN** core width, 20/50/100 logical-pixel glow extents, and rounded gradient contours are rendered at matching physical-pixel scale

## ADDED Requirements

### Requirement: Ring has three continuous glow zones
The shader SHALL produce bright core, medium glow, and outer glow zones in one rendering pass. At default settings their logical-pixel extents SHALL be 20px, 50px, and 100px respectively, with successively lower opacity. No separate painted actor or blur effect SHALL be used for these zones.

#### Scenario: Default glow appearance
- **WHEN** the ring is active with default softness and glow settings
- **THEN** the visible ring has a 20px bright core followed by medium and outer diffusion extending to approximately 50px and 100px without discontinuities

#### Scenario: No glow seams
- **WHEN** a glow zone crosses from an edge into a rounded corner
- **THEN** its opacity transition remains continuous with no overlap seam or abrupt rectangular corner

### Requirement: Softness and glow adjust gradient profile
The extension SHALL provide `softness` and `glow` settings, each ranging from 0 to 100 percent. `softness` SHALL control gradient transition breadth; `glow` SHALL control medium and outer glow spread and opacity. Both settings SHALL apply live while the ring is active and SHALL NOT alter strut geometry.

#### Scenario: Softness changed
- **WHEN** the user increases softness while the ring is active
- **THEN** the shader widens the alpha falloff around the core while preserving its configured border geometry

#### Scenario: Glow changed
- **WHEN** the user decreases glow while the ring is active
- **THEN** medium and outer glow become less prominent and shorter while core brightness and work-area reservation remain unchanged
