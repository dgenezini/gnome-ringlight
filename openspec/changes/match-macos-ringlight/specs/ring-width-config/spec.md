## ADDED Requirements

### Requirement: Pixel mode reserves the fixed light footprint
The extension SHALL reserve, in pixel width mode, exactly the fixed light footprint: the 50-logical-pixel opaque core plus its glow tail (~100 logical pixels total), so windows sit right at the glow's edge with no dead reserved space. The old `ring-width` setting SHALL be removed; resolution mode SHALL keep deriving the band from the available area.

#### Scenario: Pixel mode default
- **WHEN** the extension activates with `width-mode` set to `pixels`
- **THEN** every ring strut reserves the ~100-logical-pixel light footprint on its configured edge, and the glow fills the reserved band

#### Scenario: Resolution mode derives the band
- **WHEN** the user selects resolution mode and sets `available-width`/`available-height`
- **THEN** the ring reserves the derived per-axis width and the glow fills that band
