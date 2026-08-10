## ADDED Requirements

### Requirement: Ring rendered with small edge gradient
The extension SHALL paint the visible ring with Cairo on an `St.DrawingArea` instead of a solid CSS border. The ring SHALL be fully opaque with a small soft gradient at the band edges: flat colored center with ~3px fade at the inner and outer edges, produced by a `Shell.BlurEffect` with a fixed 2px radius. Anti-aliasing SHALL be enabled so rounded corners render smoothly at any border width.

#### Scenario: Ring active
- **WHEN** the ring is active
- **THEN** the ring is painted with anti-aliased edges, has a flat opaque colored center, and fades only in the last few pixels at the inner and outer band edges

#### Scenario: Ring follows configured width
- **WHEN** the ring is active
- **THEN** the opaque band thickness equals the configured width (`border-width`, or the resolution-derived margin), and the glow does not extend beyond the blur radius

### Requirement: Gradient derives from existing color
The gradient SHALL be computed from the existing `border-color-temperature` color — no new color settings. The edge fade SHALL be a fixed default with no user-facing controls.

#### Scenario: Temperature changed
- **WHEN** `border-color-temperature` changes while the ring is active
- **THEN** the ring rebuilds with the new hue applied across the whole band, with the same edge fade

### Requirement: Struts and click-through unchanged
The ring's new rendering SHALL NOT change the extension's strut behavior: the transparent strips continue to reserve the work area, the ring actor remains non-strut and `reactive: false`, and pointer events continue to pass through to windows.

#### Scenario: Ring active over interactive windows
- **WHEN** the ring is active and the pointer moves over it
- **THEN** clicks and hover pass through to the windows below, and the work area is shrunk exactly as before

### Requirement: HiDPI monitors render sharply
The ring SHALL scale its Cairo drawing by the shell's scale factor so the band and edges stay sharp on scaled (HiDPI) monitors.

#### Scenario: Ring on a scaled monitor
- **WHEN** the ring is active on a monitor whose scale factor is greater than 1
- **THEN** the ring's band and edge fade render at the monitor's physical resolution without blurring or jagged steps
