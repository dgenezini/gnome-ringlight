## MODIFIED Requirements

### Requirement: Ring corners rounded with configurable radius
The extension SHALL render the ring with rounded corners—both the outer corner at the ring's corner and the inner corner of the band—using the shader's rounded distance-field geometry. The corner radius SHALL be user-configurable via the existing `border-radius` setting in logical pixels, with a default of 100. The inner corner radius SHALL follow CSS border semantics (outer radius minus the applicable ring thickness, clamped to 0), keeping the band at constant thickness. A radius of 0 SHALL produce sharp corners. The radial alpha gradient and glow SHALL follow both rounded boundaries continuously. The work area SHALL still be shrunk by the full ring thickness on every edge, unchanged by the radius.

#### Scenario: Default rounded ring
- **WHEN** the ring becomes active with default settings (`border-width` 150, `border-radius` 100)
- **THEN** the ring shows rounded outer corners of radius 100, an inner corner clamped to 0, and a continuous radial alpha falloff around each corner

#### Scenario: Radius changed while ring active
- **WHEN** the user changes `border-radius` in settings while the ring is active
- **THEN** the ring redraws with the new rounded gradient geometry without toggling camera state

#### Scenario: Radius zero
- **WHEN** `border-radius` is set to 0
- **THEN** the ring renders with sharp 90° corners

#### Scenario: Radius larger than ring thickness
- **WHEN** `border-radius` is larger than `border-width`
- **THEN** the inner corner is visibly rounded with radius `border-radius − border-width`

#### Scenario: Ring thickness differs per axis (resolution mode)
- **WHEN** `width-mode` is `resolution` so horizontal and vertical ring thickness differ
- **THEN** the ring uses per-side border thicknesses and still renders rounded corners

#### Scenario: Work area unchanged by radius
- **WHEN** the ring is active with any `border-radius` value
- **THEN** the usable work area is the work area shrunk by the full ring thickness on each edge, identical to radius 0

## ADDED Requirements

### Requirement: Appearance controls available in preferences
The preferences window SHALL expose Brightness, Softness, and Glow controls in addition to existing color temperature and width controls. Each control SHALL show and persist its current percentage value from 0 through 100 and SHALL update the active ring immediately.

#### Scenario: Appearance controls shown
- **WHEN** the user opens Ring Light preferences
- **THEN** Brightness, Softness, and Glow controls are visible with their stored percentage values

#### Scenario: Appearance control persisted
- **WHEN** the user changes Brightness, Softness, or Glow and closes preferences
- **THEN** reopening preferences shows the saved value and the next ring activation uses it
