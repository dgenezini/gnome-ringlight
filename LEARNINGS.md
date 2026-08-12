# Everything I Learned Building a GNOME Shell Extension

Written by someone who had never built an extension (and had no prior GNOME
object/library knowledge) — this is the knowledge the code doesn't tell you,
gathered while building Ring Light for GNOME Shell 45–50.

---

## 1. What an extension actually is

A GNOME Shell extension is a folder of JavaScript files loaded **into the
shell process itself**. The shell is not a server you talk to — your code
runs inside it, alongside the top bar, overview, and quick settings. That
explains everything about how it feels to develop one: one crash in your
code can take down the whole desktop.

### Anatomy

```
ringlight@danielgenezini/      <- folder name MUST equal metadata.json "uuid"
├── metadata.json              <- id, name, supported shell versions
├── extension.js               <- the extension: enable() + disable()
├── prefs.js                   <- settings window (optional)
└── schemas/
    ├── org.gnome.shell.extensions.ringlight.gschema.xml
    └── gschemas.compiled      <- compiled binary, committed to git!
```

`metadata.json` essentials:

```json
{
  "uuid": "ringlight@danielgenezini",
  "settings-schema": "org.gnome.shell.extensions.ringlight",
  "shell-version": ["45", "46", "47", "48", "49", "50"],
  "version-name": "1.0.0"
}
```

- The **uuid is sacred**: the folder name, the schema id, and the
  `settings-schema` field all reference it. Mismatch = extension silently
  doesn't load or settings don't appear.
- `shell-version` promises your code works on those versions. You will find
  version differences (see §12).

### Lifecycle

The shell imports your module and calls `enable()`. It calls `disable()`
when the user disables the extension, or on logout. Everything you create in
`enable()` must be destroyed in `disable()` — if you leak signal connections
or widgets, they outlive you and keep running against a torn-down extension.
`disable()` must be fully **synchronous**: no pending callbacks may act after
it returns.

### Where extensions live

- System: `/usr/share/gnome-shell/extensions/`
- User: `~/.local/share/gnome-shell/extensions/<uuid>/`

The dev loop trick: symlink your repo into the user directory, edits are
live, no install step.

## 2. The dev loop is brutal — learn it first

This is the single biggest time-sink if you don't know it.

- **`enable()`/`disable()` do NOT reload your code.** GJS (the shell's
  JavaScript engine) caches the imported module per session. `gnome-extensions
  disable && enable` re-runs the lifecycle on the *cached* code — your edits
  are never read.
- **Real code reload requires a full shell restart**: on X11 press
  `alt+F2`, type `r`. On Wayland, log out and back in (Wayland cannot restart
  the shell without killing your session).
- **Schema and prefs changes also need a restart** — the settings daemon and
  the prefs window are separate processes that cache their data.
- Errors go to `journalctl -f /usr/bin/gnome-shell`. When the shell crashes,
  it often restarts itself and then shows the "Oops, something went wrong"
  screen.
- Syntax check without a build system: `node --check extension.js prefs.js`.

There is no test runner, no linter, no CI. Manual testing is the workflow.
I built a checklist and ran it on every change (camera on/off, monitor
hotplug, disable while active).

## 3. Three import namespaces — this confuses everyone

JavaScript in an extension imports from **three totally different places**:

```js
import Clutter from 'gi://Clutter';          // 1. system libraries (GObject Introspection)
import Shell from 'gi://Shell';              //    -> native C libraries exposed to JS
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js'; // 2. the API the shell gives you
import * as Main from 'resource:///org/gnome/shell/ui/main.js'; // 3. shell's OWN internal JS files
```

1. **`gi://`** — GObject Introspection. Any native GNOME/GLib library with
   introspection data becomes importable. `Clutter` (the scene graph),
   `St` (shell widgets), `Gio`/`GLib`/`GObject` (the underlying platform).
2. **`resource:///org/gnome/shell/extensions/extension.js`** — the `Extension`
   base class. This is your public API.
3. **`resource:///org/gnome/shell/ui/...`** — the shell's own private
   JavaScript. Nothing here is a stable API; it changes between versions.
   Extensions use it anyway (Caffeine, Dash-to-Dock, all of them) — you just
   accept you're reaching into the guts and you'll fix breakage on upgrades.

Fun fact: `resource://` imports are **cached per session**, which is why
disable/enable can't reload your code.

## 4. The GNOME object system (GObject) — not plain JS

GNOME is a C framework (GLib) with a JavaScript binding. The mental model:

### Everything is a GObject

Widgets, settings, camera monitors — all GObjects. They have:

- **Properties** — named values with a `notify::name` signal when they
  change. `monitor.cameras_in_use`, `widget.opacity`.
- **Signals** — event channels. `connect(name, callback)` to subscribe,
  `disconnect(id)` to unsubscribe. **Every connect needs a matching
  disconnect in `disable()`, or you leak.**
- **Methods** — plain functions.

The shell convention: private fields prefixed with `_`
(`this._active`, `this._settings`), and `this._fooId` stores a signal
connection id for later disconnection.

### Defining a custom GObject class

```js
const RingShaderEffect = GObject.registerClass(
class RingShaderEffect extends Clutter.ShaderEffect {
    _init(uniforms) {
        super._init({shader_type: Cogl.ShaderType.FRAGMENT});
        this._uniforms = uniforms;
    }
});
```

`GObject.registerClass` is mandatory for anything that wants to be a proper
GObject (inherit from a GI class, get signals/properties). Note `_init` is
the constructor, and you must call `super._init(...)`.

### GObject.Value — the awkward bridge

GI functions take native values, not JS numbers. Setting a shader uniform:

```js
const value = new GObject.Value();
value.init(GObject.TYPE_FLOAT);
value.set_float(1.5);
effect.set_uniform_value('u_width', value);
```

This is one of the least-documented, most-annoying parts. Every uniform set
needs this little dance.

## 5. Mutter and Clutter

### GNOME Shell is mostly a JavaScript UI on a native desktop core

GNOME Shell combines native C code with JavaScript. **Mutter** provides the
native desktop core; much of the visible shell UI is JavaScript running in
**GJS**:

```text
Mutter (C)
├─ compositor, Wayland, windows, monitors, input
└─ hosts GNOME Shell

GNOME Shell (mostly GJS JavaScript)
├─ top bar
├─ overview and app grid
├─ quick settings and notifications
└─ extensions, including Ring Light
```

That is why Ring Light imports shell JavaScript modules such as `Main`,
`QuickSettings`, and `PopupMenu`: it runs in the same GJS runtime as the
shell UI, not in an external process.

### GJS is JavaScript for GNOME

**GJS** is GNOME's JavaScript runtime. It uses Mozilla's SpiderMonkey engine
and GObject Introspection to expose native GNOME libraries to JavaScript.
It lets JavaScript call the same platform APIs that C applications use:

```js
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
```

`gi://` means "load this native GObject-Introspection library." GJS converts
values and method calls between JavaScript and the underlying C library;
`GObject.Value` (§4) is one visible part of that boundary. GJS supports ES
modules, but it is not Node.js: no npm runtime, browser DOM, or web APIs by
default.

**Mutter** is GNOME's window manager, compositor, and Wayland display
server. It owns desktop mechanics: window placement, maximize and tiling,
focus, workspaces, monitor layout and scale, input routing, and work-area
calculation. GNOME Shell runs on top of Mutter.

Ring Light uses Mutter indirectly through its struts:

```js
Main.layoutManager.addChrome(strip, {affectsStruts: true});
```

`affectsStruts` says a screen edge is reserved. Mutter then shrinks that
monitor's work area, so maximized and tiled windows stay inside the ring.

**Clutter** is the scene-graph UI and rendering toolkit GNOME Shell uses.
It owns on-screen actors, layout, painting, animations, effects, shaders,
and input events. **St** (Shell Toolkit) provides higher-level shell widgets
on top of it (`St.Widget`, `St.Label`, …).

```js
const ring = new St.Widget({x, y, width, height, reactive: false});
widget.ease({opacity: 255, duration: 250});
class RingShaderEffect extends Clutter.ShaderEffect {}
```

Mental model:

```text
Mutter      owns windows, monitors, workspaces, work areas, compositor
GNOME Shell owns top bar, overview, quick settings, extensions
Clutter     paints and animates shell actors, effects, and shaders
```

Ring Light uses Clutter to paint and fade its glow; it uses Mutter struts to
keep windows out of the glow.

### Clutter is roughly GNOME Shell's DOM

For a web developer, Clutter is closest to the browser's DOM plus its
GPU-backed rendering/compositing layer:

```text
Browser                 GNOME Shell
-------                 -----------
DOM node                Clutter actor / St.Widget
DOM tree                Clutter scene graph
CSS layout and paint    actor geometry + St styling
CSS transition          widget.ease()
Canvas/WebGL shader     Clutter.ShaderEffect
pointer events          actor events
```

Important differences:

- There is no HTML. Create objects in JavaScript:
  `new St.Widget({...})`.
- There is no browser layout engine. Actors have explicit geometry or use a
  container's layout rules.
- It is a GPU-native scene graph, not a document tree.
- `St` is the higher-level, ready-made widget layer; Clutter is the
  lower-level rendering and input layer.

### The Clutter scene graph and St

Key concepts learned:

- **The tree**: `Main.uiGroup` is the root of the visible shell UI. You add
  widgets to it. `Main.layoutManager` coordinates the shell's layout.
- **`addChrome(actor, {affectsStruts: true})`** — the shell's way to add a
  widget to the screen *and* (optionally) have it reserve screen space.
  Chrome = things that live on top of windows (bars, docks, OSDs).
- **`reactive: false`** — makes a widget ignore pointer events so clicks
  pass through to the windows below. Without this your ring blocks the
  whole screen.
- **`set_child_below_sibling(widget, Main.layoutManager.panelBox)`** — keeps
  your widgets under the top bar. `panelBox` always exists when extensions
  load (the bar is created before extensions).
- **Opacity + `ease()`** — Clutter's animation API:
  ```js
  widget.opacity = 0;
  widget.ease({opacity: 255, duration: 250, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
  ```
  Also useful: `remove_all_transitions()` to cancel animations (required in
  `disable()` to avoid callbacks firing after teardown).

## 6. Struts — how the ring shrinks the work area (the core trick)

The whole extension is one concept: **reserve screen space so windows don't
cover the ring**. GNOME's mechanism for that is *struts*.

- A **strut** is a region an actor claims on a screen edge. The top bar uses
  one to shrink the work area below it. Mutters (the window manager) folds
  all struts together and shrinks the "work area" — the rectangle where
  maximized, tiled, and newly-placed windows are allowed.
- Your widget becomes a strut via `addChrome(a, {affectsStruts: true})`.
  Any widget can do it — it doesn't have to be visible (transparent strips
  work: Ring Light uses invisible strut strips that reserve space, plus a
  separate visual widget that paints the light).
- **Fullscreen ignores struts by design** — a video call in fullscreen
  covers the ring, which is correct behavior for a ring-light (the ring
  isn't for you, it's for the people watching your camera feed... actually
  it stays visible during calls because the call UI isn't fullscreen).
- Windows are laid out within the work area: `Main.layoutManager.getWorkAreaForMonitor(m.index)` returns it per monitor.

### Gotchas learned the hard way

- `removeChrome()` only **queues** a strut recompute (runs at `BEFORE_REDRAW`,
  a frame late). If your code re-adds chrome in the same tick, it reads
  stale work areas and every rebuild compounds the error. Fix: call the
  private `Main.layoutManager._updateRegions()` after removing chrome. It's
  private and undocumented, but stable across 45–50.
- A strut only counts when the actor **touches a monitor edge** — the
  strut-scan picks the side from the edges the actor covers. So a top strip
  must span from the monitor's top edge down over the bar plus your
  thickness, not just sit at the work-area boundary.
- **There is no signal for "work area changed"**. A dock or taskbar
  registering its struts changes it silently. Fix: poll every second,
  snapshot the work areas as a string, rebuild when it changes.

## 7. Camera detection — two paths, because the ecosystem is messy

Two very different ways a camera gets used, and the extension must handle
both:

1. **PipeWire** — modern apps (video calls, GNOME's camera indicator).
   `new Shell.CameraMonitor()` wraps mutter's camera monitor, and
   `notify::cameras-in-use` fires when any PipeWire camera stream starts.
   This is the *same object* the shell's camera indicator uses.
2. **Direct `/dev/videoX` open** — Firefox/Chrome bypass PipeWire and open
   the V4L2 device directly. `CameraMonitor` never sees this.

The fix for #2 is a 1-second poll that scans `/proc/*/fd` for open camera
nodes. Two tricks:

- **Compare by `device:inode`**, not path: `stat()` a `/proc/PID/fd/N`
  symlink resolves it to the real node, and the inode matches
  `/dev/video0`'s. Path comparison breaks because of symlinks and
  permissions.
- **Streak counting**: apps briefly probe `/dev/video*` at startup and
  close them. Only trust an open that persists for 2 consecutive polls,
  or the ring flickers on every app launch.

If `CameraMonitor` can't be created, the ring stays on permanently with a
warning — better visible-when-wrong than silently broken.

All camera state funnels through one `_refresh()` — every input (PipeWire
signal, poll result, mode change) calls the same gate. Single source of
truth prevents state bugs.

## 8. Shaders — painting the light with a fragment shader

The ring isn't 4 rectangles; it's one **full-monitor transparent widget with
a GLSL fragment shader** that computes the light's alpha per pixel. Why: a
soft glow with rounded corners is trivial in a shader and painful with
widgets.

Learned while doing this:

- `Clutter.ShaderEffect` attaches to a widget; its fragment shader runs per
  pixel over the widget's texture.
- The shader receives the widget's texture: `texture2D(tex, cogl_tex_coord_in[0].st)`.
  Output goes to `cogl_color_out`. Inputs are `cogl_tex_coord_in`.
- **Uniforms** pass data in: widget size, the work-area rectangle, colors,
  brightness, cursor position. All floats, all set through the
  `GObject.Value` dance (§4).
- **Scale is a trap**: uniform positions must be in physical pixels
  (`St.ThemeContext.get_for_stage(global.stage).scale_factor`), because the
  texture is physical resolution. Screen coordinates are logical. Multiply
  by scale before sending, or the ring is wrong on HiDPI.
- **Signed Distance Functions (SDFs)** are the standard trick for rounded
  rects: `roundedRectSdf(point, minCorner, maxCorner, radius)` returns the
  distance to the shape edge (negative inside). `smoothstep()` turns a
  distance into a soft alpha ramp — that's the entire glow.
- Alpha composition: `cogl_color_out = vec4(color, 1.0) * alpha * source.a`.
  The `source.a` term makes the shader respect the widget's own opacity
  (which the fade-in/out animations drive).
- Per-pixel branching costs nothing on GPU — the cursor-hole carve (fade
  alpha inside a circle around the pointer) is just an extra `smoothstep`.

## 9. Settings — GSettings, schemas, and the compiled binary

Extension settings use **GSettings**, GLib's key-value store, backed by a
schema XML file.

```xml
<schema id="org.gnome.shell.extensions.ringlight" path="/org/gnome/shell/extensions/ringlight/">
  <key name="ring-radius" type="i">
    <default>120</default>
    <range min="0" max="1000"/>
  </key>
</schema>
```

- The schema **must be compiled**: `glib-compile-schemas schemas/` produces
  the binary `gschemas.compiled` — which is **committed to git**. Forgetting
  to recompile after editing the XML = settings silently don't apply.
- Access from code: `this.getSettings()` (the extension base class wires it
  up from `settings-schema` in metadata.json).
- Listen for changes: `settings.connect('changed', cb)` or scoped
  `'changed::ring-mode'`.
- Two-way binding in prefs: `settings.bind(key, widgetProp, ...)` keeps a
  widget and a setting in sync automatically.
- **Types matter**: keys are typed in the schema (`i` int, `s` string,
  `b` boolean). Wrong type → runtime error.

## 10. The prefs window — a separate process with its own stack

`prefs.js` runs in a **different process** than the shell (the Extensions
app / gnome-shell-extension-prefs). It's not the shell — it's a GTK app
using **libadwaita (Adw)** widgets: `Adw.PreferencesPage`,
`Adw.PreferencesGroup`, `Adw.SpinRow`, `Adw.SwitchRow`.

Learned:

- `fillPreferencesWindow(window)` is the entry point; build pages/groups and
  add them to the window.
- Widgets bind to settings directly (`settings.bind('ring-radius',
  row.adjustment, 'value', ...)`) — no manual save/load.
- GTK uses a **style provider** (`Gtk.CssProvider`) to style things CSS
  can't normally reach — e.g. painting the color-temperature slider track
  with a gradient so the slider previews the ring color.
- **Version dance**: GNOME 50 moved `ExtensionPreferences` to a new
  resource; 45–49 use the old one. The fix is a dynamic import with
  fallback:
  ```js
  try {
      ({ExtensionPreferences} = await import('resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'));
  } catch {
      ({ExtensionPreferences} = await import('resource:///org/gnome/shell/extensions/prefs.js'));
  }
  ```
  Note: `await import()` is needed because this is ESM, and a plain
  `import ... from` can't fail at runtime — only syntax errors are caught.

## 11. Quick Settings toggle — reaching into shell UI

Adding a toggle to the quick settings (the wifi/bluetooth popover) requires
three shell-internal pieces:

```js
const toggle = new QuickSettings.QuickMenuToggle({...});
const indicator = new QuickSettings.SystemIndicator();
indicator.quickSettingsItems.push(toggle);
Main.panel.statusArea.quickSettings.addExternalIndicator(indicator);
```

- `QuickMenuToggle` is a toggle-with-a-menu — clicking the body opens the
  menu. `toggleMode: false` disables the switch behavior (a 3-state mode
  can't be a binary switch).
- Menu items come from `PopupMenu`; `item.setOrnament(CHECK)` marks the
  active mode, exactly like the shell's own menus.
- `SystemIndicator` + `addExternalIndicator` is the public-ish pattern
  (Caffeine does the same).

## 12. Cross-version compatibility — the two dances (so far)

Supporting 45–50 means every API you use is really six versions of itself.
Two breaking changes already handled:

1. **`Meta.Monitor.geometry` dropped in mutter 18 (GNOME 48)**. The
   layout-manager monitor objects now expose `x/y/width/height` directly.
   Safe access: `const {x, y, width, height} = m.geometry ?? m;` — older
   versions have `.geometry`, newer ones are the rect themselves.
2. **`ExtensionPreferences` resource moved in GNOME 50** (see §10).

Expect more. The pattern is always the same: feature-detect at runtime,
fall back, and keep both paths until the old versions are out of range.

## 13. Timing and async traps — where the bugs hide

The shell is full of deferred work, and most bugs in this extension were
timing bugs:

- **Animations fire callbacks later**: a fade-out's `onComplete` runs after
  you've already disabled the extension or rebuilt. Fix: a monotonically
  increasing `_transitionToken`; the callback checks it against the current
  value and bails if it's stale.
- **`removeChrome` is async** (see §6).
- **Struts appear before widgets allocate**: `_updateRegions` computes
  struts from widget allocations, which don't exist in the same tick you
  add the widget. Never read live work areas right after adding chrome —
  snapshot the *expected* geometry arithmetically instead.
- **Motion events stop while the pointer is over an app window**: the app
  consumes them, so the cursor-hole freezes. Fix: a timer that re-reads the
  global pointer position (`global.display.get_pointer_info()`) and only
  updates when it actually moved.
- **Signals you forgot to disconnect** fire after `disable()`.
  `this._fooId` + `disconnect()` every one, and cancel every `GLib.timeout_add`
  with `GLib.source_remove()`.

## 14. The platform quirks you'll hit

- **Wayland vs X11**: `global.stage` motion events work on both (mutter
  routes them), but a shell restart means re-login on Wayland — so dev
  cycles are slower. The camera poll exists because browsers bypass
  PipeWire; on X11 a camera can be held by a process that never shows in
  the monitor.
- **HiDPI**: all shader geometry must be scaled (§8). Cursor positions from
  events are logical px; texture space is physical px. The scale factor
  comes from `St.ThemeContext`.
- **Monitor hotplug**: `Main.layoutManager` emits `monitors-changed`; the
  ring rebuilds from scratch (remove chrome, re-add). Monitors can be
  transiently `undefined` mid-change — skip instead of crashing.

## 15. Process lessons (not GNOME, but learned here too)

- **Write a tiny spec before coding** (OpenSpec workflow used here: propose
  → design → delta specs → tasks → implement → archive). The specs caught
  design problems before code, and the archived changes are now the best
  record of *why* decisions were made.
- **Every feature was manual-tested against a checklist** — no CI exists
  for shell extensions, so the checklist *is* the test suite.
- **"One image is worth a thousand words" is real for code agents too.**
  Round after round of prose prompts ("more glow", "bluer halo", "softer
  edge") failed to converge on a good look. The moment the macOS FaceTime
  edge-light reference image was handed to the agent (the
  `match-macos-ringlight` change), the design snapped into place — one
  picture communicated the target light profile (glow–core–glow, cool blue
  halo, continuous illumination) that paragraphs of adjectives couldn't.
  Same applies to screenshots of what the current code *actually renders*:
  showing the output beats describing it.
- **Commit messages tell the story**: the git log is the only other doc in
  the repo. Small, descriptive commits ("Toggle ringlight in camera
  toggle") make the history readable.

## 16. Leftovers to clean up

`extension.js` still has two `// TEMP DEBUG` `console.log` calls (in
`_build()` and `_updateCursorUniforms()`). They only fire on rebuild /
pointer moves, so they're harmless, but they shouldn't ship — remove them
when the next feature lands.

---

### The one-sentence summary

A GNOME Shell extension is JavaScript that runs *inside* the shell process,
wrapping GObject-based native libraries (`gi://`) and the shell's own
private modules (`resource://`), and the entire craft is: register chrome
widgets and struts, connect/disconnect signals symmetrically, never trust
timing, and feature-detect every API across the six shell versions you
promise to support.
