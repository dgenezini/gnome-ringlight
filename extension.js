// Ring Light: white 150px border around every monitor that shrinks the
// usable work area so maximized/tiled/new windows stay inside the ring.
//
// Space is reserved the same way the top bar does it: each ring strip is
// registered as chrome with affectsStruts, so Main.layoutManager folds
// them into the builtin struts of every workspace and mutter shrinks the
// work area (maximize, snap-tiling and window placement all respect it).
// Fullscreen windows ignore struts by design, so the ring stays visible
// during video calls.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const RING_STYLE = 'background-color: #ffffff;';
const V4L2_POLL_MS = 1000;
const V4L2_STREAK_MIN = 2; // consecutive polls before trusting an open

export default class RingLightExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsChangedId = this._settings.connect('changed', () => {
            if (this._active)
                this._build();
        });
        this._borders = [];
        this._active = false;

        // same object GNOME Shell's camera indicator binds to
        // (js/ui/status/camera.js): mutter's PipeWire camera monitor
        try {
            this._cameraMonitor = new Shell.CameraMonitor();
        } catch (e) {
            // no camera monitor to watch: keep the ring always on rather
            // than silently losing it
            console.warn('Ring Light: camera monitor unavailable, ring stays on permanently');
            this._setActive(true);
            return;
        }
        this._cameraChangedId = this._cameraMonitor.connect(
            'notify::cameras-in-use', () =>
                this._setActive(this._cameraMonitor.cameras_in_use));
        this._setActive(this._cameraMonitor.cameras_in_use); // initial state

        // Browsers bypass PipeWire for video: Firefox/Chrome open /dev/videoX
        // directly, which CameraMonitor never sees. Poll for open camera fds.
        this._v4l2Streak = 0;
        this._v4l2PollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, V4L2_POLL_MS, () => {
            this._v4l2Poll();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._v4l2PollId) {
            GLib.source_remove(this._v4l2PollId);
            this._v4l2PollId = 0;
        }
        this._settings.disconnect(this._settingsChangedId);
        if (this._cameraMonitor) {
            this._cameraMonitor.disconnect(this._cameraChangedId);
            this._cameraMonitor = null;
        }
        this._setActive(false); // removes chrome + disconnects monitors-changed
    }

    _setActive(active) {
        if (active === this._active)
            return;
        this._active = active;
        if (active) {
            this._build();
            this._monitorsChangedId = Main.layoutManager.connect(
                'monitors-changed', () => {
                    if (this._active)
                        this._build();
                });
        } else {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            for (const a of this._borders)
                Main.layoutManager.removeChrome(a);
            this._borders = [];
        }
    }

    _v4l2Poll() {
        if (this._cameraMonitor.cameras_in_use)
            return; // already on via PipeWire, nothing to add
        const inUse = this._v4l2InUse();
        this._v4l2Streak = inUse ? this._v4l2Streak + 1 : 0;
        // apps briefly probe /dev/video* at startup; trust only a persistent open
        if (inUse && this._v4l2Streak < V4L2_STREAK_MIN)
            return;
        this._setActive(inUse);
    }

    // stat() on /proc/PID/fd/N follows the magic link to the open file, so
    // compare its device:inode against the /dev/video* nodes
    _statKey(path) {
        try {
            const info = Gio.File.new_for_path(path)
                .query_info('unix::device,unix::inode', Gio.FileQueryInfoFlags.NONE, null);
            return info.get_attribute_uint32('unix::device') + ':' +
                info.get_attribute_uint64('unix::inode');
        } catch (e) {
            return null; // fd vanished / no permission
        }
    }

    _v4l2InUse() {
        const dev = new GLib.Dir('/dev', 0);
        const nodes = [];
        let name;
        while ((name = dev.read_name()) !== null) {
            if (name.startsWith('video'))
                nodes.push(this._statKey('/dev/' + name));
        }
        if (nodes.length === 0)
            return false;

        const procs = new GLib.Dir('/proc', 0);
        let pid;
        while ((pid = procs.read_name()) !== null) {
            if (!pid.match(/^\d+$/))
                continue;
            let fds;
            try {
                fds = new GLib.Dir(`/proc/${pid}/fd`, 0);
            } catch (e) {
                continue; // pid exited between reads
            }
            let fd;
            while ((fd = fds.read_name()) !== null) {
                const key = this._statKey(`/proc/${pid}/fd/${fd}`);
                if (key && nodes.includes(key))
                    return true;
            }
        }
        return false;
    }

    _build() {
        for (const a of this._borders)
            Main.layoutManager.removeChrome(a);
        this._borders = [];

        const BORDER = this._settings.get_int('border-width');

        for (const m of Main.layoutManager.monitors) {
            // mutter 18 dropped Meta.Monitor.geometry; the layout manager
            // Monitor objects now expose x/y/width/height directly
            const {x, y, width, height} = m.geometry ?? m;

            // full-width strips overlap the vertical strips in the corners;
            // struts work per edge so overlap does not matter
            const edges = [
                {x, y, width, height: BORDER},                                  // top
                {x, y: y + height - BORDER, width, height: BORDER},             // bottom
                {x, y: y + BORDER, width: BORDER, height: Math.max(1, height - 2 * BORDER)}, // left
                {x: x + width - BORDER, y: y + BORDER, width: BORDER,
                    height: Math.max(1, height - 2 * BORDER)},                               // right
            ];

            for (const e of edges) {
                const a = new St.Widget({
                    style: RING_STYLE,
                    reactive: false, // pointer clicks fall through to windows
                    ...e,
                });
                // registers the strip as a strut and adds it to the uiGroup
                Main.layoutManager.addChrome(a, {affectsStruts: true});
                // keep the ring under the top bar so the panel stays readable;
                // panelBox exists when extensions load (created before them)
                Main.layoutManager.uiGroup.set_child_below_sibling(a, Main.layoutManager.panelBox);
                this._borders.push(a);
            }
        }
    }
}
