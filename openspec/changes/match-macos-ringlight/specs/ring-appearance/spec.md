## ADDED Requirements

### Requirement: Continuous default call light
The extension SHALL default `cursor-transparency` to false so active ring remains continuous while pointer rests on a ring edge. Cursor transparency and its radius/fade settings SHALL remain available in preferences.

#### Scenario: Default pointer on ring
- **WHEN** pointer rests on an active ring using default settings
- **THEN** ring core and halo remain continuous at pointer location

#### Scenario: Cursor transparency enabled
- **WHEN** user enables `cursor-transparency` while ring is active and pointer is on ring band
- **THEN** ring fades around pointer according to configured cursor radius and fade
