## Why

Camera and mode state changes currently create or remove ring chrome instantly, causing an abrupt visual jump and work-area change. A short fade makes activation and deactivation less distracting while retaining current behavior.

## What Changes

- Fade ring visual opacity in and out over a fixed, short duration whenever active state changes.
- Keep work-area struts active for full visible interval and remove them only after fade-out finishes.
- Ensure rapid camera or mode changes cancel and reverse any in-progress transition without leaked actors or listeners.
- Leave geometry, camera detection, Quick Settings modes, and configured brightness semantics unchanged.

## Capabilities

### New Capabilities
- `ring-visibility-animation`: Smooth ring visual transitions between hidden and visible states.

### Modified Capabilities
- `camera-triggered-ring`: Camera-driven activation and deactivation transition rather than appearing or disappearing instantly.
- `ring-mode-control`: Mode changes transition ring visibility rather than appearing or disappearing instantly.

## Impact

- `extension.js`: ring opacity transition lifecycle, delayed chrome cleanup, and disable-time cancellation.
- Existing shader and GSettings schema remain unchanged.
