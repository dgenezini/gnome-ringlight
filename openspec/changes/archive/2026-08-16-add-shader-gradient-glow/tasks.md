## 1. Settings and preferences

- [x] 1.1 Add 0–100 `brightness`, `softness`, and `glow` GSettings keys with specified defaults, then recompile `schemas/gschemas.compiled`.
- [x] 1.2 Add live Brightness, Softness, and Glow percentage controls to preferences, using existing settings binding patterns.

## 2. Shader rendering

- [x] 2.1 Add a GNOME Shell 45–50-compatible `Clutter.ShaderEffect` fragment shader with physical-pixel uniforms and rounded-rectangle signed-distance helpers.
- [x] 2.2 Compute inner/outer ring boundaries from per-axis margins, then render core, medium, and outer 20/50/100px glow zones with chained `smoothstep` alpha falloff, Kelvin RGB, brightness, softness, and glow uniforms.
- [x] 2.3 Replace Cairo `St.DrawingArea` and `Shell.BlurEffect` construction in `_build()` with one padded non-strut shader widget per monitor; retain transparent strut actors, click-through, panel ordering, and live rebuild behavior.

## 3. Verification

- [x] 3.1 Run `glib-compile-schemas schemas/` and `node --check extension.js prefs.js`.
- [x] 3.2 Restart GNOME Shell and manually test auto/always/off activation, monitor add/remove, disable while active, pixel and resolution width modes, rounded and zero-radius corners, brightness/softness/glow updates, and a HiDPI monitor if available.
