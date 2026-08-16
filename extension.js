// SPDX-License-Identifier: GPL-2.0-or-later
//
// Ring Light: white ring around every monitor that shrinks the
// usable work area so maximized/tiled/new windows stay inside the ring.
//
// Space is reserved the same way the top bar does it: each ring strip is
// registered as chrome with affectsStruts, so Main.layoutManager folds
// them into the builtin struts of every workspace and mutter shrinks the
// work area (maximize, snap-tiling and window placement all respect it).
// Fullscreen windows ignore struts by design, so the ring stays visible
// during video calls.
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
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

// fixed light footprint: opaque core (50px) + glow tail to 100px —
// windows sit right at the glow's edge
const LIGHT_W = 100;

// One fragment shader paints a macOS-style edge light: an opaque white core
// hugging the work-area edge plus a cool-white halo tailing into the work
// area (and a short outward ramp toward the monitor edge). `s` is the
// distance from the work-area edge (the outer rect), positive inward; the
// rounded-rect SDFs make corners radial. Profile widths are fixed logical
// px (uniforms arrive already scaled): ~50px core, ~200px total footprint,
// matching the reference light.
const RING_SHADER = `
uniform sampler2D tex;
uniform float u_width;
uniform float u_height;
uniform float u_outer_left;
uniform float u_outer_top;
uniform float u_outer_right;
uniform float u_outer_bottom;
uniform float u_outer_radius;
uniform float u_inner_left;
uniform float u_inner_top;
uniform float u_inner_right;
uniform float u_inner_bottom;
uniform float u_inner_radius;
uniform float u_red;
uniform float u_green;
uniform float u_blue;
uniform float u_temperature;
uniform float u_brightness;
uniform float u_band;
uniform float u_mouse_x;
uniform float u_mouse_y;
uniform float u_cursor_radius;
uniform float u_cursor_fade;

float roundedRectSdf(vec2 point, vec2 minCorner, vec2 maxCorner, float radius) {
    vec2 halfSize = (maxCorner - minCorner) * 0.5;
    float r = min(radius, min(halfSize.x, halfSize.y));
    vec2 q = abs(point - (minCorner + maxCorner) * 0.5) - halfSize + vec2(r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
    vec2 point = cogl_tex_coord_in[0].st * vec2(u_width, u_height);
    float outer = roundedRectSdf(point, vec2(u_outer_left, u_outer_top),
        vec2(u_outer_right, u_outer_bottom), u_outer_radius);
    float inner = roundedRectSdf(point, vec2(u_inner_left, u_inner_top),
        vec2(u_inner_right, u_inner_bottom), u_inner_radius);
    float s = -outer; // distance from the work-area edge, inward positive

    // symmetric light profile centered in the reserved band: opaque core
    // with equal glow tails fading to both band edges, like the reference
    float band = max(u_band, 2.0);
    float coreHalf = min(25.0, band * 0.5);
    float glowHalf = max(coreHalf + 1.0, band * 0.5);
    float d = abs(s - band * 0.5); // distance from the core center

    float core = 1.0 - smoothstep(coreHalf, coreHalf + 8.0, d);
    float glow = 1.0 - smoothstep(coreHalf, glowHalf, d);

    float coreA = core * u_brightness;
    float haloA = glow * u_brightness * 0.5;
    float alpha = max(coreA, haloA);

    // keep the light inside the reserved band: fade out at the inner rect
    // so the glow never paints over window content
    alpha *= 1.0 - smoothstep(0.0, 4.0, -inner);

    // Warm blackbody colors look too yellow as an opaque UI edge. Desaturate
    // only the warm end; 6500K keeps its existing near-white core and blue halo.
    vec3 rawCore = vec3(u_red, u_green, u_blue);
    float warm = 1.0 - smoothstep(2700.0, 4500.0, u_temperature);
    vec3 coreColor = mix(rawCore, vec3(1.0), 0.35 * warm);
    float cool = smoothstep(2700.0, 6500.0, u_temperature);
    vec3 warmHalo = vec3(1.0, 0.78, 0.63);
    vec3 coolHalo = rawCore * vec3(0.55, 0.82, 1.0);
    vec3 haloColor = mix(warmHalo, coolHalo, cool);
    vec3 color = coreA >= haloA ? coreColor : haloColor;
    // pointer avoidance: fade the ring out inside a circle around the
    // cursor so it never covers the pointer; smoothstep ramps alpha from
    // 0 at the cursor (or radius−fade from it) to full at the radius.
    // The hole is carved only while the ring is actually visible under
    // the pointer: evaluate the light profile at the cursor and skip the
    // hole where it is absent — outside the work area (top bar, bezels),
    // in the interior, and in the faint ramps at the band edges. So the
    // hole never trails the pointer once it leaves the ring.
    float sCursor = -roundedRectSdf(vec2(u_mouse_x, u_mouse_y),
        vec2(u_outer_left, u_outer_top), vec2(u_outer_right, u_outer_bottom), u_outer_radius);
    if (u_cursor_radius > 0.0) {
        float dCursor = abs(sCursor - band * 0.5);
        float cursorCore = 1.0 - smoothstep(coreHalf, coreHalf + 8.0, dCursor);
        float cursorGlow = 1.0 - smoothstep(coreHalf, glowHalf, dCursor);
        float cursorAlpha = max(cursorCore, cursorGlow * 0.5) * u_brightness;
        float innerAtCursor = roundedRectSdf(vec2(u_mouse_x, u_mouse_y),
            vec2(u_inner_left, u_inner_top), vec2(u_inner_right, u_inner_bottom), u_inner_radius);
        cursorAlpha *= 1.0 - smoothstep(0.0, 4.0, -innerAtCursor);
        if (cursorAlpha > 0.1) {
            float d = distance(point, vec2(u_mouse_x, u_mouse_y));
            alpha *= smoothstep(u_cursor_radius - u_cursor_fade, u_cursor_radius, d);
        }
    }
    vec4 source = texture2D(tex, cogl_tex_coord_in[0].st);
    cogl_color_out = vec4(color, 1.0) * alpha * source.a;
}`;

const RingShaderEffect = GObject.registerClass(
class RingShaderEffect extends Clutter.ShaderEffect {
    _init(uniforms) {
        super._init({shader_type: Cogl.ShaderType.FRAGMENT});
        this._uniforms = uniforms;
        // one GValue per uniform, reused every paint: set_uniform_value
        // copies the value, so no per-frame allocation on the shell loop
        this._uniformValues = {}; // uniform name → GValue (lazily created)
        this._texValue = new GObject.Value();
        this._texValue.init(GObject.TYPE_INT);
        this._texValue.set_int(0);
        this.set_shader_source(RING_SHADER);
    }

    vfunc_paint_target(node, paintContext) {
        this.set_uniform_value('tex', this._texValue);
        for (const [name, number] of Object.entries(this._uniforms)) {
            let value = this._uniformValues[name];
            if (!value) {
                value = new GObject.Value();
                value.init(GObject.TYPE_FLOAT);
                this._uniformValues[name] = value;
            }
            value.set_float(number);
            this.set_uniform_value(name, value);
        }
        super.vfunc_paint_target(node, paintContext);
    }
});

const V4L2_POLL_MS = 2000;
const V4L2_STREAK_MIN = 2; // consecutive polls before trusting an open

// ring visual fade duration; struts appear/disappear instantly
const FADE_MS = 250;

// ring-mode setting values → labels shown in the quick settings toggle
const RING_MODES = {
    auto: 'Automatic',
    always: 'Always On',
    off: 'Off',
};

export default class RingLightExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (!this._active)
                return;
            if (key === 'excluded-monitors')
                this._build();
            else
                this._applySettings();
        });
        this._borders = [];
        this._rings = []; // visible ring widgets only (not strut strips)
        this._cursorPos = null;
        this._cursorUniforms = {radius: 0, fade: 0}; // scaled physical px
        this._scale = 1;
        this._active = false;
        this._cameraInUse = false;
        this._transitionToken = 0; // guards stale fade callbacks

        this._modeChangedId = this._settings.connect('changed::ring-mode', () => {
            this._refresh();
            this._updateToggle();
        });
        this._quickSettingsChangedId = this._settings.connect(
            'changed::show-quick-settings-toggle', () => this._updateQuickSettings());
        this._updateQuickSettings();

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

        // keep the cursor hole following the pointer; motion events arrive
        // through mutter's input pipeline on both X11 and Wayland
        this._motionId = global.stage.connect('motion-event', (_stage, event) => {
            this._cursorPos = event.get_coords();
            if (this._active && this._cursorUniforms.radius > 0)
                this._updateCursorUniforms();
        });
        // fallback: stage motion events stop while the pointer is over an
        // app window (the app consumes them), freezing the hole on the
        // ring. Re-read the pointer on a timer — mutter tracks it globally
        // — and update only when it actually moved.
        this._pointerPollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            if (this._active && this._cursorUniforms.radius > 0) {
                try {
                    const [px, py] = global.display.get_pointer_info().get_position();
                    if (!this._cursorPos || px !== this._cursorPos[0] || py !== this._cursorPos[1]) {
                        this._cursorPos = [px, py];
                        this._updateCursorUniforms();
                    }
                } catch (e) {
                }
            }
            return GLib.SOURCE_CONTINUE;
        });
        // Browsers bypass PipeWire for video: Firefox/Chrome open /dev/videoX
        // directly, which CameraMonitor never sees. Poll for open camera fds.
        this._v4l2Streak = 0;
        this._lastWorkAreas = null;
        this._v4l2PollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, V4L2_POLL_MS, () => {
            this._poll();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._motionId) {
            global.stage.disconnect(this._motionId);
            this._motionId = 0;
        }
        if (this._pointerPollId) {
            GLib.source_remove(this._pointerPollId);
            this._pointerPollId = 0;
        }
        if (this._v4l2PollId) {
            GLib.source_remove(this._v4l2PollId);
            this._v4l2PollId = 0;
        }
        this._settings.disconnect(this._settingsChangedId);
        this._settings.disconnect(this._modeChangedId);
        this._settings.disconnect(this._quickSettingsChangedId);
        if (this._cameraMonitor) {
            this._cameraMonitor.disconnect(this._cameraChangedId);
            this._cameraMonitor = null;
        }
        this._destroyToggle();
        // disable must be fully synchronous: cancel any in-flight fade and
        // remove all chrome now, so no callback outlives the extension
        this._transitionToken++;
        for (const {widget} of this._rings)
            widget.remove_all_transitions();
        for (const a of this._borders)
            Main.layoutManager.removeChrome(a);
        this._borders = [];
        this._rings = [];
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }
        this._active = false;
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

    _destroyToggle() {
        if (this._toggle) {
            this._toggle.destroy();
            this._toggle = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _updateQuickSettings() {
        const visible = this._settings.get_boolean('show-quick-settings-toggle');
        if (visible && !this._toggle)
            this._createToggle();
        else if (!visible && this._toggle)
            this._destroyToggle();
    }

    _updateToggle() {
        if (!this._toggle)
            return;
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
        this._transitionToken++; // stale fade callbacks from a prior state must not act
        if (active) {
            // struts reserve the work area immediately; only visuals fade in
            this._build();
            this._monitorsChangedId = Main.layoutManager.connect(
                'monitors-changed', () => {
                    if (this._active)
                        this._build();
                });
            for (const {widget} of this._rings) {
                widget.opacity = 0;
                widget.ease({
                    opacity: 255,
                    duration: FADE_MS,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }
        } else {
            if (this._monitorsChangedId) {
                Main.layoutManager.disconnect(this._monitorsChangedId);
                this._monitorsChangedId = 0;
            }
            // struts stay until fade-out completes: the ring must remain
            // paired with the work area it reserves until it disappears
            const token = this._transitionToken;
            const cleanup = () => {
                if (this._transitionToken !== token)
                    return; // state changed again; newer chrome is authoritative
                for (const a of this._borders)
                    Main.layoutManager.removeChrome(a);
                this._borders = [];
                this._rings = [];
            };
            if (this._rings.length === 0) {
                cleanup();
            } else {
                for (const {widget} of this._rings)
                    widget.ease({
                        opacity: 0,
                        duration: FADE_MS,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        onComplete: cleanup,
                    });
            }
        }
    }

    // Struts arrive after the ring's first build (a bottom taskbar registers
    // its space once the shell settles, after login) and no signal fires for
    // that — so watch the work area each tick and rebuild when it moves.
    _poll() {
        if (this._active && this._workAreasChanged())
            this._build();
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

    // work-area snapshot across monitors; a bar/dock registering its struts
    // changes it, which is the signal that the ring needs a rebuild
    _workAreasString() {
        return Main.layoutManager.monitors
            .map(m => Main.layoutManager.getWorkAreaForMonitor(m.index))
            .map(wa => `${wa.x},${wa.y},${wa.width},${wa.height}`)
            .join(';');
    }

    _workAreasChanged() {
        const areas = this._workAreasString();
        if (areas === this._lastWorkAreas)
            return false;
        this._lastWorkAreas = areas;
        return true;
    }

    // An open camera fd shows up as /proc/PID/fd/N → /dev/videoX. Plain
    // readlink per fd: one syscall each, no GIO/GFile allocation (a stat
    // on every fd of every process once a second was the CPU hog).
    _v4l2InUse() {
        const dev = new GLib.Dir('/dev', 0);
        const nodes = new Set();
        let name;
        while ((name = dev.read_name()) !== null) {
            if (name.startsWith('video'))
                nodes.add('/dev/' + name);
        }
        if (nodes.size === 0)
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
                try {
                    if (nodes.has(GLib.file_read_link(`/proc/${pid}/fd/${fd}`)))
                        return true;
                } catch (e) {
                    // fd vanished between readdir and readlink
                }
            }
        }
        return false;
    }

    _monitorConnector(layoutMonitor) {
        try {
            const connector = global.display.get_monitor_name?.(layoutMonitor.index);
            if (connector)
                return connector;
            const monitor = global.backend.get_monitor_manager()
                .get_monitors()[layoutMonitor.index];
            const name = monitor?.get_connector();
            if (name)
                return name;
        } catch (e) {
        }
        console.warn(`Ring Light: no connector identity for monitor ${layoutMonitor.index}; keeping it enabled`);
        return null;
    }

    _build() {
        for (const a of this._borders)
            Main.layoutManager.removeChrome(a);
        this._borders = [];
        this._rings = []; // rebuilt from scratch; stale rings from a prior build die here

        // removeChrome only *queues* the strut recompute (BEFORE_REDRAW
        // late). The work-area query below must see the bars but not our
        // strips, or every rebuild would compound the error (runaway ring
        // while dragging a settings spin). Force the same idempotent
        // recompute the late handler runs; private but stable 45–50.
        if (typeof Main.layoutManager._updateRegions === 'function')
            Main.layoutManager._updateRegions();

        // pointer-avoidance state: cache the scaled radius/fade (the motion
        // handler only refreshes x/y) and seed the hole at the current
        // pointer, so it is correct the moment the ring appears
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._scale = scale;
        if (!this._cursorPos) {
            try {
                this._cursorPos = global.display.get_pointer_info().get_position();
            } catch (e) {
                this._cursorPos = null; // hole appears at first motion event
            }
        }

        const baseline = [];
        const excluded = this._settings.get_strv('excluded-monitors');
        for (const m of Main.layoutManager.monitors) {
            // monitors can be transiently undefined while layout changes
            // (login, hotplug) — skip instead of crashing mid-build
            if (!m)
                continue;
            const connector = this._monitorConnector(m);
            if (connector && excluded.includes(connector))
                continue;
            // mutter 18 dropped Meta.Monitor.geometry; the layout manager
            // Monitor objects now expose x/y/width/height directly
            const {x, y, width, height} = m.geometry ?? m;

            // ring hugs the work area edge: same thickness on all sides
            const marginX = LIGHT_W;
            const marginY = LIGHT_W;

            // work area = monitor minus what bars/docks reserve (their
            // struts). The ring hugs it, so the band starts after the top
            // bar and ends before a task bar/dock instead of drawing
            // behind them.
            const wa = Main.layoutManager.getWorkAreaForMonitor(m.index);
            const top = Math.max(0, wa.y - y);
            const bottom = Math.max(0, y + height - (wa.y + wa.height));
            const left = Math.max(0, wa.x - x);
            const right = Math.max(0, x + width - (wa.x + wa.width));

            baseline.push(`${wa.x + marginX},${wa.y + marginY},` +
                `${wa.width - 2 * marginX},${wa.height - 2 * marginY}`);

            // Visual light is non-strut chrome: the actor spans the full
            // monitor so the halo can bleed outward to the monitor edges;
            // its white source surface is recolored and made transparent
            // entirely by one shader anchored at the work-area rect.
            // Transparent struts (below) reserve the work area.
            const shapeW = Math.max(1, wa.width);
            const shapeH = Math.max(1, wa.height);
            const innerW = Math.max(1, shapeW - 2 * marginX);
            const innerH = Math.max(1, shapeH - 2 * marginY);
            const effect = new RingShaderEffect({
                u_width: width * scale,
                u_height: height * scale,
                u_outer_left: left * scale,
                u_outer_top: top * scale,
                u_outer_right: (left + shapeW) * scale,
                u_outer_bottom: (top + shapeH) * scale,
                u_inner_left: (left + marginX) * scale,
                u_inner_top: (top + marginY) * scale,
                u_inner_right: (left + marginX + innerW) * scale,
                u_inner_bottom: (top + marginY + innerH) * scale,
            });
            const ring = new St.Widget({
                x, y, width, height,
                reactive: false, // pointer clicks fall through to windows
                style: 'background-color: white;', // source alpha for shader
                effect,
            });
            Main.layoutManager.addChrome(ring);
            Main.layoutManager.uiGroup.set_child_below_sibling(ring, Main.layoutManager.panelBox);
            this._borders.push(ring);
            this._rings.push({widget: ring, effect});

            // work area: transparent strips keep the struts that shrink it;
            // transparent so they never paint over the ring's rounded corners.
            // A strut only counts when the actor touches a monitor edge
            // (_updateRegions picks the side from the edges it touches), so
            // each strip spans from the monitor edge over the bar's reserved
            // space plus the ring thickness.
            const edges = [
                {x, y, width, height: top + marginY},                                        // top
                {x, y: y + height - bottom - marginY, width,
                    height: bottom + marginY},                                               // bottom
                {x, y: wa.y + marginY, width: left + marginX,
                    height: Math.max(1, wa.height - 2 * marginY)},                           // left
                {x: wa.x + wa.width - marginX, y: wa.y + marginY,
                    width: right + marginX,
                    height: Math.max(1, wa.height - 2 * marginY)},                           // right
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
        // baseline for the work-area poll: what getWorkAreaForMonitor reports
        // once the strut strips settle. Each strip reserves marginX/Y beyond
        // the bar's space on its edge, so the settled live area reads wa
        // shrunk by that constant — snapshot it arithmetically instead of
        // reading it live (fresh strips have no allocation yet, and
        // _updateRegions computes struts from allocations, so a live read
        // would snapshot a stale area and the poll would rebuild every tick)
        this._lastWorkAreas = baseline.join(';');
        this._applySettings();
    }

    // Settings changes touch only shader uniforms (band width LIGHT_W is
    // constant, so no strut changes): update in place instead of rebuilding,
    // since a rebuild re-adds the strut strips and makes mutter resize every
    // maximized/tiled window twice — a visible flicker.
    _applySettings() {
        const RADIUS = this._settings.get_int('ring-radius');
        const TEMPERATURE = this._settings.get_int('ring-color-temperature');
        const [CR, CG, CB] = temperatureToRGB(TEMPERATURE);
        const BRIGHTNESS = this._settings.get_int('brightness') / 100;
        const cursorOn = this._settings.get_boolean('cursor-transparency');
        this._cursorUniforms.radius = cursorOn ? this._settings.get_int('cursor-radius') * this._scale : 0;
        this._cursorUniforms.fade = cursorOn ? this._settings.get_int('cursor-fade') * this._scale : 0;

        for (const {widget, effect} of this._rings) {
            Object.assign(effect._uniforms, {
                u_outer_radius: RADIUS * this._scale,
                u_inner_radius: Math.max(0, RADIUS - LIGHT_W) * this._scale,
                u_red: CR / 255,
                u_green: CG / 255,
                u_blue: CB / 255,
                u_temperature: TEMPERATURE,
                u_brightness: BRIGHTNESS,
                u_band: LIGHT_W * this._scale,
            });
            widget.queue_redraw();
        }
        this._updateCursorUniforms();
    }

    // cursor hole uniforms: pointer position is ring-local (the shader
    // samples texture space) and scaled like u_width/u_height. Pushed into
    // the effect's uniform dict; applied at next paint by vfunc_paint_target
    _updateCursorUniforms() {
        if (!this._cursorPos || this._rings.length === 0)
            return;
        const [cx, cy] = this._cursorPos;
        for (const {widget, effect} of this._rings) {
            Object.assign(effect._uniforms, {
                u_mouse_x: (cx - widget.x) * this._scale,
                u_mouse_y: (cy - widget.y) * this._scale,
                u_cursor_radius: this._cursorUniforms.radius,
                u_cursor_fade: this._cursorUniforms.fade,
            });
            widget.queue_redraw();
        }
    }
}
