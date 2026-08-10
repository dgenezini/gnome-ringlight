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
import Gio from 'gi://Gio';
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

// One fragment shader paints core plus medium and outer glow. `ringDistance`
// is negative inside the rounded band, positive outside it; its SDF curves
// make corners radial instead of joining four rectangular gradients.
const RING_SHADER = `
uniform sampler2D tex;
uniform float u_width;
uniform float u_height;
uniform float u_outer_left;
uniform float u_outer_top;
uniform float u_outer_right;
uniform float u_outer_bottom;
uniform float u_inner_left;
uniform float u_inner_top;
uniform float u_inner_right;
uniform float u_inner_bottom;
uniform float u_outer_radius;
uniform float u_inner_radius;
uniform float u_min_thickness;
uniform float u_red;
uniform float u_green;
uniform float u_blue;
uniform float u_brightness;
uniform float u_softness;
uniform float u_glow;
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
    float ringDistance = max(outer, -inner);
    float insideDepth = max(0.0, -ringDistance);
    // One physical-pixel coverage transition anti-aliases SDF edges.
    float inside = 1.0 - smoothstep(-1.0, 1.0, ringDistance);
    // Glow consumes width from both band edges, leaving a bright core in the
    // center. Keep a 20px core where the configured width permits it. The
    // curve is a single C2-smooth quintic: zero at both band edges (no hard
    // line), full at the core — no slope joins to band.
    float maxGlow = max(0.0, (u_min_thickness - 20.0) * 0.5);
    float glowWidth = min(100.0 * u_glow * (2.0 * u_softness), maxGlow);
    float progress = glowWidth > 0.01 ?
        clamp(insideDepth / glowWidth, 0.0, 1.0) : 1.0;
    float glow = progress * progress * progress *
        (progress * (progress * 6.0 - 15.0) + 10.0);
    float alpha = glow * inside * u_brightness;
    // pointer avoidance: fade the ring out inside a circle around the
    // cursor so it never covers the pointer; smoothstep ramps alpha from
    // 0 at the cursor (or radius−fade from it) to full at the radius
    if (u_cursor_radius > 0.0) {
        float d = distance(point, vec2(u_mouse_x, u_mouse_y));
        alpha *= smoothstep(u_cursor_radius - u_cursor_fade, u_cursor_radius, d);
    }
    vec4 source = texture2D(tex, cogl_tex_coord_in[0].st);
    cogl_color_out = vec4(u_red, u_green, u_blue, 1.0) * alpha * source.a;
}`;

const RingShaderEffect = GObject.registerClass(
class RingShaderEffect extends Clutter.ShaderEffect {
    _init(uniforms) {
        super._init({shader_type: Cogl.ShaderType.FRAGMENT});
        this._uniforms = uniforms;
        this.set_shader_source(RING_SHADER);
    }

    vfunc_paint_target(node, paintContext) {
        const texture = new GObject.Value();
        texture.init(GObject.TYPE_INT);
        texture.set_int(0);
        this.set_uniform_value('tex', texture);
        for (const [name, number] of Object.entries(this._uniforms)) {
            const value = new GObject.Value();
            value.init(GObject.TYPE_FLOAT);
            value.set_float(number);
            this.set_uniform_value(name, value);
        }
        super.vfunc_paint_target(node, paintContext);
    }
});

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
        this._rings = []; // visible ring widgets only (not strut strips)
        this._cursorPos = null;
        this._cursorUniforms = {radius: 0, fade: 0}; // scaled physical px
        this._scale = 1;
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

        // keep the cursor hole following the pointer; motion events arrive
        // through mutter's input pipeline on both X11 and Wayland
        this._motionId = global.stage.connect('motion-event', (_stage, event) => {
            this._cursorPos = event.get_coords();
            if (this._active && this._cursorUniforms.radius > 0)
                this._updateCursorUniforms();
        });

        // Browsers bypass PipeWire for video: Firefox/Chrome open /dev/videoX
        // directly, which CameraMonitor never sees. Poll for open camera fds.
        this._v4l2Streak = 0;
        this._v4l2PollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, V4L2_POLL_MS, () => {
            this._v4l2Poll();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._motionId) {
            global.stage.disconnect(this._motionId);
            this._motionId = 0;
        }
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
        const BORDER = this._settings.get_int('ring-width');
        const RADIUS = this._settings.get_int('ring-radius');
        const PADDING = this._settings.get_int('padding');
        const [CR, CG, CB] = temperatureToRGB(this._settings.get_int('ring-color-temperature'));
        const BRIGHTNESS = this._settings.get_int('brightness') / 100;
        const SOFTNESS = this._settings.get_int('softness') / 100;
        const GLOW = this._settings.get_int('glow') / 100;

        // pointer-avoidance state: cache the scaled radius/fade (the motion
        // handler only refreshes x/y) and seed the hole at the current
        // pointer, so it is correct the moment the ring appears
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._scale = scale;
        this._cursorUniforms.radius = this._settings.get_int('cursor-radius') * scale;
        this._cursorUniforms.fade = this._settings.get_int('cursor-fade') * scale;
        if (!this._cursorPos) {
            try {
                this._cursorPos = global.display.get_pointer_info().get_position();
            } catch (e) {
                this._cursorPos = null; // hole appears at first motion event
            }
        }

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

            // Visual ring is non-strut chrome: its white source surface is
            // recolored and made transparent entirely by one shader. Glow is
            // clipped to this band; transparent struts reserve its margins.
            const shapeW = Math.max(1, wa.width - 2 * PADDING);
            const shapeH = Math.max(1, wa.height - 2 * PADDING);
            const ringW = shapeW;
            const ringH = shapeH;
            const innerW = Math.max(1, shapeW - 2 * marginX);
            const innerH = Math.max(1, shapeH - 2 * marginY);
            const effect = new RingShaderEffect({
                u_width: ringW * scale,
                u_height: ringH * scale,
                u_outer_left: 0,
                u_outer_top: 0,
                u_outer_right: shapeW * scale,
                u_outer_bottom: shapeH * scale,
                u_inner_left: ((shapeW - innerW) / 2) * scale,
                u_inner_top: ((shapeH - innerH) / 2) * scale,
                u_inner_right: ((shapeW + innerW) / 2) * scale,
                u_inner_bottom: ((shapeH + innerH) / 2) * scale,
                u_outer_radius: RADIUS * scale,
                u_inner_radius: Math.max(0, RADIUS - Math.max(marginX, marginY)) * scale,
                u_min_thickness: Math.min(marginX, marginY) * scale,
                u_red: CR / 255,
                u_green: CG / 255,
                u_blue: CB / 255,
                u_brightness: BRIGHTNESS,
                u_softness: SOFTNESS,
                u_glow: GLOW,
            });
            const ring = new St.Widget({
                x: wa.x + PADDING,
                y: wa.y + PADDING,
                width: ringW, height: ringH,
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
        this._updateCursorUniforms();
    }

    // cursor hole uniforms: pointer position is ring-local (the shader
    // samples texture space) and scaled like u_width/u_height
    _updateCursorUniforms() {
        if (!this._cursorPos || this._rings.length === 0)
            return;
        const [cx, cy] = this._cursorPos;
        for (const {widget, effect} of this._rings) {
            this._setFloatUniform(effect, 'u_mouse_x', (cx - widget.x) * this._scale);
            this._setFloatUniform(effect, 'u_mouse_y', (cy - widget.y) * this._scale);
            this._setFloatUniform(effect, 'u_cursor_radius', this._cursorUniforms.radius);
            this._setFloatUniform(effect, 'u_cursor_fade', this._cursorUniforms.fade);
        }
    }

    _setFloatUniform(effect, name, number) {
        const value = new GObject.Value();
        value.init(GObject.TYPE_FLOAT);
        value.set_float(number);
        effect.set_uniform_value(name, value);
    }
}
