## MODIFIED Requirements

### Requirement: Ring follows selected mode
The extension SHALL derive ring visibility from `ring-mode` and apply active visibility only to enabled monitors:
- `auto`: rings on enabled monitors are active while a camera is in use (PipeWire monitor or v4l2 poll), inactive otherwise.
- `always`: rings on enabled monitors are active regardless of camera state.
- `off`: no monitor ring is active, even while a camera is in use.

Mode changes SHALL apply immediately without a shell restart.

#### Scenario: Always On with no camera
- **WHEN** mode is `always` and no camera is in use
- **THEN** ring is visible on every enabled monitor and excluded monitors retain their normal work area

#### Scenario: Off while camera in use
- **WHEN** mode is `off` and a camera is in use
- **THEN** no ring is visible and no work area is shrunk

#### Scenario: Always On with camera in use
- **WHEN** mode is `always` and a camera is in use
- **THEN** rings on enabled monitors stay visible without rebuild churn from camera state changes

#### Scenario: Auto keeps camera behavior
- **WHEN** mode is `auto` and a camera turns on
- **THEN** rings activate on enabled monitors; when last camera turns off they deactivate

#### Scenario: Mode switch applies immediately
- **WHEN** user switches from `off` to `always`
- **THEN** rings appear immediately on enabled monitors, with no restart needed
