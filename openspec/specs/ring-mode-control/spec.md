# ring-mode-control

## Purpose

Let the user pick how the ring behaves: automatic (camera-triggered), always on, or off, from a Quick Settings toggle. (TBD: expand)

## Requirements

### Requirement: Ring mode selection in Quick Settings
The extension SHALL add a "Ring Light" toggle to the GNOME Quick Settings menu via the GNOME 45+ `QuickSettings.addQuickSettingsItems` API. The toggle SHALL expose exactly three modes: **Automatic**, **Always On**, and **Off**. The toggle's state and subtitle SHALL reflect the active mode.

#### Scenario: Toggle appears when extension enabled
- **WHEN** the extension is enabled
- **THEN** a "Ring Light" toggle is present in the Quick Settings menu, showing the current mode

#### Scenario: Mode selected from toggle menu
- **WHEN** the user selects "Always On" from the toggle's mode menu
- **THEN** the mode is applied immediately and the toggle shows "Always On"

#### Scenario: Toggle removed on disable
- **WHEN** the extension is disabled
- **THEN** the "Ring Light" toggle is removed from the Quick Settings menu

### Requirement: Mode persisted
The extension SHALL persist the selected mode in the `ring-mode` GSettings key (`'auto'`, `'always'`, or `'off'`, default `'auto'`). The mode SHALL survive extension and shell restarts, and changes to the key outside the toggle (e.g. `dconf`) SHALL take effect live.

#### Scenario: Default mode preserves current behavior
- **WHEN** the extension is first installed (no `ring-mode` value set)
- **THEN** the mode is `auto` and the ring behaves exactly as before this change

#### Scenario: Mode survives restart
- **WHEN** the user selects "Always On" and then restarts the shell
- **THEN** the toggle shows "Always On" and the ring is on

#### Scenario: External mode change applied live
- **WHEN** the `ring-mode` setting changes while the extension is enabled (e.g. via `dconf` or the settings window)
- **THEN** the toggle and the ring update to the new mode immediately, without a restart

### Requirement: Ring follows selected mode
The extension SHALL derive ring visibility from `ring-mode`:
- `auto`: ring active while a camera is in use (PipeWire monitor or v4l2 poll), inactive otherwise — unchanged from current behavior.
- `always`: ring active regardless of camera state.
- `off`: ring never active, even while a camera is in use.

Mode changes SHALL apply immediately without a shell restart.

#### Scenario: Always On with no camera
- **WHEN** the mode is `always` and no camera is in use
- **THEN** the ring is visible on every monitor

#### Scenario: Off while camera in use
- **WHEN** the mode is `off` and a camera is in use
- **THEN** the ring is not visible and the work area is not shrunk

#### Scenario: Always On with camera in use
- **WHEN** the mode is `always` and a camera is in use
- **THEN** the ring stays visible (no rebuild churn from camera state changes)

#### Scenario: Auto keeps camera behavior
- **WHEN** the mode is `auto` and a camera turns on
- **THEN** the ring activates; when the last camera turns off the ring deactivates

#### Scenario: Mode switch applies immediately
- **WHEN** the user switches from `off` to `always`
- **THEN** the ring appears immediately, no restart needed

### Requirement: Explicit modes respected without camera monitor
If `new Shell.CameraMonitor()` fails at enable time, the fallback behavior SHALL depend on the mode: in `auto` the ring stays on permanently with a warning (unchanged from current behavior); in `always` the ring stays on permanently; in `off` the ring stays off.

#### Scenario: Fallback with auto mode
- **WHEN** the camera monitor cannot be created and the mode is `auto`
- **THEN** the ring is visible permanently and a warning is logged

#### Scenario: Fallback with off mode
- **WHEN** the camera monitor cannot be created and the mode is `off`
- **THEN** the ring is not visible and no warning about camera triggering is needed

#### Scenario: Fallback with always mode
- **WHEN** the camera monitor cannot be created and the mode is `always`
- **THEN** the ring is visible permanently
