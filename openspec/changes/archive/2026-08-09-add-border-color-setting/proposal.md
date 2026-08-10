## Why

The ring is hardcoded white (`RING_STYLE`). Users on video calls want the ring to match their lighting: warm incandescent yellow is common in home offices, and a hard white ring clashes with a warm-lit room. The border width is already configurable; the color should be too, as a light-temperature slider (yellow → white) instead of a free-form color picker, because the ring is meant to look like a light source, not an arbitrary color.

## What Changes

- New GSettings key `border-color-temperature` (int, Kelvin, 2700–6500, default 6500) controlling the ring color.
- Ring color derived from the temperature using the Tanner Helland blackbody approximation; default 6500K ≈ current pure white, so existing users see no change.
- Prefs window gets a temperature slider row whose track shows the yellow→white gradient (a "slider with color in it") and which writes the Kelvin value.
- Extension builds the ring style from the configured temperature instead of the `RING_STYLE` constant.

## Capabilities

### New Capabilities
- `ring-appearance`: ring look-and-feel settings — this change covers border color temperature; future appearance settings (rounded corners, etc.) can extend it.

### Modified Capabilities
<!-- none -->

## Impact

- `schemas/org.gnome.shell.extensions.ringlight.gschema.xml`: new `border-color-temperature` key; `gschemas.compiled` must be recompiled and committed.
- `extension.js`: replace `RING_STYLE` constant with temperature→hex conversion; reuse existing `changed` handler (already rebuilds ring on settings change).
- `prefs.js`: add temperature slider row with gradient track (GTK CSS provider — cross-version GTK4 dance, GNOME 45–50 all use GTK4 for prefs).
- No API/dependency changes. Ring width/mode behavior untouched.
