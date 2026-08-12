## MODIFIED Requirements

### Requirement: Ring activates when camera turns on
The extension SHALL show the ring on every enabled monitor when mutter reports a camera in use, and SHALL keep those rings visible while a camera is in use. Direct v4l2 camera use SHALL also activate the ring: browsers (Firefox/Chrome) open /dev/videoX directly instead of PipeWire, so the extension polls for open camera device files as a complement to `Shell.CameraMonitor`.

#### Scenario: Camera turns on while extension enabled
- **WHEN** the camera in-use state reported by `Shell.CameraMonitor` (`cameras-in-use` property, same object GNOME Shell's camera indicator binds to) changes to true
- **THEN** the extension builds border strips with `affectsStruts: true` on every enabled monitor and no ring actors on excluded monitors

#### Scenario: Maximized windows resize on activation
- **WHEN** the ring becomes active on a workspace containing maximized or tiled windows
- **THEN** mutter shrinks those windows' work area so they fit inside the ring, on every workspace of an enabled monitor

#### Scenario: Second camera starts while ring active
- **WHEN** a camera is already in use and another camera turns on
- **THEN** the ring stays active and is not rebuilt unnecessarily

### Requirement: Ring follows monitor changes while active
While the ring is active, the extension SHALL keep ring geometry in sync with monitor configuration and apply it only to enabled monitors.

#### Scenario: Monitor added or removed while active
- **WHEN** a monitor is added, removed, or resized while the ring is active
- **THEN** the extension rebuilds border strips from current monitor layout and stored monitor selections

#### Scenario: Excluded monitor added while active
- **WHEN** an excluded monitor reconnects while the ring is active
- **THEN** the extension creates no visual ring or struts for that monitor

#### Scenario: Monitor changes while inactive
- **WHEN** monitors change while no camera is in use
- **THEN** the extension does not build a ring
