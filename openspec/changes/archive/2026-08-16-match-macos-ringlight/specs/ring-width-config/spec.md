## REMOVED Requirements

### Requirement: Width mode is selectable

### Requirement: Width derived from available resolution

## ADDED Requirements

### Requirement: Ring reserves fixed light footprint
The extension SHALL reserve, in every mode, exactly the fixed light footprint: the ~50-logical-pixel opaque core plus its glow tail (~100 logical pixels total, the `LIGHT_W` constant), so windows sit right at the glow's edge with no dead reserved space. No width or width-mode settings exist: `ring-width`, `width-mode`, `available-width`, and `available-height` are removed and never exposed.

#### Scenario: Ring active
- **WHEN** the extension activates
- **THEN** every ring strut reserves the ~100-logical-pixel light footprint on its configured edge, and the glow fills the reserved band
