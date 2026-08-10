## ADDED Requirements

### Requirement: Pixel width mode is default
The ring width SHALL default to a fixed pixel width, defined by the existing `border-width` setting, applied uniformly to all four strips. Existing installs SHALL keep this behavior without reconfiguration.

#### Scenario: Ring built in default pixel mode
- **WHEN** the ring activates with `width-mode` set to `pixels`
- **THEN** all four border strips use the `border-width` setting as their thickness, on every monitor

### Requirement: Width mode is selectable
A `width-mode` setting SHALL select between `pixels` and `resolution`. The extension SHALL rebuild the ring from the current mode and settings while the ring is active, so changes apply live.

#### Scenario: Mode changed while ring active
- **WHEN** `width-mode` changes while the ring is active
- **THEN** the ring is rebuilt using the newly selected mode

#### Scenario: Mode changed while ring inactive
- **WHEN** `width-mode` changes while no camera is in use
- **THEN** the next activation uses the new mode

### Requirement: Width derived from available resolution
In `resolution` mode the extension SHALL compute the ring thickness per axis from the `available-width` and `available-height` settings: vertical margin `(monitor height − available height) / 2` for the top and bottom strips, horizontal margin `(monitor width − available width) / 2` for the left and right strips. Margins SHALL be rounded to whole pixels and clamped to a minimum of 1 pixel.

#### Scenario: Resolution mode on a larger monitor
- **WHEN** the ring activates in `resolution` mode on a 3840×2160 monitor with `available-width` 1920 and `available-height` 1080
- **THEN** top and bottom strips are 540 px tall and left and right strips are 960 px wide, leaving a 1920×1080 available area

#### Scenario: Resolution mode matches monitor size
- **WHEN** `available-width` equals the monitor width
- **THEN** the horizontal margin computes to zero and left and right strips clamp to 1 px thickness, with the ring still present on the other axis

#### Scenario: Available resolution changed while ring active
- **WHEN** `available-width` or `available-height` changes while the ring is active in `resolution` mode
- **THEN** the ring is rebuilt with margins derived from the new values
