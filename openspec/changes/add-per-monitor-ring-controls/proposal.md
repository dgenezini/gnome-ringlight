## Why

Uniform rings waste screen space on multi-monitor desks where only one display is used for a call or camera framing. Users need to exclude individual monitors without disabling camera-triggered activation everywhere.

## What Changes

- Add persistent per-monitor enablement keyed by a stable monitor connector identifier.
- Add preferences controls to enable or exclude each currently connected monitor.
- Build visual rings and work-area struts only for enabled monitors.
- Preserve safe defaults: monitors without stored configuration remain enabled.
- Reconcile stored selection against monitor changes; disconnected monitors are not shown and reconnecting monitors recover their stored selection.

## Capabilities

### New Capabilities
- `per-monitor-ring-selection`: Select which connected monitors receive ring visuals and work-area reservation.

### Modified Capabilities
- `camera-triggered-ring`: Activation and monitor-change behavior apply rings only to enabled monitors.
- `ring-mode-control`: Active Automatic and Always On modes light enabled monitors rather than every monitor.

## Impact

- `extension.js`: monitor identity lookup and conditional ring/strut creation.
- `prefs.js`: connected-monitor enablement rows.
- `schemas/org.gnome.shell.extensions.ringlight.gschema.xml`: persisted monitor-selection setting; compiled schema regenerated.
- GNOME Shell monitor metadata APIs across supported GNOME 45–50 versions.
