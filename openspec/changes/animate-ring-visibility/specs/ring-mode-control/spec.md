## MODIFIED Requirements

### Requirement: Ring follows selected mode
The extension SHALL derive ring visibility from `ring-mode`:
- `auto`: ring active while a camera is in use (PipeWire monitor or v4l2 poll), inactive otherwise — unchanged from current behavior.
- `always`: ring active regardless of camera state.
- `off`: ring never active, even while a camera is in use.

Mode changes SHALL fade ring visibility immediately without a shell restart.

#### Scenario: Always On with no camera
- **WHEN** mode is `always` and no camera is in use
- **THEN** ring fades in and remains visible on every monitor

#### Scenario: Off while camera in use
- **WHEN** mode is `off` and a camera is in use
- **THEN** ring fades out and work area restores after fade completion

#### Scenario: Always On with camera in use
- **WHEN** mode is `always` and a camera is in use
- **THEN** ring stays visible without rebuild churn from camera state changes

#### Scenario: Auto keeps camera behavior
- **WHEN** mode is `auto` and a camera turns on
- **THEN** ring fades in; when last camera turns off it fades out

#### Scenario: Mode switch applies immediately
- **WHEN** user switches from `off` to `always`
- **THEN** ring begins fading in immediately, no restart needed
