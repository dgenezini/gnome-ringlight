## Context

Extension has pure-JS unit tests only. Compositor behavior (ring build, struts, monitor changes, shader compile) is verified by hand per openspec checklists that stay unchecked. Goal: run the real extension inside a headless GNOME Shell in CI.

GNOME Shell runs headless via mutter's headless backend (`gnome-shell --headless`), which needs no X/Wayland and creates a fallback virtual monitor. The shell exposes two D-Bus interfaces usable from outside:
- `org.gnome.Shell.Extensions` — `EnableExtension` / `DisableExtension` / `GetExtensionInfo` / `GetExtensionErrors` (lifecycle + error retrieval)
- `org.gnome.Shell.Eval` — evaluate JS inside the running shell (state assertions), enabled with `--unsafe-mode`
- `org.gnome.Mutter.DisplayConfig` — monitor configuration, including virtual monitors in the headless backend

## Goals / Non-Goals

**Goals:**
- Boot a real `gnome-shell --headless --unsafe-mode` session from a script, load the extension, and assert behavior over D-Bus
- Cover: enable/disable lifecycle, ring build (widget + strut count), work-area shrink from struts, settings round-trip, monitor add/remove, shader compile integrity
- Run in CI on GNOME 46 and 50 (oldest-supported / current pair that spans the known API dances)
- Keep the existing `tests/extension.test.mjs` suite untouched and passing

**Non-Goals:**
- Visual verification (light profile look still needs eyes)
- Real camera fd / PipeWire behavior (no devices in CI)
- Full 46–50 matrix (only 46 + 50)
- Any production code change unless a test hook proves unavoidable

## Decisions

1. **One harness script drives everything**: `tests/headless/run.mjs` (node, zero deps, same style as existing tests). It spawns `dbus-run-session -- gnome-shell --headless --unsafe-mode`, waits for `org.gnome.Shell` to own the session bus name, runs test cases, kills the session, reports pass/fail, non-zero exit on failure.

2. **Lifecycle via `org.gnome.Shell.Extensions`, assertions via `org.gnome.Shell.Eval`**:
   - `EnableExtension('ringlight@danielgenezini')`, then `GetExtensionErrors` must be empty
   - Eval expressions return JSON-able values; assert on `Main.layoutManager.monitors.length`, ring widget count (`Main.extensionManager.lookup(uuid).extension._rings.length`), work area before/after struts
   - `gsettings set org.gnome.shell.extensions.ringlight <key> <value>` under the session bus for settings round-trip (dconf spawns on the session bus)

3. **Monitor add/remove via `org.gnome.Mutter.DisplayConfig`**: `GetCurrentState` → build a `ApplyMonitorsConfig` with two logical monitors (connector list from the state), assert ring count == 2; then back to one. If ApplyMonitorsConfig is unsupported on a headless version (risk, see below), the harness detects the failure and degrades to single-monitor-only tests, reporting the skip.

4. **Shader compile errors from the shell log**: the headless shell writes GLSL/Cogl errors to stderr; harness captures child output and fails the run on lines matching `RingLight|shader.*(error|compile)|CoglShader`. This is the only net that catches "ring invisible, no crash".

5. **Extension installation**: harness sets a temp `XDG_DATA_HOME`, copies the repo into `$XDG_DATA_HOME/gnome-shell/extensions/ringlight@danielgenezini/` (same layout as a user install), so the shell's extension scan finds it on boot.

6. **CI**: extend `.github/workflows/ci.yml` with a matrix job (`ubuntu-24.04` = GNOME 46, `ubuntu-26.04` = GNOME 50), `apt install gnome-shell dbus libglib2.0-bin`, run the node unit suite then the headless suite. Mark headless job `continue-on-error: false` but keep it a separate job so unit-test failures stay visible independently.

7. **Prototype locally first**: validate the harness against the host GNOME 50.3 before touching CI (10-minute check, catches backend assumptions early).

## Risks / Trade-offs

- **Headless DisplayConfig monitor add**: may not work on all 46/50 mutter versions. Mitigated by graceful degradation to single-monitor tests (decision 3).
- **Eval string-encoded assertions**: brittle, but the only injection point; keep each assertion a small, single-purpose script and reuse helpers.
- **CI flakiness**: compositor tests are timing-sensitive; harness waits on bus-name ownership and polls assertions with a timeout instead of fixed sleeps.
- **Per-version dependency weight**: each headless job pulls the full gnome-shell stack (~300 MB); accepted for the coverage gain.
- **`--unsafe-mode`**: only used inside isolated CI/session bus, no security exposure in production use.
