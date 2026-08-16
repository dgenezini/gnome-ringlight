# Headless Tests

## ADDED Requirements

### Requirement: Headless shell session bootstrap

The test harness MUST boot a real GNOME Shell session with mutter's headless backend (`gnome-shell --headless --unsafe-mode`) inside an isolated `dbus-run-session`, with a temporary `XDG_DATA_HOME`. The harness MUST wait for the shell to own its D-Bus session name before running any test case, and MUST terminate the session (and its bus) on completion.

#### Scenario: Shell boots and owns the bus
- **WHEN** the harness starts the headless shell session
- **THEN** the shell owns the `org.gnome.Shell` D-Bus name on the session bus within a bounded timeout

#### Scenario: Session is cleaned up
- **WHEN** the test run finishes or fails
- **THEN** the shell process and its D-Bus session are terminated

### Requirement: Extension lifecycle under test

The harness MUST install the extension into the session's `XDG_DATA_HOME/gnome-shell/extensions/ringlight@danielgenezini`, enable it through `org.gnome.Shell.Extensions.EnableExtension`, and assert the extension reports no errors via `GetExtensionErrors`. The suite MUST cover enable and disable transitions.

#### Scenario: Extension enables without errors
- **WHEN** the harness enables `ringlight@danielgenezini` on a booted headless shell
- **THEN** `GetExtensionErrors` returns no errors and the ring state becomes active per the `ring-mode` setting

#### Scenario: Extension disables cleanly
- **WHEN** the harness disables the extension (or sets `ring-mode` to `off`)
- **THEN** no chrome/struts remain registered and no errors are reported

### Requirement: Ring build and strut-based work-area reservation

With the ring active, the harness MUST assert via `org.gnome.Shell.Eval` that one ring widget plus four strut strips exist per monitor, and that the settled work area is the monitor area shrunk by the light footprint on every edge.

#### Scenario: Single monitor ring build
- **WHEN** the ring is active on a session with one monitor
- **THEN** the extension has one ring widget and four strut strips, and the work area equals the monitor rect shrunk by the fixed band width on all edges

#### Scenario: Work area returns to full size after disable
- **WHEN** the ring is deactivated
- **THEN** the work area returns to the un-shrunk monitor rect

### Requirement: Settings round-trip without rebuild

The harness MUST change settings keys (`ring-color-temperature`, `brightness`, `ring-radius`, `cursor-transparency`) via `gsettings` on the session bus and assert the extension applies them live without crashing or logging errors.

#### Scenario: Settings change applies live
- **WHEN** a settings value changes while the ring is active
- **THEN** the extension updates its shader uniform state and reports no errors

### Requirement: Monitor add/remove rebuild

When the monitor layout changes, the harness MUST assert the ring rebuilds to match: N monitors produce N rings, and removing a monitor removes its ring. The harness MUST use `org.gnome.Mutter.DisplayConfig` to change the monitor layout; if the headless backend rejects layout changes, the harness MUST report the monitor scenario as skipped rather than fail the run.

#### Scenario: Second monitor adds a ring
- **WHEN** a second virtual monitor is added while the ring is active
- **THEN** the extension builds a ring for the new monitor

#### Scenario: Monitor removal drops its ring
- **WHEN** a monitor is removed
- **THEN** its ring and struts are removed and the remaining ring still reserves its work area

### Requirement: Shader compile integrity

The harness MUST capture the shell's output and fail the run if any shader compile error or Cogl/GLSL error mentioning the ring shader appears.

#### Scenario: Shader errors fail the run
- **WHEN** the shell log contains a GLSL/Cogl compile error from the ring shader during the run
- **THEN** the harness reports the run as failed

### Requirement: Version coverage

The headless suite MUST pass on GNOME Shell 46 and 50, the oldest-supported and current versions in the `metadata.json` range (45 already removed).

#### Scenario: CI matrix runs both versions
- **WHEN** the CI workflow runs the headless suite
- **THEN** it executes against GNOME 46 and GNOME 50 and fails if either version reports a failure
