## ADDED Requirements

### Requirement: Ring activates when camera turns on
The extension SHALL show the ring when the XDG Camera portal reports any camera in use, and SHALL keep the ring visible while a camera is in use.

#### Scenario: Camera turns on while extension enabled
- **WHEN** the camera in-use state reported by the `org.freedesktop.portal.Camera` portal changes to true
- **THEN** the extension builds the border strips on every monitor and registers them with `affectsStruts: true`

#### Scenario: Maximized windows resize on activation
- **WHEN** the ring becomes active on a workspace containing maximized or tiled windows
- **THEN** mutter shrinks those windows' work area so they fit inside the ring, on every workspace

#### Scenario: Second camera starts while ring active
- **WHEN** a camera is already in use and another camera turns on
- **THEN** the ring stays active and is not rebuilt unnecessarily

### Requirement: Ring deactivates when last camera turns off
The extension SHALL remove the ring when no camera is in use.

#### Scenario: Last camera turns off
- **WHEN** the camera in-use state reported by the portal changes to false
- **THEN** the extension removes all border strips and restores the previous work area

#### Scenario: Maximized windows restore on deactivation
- **WHEN** the ring is deactivated while windows were shrunk by it
- **THEN** maximized and tiled windows expand back to the full work area on every workspace

### Requirement: Ring follows monitor changes while active
While the ring is active, the extension SHALL keep the ring geometry in sync with monitor configuration.

#### Scenario: Monitor added or removed while active
- **WHEN** a monitor is added, removed, or resized while the ring is active
- **THEN** the extension rebuilds the border strips from the current monitor layout

#### Scenario: Monitor changes while inactive
- **WHEN** monitors change while no camera is in use
- **THEN** the extension does not build a ring

### Requirement: Graceful fallback without camera portal
If the camera portal is unavailable, the extension SHALL keep the ring visible permanently and log a warning.

#### Scenario: Portal missing or old
- **WHEN** the `org.freedesktop.portal.Camera` interface cannot be resolved at enable time
- **THEN** the extension shows the ring as before (always-on) and logs a warning explaining camera triggering is unavailable

### Requirement: Clean disable
The extension SHALL fully remove the ring and all portal listeners on disable, regardless of camera state.

#### Scenario: Extension disabled while camera in use
- **WHEN** the extension is disabled while the ring is active
- **THEN** all border strips are removed, portal signals are disconnected, and the work area is restored

#### Scenario: Extension disabled while inactive
- **WHEN** the extension is disabled while no camera is in use
- **THEN** no strips exist to remove and all portal listeners are disconnected
