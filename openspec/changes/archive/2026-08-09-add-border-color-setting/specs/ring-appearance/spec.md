## ADDED Requirements

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
