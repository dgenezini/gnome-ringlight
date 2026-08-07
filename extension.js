// Ring Light: white 150px border around every monitor that shrinks the
// usable work area so maximized/tiled/new windows stay inside the ring.
//
// Space is reserved the same way the top bar does it: each ring strip is
// registered as chrome with affectsStruts, so Main.layoutManager folds
// them into the builtin struts of every workspace and mutter shrinks the
// work area (maximize, snap-tiling and window placement all respect it).
// Fullscreen windows ignore struts by design, so the ring stays visible
// during video calls.
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// ponytail: hardcoded knob. Add a gsettings schema if this ever needs one.
const BORDER = 150; // logical px per edge
const RING_STYLE = 'background-color: #ffffff;';

export default class RingLightExtension extends Extension {
    enable() {
        this._borders = [];
        this._build();
        this._monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed', () => this._build());
    }

    disable() {
        Main.layoutManager.disconnect(this._monitorsChangedId);
        for (const a of this._borders)
            Main.layoutManager.removeChrome(a);
        this._borders = [];
    }

    _build() {
        for (const a of this._borders)
            Main.layoutManager.removeChrome(a);
        this._borders = [];

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
                // panelBox is created after extensions load at startup, so it
                // may not exist yet — it gets appended above our strips anyway
                if (Main.panelBox)
                    Main.layoutManager.uiGroup.set_child_below_sibling(a, Main.panelBox);
                this._borders.push(a);
            }
        }
    }
}
