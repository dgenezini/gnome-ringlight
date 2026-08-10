# camera-triggered-ring

## MODIFIED Requirements

### Requirement: Graceful fallback without camera monitor
If the camera monitor cannot be created, the fallback behavior SHALL depend on the `ring-mode` setting: in `auto` or `always` modes the extension SHALL keep the ring visible permanently and log a warning explaining camera triggering is unavailable; in `off` mode the extension SHALL keep the ring hidden.

#### Scenario: CameraMonitor unavailable
- **WHEN** `new Shell.CameraMonitor()` fails at enable time
- **THEN** the extension shows the ring (always-on) and logs a warning explaining camera triggering is unavailable, unless the mode is `off`, in which case the ring stays hidden
