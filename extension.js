// SPDX-License-Identifier: GPL-2.0-or-later
//
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

        // removeChrome only *queues* the strut recompute (BEFORE_REDRAW
        // late). The work-area query below must see the bars but not our
        // strips, or every rebuild would compound the error (runaway ring
        // while dragging a settings spin). Force the same idempotent
        // recompute the late handler runs; private but stable 45–50.
        if (typeof Main.layoutManager._updateRegions === 'function')
            Main.layoutManager._updateRegions();

        const mode = this._settings.get_string('width-mode');
        const BORDER = this._settings.get_int('border-width');
        const RADIUS = this._settings.get_int('border-radius');
        const PADDING = this._settings.get_int('padding');

        for (const m of Main.layoutManager.monitors) {
            // mutter 18 dropped Meta.Monitor.geometry; the layout manager
            // Monitor objects now expose x/y/width/height directly
            const {x, y, width, height} = m.geometry ?? m;

            // resolution mode: ring thickness per axis = (monitor − available) / 2
            const marginX = mode === 'resolution' ?
                Math.max(1, Math.round((width - this._settings.get_int('available-width')) / 2)) : BORDER;
            const marginY = mode === 'resolution' ?
                Math.max(1, Math.round((height - this._settings.get_int('available-height')) / 2)) : BORDER;

            // work area = monitor minus what bars/docks reserve (their
            // struts). The ring hugs it, so the band starts after the top
            // bar and ends before a task bar/dock instead of drawing
            // behind them.
            const wa = Main.layoutManager.getWorkAreaForMonitor(m.index);
            const top = Math.max(0, wa.y - y);
            const bottom = Math.max(0, y + height - (wa.y + wa.height));
            const left = Math.max(0, wa.x - x);
            const right = Math.max(0, x + width - (wa.x + wa.width));

            // ring look: one widget over the work area, inset by PADDING so
            // it floats off the monitor edges / top bar / docks, painted as
            // a rounded border. CSS gives the inner corner radius = radius −
            // border width, so the band keeps constant thickness.
            // Must NOT affect struts: a full-work-area actor touching the
            // monitor edges would become a single full-size strut (see
            // _updateRegions in js/ui/layout.js) and collapse the work area.
            const ring = new St.Widget({
                x: wa.x + PADDING, y: wa.y + PADDING,
                width: Math.max(1, wa.width - 2 * PADDING),
                height: Math.max(1, wa.height - 2 * PADDING),
                style: `background-color: transparent;
                    border-left-width: ${marginX}px; border-right-width: ${marginX}px;
                    border-top-width: ${marginY}px; border-bottom-width: ${marginY}px;
                    border-color: #ffffff; border-radius: ${RADIUS}px;`,
                reactive: false, // pointer clicks fall through to windows
            });
            Main.layoutManager.addChrome(ring);
            Main.layoutManager.uiGroup.set_child_below_sibling(ring, Main.layoutManager.panelBox);
            this._borders.push(ring);

            // work area: transparent strips keep the struts that shrink it;
            // transparent so they never paint over the ring's rounded corners.
            // A strut only counts when the actor touches a monitor edge
            // (_updateRegions picks the side from the edges it touches), so
            // each strip spans from the monitor edge over the bar's reserved
            // space plus the padding plus the ring thickness.
            const edges = [
                {x, y, width, height: top + PADDING + marginY},                                        // top
                {x, y: y + height - bottom - PADDING - marginY, width,
                    height: bottom + PADDING + marginY},                                               // bottom
                {x, y: wa.y + PADDING + marginY, width: left + PADDING + marginX,
                    height: Math.max(1, wa.height - 2 * (PADDING + marginY))},                         // left
                {x: wa.x + wa.width - PADDING - marginX, y: wa.y + PADDING + marginY,
                    width: right + PADDING + marginX,
                    height: Math.max(1, wa.height - 2 * (PADDING + marginY))},                         // right
            ];

            for (const e of edges) {
                const a = new St.Widget({
                    style: 'background-color: transparent;',
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
