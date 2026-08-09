# Ring Light

GNOME Shell extension that draws a white border around every monitor. The ring
reserves space like the top bar does (chrome struts), so maximized, tiled, and
newly placed windows shrink to stay inside it. Fullscreen windows ignore
struts by design — the ring stays visible during video calls.

The ring is only active while a camera is in use. It watches the same
PipeWire camera monitor as GNOME Shell's camera indicator, so it appears when
you join a call and disappears when you leave. If the camera monitor is
unavailable, the ring stays on permanently with a warning in the shell log.

Supports GNOME Shell 45–50.

## Requirements

- GNOME Shell 45–50
- `glib-compile-schemas` (part of GLib) if installing from source

## Install

### Zip release (recommended)

Download `ringlight@danielgenezini.shell-extension.zip` from the
[latest release](https://github.com/dgenezini/gnome-ringlight/releases) and
install it:

```sh
gnome-extensions install ringlight@danielgenezini.shell-extension.zip
```

On X11, restart the shell with `alt+F2` → `r`; on Wayland, re-login. Then
enable:

```sh
gnome-extensions enable ringlight@danielgenezini
```

### From source

Clone the repo and symlink it into the extensions directory:

```sh
git clone https://github.com/dgenezini/gnome-ringlight ~/.local/share/gnome-shell/extensions/ringlight@danielgenezini
```

If you cloned elsewhere, symlink instead:

```sh
ln -s /path/to/gnome-ringlight ~/.local/share/gnome-shell/extensions/ringlight@danielgenezini
```

On X11, log out and back in (or restart the shell with `alt+F2` → `r`). On
Wayland, re-login or reboot. Then enable:

```sh
gnome-extensions enable ringlight@danielgenezini
```

### From source

The compiled schema binary is committed, but if you edit the schema, recompile
it:

```sh
glib-compile-schemas schemas/
```

Commit the new binary — `schemas/gschemas.compiled` must stay up to date or
settings changes won't apply.

## Usage

Join or start a call using your camera — the ring appears. Hang up — it
disappears. Configure the border width (in logical pixels, default 150) in
GNOME Settings → Extensions, or directly:

```sh
gsettings set org.gnome.shell.extensions.ringlight border-width 200
```

## Development

The repo is symlinked into the extensions directory, so edits are live — no
install step.

### Run

Reload after any change:

```sh
gnome-extensions disable ringlight@danielgenezini && gnome-extensions enable ringlight@danielgenezini
```

Schema or prefs changes may need a full shell restart (`alt+F2` → `r` on X11,
or Wayland session re-login).

### Test

No test suite exists. Manual checklist for every change:

- Syntax check: `node --check extension.js prefs.js`
- Camera on → ring appears
- Camera off → ring disappears
- Monitor added/removed while ring active → ring rebuilds correctly
- Extension disabled while ring active → everything cleans up

Watch errors in the shell log:

```sh
journalctl -f /usr/bin/gnome-shell
```
