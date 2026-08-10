## Context

The ring is currently a hardcoded `#ffffff` (`RING_STYLE` constant in `extension.js`). Width and mode are already GSettings-backed (`border-width`, `width-mode`, `available-width/height`) and the extension rebuilds the ring whenever any key changes (`changed` handler in `enable()`) or monitors change. Prefs use libadwaita rows bound via `Gio.Settings.bind` / manual connect. Host is GNOME Shell 50.3; code must run on 45–50 (prefs are GTK4 on all of them).

## Goals / Non-Goals

**Goals:**
- Configurable ring color expressed as light temperature (Kelvin), range 2700–6500, default 6500 (≈ current white).
- Preferences slider whose track renders the yellow→white temperature ramp, so the color is visible on the control itself.
- Live recolor on change; zero behavior change to geometry/struts.

**Non-Goals:**
- Free-form color picker / arbitrary hex colors.
- Presets row (slider covers the space).
- Per-monitor colors.

## Decisions

### 1. Store Kelvin int, not hex
Single GSettings key `border-color-temperature` (type `i`, range 2700–6500, default 6500). Kelvin is the user-facing concept ("warm white", "daylight"); hex is derived.

- Alternative: store hex string. Rejected: prefs would need the conversion to draw the track and to write a value, duplicating logic in two files; Kelvin keeps one numeric source of truth.

### 2. Tanner Helland blackbody approximation in `extension.js`
Small (~15 line) piecewise function `temperatureToHex(kelvin)` producing the standard sRGB blackbody color. This is the widely used Kelvin→RGB mapping and lands on the real light-temperature colors (2700 K ≈ `#ffa757` warm yellow, 3000 K warm white, 4000 K neutral, 6500 K ≈ `#fffefa` white).

- Alternative: linear RGB interpolation between endpoints. Rejected: Kelvin is perceptually non-linear (mired is the linear scale); a midpoint slider value would look wrong. Interpolating along a fixed lookup table of the common temperatures is equivalent to Tanner Helland with extra code.

Prefs never converts — the slider writes Kelvin directly.

### 3. Slider with color track via CSS gradient on `Gtk.Scale`
Row: `Adw.PreferencesRow` with a `Gtk.Scale` as child (2700–6500, step 100). Track gradient painted with a CSS provider scoped to the scale:

```css
scale trough {
  background-image: linear-gradient(to right, #ffa757, #ffb16e, #ffcea6, #fffefa);
  background-color: transparent;
}
```

Attach provider to the scale's own style context (`Gtk.StyleContext.add_provider(scale.get_style_context(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)`), so the selector stays minimal. Bind the scale value to the setting manually (`settings.bind('border-color-temperature', scale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)`), matching the existing `SpinRow` binding pattern.

- Alternative: `Gtk.ColorButton`. Rejected — user explicitly asked for a slider.
- Alternative: `Adw.SpinRow` like the other rows. Rejected — no visual color.
- Cross-version note: prefs run GTK4 on 45–50, so no Gtk3 dance needed here; the dynamic `ExtensionPreferences` import pattern stays as-is.

### 4. Extension consumes temperature
Replace `RING_STYLE` constant with a function: `RING_STYLE = `background-color: ${temperatureToHex(settings.get_int('border-color-temperature'))};`` evaluated in `_build()`. Existing `changed` handler already rebuilds while active; nothing else moves.

## Risks / Trade-offs

- **Gradient is static while ring color is dynamic** → track shows the full ramp, not the live picked color; handle position communicates the pick. Acceptable; a live-swatch suffix can be added later if wanted.
- **CSS provider on scale is GTK4-specific** → prefs are GTK4 across the whole 45–50 range, so no compat branch needed; keep the provider call on the scale's own style context so it does not bleed into other widgets.
- **Tanner Helland is an approximation** → fine for display color; clamped to 0–255.
- **Existing users' stored settings** → no migration needed: no existing key is removed, new key has a default.

## Migration Plan

1. Add key to `schemas/*.gschema.xml`; recompile `glib-compile-schemas schemas/` and commit the binary (AGENTS.md requirement).
2. Ship; no migration/rollback needed — reverting the change restores the constant color.

## Open Questions

None.
