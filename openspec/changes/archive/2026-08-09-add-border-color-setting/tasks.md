## 1. Schema

- [x] 1.1 Add `border-color-temperature` key (type `i`, min 2700, max 6500, default 6500) to `schemas/org.gnome.shell.extensions.ringlight.gschema.xml`
- [x] 1.2 Recompile schemas with `glib-compile-schemas schemas/` (committed binary — regenerate it)

## 2. Extension

- [x] 2.1 Add `temperatureToHex(kelvin)` function (Tanner Helland blackbody approximation, clamped 0–255) to `extension.js`
- [x] 2.2 Replace `RING_STYLE` constant with a per-build computed style from `this._settings.get_int('border-color-temperature')` in `_build()`
- [x] 2.3 Syntax check: `node --check extension.js`

## 3. Preferences

- [x] 3.1 Add temperature slider row to `prefs.js`: `Adw.PreferencesRow` with `Gtk.Scale` child (2700–6500, step 100), bound to `border-color-temperature`
- [x] 3.2 Add CSS provider with `scale trough` yellow→white gradient on the scale's style context (scoped, GTK4 `Gtk.StyleContext.add_provider`)
- [x] 3.3 Show current temperature on the row (value label / subtitle) so the slider conveys the picked Kelvin
- [x] 3.4 Syntax check: `node --check prefs.js`

## 4. Manual test

- [x] 4.1 Restart shell (`alt+F2` → `r`); ring default still effectively white
- [x] 4.2 With camera active, drag slider to 2700 K → ring warm yellow; back to 6500 K → white; geometry/struts unchanged
- [x] 4.3 Verify slider handle restores to stored value after prefs reopen
- [x] 4.4 Verify no `journalctl -f /usr/bin/gnome-shell` errors during above
