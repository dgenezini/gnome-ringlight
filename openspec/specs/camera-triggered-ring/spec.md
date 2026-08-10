# camera-triggered-ring

## Purpose

Make the ring light up automatically while any camera is in use, instead of being always-on. (TBD: expand)

## Requirements

### Requirement: Ring activates when camera turns on
The extension SHALL show the ring when mutter reports a camera in use, and SHALL keep the ring visible while a camera is in use. Direct v4l2 camera use SHALL also activate the ring: browsers (Firefox/Chrome) open /dev/videoX directly instead of PipeWire, so the extension polls for open camera device files as a complement to `Shell.CameraMonitor`.

#### Scenario: Camera turns on while extension enabled
- **WHEN** the camera in-use state reported by `Shell.CameraMonitor` (`cameras-in-use` property, same object GNOME Shell's camera indicator binds to) changes to true
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
- **WHEN** the camera in-use state changes to false
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

### Requirement: Graceful fallback without camera monitor
If the camera monitor cannot be created, the fallback behavior SHALL depend on the `ring-mode` setting: in `auto` or `always` modes the extension SHALL keep the ring visible permanently and log a warning explaining camera triggering is unavailable; in `off` mode the extension SHALL keep the ring hidden.

#### Scenario: CameraMonitor unavailable
- **WHEN** `new Shell.CameraMonitor()` fails at enable time
- **THEN** the extension shows the ring (always-on) and logs a warning explaining camera triggering is unavailable, unless the mode is `off`, in which case the ring stays hidden

### Requirement: Clean disable
The extension SHALL fully remove the ring and all camera monitor listeners on disable, regardless of camera state.

#### Scenario: Extension disabled while camera in use
- **WHEN** the extension is disabled while the ring is active
- **THEN** all border strips are removed, the camera monitor listener is disconnected, and the work area is restored

#### Scenario: Extension disabled while inactive
- **WHEN** the extension is disabled while no camera is in use
- **THEN** no strips exist to remove and the camera monitor listener is disconnected
