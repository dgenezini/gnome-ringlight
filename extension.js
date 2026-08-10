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
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

// Tanner Helland's blackbody approximation: maps a Kelvin color temperature
// to [r, g, b] components (0-255), spanning the common light temps (2700K
// warm yellow, 3000K warm white, 4000K neutral, 6500K daylight white).
function temperatureToRGB(kelvin) {
    const t = kelvin / 100;
    let r, g, b;
    if (t <= 66)
        r = 255;
    else
        r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    if (t <= 66)
        g = 99.4708025861 * Math.log(t) - 161.1195681661;
    else
        g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    if (t >= 66)
        b = 255;
    else if (t <= 19)
        b = 0;
    else
        b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
    return [r, g, b].map(clamp);
}

// rounded-rect path; radius clamped to fit the rect
function roundedRectPath(cr, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    cr.moveTo(x + r, y);
    cr.lineTo(x + w - r, y);
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.lineTo(x + w, y + h - r);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.lineTo(x + r, y + h);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.lineTo(x, y + r);
    cr.arc(x + r, y + r, r, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
}

const V4L2_POLL_MS = 1000;
const V4L2_STREAK_MIN = 2; // consecutive polls before trusting an open

// ring-mode setting values → labels shown in the quick settings toggle
const RING_MODES = {
    auto: 'Automatic',
    always: 'Always On',
    off: 'Off',
};

export default class RingLightExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsChangedId = this._settings.connect('changed', () => {
            if (this._active)
                this._build();
        });
        this._borders = [];
        this._active = false;
        this._cameraInUse = false;

        this._modeChangedId = this._settings.connect('changed::ring-mode', () => {
            this._refresh();
            this._updateToggle();
        });
        this._createToggle();

        // same object GNOME Shell's camera indicator binds to
        // (js/ui/status/camera.js): mutter's PipeWire camera monitor
        try {
            this._cameraMonitor = new Shell.CameraMonitor();
        } catch (e) {
            // no camera monitor to watch: auto mode keeps the ring on
            // permanently rather than silently losing it; always/off are
            // unaffected because they never consult the camera state
            console.warn('Ring Light: camera monitor unavailable, ring stays on in auto mode');
            this._cameraInUse = true;
        }
        if (this._cameraMonitor) {
            this._cameraChangedId = this._cameraMonitor.connect(
                'notify::cameras-in-use', () => {
                    this._cameraInUse = this._cameraMonitor.cameras_in_use;
                    this._refresh();
                });
        }
        this._refresh(); // initial state

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
        this._settings.disconnect(this._modeChangedId);
        if (this._cameraMonitor) {
            this._cameraMonitor.disconnect(this._cameraChangedId);
            this._cameraMonitor = null;
        }
        this._toggle.destroy();
        this._toggle = null;
        this._indicator.destroy();
        this._indicator = null;
        this._setActive(false); // removes chrome + disconnects monitors-changed
    }

    // single source of truth for ring visibility: mode gates the camera
    // state. Every input (camera notify, v4l2 poll, ring-mode change)
    // funnels through here.
    _refresh() {
        const mode = this._settings.get_string('ring-mode');
        this._setActive(mode !== 'off' && (mode === 'always' || this._cameraInUse));
    }

    // Quick Settings toggle (the popover with wifi/bluetooth/dnd), same
    // pattern as Caffeine: an invisible SystemIndicator carrying one
    // QuickMenuToggle. Body click and the chevron both open the mode menu;
    // the toggle is not a switch — three states don't map onto one.
    _createToggle() {
        const toggle = new QuickSettings.QuickMenuToggle({
            title: 'Ring Light',
            iconName: 'camera-video-symbolic',
            toggleMode: false, // clicking must open the menu, not flip state
        });
        toggle.menu.setHeader('camera-video-symbolic', 'Ring Light');
        this._modeItems = {};
        for (const [mode, label] of Object.entries(RING_MODES)) {
            const item = toggle.menu.addAction(label, () => {
                this._settings.set_string('ring-mode', mode);
                toggle.menu.close();
            });
            this._modeItems[mode] = item;
        }
        toggle.connect('clicked', () => toggle.menu.open());
        this._toggle = toggle;
        const indicator = new QuickSettings.SystemIndicator();
        indicator.quickSettingsItems.push(toggle);
        Main.panel.statusArea.quickSettings.addExternalIndicator(indicator);
        this._indicator = indicator;
        this._updateToggle();
    }

    _updateToggle() {
        const mode = this._settings.get_string('ring-mode');
        // auto/always can light the ring, so they show the enabled color;
        // off is the only disabled-looking state
        this._toggle.checked = mode !== 'off';
        this._toggle.subtitle = RING_MODES[mode];
        for (const [m, item] of Object.entries(this._modeItems))
            item.setOrnament(m === mode ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
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
        if (this._settings.get_string('ring-mode') !== 'auto' || !this._cameraMonitor)
            return; // outside auto mode (or without a monitor) the camera can't affect the ring
        if (this._cameraMonitor.cameras_in_use)
            return; // already on via PipeWire, nothing to add
        const inUse = this._v4l2InUse();
        this._v4l2Streak = inUse ? this._v4l2Streak + 1 : 0;
        // apps briefly probe /dev/video* at startup; trust only a persistent open
        if (inUse && this._v4l2Streak < V4L2_STREAK_MIN)
            return;
        this._cameraInUse = inUse;
        this._refresh();
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
        const [CR, CG, CB] = temperatureToRGB(this._settings.get_int('border-color-temperature'));

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

            // ring look: one widget per monitor, painted with Cairo
            // (St.DrawingArea) because the natural look needs what St can't
            // do: a soft gradient at the band edges, plus a band thickness
            // that matches the configured width exactly.
            // The band sits at the work area inset by PADDING, thickness W =
            // max(marginX, marginY) — a single stroke can't vary per axis
            // (CSS borders could); max keeps every side at least as thick as
            // configured. The widget is bigger than the band by GLOW_M so the
            // Shell.BlurEffect glow fades out inside the widget instead of
            // being clipped (the bug before: the stroke was centered on the
            // widget edge, so half the band fell outside and was cut).
            // Must NOT affect struts: a full-work-area actor touching the
            // monitor edges would become a single full-size strut (see
            // _updateRegions in js/ui/layout.js) and collapse the work area.
            const W = Math.max(marginX, marginY);
            // small gradient: ~3px soft fade at the inner and outer band
            // edges, flat colored center (blur radius 2 ≈ 2σ transition).
            // Wide gradients (radius ∝ W) were tried and rejected — the
            // center stayed flat but the edges bled too far into the screen.
            const GLOW_RADIUS = 2;
            const GLOW_M = GLOW_RADIUS * 3; // ≈ gaussian tail, fades to 0
            const ringW = Math.max(1, wa.width - 2 * PADDING + 2 * GLOW_M);
            const ringH = Math.max(1, wa.height - 2 * PADDING + 2 * GLOW_M);
            const ring = new St.DrawingArea({
                x: wa.x + PADDING - GLOW_M,
                y: wa.y + PADDING - GLOW_M,
                width: ringW, height: ringH,
                reactive: false, // pointer clicks fall through to windows
                // real blur filter: crisp band below → smooth cross-band
                // gradient, color at center to transparent at the edges
                effect: new Shell.BlurEffect({radius: GLOW_RADIUS}),
            });
            ring.connect('repaint', () => {
                // surface size is physical px; draw in logical px so the
                // stroke scales cleanly on HiDPI monitors
                const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
                const [surfW, surfH] = ring.get_surface_size();
                const cr = ring.get_context();
                cr.save();
                cr.scale(scale, scale);
                const w = surfW / scale;
                const h = surfH / scale;

                // crisp full-width band, fully inside the widget: spans
                // [PADDING, PADDING + W] relative to the work area. Fully
                // opaque — the only softness is the glow radius blur.
                const inset = GLOW_M + W / 2;
                cr.setSourceRGBA(CR / 255, CG / 255, CB / 255, 1);
                cr.setLineWidth(W);
                roundedRectPath(cr, inset, inset,
                    Math.max(1, w - 2 * inset), Math.max(1, h - 2 * inset), RADIUS);
                cr.stroke();
                cr.restore();
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
