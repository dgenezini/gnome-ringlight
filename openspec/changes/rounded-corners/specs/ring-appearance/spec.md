## ADDED Requirements

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
