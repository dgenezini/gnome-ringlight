## Why

Current ring is an opaque, narrow border with a glow clipped inside its reserved band. It lacks long blue-white bloom and continuous illumination seen in macOS FaceTime edge light reference, so it does not read as a bright light source.

## What Changes

- Render a wide bright core with a long, soft, cool-white glow extending toward monitor edges and ring interior.
- Expand visual actor beyond work-area struts so bloom does not consume reserved workspace or alter window placement.
- Set defaults proportionally closer to reference image: wider light footprint, high-brightness core, and visible outer glow.
- Disable cursor transparency by default so light remains continuous during calls; retain setting for users who need pointer avoidance.
- Preserve configurable width, color temperature, brightness, rounded corners, click-through behavior, panel/dock gaps, and camera activation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `edge-glow-rendering`: Replace small in-band edge fade with macOS-style bright core and long out-of-band bloom.
- `ring-appearance`: Define reference-matching default light color and continuous default appearance.
- `ring-width-config`: Separate visual bloom extent from strut-reserved width so windows retain configured work area.

## Impact

- `extension.js`: shader geometry, actor allocation, and rendering defaults.
- `schemas/org.gnome.shell.extensions.ringlight.gschema.xml`: appearance defaults; rebuild committed `gschemas.compiled`.
- `prefs.js`: existing controls and descriptions may need updates for changed visual behavior.
- Manual testing required on GNOME 45–50: camera on/off, monitor add/remove, disable while active, HiDPI, panels/docks, and cursor avoidance.
