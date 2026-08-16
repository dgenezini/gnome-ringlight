# ring-appearance

## Purpose

Control the visual color, brightness, and rounded corners of the ring. (TBD: expand)

## Requirements

### Requirement: Ring color follows configured light temperature
The extension SHALL color the ring border according to the `ring-color-temperature` setting, expressed in Kelvin. The setting SHALL range from 2700 K (warm incandescent yellow) to 6500 K (daylight white) and SHALL default to 6500 K, which renders effectively white. The color SHALL be derived from the temperature via a blackbody-approximation mapping (e.g. Tanner Helland), interpolating through commonly used light temperatures: warm yellow (~2700 K), warm white (~3000 K), neutral (~4000 K), daylight white (~6500 K). Changing the temperature SHALL recolor the ring immediately while it is active, without changing its geometry or strut behavior. The warm end SHALL be partially desaturated toward white so the ring stays a usable UI edge, and the halo color SHALL blend from a warm tint at low temperatures to a cool blue at 6500 K.

#### Scenario: Default appearance
- **WHEN** the extension is enabled with the default `ring-color-temperature` value (6500)
- **THEN** the ring core renders effectively white with a cool blue halo

#### Scenario: Ring recolors on temperature change
- **WHEN** the user lowers `ring-color-temperature` while the ring is active
- **THEN** the ring shader updates with the new color derived from that temperature

#### Scenario: Warm temperature yields yellow ring
- **WHEN** `ring-color-temperature` is set to the lower end of the range (2700)
- **THEN** the ring renders a warm yellow tint

#### Scenario: Geometry unaffected by color
- **WHEN** the temperature changes while the ring is active
- **THEN** ring dimensions, struts, and work-area shrinking are unchanged from before the change

### Requirement: Temperature slider with color track in preferences
The preferences window SHALL expose the ring color as a slider over the 2700–6500 K range, with a track gradient showing the yellow-to-white temperature ramp, so the slider itself previews the color. The slider SHALL show the current temperature value, and moving it SHALL update the `ring-color-temperature` setting.

#### Scenario: Slider track previews color ramp
- **WHEN** the preferences window is open
- **THEN** the temperature slider track displays a continuous gradient from warm yellow (2700 K) to white (6500 K) and the handle sits at the current setting

#### Scenario: Slider writes setting
- **WHEN** the user drags the slider
- **THEN** `ring-color-temperature` is updated to the dragged Kelvin value

#### Scenario: Setting reflected on reopen
- **WHEN** the user closes and reopens preferences after changing the slider
- **THEN** the slider handle is positioned at the stored setting

### Requirement: Brightness setting
The extension SHALL expose a `brightness` percentage setting (0–100, default 100) scaling the ring's opacity. Changing it while the ring is active SHALL apply immediately without rebuilding struts.

#### Scenario: Brightness lowered while active
- **WHEN** `brightness` changes while the ring is active
- **THEN** the ring dims immediately; struts and work area are unchanged

### Requirement: Ring corners rounded with configurable radius
The extension SHALL render the ring with rounded corners — both the outer corner at the ring's corner and the inner corner of the band. The corner radius SHALL be user-configurable via a `ring-radius` setting in logical pixels, with a default of 120. The inner corner radius SHALL be the outer radius minus the ring thickness (`LIGHT_W`), clamped to 0, keeping the band at constant thickness. A radius of 0 SHALL produce sharp corners. The work area SHALL still be shrunk by the full ring thickness on every edge, unchanged by the radius.

#### Scenario: Default rounded ring
- **WHEN** the ring becomes active with default settings (`ring-radius` 120)
- **THEN** the ring shows rounded outer corners with the inner corner rounded at radius 20

#### Scenario: Radius changed while ring active
- **WHEN** the user changes `ring-radius` in settings while the ring is active
- **THEN** the ring redraws with the new radius without toggling camera state

#### Scenario: Radius zero
- **WHEN** `ring-radius` is set to 0
- **THEN** the ring renders with sharp 90° corners

#### Scenario: Radius larger than ring thickness
- **WHEN** `ring-radius` is larger than the ring thickness
- **THEN** the inner corner is visibly rounded with radius `ring-radius − thickness`

#### Scenario: Work area unchanged by radius
- **WHEN** the ring is active with any `ring-radius` value
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
The extension SHALL default `cursor-transparency` to false so the active ring remains continuous while the pointer rests on a ring edge. Cursor transparency and its radius/fade settings SHALL remain available in preferences.

#### Scenario: Default pointer on ring
- **WHEN** the pointer rests on an active ring using default settings
- **THEN** the ring core and halo remain continuous at the pointer location

#### Scenario: Cursor transparency enabled
- **WHEN** the user enables `cursor-transparency` while the ring is active and the pointer is on a ring band
- **THEN** the ring fades around the pointer according to the configured cursor radius and fade
