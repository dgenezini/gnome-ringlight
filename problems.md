# Problems & Fixes Log

Bugs reported and fixed across the project's OpenCode session history (55 sessions). Grouped by subsystem.

## Initial build

| Problem | Root cause | Fix |
|---|---|---|
| `enable` says extension does not exist | Shell scans `~/.local/share/gnome-shell/extensions` only at startup | Symlink repo there, restart shell (Alt+F2 `r` / relogin) |
| `TypeError: m.geometry is undefined` | Mutteer 18 dropped `Meta.Monitor.geometry` | `m.geometry ?? m` (plain x/y/w/h fields) |
| Windows maximize behind border, space not shrunk | `move_resize_frame` always runs constraints; maximize constraint snaps back to work area | Dead approach in mutter 18. Switched to struts: `Main.layoutManager.addChrome(actor, {affectsStruts: true})` |
| Border only on top edge | Extension crashed mid-`_build()`: `Main.panelBox` undefined at load time, after top strip already registered | Guard `if (Main.panelBox)` before `set_child_below_sibling` |

## Camera trigger

| Problem | Root cause | Fix |
|---|---|---|
| `Error: No signal 'DevicesChanged' on object 'GDBusProxy'` | Plain GDBusProxy GType only knows `g-signal`/`g-properties-changed`; D-Bus signal names need interface info + generated subclass | Portal abandoned anyway (no camera object exported on this machine) → `Shell.CameraMonitor` |
| No activation when camera opens, no error | Firefox/Chrome bypass PipeWire, open `/dev/videoX` directly; portal emits no `PropertiesChanged` for camera state | 1s poll for open `/dev/videoX` |
| Ring stays always on | gjs 1.88 `get_property` needs 2 args; notify handler threw, enable's try/catch fell into permanent always-on fallback | `_cameraInUse()` with 2-arg `get_property('cameras_in_use')` |
| Ring doesn't appear with Firefox/Chrome | `/dev/videoX` poll bug: only 2 of 3 `GLib.Dir` calls fixed, one still single-arg (missing flags) | Fixed `/proc` scan |
| Errors persisted after fix | GJS caches `file://` import per session — shell ran stale module | Full re-login (Wayland; `alt+F2 r` is X11 only) |
| Extension eats CPU, freezes GNOME (even with camera disabled) | `/dev/videoX` poll statted *every fd of every process* via `Gio.File.query_info()` each second — tens of thousands of GIO allocs + syscalls on the shell main loop; runs in auto mode regardless of camera state | Cache pid → fd count; stat only fds of processes that gained/lost an fd since last poll. Steady state = one readdir per process, zero stats. Detection unchanged (camera open = +1 fd) |

## Ring placement / work area

| Problem | Root cause | Fix |
|---|---|---|
| Edges behind topbar + taskbar | Ring didn't skip reserved bars | Ring hugs work area; default corner radius 180→100 |
| Ring behind taskbar right after login (always mode) | Taskbar registers its strut *after* ring builds → ring pinned to screen bottom | Poll work areas per second, rebuild on change |
| Rebuild poll → windows flick forever | Baseline snapshot read work area live at end of `_build`, but shell computes struts from actor *allocations* — fresh strips unallocated → baseline diverged → rebuild loop every tick | Arithmetic baseline instead of live snapshot |
| Config change → windows flicker | `changed` handler ran `_build()` → struts torn down/re-added → work area recomputed twice. Settings never affect struts anyway (band width constant, rest shader-only) | Update shader uniforms in place, no rebuild |

## Rendering / glow

| Problem | Root cause | Fix |
|---|---|---|
| Gradient stepped/ugly | St CSS only does linear fills, no border/radial gradients | Cairo gradient, later `Shell.BlurEffect` |
| Ring cut off by margins (half width missing) | Stroke centered on widget edge → inner half fell outside widget, clipped | Size widget to band + glow headroom, stroke centered inside, blur via `Shell.BlurEffect` |
| Gradient outside ring + diagonal transparency | Gradient drawn over whole rect | Gradient inside ring only, flat center |
| Gap between ring and glow even at 0 | Glow/softness geometry outside band | Glow inside ring width, ring shrinks proportionally |
| Whole screen had transparent white | `outGlow = smoothstep(-outW, 0.0, s)` stays 1 for all s>0 → `max(outGlow, inGlow)` lit everything | Outward glow only when s<0 |
| Work area considers glow | Glow tail painted over windows | Clip glow at inner rect; reserve = light footprint only |
| Not bright like macOS image | Ring is opaque white border, not bloom: needs ~50px white core + ~130px outer glow + additive glow. Also SDR caps ~300–400 nits | Wider ring, real bloom; monitor HDR/eco settings matter |
| No blue glow | Halo too white — reference is (0.39, 0.75, 0.89) | Color-corrected halo |

## Cursor hole

| Problem | Root cause | Fix |
|---|---|---|
| Hole inverted (transparent at cursor) | `smoothstep(r, r−fade, d)` = 1 at cursor | Swap edges → `smoothstep(r−fade, r, d)` |
| Hole not hidden when cursor leaves ring | Gate only checked "outside inner rect" — true even where ring is invisible (edges, top bar, faint outer ramp) | Gate hole on ring's actual alpha under cursor |
| Hole freezes over app windows | Stage `motion-event` stops firing over app windows (compositor routes motion to app) → stale `_cursorPos`; desktop worked because stage still got events | Poll global pointer (mutter tracks it) as fallback |
| Worked, then stopped | Stale module / rebuild loops / motion death at band edges | Same fixes: relogin, no-rebuild, pointer poll + alpha gating |

## Prefs UI

| Problem | Root cause | Fix |
|---|---|---|
| No settings icon; `doesn't have preferences` | GNOME 50 Extensions daemon caches extension list at startup | Restart shell |
| `ImportError: resource:///org/gnome/shell/extensions/prefs.js does not exist` | GNOME 50 moved `ExtensionPreferences` to Extensions daemon resource | Dynamic import: new daemon path, old path fallback (45–49) |
| `TypeError: Adw.PreferencesGroup cannot convert to AdwPreferencesPage` | GNOME 50 window only accepts `Adw.PreferencesPage` | Wrap group in a page |
| `No property subtitle on AdwPreferencesRow` | Wrong widget type | `AdwActionRow` |
| Title/subtitle missing, GTK blue fill over slider | libadwaita CSS | CSS override |
| Wrong font size/margin | `title-4` = libadwaita heading font | Plain label, body size |
| Left/right margins missing vs other rows | Rows inset content `margin-left/right: 6px` | Match SpinRow inset |

## Misc

- GitHub release 403 → workflow ran on forgejo mirror without proper token → guard workflow to GitHub only.
- pop-shell red herring: user doesn't use it; ignored.

## Recurring themes

- **Stale module cache**: GJS caches `file://` import per session — code changes need full re-login on Wayland (`alt+F2 r` is X11 only).
- **Work-area math vs actor allocations**: divergence between live snapshots and allocation-based struts caused both flicker bugs.
