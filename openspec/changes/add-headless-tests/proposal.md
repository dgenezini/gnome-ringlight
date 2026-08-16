## Why

The extension's only executable checks are pure-JS unit tests (`tests/extension.test.mjs`). Everything compositor-related — ring build, strut reservation, monitor add/remove, enable/disable, shader compile — is manually tested per the openspec checklists, most of which remain unchecked. The last two bugs (high CPU, geometry API change) shipped as regressions only caught by the user. A headless GNOME Shell session lets the real extension run in CI and convert the manual checklist into assertions.

## What Changes

- Add a headless GNOME Shell test harness that boots a real shell session and drives the extension over D-Bus (`org.gnome.Shell.Eval`).
- Add integration tests covering: extension enable/disable, ring build, strut-based work-area shrink, monitor add/remove (via `org.gnome.Mutter.DisplayConfig` virtual monitors), settings changes, and shader-compile errors in the shell log.
- Drop GNOME 45 from the test matrix (already removed from `metadata.json` `shell-version`: 46–50 remains).
- Add a CI workflow running the headless tests on the supported versions (46 and 50 as the oldest/current dance pair).
- Keep the existing pure-JS test suite; headless tests are a second layer, not a replacement.

## Capabilities

### New Capabilities
- `headless-tests`: boot a headless GNOME Shell session, load the extension, and verify ring behavior through the shell's D-Bus Eval interface — enable/disable lifecycle, strut-driven work-area reservation, monitor add/remove, settings round-trips, and shader compile integrity.

### Modified Capabilities
<!-- None: no runtime behavior of the extension changes. -->

## Impact

- **New files**: `tests/headless/` harness (session bootstrap, Eval driver, assertions), `.github/workflows/test.yml` (or extended `ci.yml`).
- **Code**: `extension.js` only if a test hook becomes necessary (prefer driving the public surface via Eval, no production changes).
- **Dependencies**: CI needs `gnome-shell`, `mutter`, `gdbus`, `dbus` per version; Ubuntu images matching shell versions 46 and 50.
- **Version support**: metadata `shell-version` 46–50 (45 already removed).
