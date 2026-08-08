// Ring Light: white 150px border around every monitor that shrinks the
// usable work area so maximized/tiled/new windows stay inside the ring.
//
// Space is reserved the same way the top bar does it: each ring strip is
// registered as chrome with affectsStruts, so Main.layoutManager folds
// them into the builtin struts of every workspace and mutter shrinks the
// work area (maximize, snap-tiling and window placement all respect it).
// Fullscreen windows ignore struts by design, so the ring stays visible
// during video calls.
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const RING_STYLE = 'background-color: #ffffff;';

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
            'notify::cameras-in-use', () => this._onCameraChanged());
        this._setActive(this._cameraInUse()); // initial state
    }

    disable() {
        this._settings.disconnect(this._settingsChangedId);
        this._settings = null;
        if (this._cameraMonitor) {
            this._cameraMonitor.disconnect(this._cameraChangedId);
            this._cameraMonitor = null;
        }
        this._setActive(false); // removes chrome + disconnects monitors-changed
    }

    _cameraInUse() {
        return this._cameraMonitor ? this._cameraMonitor.cameras_in_use : false;
    }

    _onCameraChanged() {
        const inUse = this._cameraInUse();
        if (inUse !== this._active)
            this._setActive(inUse);
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
                // keep the ring under the top bar so the panel stays readable.
                // panelBox exists when extensions load (created before them),
                // and addChrome puts us above it otherwise
                if (Main.layoutManager.panelBox)
                    Main.layoutManager.uiGroup.set_child_below_sibling(a, Main.layoutManager.panelBox);
                this._borders.push(a);
            }
        }
    }
}
