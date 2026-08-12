# ring-appearance

## Purpose

Control the visual color of the ring so it can match the light source it represents. (TBD: expand)

## Requirements

### Requirement: Ring color follows configured light temperature
The extension SHALL color the ring border according to the `border-color-temperature` setting, expressed in Kelvin. The setting SHALL range from 2700 K (warm incandescent yellow) to 6500 K (daylight white) and SHALL default to 6500 K, which renders effectively white and preserves the current default appearance. The color SHALL be derived from the temperature via a blackbody-approximation mapping (e.g. Tanner Helland), interpolating through commonly used light temperatures: warm yellow (~2700 K), warm white (~3000 K), neutral (~4000 K), daylight white (~6500 K). Changing the temperature SHALL recolor the ring immediately while it is active, without changing its geometry or strut behavior.

#### Scenario: Default appearance unchanged
- **WHEN** the extension is enabled with the default `border-color-temperature` value (6500)
- **THEN** the ring renders effectively white, matching the previous hardcoded color

#### Scenario: Ring recolors on temperature change
- **WHEN** the user lowers `border-color-temperature` while the ring is active
- **THEN** the ring is rebuilt with the new color derived from that temperature

#### Scenario: Warm temperature yields yellow ring
- **WHEN** `border-color-temperature` is set to the lower end of the range (2700)
- **THEN** the ring renders a warm yellow tint

#### Scenario: Geometry unaffected by color
- **WHEN** the temperature changes while the ring is active
- **THEN** ring dimensions, struts, and work-area shrinking are unchanged from before the change

### Requirement: Temperature slider with color track in preferences
The preferences window SHALL expose the ring color as a slider over the 2700–6500 K range, with a track gradient showing the yellow-to-white temperature ramp, so the slider itself previews the color. The slider SHALL show the current temperature value, and moving it SHALL update the `border-color-temperature` setting.

#### Scenario: Slider track previews color ramp
- **WHEN** the preferences window is open
- **THEN** the temperature slider track displays a continuous gradient from warm yellow (2700 K) to white (6500 K) and the handle sits at the current setting

#### Scenario: Slider writes setting
- **WHEN** the user drags the slider
- **THEN** `border-color-temperature` is updated to the dragged Kelvin value

#### Scenario: Setting reflected on reopen
- **WHEN** the user closes and reopens preferences after changing the slider
- **THEN** the slider handle is positioned at the stored setting

### Requirement: Ring corners rounded with configurable radius
The extension SHALL render the ring with rounded corners — both the outer corner at the ring's corner and the inner corner of the band. The corner radius SHALL be user-configurable via a `border-radius` setting in logical pixels, with a default of 100. The inner corner radius SHALL follow CSS border semantics (outer radius minus ring thickness, clamped to 0), keeping the band at constant thickness. A radius of 0 SHALL produce sharp corners. The work area SHALL still be shrunk by the full ring thickness on every edge, unchanged by the radius.

#### Scenario: Default rounded ring
- **WHEN** the ring becomes active with default settings (`border-width` 150, `border-radius` 100)
- **THEN** the ring shows rounded outer corners: a quarter-circle of radius 100 at each ring corner, with the inner corner sharp (radius clamps to 0)

#### Scenario: Radius changed while ring active
- **WHEN** the user changes `border-radius` in settings while the ring is active
- **THEN** the ring redraws with the new radius without toggling camera state

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

### Requirement: Ring skips reserved bars
The ring SHALL hug the monitor's work area rather than the monitor rect: the band starts below the top panel and ends above a bottom task bar/dock, and likewise skips any side docks, instead of drawing behind them. The ring's struts SHALL still reserve the full ring thickness beyond the bars' own reserved space, so maximized windows never overlap the ring.

#### Scenario: Top bar present
- **WHEN** the ring becomes active on a monitor with the GNOME top panel
- **THEN** the ring's top band starts at the bottom edge of the panel's reserved space, and the work area starts a further full ring thickness below it

#### Scenario: Bottom task bar present
- **WHEN** the ring becomes active on a monitor with a dock/task bar at the bottom that reserves strut space
- **THEN** the ring's bottom band ends at the top edge of the dock's reserved space, and the work area ends a further full ring thickness above it

#### Scenario: No bars
- **WHEN** the ring becomes active on a monitor with no reserved bar space on an edge
- **THEN** the ring band on that edge starts at the monitor edge, as before

#### Scenario: Bars change while ring active
- **WHEN** a dock is added, removed, or resized while the ring is active
- **THEN** the ring rebuilds and hugs the updated work area

### Requirement: Continuous default call light
The extension SHALL default `cursor-transparency` to false so active ring remains continuous while pointer rests on a ring edge. Cursor transparency and its radius/fade settings SHALL remain available in preferences.

#### Scenario: Default pointer on ring
- **WHEN** pointer rests on an active ring using default settings
- **THEN** ring core and halo remain continuous at pointer location

#### Scenario: Cursor transparency enabled
- **WHEN** user enables `cursor-transparency` while ring is active and pointer is on ring band
- **THEN** ring fades around pointer according to configured cursor radius and fade

### Requirement: Appearance controls available in preferences
The preferences window SHALL expose Brightness, Softness, and Glow controls in addition to existing color temperature and width controls. Each control SHALL show and persist its current percentage value from 0 through 100 and SHALL update the active ring immediately.

#### Scenario: Appearance controls shown
- **WHEN** the user opens Ring Light preferences
- **THEN** Brightness, Softness, and Glow controls are visible with their stored percentage values

#### Scenario: Appearance control persisted
- **WHEN** the user changes Brightness, Softness, or Glow and closes preferences
- **THEN** reopening preferences shows the saved value and the next ring activation uses it
