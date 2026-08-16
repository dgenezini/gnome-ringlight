# AGENTS.md

GNOME Shell extension "Ring Light" (`ringlight@danielgenezini`): white border around each monitor that shrinks the work area so maximized/tiled windows stay inside it. ESM JavaScript (GJS), no build system. Automated checks: `node --test tests/extension.test.mjs` (syntax, schema keys, schema binary, metadata, color math), `node tests/headless/run.mjs` (integration: boots a real headless GNOME Shell with two virtual monitors and drives the extension over D-Bus) and `node tests/headless/prefs.mjs` (integration: drives the real `prefs.js` settings window as a GJS/GTK4 process under Xvfb against a seeded dconf database); CI in `.github/workflows/ci.yml` runs all three on GNOME 46 (ubuntu-24.04) and GNOME 50 (ubuntu-26.04). Host runs GNOME Shell 50.3.

## Dev loop

- Repo is **symlinked** from `~/.local/share/gnome-shell/extensions/ringlight@danielgenezini` — edits are live, no install step.
- Code changes need a **full shell restart** (`alt+F2` → `r` on X11, Wayland session re-login). `gnome-extensions disable/enable` only re-runs `enable()`/`disable()` on the cached module — GJS caches the `file://` import per session, so new code is never read. Schema/prefs changes also need restart.
- Watch errors: `journalctl -f /usr/bin/gnome-shell`.
- Checks: `node --check extension.js prefs.js` for syntax; `node --test tests/extension.test.mjs` for unit + schema checks; `node tests/headless/run.mjs` for the headless GNOME Shell integration suite; `node tests/headless/prefs.mjs` for the prefs-window integration suite (CI runs all four, on GNOME 46 and 50). The shell suite needs `gnome-shell`, `dbus-run-session` and `gdbus` installed; the prefs suite additionally needs `gjs`, `Xvfb` and the `gir1.2-adw-1` typelib (skips cleanly when Xvfb is missing).
- Every feature change is manual-tested (see archived openspec tasks for the checklist: camera on/off, monitor add/remove, disable while active).

## Version compatibility (GNOME 45–50)

Code must run across `metadata.json` `shell-version` range. Two known dances, keep the pattern for any new cross-version API:

- `prefs.js` dynamic-imports `ExtensionPreferences` from the GNOME 50 Extensions-daemon resource, falls back to the 45–49 shell resource.
- Mutteer 18 (GNOME 48+) dropped `Meta.Monitor.geometry`; code uses `m.geometry ?? m` on layout-manager monitor objects.
- Bump `shell-version` in `metadata.json` when adding version support.

## Architecture

- `extension.js`: 4 `St.Widget` strips per monitor (top/bottom full width, left/right inset) registered via `Main.layoutManager.addChrome(a, {affectsStruts: true})`. Struts fold into every workspace's builtin struts, so mutter shrinks the work area; fullscreen ignores struts by design (ring stays visible on calls).
- Ring is kept below the top bar via `set_child_below_sibling(panelBox)`; strips are `reactive: false` so clicks pass through.
- **Ring is only active while a camera is in use** — `new Shell.CameraMonitor()` (same object shell's camera indicator uses), gated by `_setActive()`. Complemented by a 2s poll for open `/dev/videoX` files, since Firefox/Chrome bypass PipeWire and open the device directly. If the monitor can't be created, ring stays on permanently with a warning.
- `prefs.js`: settings window binding schema `org.gnome.shell.extensions.ringlight` keys: ring color temperature, brightness, corner radius, cursor hole radius/fade, quick-settings toggle.
- `schemas/gschemas.compiled` is a **committed binary** — after editing `schemas/*.gschema.xml`, recompile with `glib-compile-schemas schemas/` and commit the new binary, or settings changes won't apply.

## Workflow

- Features go through OpenSpec: `openspec/` holds specs + archived changes; commands `/opsx-propose`, `/opsx-apply`, `/opsx-update`, `/opsx-archive` (definitions in `.opencode/commands/`). Specs in `openspec/specs/` describe shipped state — code is authoritative. If implementation diverges, update the specs (or the change's delta specs before syncing), don't chase specs.
- Docs: `README.md` for users, `problems.md` for the bugs-and-fixes log (grouped by subsystem; add every fixed bug there), commit history. Conventional commit-ish messages, e.g. "Toggle ringlight in camera toggle".
