## MODIFIED Requirements

### Requirement: Ring activates when camera turns on
The extension SHALL fade in rings on enabled monitors when mutter reports a camera in use, and SHALL keep those rings visible while a camera is in use. Direct v4l2 camera use SHALL also activate the ring: browsers (Firefox/Chrome) open /dev/videoX directly instead of PipeWire, so the extension polls for open camera device files as a complement to `Shell.CameraMonitor`.

#### Scenario: Camera turns on while extension enabled
- **WHEN** the camera in-use state reported by `Shell.CameraMonitor` (`cameras-in-use` property, same object GNOME Shell's camera indicator binds to) changes to true
- **THEN** the extension builds border strips on every enabled monitor, registers them with `affectsStruts: true`, and fades visual rings in

#### Scenario: Maximized windows resize on activation
- **WHEN** the ring becomes active on a workspace containing maximized or tiled windows
- **THEN** mutter shrinks those windows' work area so they fit inside the ring, on every workspace

#### Scenario: Second camera starts while ring active
- **WHEN** a camera is already in use and another camera turns on
- **THEN** the ring stays active and is not rebuilt unnecessarily

### Requirement: Ring deactivates when last camera turns off
The extension SHALL fade out rings when no camera is in use, then remove their border strips and restore the previous work area.

#### Scenario: Last camera turns off
- **WHEN** camera in-use state changes to false
- **THEN** extension fades visual rings out, removes all border strips after fade completion, and restores previous work area

#### Scenario: Maximized windows restore on deactivation
- **WHEN** ring is deactivated while windows were shrunk by it
- **THEN** maximized and tiled windows expand back to full work area after fade-out completes on every workspace
