## ADDED Requirements

### Requirement: Ring fades out around the pointer
While the ring is active, the visible ring SHALL fade to transparent inside a circular region centered on the pointer, so the cursor is never covered by the ring. The transition SHALL be smooth: alpha SHALL be multiplied by `smoothstep(radius − fade, radius, distance(pointer, pixel))`, where `radius` and `fade` are the configured cursor radius and fade width — alpha 0 at the cursor, full beyond the radius, ramping over the fade width. The hole SHALL track the pointer live while it moves, SHALL be correct on every monitor and continuous across monitor boundaries, and SHALL be correct on HiDPI (scaled) monitors. Only the visible ring is affected: strut reservation, click-through (`reactive: false`), and work-area shrinking SHALL be unchanged.

#### Scenario: Cursor over the ring
- **WHEN** the ring is active and the pointer is over a ring band
- **THEN** the ring is transparent within the cursor radius around the pointer, with a smooth edge over the fade width, and pointer events still pass through to the window below

#### Scenario: Cursor away from the ring
- **WHEN** the ring is active and the pointer is farther than the cursor radius from every ring band
- **THEN** the ring renders exactly as without the feature

#### Scenario: Cursor moves across a monitor boundary
- **WHEN** the pointer moves from one monitor's ring onto an adjacent monitor's ring
- **THEN** the hole is a single continuous circle across both rings, not two separate holes

#### Scenario: Cursor over the ring during a fullscreen call
- **WHEN** a fullscreen window is showing and the pointer is over the visible ring
- **THEN** the ring disappears around the pointer while the rest of the ring stays visible

### Requirement: Cursor hole configured by radius and fade settings
The extension SHALL expose `cursor-radius` and `cursor-fade` GSettings keys, both integer logical pixels ranging 0–1000, defaulting to 230 and 150 respectively. `cursor-radius` SHALL default to 230 and a value of 0 SHALL disable the hole entirely (ring always fully visible). Changing either setting while the ring is active SHALL rebuild the ring with the new values immediately. The preferences window SHALL expose both keys as spin rows.

#### Scenario: Radius set to zero
- **WHEN** `cursor-radius` is 0 and the ring is active with the pointer over the band
- **THEN** the ring is fully visible with no hole

#### Scenario: Radius changed while active
- **WHEN** the user changes `cursor-radius` while the ring is active
- **THEN** the ring rebuilds with the new radius without toggling camera state

#### Scenario: Zero fade is a hard edge
- **WHEN** `cursor-fade` is 0 and the pointer is over the band
- **THEN** the hole has a hard circular edge with no gradient

### Requirement: Pointer tracking only while the ring is active
The extension SHALL track pointer motion only while the ring is active; when the ring is inactive the extension SHALL NOT repaint or update ring shaders on pointer movement.

#### Scenario: Ring inactive
- **WHEN** the ring is inactive (camera off, or mode off) and the pointer moves
- **THEN** no ring shader uniform updates occur and no repaint is triggered by pointer motion
