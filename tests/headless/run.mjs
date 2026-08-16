// Ring Light headless GNOME Shell integration tests. Zero deps: node stdlib +
// system tools (dbus-run-session, gnome-shell, gdbus, gsettings).
//
// Run: node tests/headless/run.mjs
//
// Boots a real `gnome-shell --headless --unsafe-mode` session with two virtual
// monitors inside an isolated dbus-run-session + temp XDG dirs, installs this
// repo as the extension, and drives it over D-Bus:
//   - org.gnome.Shell.Extensions: GetExtensionErrors
//   - org.gnome.Shell.Eval: in-shell state assertions (ring widgets, struts,
//     work areas, shader uniforms, camera gating, quick-settings toggle)
//   - gsettings (session bus): settings round-trip
//   - org.gnome.Mutter.DisplayConfig: monitor layout change attempt (skipped
//     on headless backends that reject/block layout changes)
//
// The extension is pre-enabled via a seeded dconf database
// (enabled-extensions; ring starts off) and driven live via gsettings.
// The run fails if the shell log contains shader/GLSL/Cogl errors.
import {spawn, spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UUID = 'ringlight@danielgenezini';
const LIGHT_W = 100; // must match LIGHT_W in extension.js
const MONITORS = ['1280x720', '800x600']; // two virtual monitors at boot

const state = {
    tmp: null,
    addr: null,
    log: '', // all shell stdout+stderr, checked for shader errors at the end
    results: [], // {name, ok, skipped, detail}
};

// ---------------------------------------------------------------------------
// process plumbing
// ---------------------------------------------------------------------------

function runSync(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {
        encoding: 'utf8',
        timeout: opts.timeoutMs ?? 15000,
        env: {...process.env, ...opts.env},
    });
    if (r.error)
        throw r.error;
    return r;
}

// args: {dest, path, gv: [GVariant-text arguments...]}
function gdbus(method, {dest, path, gv = []} = {}, opts = {}) {
    const r = runSync('gdbus',
        ['call', '--address', state.addr, '--dest', dest, '--object-path', path, '--method', method, ...gv],
        opts);
    if (r.status !== 0)
        throw new Error(`gdbus ${method} failed: ${r.stderr.trim()}`);
    return r.stdout.trim();
}

function shellEnv() {
    return {
        PATH: process.env.PATH,
        LANG: process.env.LANG ?? 'C.UTF-8',
        HOME: state.tmp,
        XDG_DATA_HOME: join(state.tmp, 'data'),
        XDG_CONFIG_HOME: join(state.tmp, 'config'),
        XDG_CACHE_HOME: join(state.tmp, 'cache'),
        XDG_RUNTIME_DIR: join(state.tmp, 'runtime'),
    };
}

function gsettings(args) {
    return runSync('gsettings', args, {
        env: {
            ...shellEnv(),
            DBUS_SESSION_BUS_ADDRESS: state.addr,
            GSETTINGS_SCHEMA_DIR: schemasDir(),
        },
    });
}

function schemasDir() {
    return join(state.tmp, 'data', 'gnome-shell', 'extensions', UUID, 'schemas');
}

// ---------------------------------------------------------------------------
// GVariant text helpers (gdbus output parsing)
// ---------------------------------------------------------------------------

// Eval returns (b success, s result); result is a JSON string. Extract the
// quoted string and unescape GVariant escapes, then JSON.parse.
function parseGdbusString(out) {
    const m = out.match(/^\(\s*(?:true|false),\s*'((?:[^'\\]|\\.)*)'\s*\)$/s);
    if (!m)
        throw new Error(`cannot parse gdbus string output: ${out.slice(0, 200)}`);
    const s = m[1].replace(/\\(['\\nrtbfva0])/g, (_, c) =>
        ({'\'': "'", '\\': '\\', n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', a: '\a', 0: '\0'}[c]));
    return s;
}

// GVariant text for a string argument: single-quoted, escapes quoted/backslashes.
function q(s) {
    return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// ---------------------------------------------------------------------------
// D-Bus helpers
// ---------------------------------------------------------------------------

function evalShell(script, opts = {}) {
    const out = gdbus('org.gnome.Shell.Eval', {dest: 'org.gnome.Shell', path: '/org/gnome/Shell', gv: [q(script)]}, opts);
    const m = out.match(/^\((true|false),/);
    const result = parseGdbusString(out);
    if (m[1] !== 'true')
        throw new Error(`Eval failed: ${result}`);
    const parsed = JSON.parse(result);
    // Eval JSON-encodes every result, so string results (our JSON.stringify
    // payloads) arrive double-encoded: "{"rings":2}" -> parse -> {"rings":2}
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
}

function extensionsPath() {
    // GNOME 50 serves org.gnome.Shell.Extensions at /org/gnome/Shell; older
    // versions at /org/gnome/Shell/Extensions. Probe both.
    for (const p of ['/org/gnome/Shell/Extensions', '/org/gnome/Shell']) {
        const r = runSync('gdbus', ['introspect', '--address', state.addr, '--dest', 'org.gnome.Shell', '--object-path', p], {timeoutMs: 10000});
        if (r.status === 0 && r.stdout.includes('interface org.gnome.Shell.Extensions'))
            return p;
    }
    throw new Error('cannot find org.gnome.Shell.Extensions interface on the session bus');
}

function extensionErrors(extPath) {
    const out = gdbus('org.gnome.Shell.Extensions.GetExtensionErrors', {dest: 'org.gnome.Shell', path: extPath, gv: [q(UUID)]});
    // (@as []) or (@as ['...', '...']) — extract the array of strings
    // (gdbus prints empty arrays with a trailing comma: `(@as [],)`)
    const inner = out.match(/^\(\s*@as\s+\[(.*)\]\s*,?\s*\)$/s);
    if (!inner)
        throw new Error(`cannot parse GetExtensionErrors output: ${out.slice(0, 200)}`);
    return inner[1].trim() === '' ? [] : inner[1].split(',').map(s => s.trim().slice(1, -1));
}

// ---------------------------------------------------------------------------
// assertion helpers
// ---------------------------------------------------------------------------

async function waitFor(pred, label, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    let lastErr;
    while (Date.now() < deadline) {
        try {
            if (await pred())
                return true;
        } catch (e) {
            lastErr = e;
        }
        if (process.env.DEBUG_WAIT)
            console.error(`[waitFor] ${label}: pred=false${lastErr ? ` lastErr=${lastErr.message}` : ''} elapsed=${Date.now() - deadline + timeoutMs}ms`);
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`timed out waiting for ${label}${lastErr ? ` (last error: ${lastErr.message})` : ''}`);
}

function result(name, ok, detail = '') {
    state.results.push({name, ok, skipped: false, detail});
}

function skip(name, detail) {
    state.results.push({name, ok: true, skipped: true, detail});
}

// ---------------------------------------------------------------------------
// scenarios
// ---------------------------------------------------------------------------

const EXT_LOOKUP = `(() => {
    const st = Main.extensionManager.lookup('${UUID}');
    return st?.stateObj ?? st?.extension ?? st;
})()`;

function ringStateExpr() {
    return `(() => {
        const e = ${EXT_LOOKUP};
        const lm = Main.layoutManager;
        return JSON.stringify({
            rings: e?._rings?.length ?? -1,
            borders: e?._borders?.length ?? -1,
            active: e?._active ?? false,
            workAreas: lm.monitors.map(m => {
                const wa = lm.getWorkAreaForMonitor(m.index);
                return [wa.x, wa.y, wa.width, wa.height];
            }),
        });
    })()`;
}

function workAreaBaselineExpr() {
    return `(() => {
        const lm = Main.layoutManager;
        return JSON.stringify(lm.monitors.map(m => {
            const wa = lm.getWorkAreaForMonitor(m.index);
            return [wa.x, wa.y, wa.width, wa.height];
        }));
    })()`;
}

// shader uniforms of the first ring + the global scale factor, so radius
// assertions don't assume scale 1
const RING_UNIFORMS = `(() => {
    const e = ${EXT_LOOKUP};
    const u = e?._rings?.[0]?.effect._uniforms ?? {};
    return JSON.stringify({
        temp: u.u_temperature,
        brightness: u.u_brightness,
        innerRadius: u.u_inner_radius,
        outerRadius: u.u_outer_radius,
        cursorRadius: u.u_cursor_radius,
        scale: imports.gi.St.ThemeContext.get_for_stage(global.stage).scale_factor,
    });
})()`;

async function scenarioEnable() {
    // ring was seeded off; flip it on through the same settings path users use
    const r = gsettings(['set', 'org.gnome.shell.extensions.ringlight', 'ring-mode', 'always']);
    if (r.status !== 0)
        throw new Error(`gsettings set ring-mode failed: ${r.stderr}`);
    await waitFor(() => {
        const s = evalShell(ringStateExpr());
        return s.rings === MONITORS.length && s.active;
    }, 'extension active with one ring per monitor', 30000);
    const errs = extensionErrors(extensionsPath());
    if (errs.length > 0)
        throw new Error(`extension reports errors: ${errs.join('; ')}`);
}

async function scenarioRingBuild(baseline) {
    await waitFor(() => {
        const s = evalShell(ringStateExpr());
        return s.rings === MONITORS.length && s.borders === 5 * MONITORS.length;
    }, 'ring widgets + 4 strut strips per monitor');
    await waitFor(() => {
        const s = evalShell(ringStateExpr());
        return s.workAreas.every((wa, i) =>
            wa[0] === baseline[i][0] + LIGHT_W &&
            wa[1] === baseline[i][1] + LIGHT_W &&
            wa[2] === baseline[i][2] - 2 * LIGHT_W &&
            wa[3] === baseline[i][3] - 2 * LIGHT_W);
    }, 'work area shrunk by band width on every edge');
}

async function scenarioSettings() {
    const sets = [
        ['ring-color-temperature', '4000'],
        ['brightness', '50'],
        ['ring-radius', '60'],
        ['cursor-transparency', 'true'],
    ];
    for (const [key, value] of sets) {
        const r = gsettings(['set', 'org.gnome.shell.extensions.ringlight', key, value]);
        if (r.status !== 0)
            throw new Error(`gsettings set ${key} failed: ${r.stderr}`);
    }
    await waitFor(() => {
        const s = evalShell(RING_UNIFORMS);
        return s.temp === 4000 && Math.abs(s.brightness - 0.5) < 1e-9 && s.cursorRadius > 0 &&
            s.outerRadius === 60 * s.scale &&
            s.innerRadius === Math.max(0, 60 - LIGHT_W) * s.scale;
    }, 'settings applied to shader uniforms');

    // cursor-radius 0 must disable the pointer hole entirely
    const r0 = gsettings(['set', 'org.gnome.shell.extensions.ringlight', 'cursor-radius', '0']);
    if (r0.status !== 0)
        throw new Error(`gsettings set cursor-radius failed: ${r0.stderr}`);
    await waitFor(() => evalShell(RING_UNIFORMS).cursorRadius === 0,
        'cursor-radius 0 disables the hole');

    const errs = extensionErrors(extensionsPath());
    if (errs.length > 0)
        throw new Error(`extension reports errors after settings change: ${errs.join('; ')}`);
}

async function scenarioDisable(baseline) {
    const r = gsettings(['set', 'org.gnome.shell.extensions.ringlight', 'ring-mode', 'off']);
    if (r.status !== 0)
        throw new Error(`gsettings set ring-mode off failed: ${r.stderr}`);
    await waitFor(() => {
        const s = evalShell(ringStateExpr());
        return s.rings === 0 && s.borders === 0 && !s.active;
    }, 'chrome removed after disable');
    await waitFor(() => {
        const s = evalShell(ringStateExpr());
        return s.workAreas.every((wa, i) =>
            wa[0] === baseline[i][0] && wa[1] === baseline[i][1] &&
            wa[2] === baseline[i][2] && wa[3] === baseline[i][3]);
    }, 'work area restored after disable');
}

// ring-mode 'auto' gates on camera state. Headless has no real cameras, so
// drive _cameraInUse directly and watch the ring follow _refresh(); the v4l2
// poll is silenced by dropping the monitor so it can't flip the flag back
// every 2s mid-test.
async function scenarioCameraAuto(baseline) {
    evalShell(`(() => {
        const e = ${EXT_LOOKUP};
        e._cameraMonitor = null; // poll would force _cameraInUse=false every 2s
        e._cameraInUse = false;
        e._refresh();
        return true;
    })()`);
    const r = gsettings(['set', 'org.gnome.shell.extensions.ringlight', 'ring-mode', 'auto']);
    if (r.status !== 0)
        throw new Error(`gsettings set ring-mode auto failed: ${r.stderr}`);
    await waitFor(() => {
        const s = evalShell(ringStateExpr());
        return s.rings === 0 && !s.active &&
            s.workAreas.every((wa, i) => wa[0] === baseline[i][0] && wa[1] === baseline[i][1] &&
                wa[2] === baseline[i][2] && wa[3] === baseline[i][3]);
    }, 'auto + no camera: no ring, work area untouched');

    evalShell(`(() => {
        const e = ${EXT_LOOKUP};
        e._cameraInUse = true;
        e._refresh();
        return true;
    })()`);
    await waitFor(() => {
        const s = evalShell(ringStateExpr());
        return s.rings === MONITORS.length && s.active &&
            s.workAreas.every((wa, i) =>
                wa[0] === baseline[i][0] + LIGHT_W && wa[1] === baseline[i][1] + LIGHT_W &&
                wa[2] === baseline[i][2] - 2 * LIGHT_W && wa[3] === baseline[i][3] - 2 * LIGHT_W);
    }, 'auto + camera in use: ring on, work area shrunk');

    evalShell(`(() => {
        const e = ${EXT_LOOKUP};
        e._cameraInUse = false;
        e._refresh();
        return true;
    })()`);
    await waitFor(() => {
        const s = evalShell(ringStateExpr());
        return s.rings === 0 && !s.active &&
            s.workAreas.every((wa, i) => wa[0] === baseline[i][0] && wa[1] === baseline[i][1] &&
                wa[2] === baseline[i][2] && wa[3] === baseline[i][3]);
    }, 'auto + camera released: ring off, work area restored');
    const errs = extensionErrors(extensionsPath());
    if (errs.length > 0)
        throw new Error(`extension reports errors after auto-mode toggling: ${errs.join('; ')}`);
}

async function scenarioExcludedMonitors() {
    const r = gsettings(['set', 'org.gnome.shell.extensions.ringlight', 'ring-mode', 'always']);
    if (r.status !== 0)
        throw new Error(`gsettings set ring-mode always failed: ${r.stderr}`);
    await waitFor(() => evalShell(ringStateExpr()).rings === MONITORS.length,
        'ring back for excluded-monitors test');

    // connector names are backend-specific (headless virtual monitors); read
    // them through the extension's own lookup so the test works anywhere
    const s = evalShell(`(() => {
        const e = ${EXT_LOOKUP};
        return JSON.stringify({
            conns: Main.layoutManager.monitors.map(m => e._monitorConnector(m)),
        });
    })()`);
    if (s.conns.some(c => !c)) {
        skip('excluded-monitors', `connector lookup unavailable: ${JSON.stringify(s.conns)}`);
        return;
    }
    const target = s.conns[1]; // drop the 800x600 monitor

    const setExcluded = v => {
        const r2 = gsettings(['set', 'org.gnome.shell.extensions.ringlight', 'excluded-monitors', v]);
        if (r2.status !== 0)
            throw new Error(`gsettings set excluded-monitors failed: ${r2.stderr}`);
    };

    setExcluded(`['${target}']`);
    await waitFor(() => evalShell(ringStateExpr()).rings === MONITORS.length - 1,
        'ring dropped on the excluded connector');

    setExcluded('[]');
    await waitFor(() => evalShell(ringStateExpr()).rings === MONITORS.length,
        'ring restored after clearing exclusion');

    // unknown connector name must be ignored, not crash or drop everything
    setExcluded("['BOGUS-CONNECTOR']");
    await waitFor(() => evalShell(ringStateExpr()).rings === MONITORS.length,
        'unknown connector name keeps every ring');
    setExcluded('[]');
    const errs = extensionErrors(extensionsPath());
    if (errs.length > 0)
        throw new Error(`extension reports errors after excluded-monitors changes: ${errs.join('; ')}`);
}

async function scenarioQuickSettings() {
    const toggleStateExpr = `(() => {
        const e = ${EXT_LOOKUP};
        const qs = Main.panel.statusArea.quickSettings;
        // qs._indicators is an St.BoxLayout (46+): the external indicator is
        // a child actor of it. get_children() covers that shape on every
        // supported shell version.
        const children = qs._indicators?.get_children?.() ?? [];
        return JSON.stringify({
            has: !!e._toggle && !!e._indicator,
            registered: !!e._toggle && !!e._indicator && children.includes(e._indicator),
            modes: e._toggle ? Object.keys(e._modeItems).length : -1,
            checked: e._toggle ? e._toggle.checked : null,
        });
    })()`;

    // visible and registered at startup (schema default true); mode is
    // 'always' from the exclude test, so the toggle shows enabled
    await waitFor(() => {
        const s = evalShell(toggleStateExpr);
        return s.has && s.registered && s.modes === 3 && s.checked === true;
    }, 'quick settings toggle visible, registered, 3 modes, checked');

    const r = gsettings(['set', 'org.gnome.shell.extensions.ringlight', 'show-quick-settings-toggle', 'false']);
    if (r.status !== 0)
        throw new Error(`gsettings set show-quick-settings-toggle failed: ${r.stderr}`);
    await waitFor(() => {
        const s = evalShell(toggleStateExpr);
        return !s.has && !s.registered && s.modes === -1;
    }, 'toggle destroyed when hidden by setting');

    const r2 = gsettings(['set', 'org.gnome.shell.extensions.ringlight', 'show-quick-settings-toggle', 'true']);
    if (r2.status !== 0)
        throw new Error(`gsettings set show-quick-settings-toggle failed: ${r2.stderr}`);
    await waitFor(() => {
        const s = evalShell(toggleStateExpr);
        return s.has && s.registered && s.modes === 3;
    }, 'toggle recreated and re-registered when shown again');
}

// Runtime monitor layout change: attempt to remove the second monitor through
// org.gnome.Mutter.DisplayConfig. Headless backends reject or block this; per
// design decision 3 the scenario is then reported as SKIPPED, never failed.
// The attempt can wedge the headless session, so it runs last.
async function scenarioMonitorLayoutChange() {
    gsettings(['set', 'org.gnome.shell.extensions.ringlight', 'ring-mode', 'always']);
    await waitFor(() => evalShell(ringStateExpr()).rings === MONITORS.length, 'ring back after re-enable');

    let serial;
    try {
        const out = gdbus('org.gnome.Mutter.DisplayConfig.GetCurrentState',
            {dest: 'org.gnome.Mutter.DisplayConfig', path: '/org/gnome/Mutter/DisplayConfig'});
        const m = out.match(/^\(uint32 (\d+)/);
        if (!m)
            throw new Error(`cannot parse serial from GetCurrentState: ${out.slice(0, 120)}`);
        serial = m[1];
    } catch (e) {
        skip('monitor-layout-change', `GetCurrentState unavailable: ${e.message}`);
        return;
    }

    // single logical monitor (Meta-0) — drops the 800x600 one. Built as a
    // proper GLib.Variant in-shell; gdbus's text parser cannot express the
    // nested a{sv} in this signature.
    const apply = `(() => {
        const Gio = imports.gi.Gio;
        try {
            const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
            const proxy = Gio.DBusProxy.new_for_bus_sync(bus, Gio.DBusProxyFlags.NONE, null,
                'org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig',
                'org.gnome.Mutter.DisplayConfig', null);
            const monitor = new GLib.Variant('(ssa{sv})', ['Meta-0', 'MetaVendor', {}]);
            const lm = new GLib.Variant('(iiduba(ssa{sv}))', [0, 0, 1.0, 0, true, [monitor], {}]);
            const props = new GLib.Variant('a{sv}', {});
            proxy.call_sync('ApplyMonitorsConfig',
                new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [${serial}, 1, [lm], props]),
                Gio.DBusCallFlags.NONE, 5000, null);
            return JSON.stringify({applied: true});
        } catch (e) {
            return JSON.stringify({applied: false, err: String(e)});
        }
    })()`;

    let s;
    try {
        s = evalShell(apply, {timeoutMs: 15000});
    } catch (e) {
        skip('monitor-layout-change', `apply blocked the session: ${e.message}`);
        return;
    }
    if (!s.applied) {
        skip('monitor-layout-change', `headless backend rejected ApplyMonitorsConfig: ${s.err}`);
        return;
    }

    await waitFor(() => evalShell(ringStateExpr()).rings === 1,
        'ring count drops after monitor removal', 15000);
    result('monitor-layout-change', true, 'runtime monitor removal applied, ring rebuilt');
}

function checkShaderErrors() {
    const bad = state.log.split('\n').filter(l =>
        /(shader|glsl|cogl).{0,120}(error|fail|invalid)/i.test(l) ||
        /(error|fail).{0,120}(shader|glsl|cogl)/i.test(l));
    if (bad.length > 0)
        throw new Error(`shader/GLSL/Cogl errors in shell log:\n${bad.join('\n')}`);
}

// ---------------------------------------------------------------------------
// session bootstrap
// ---------------------------------------------------------------------------

// Pre-seed the isolated dconf database before the shell boots: enable the
// extension so it loads during normal startup (the realistic path) with the
// ring OFF — the no-ring settled work area is the baseline every shrink
// assertion compares against. The ring is then switched on live via gsettings,
// exactly the path users trigger, with no D-Bus race against startup.
function seedDconf() {
    const r = runSync('dbus-run-session', ['--', 'sh', '-c',
        `gsettings set org.gnome.shell enabled-extensions "['${UUID}']" && ` +
        'gsettings set org.gnome.shell.extensions.ringlight ring-mode off'],
        {env: {...shellEnv(), GSETTINGS_SCHEMA_DIR: schemasDir()}, timeoutMs: 30000});
    if (r.status !== 0)
        throw new Error(`dconf pre-seed failed: ${r.stderr || r.stdout}`);
}

function installExtension() {
    const extDir = join(state.tmp, 'data', 'gnome-shell', 'extensions', UUID);
    mkdirSync(extDir, {recursive: true});
    for (const f of ['extension.js', 'prefs.js', 'metadata.json', 'schemas'])
        cpSync(join(ROOT, f), join(extDir, f), {recursive: true});
}

function spawnSession() {
    const addrFile = join(state.tmp, 'addr');
    const vmArgs = MONITORS.map(m => '--virtual-monitor ' + m).join(' ');
    const child = spawn('dbus-run-session', [
        '--', 'sh', '-c',
        `echo "$DBUS_SESSION_BUS_ADDRESS" > ${addrFile}; exec gnome-shell --headless --unsafe-mode ${vmArgs}`,
    ], {env: shellEnv(), stdio: ['ignore', 'pipe', 'pipe'], detached: true});
    child.stdout.on('data', d => (state.log += d));
    child.stderr.on('data', d => (state.log += d));
    return {child, addrFile};
}

async function waitForBus(addrFile, timeoutMs = 90000) {
    await waitFor(() => existsSync(addrFile), 'dbus session address file', timeoutMs);
    state.addr = readFileSync(addrFile, 'utf8').trim();
    await waitFor(() => {
        const r = runSync('gdbus', ['call', '--address', state.addr, '--dest', 'org.freedesktop.DBus',
            '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.NameHasOwner', 'org.gnome.Shell']);
        return r.status === 0 && r.stdout.includes('true');
    }, 'shell to own org.gnome.Shell on the session bus', timeoutMs);
    // Name ownership comes before the /org/gnome/Shell object is registered;
    // wait for the Eval endpoint so the first eval doesn't race startup.
    await waitFor(() => {
        const r = runSync('gdbus', ['introspect', '--address', state.addr,
            '--dest', 'org.gnome.Shell', '--object-path', '/org/gnome/Shell'], {timeoutMs: 10000});
        return r.status === 0 && r.stdout.includes('interface org.gnome.Shell');
    }, 'shell to expose /org/gnome/Shell for Eval', timeoutMs);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
    const keep = process.argv.includes('--keep');
    state.tmp = mkdtempSync(join(tmpdir(), 'ringlight-headless-'));
    mkdirSync(join(state.tmp, 'runtime'), {mode: 0o700});
    installExtension();
    seedDconf();

    let child;
    try {
        const {child: c, addrFile} = spawnSession();
        child = c;
        await waitForBus(addrFile);
        const nMonitors = evalShell('Main.layoutManager.monitors.length');
        if (nMonitors !== MONITORS.length)
            throw new Error(`expected ${MONITORS.length} virtual monitors, shell has ${nMonitors} ` +
                '(--virtual-monitor unsupported on this gnome-shell?)');

        // shell bars register their struts a moment after startup; wait for
        // the work areas to settle so the baseline excludes that movement
        let baseline, stable = 0;
        await waitFor(() => {
            const cur = evalShell(workAreaBaselineExpr());
            if (baseline && JSON.stringify(cur) === JSON.stringify(baseline))
                stable++;
            else
                stable = 0;
            baseline = cur;
            return stable >= 6; // ~1.5s without a work-area change
        }, 'work areas to settle');

        await scenarioEnable();
        result('enable', true, 'extension enables at shell startup with zero errors');

        await scenarioRingBuild(baseline);
        result('ring-build', true, 'ring widget + strut strips per monitor; work area shrunk on every edge');

        await scenarioSettings();
        result('settings', true, 'settings round-trip applies live to shader uniforms');

        await scenarioDisable(baseline);
        result('disable', true, 'chrome removed and work area restored');

        await scenarioCameraAuto(baseline);
        result('camera-auto', true, 'auto mode follows camera state: ring on/off, work area follows');

        await scenarioExcludedMonitors();
        result('excluded-monitors', true, 'excluded connector drops its ring; unknown connector keeps all');

        await scenarioQuickSettings();
        result('quick-settings', true, 'toggle shown/hidden by setting, registered in the quick settings box');

        await scenarioMonitorLayoutChange();
        checkShaderErrors();
        result('shader-integrity', true, 'no shader/GLSL/Cogl errors in shell log');
    } finally {
        if (child) {
            // kill the whole process group (dbus-run-session + gnome-shell)
            try { process.kill(-child.pid, 'SIGTERM'); } catch {}
            await new Promise(r => setTimeout(r, 2000));
            try { process.kill(-child.pid, 'SIGKILL'); } catch {}
        }
    }

    for (const r of state.results) {
        if (r.skipped)
            console.log(`  SKIP  ${r.name}: ${r.detail}`);
        else if (r.ok)
            console.log(`  PASS  ${r.name}: ${r.detail}`);
        else
            console.log(`  FAIL  ${r.name}: ${r.detail}`);
    }
    const failed = state.results.filter(r => !r.ok && !r.skipped);
    const skipped = state.results.filter(r => r.skipped);
    console.log(`\n${state.results.length - skipped.length - failed.length}/${state.results.length} passed, ` +
        `${failed.length} failed, ${skipped.length} skipped`);
    if (keep)
        console.log(`session files kept in ${state.tmp}`);
    else
        rmSync(state.tmp, {recursive: true, force: true});
    process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(e => {
    console.error(`\nFAILED: ${e.message}`);
    if (state.log)
        console.error('--- last shell log lines ---\n' + state.log.split('\n').slice(-20).join('\n'));
    if (state.tmp && !process.argv.includes('--keep'))
        rmSync(state.tmp, {recursive: true, force: true});
    process.exit(1);
});
