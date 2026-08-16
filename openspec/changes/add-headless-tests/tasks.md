## 1. Harness bootstrap

- [x] 1.1 Create `tests/headless/run.mjs`: spawn `dbus-run-session -- gnome-shell --headless --unsafe-mode` with temp `XDG_DATA_HOME`, capture child stdout/stderr, wait for `org.gnome.Shell` bus-name ownership (poll `gdbus`/bus introspection with timeout), kill session on exit
- [x] 1.2 Install extension into session: copy repo into `$XDG_DATA_HOME/gnome-shell/extensions/ringlight@danielgenezini/` before shell boot
- [x] 1.3 Add gdbus helpers in `run.mjs`: call `org.gnome.Shell.Extensions.GetExtensionErrors` (path-probing `/org/gnome/Shell` vs `/org/gnome/Shell/Extensions` for version compat; extension enabled via pre-seeded dconf instead of `EnableExtension`, which races shell startup), `org.gnome.Shell.Eval` (single-expression scripts returning JSON-able values; handles Eval's double-encoded string results), `gsettings set` on the session bus, `org.gnome.Mutter.DisplayConfig.GetCurrentState`
- [x] 1.4 Add assertion helper with polling+timeout (no fixed sleeps) and fail-on-shader-error log scanner (lines matching ring shader/GLSL/Cogl errors)

## 2. Local prototype on host (GNOME 50.3)

- [x] 2.1 Boot the harness against the host packages; verify shell owns the bus and extension enables with zero errors
- [x] 2.2 Verify ring build assertions: 1 ring widget + 5 strut strips (4 edges + ring; empirical count, matches `_borders`), work area shrunk by band width on all edges, restores after disable
- [x] 2.3 Verify settings round-trip via `gsettings` and no errors in captured log

## 3. Monitor scenarios

- [x] 3.1 Implement `ApplyMonitorsConfig` second-virtual-monitor scenario (two logical monitors from `GetCurrentState` state); assert 2 rings; remove → 1 ring
- [x] 3.2 Detect unsupported headless monitor changes and report scenario as skipped (design decision 3 fallback), never as failure

## 4. CI

- [x] 4.1 Extend `.github/workflows/ci.yml`: matrix job over `ubuntu-24.04` (GNOME 46) and `ubuntu-26.04` (GNOME 50), `apt install gnome-shell dbus libglib2.0-bin`, run unit suite then headless suite
- [ ] 4.2 Confirm both matrix legs pass on CI (needs push — pending); `AGENTS.md` dev-loop/checks section updated with the headless test command

## 5. Verification

- [x] 5.1 Run `node --test tests/extension.test.mjs` (existing suite still green)
- [x] 5.2 Run `node tests/headless/run.mjs` locally on GNOME 50: all scenarios pass, shader-error scanner armed
- [x] 5.3 Check shell log during the run for new warnings/errors (journalctl/stderr) beyond the known camera-monitor warning
