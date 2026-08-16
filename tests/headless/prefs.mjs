// Ring Light prefs-window integration tests. Zero deps: node stdlib + system
// tools (dbus-run-session, gjs, glib-compile-resources, gsettings, Xvfb).
//
// Run: node tests/headless/prefs.mjs
//
// Boots an isolated dbus-run-session with an Xvfb display and drives the real
// prefs.js (tests/headless/prefs-driver.mjs) as a GJS/GTK4 process against a
// seeded dconf database:
//   - widget tree: groups, rows, slider/spin ranges, seeded values
//   - settings binds in both directions (widget -> gsettings, gsettings -> widget)
//   - cursor-transparency sensitivity wiring
//   - per-monitor excluded-monitors switch rows
// The base ExtensionPreferences class lives inside binaries a standalone
// process can't import, so a shim (prefs-base-shim.js) is compiled to a
// .gresource registered at the real resource paths; everything else is the
// real prefs.js and the real schema/dconf stack.
//
// Skips (exit 0) when Xvfb, gjs or glib-compile-resources is missing.
import {spawn, spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UUID = 'ringlight@danielgenezini';
const DISPLAY = ':99';
const SCREEN = '1280x720x24';

const state = {
    tmp: null,
    addr: null,
    results: [],
};

// ---------------------------------------------------------------------------
// process plumbing
// ---------------------------------------------------------------------------

function runSync(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {
        encoding: 'utf8',
        timeout: opts.timeoutMs ?? 15000,
        cwd: opts.cwd,
        env: {...process.env, ...opts.env},
    });
    if (r.error)
        throw r.error;
    return r;
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

function schemasDir() {
    return join(state.tmp, 'data', 'gnome-shell', 'extensions', UUID, 'schemas');
}

function extensionsDir() {
    return join(state.tmp, 'data', 'gnome-shell', 'extensions', UUID);
}

function have(cmd) {
    return spawnSync('sh', ['-c', `command -v ${cmd}`], {encoding: 'utf8'}).status === 0;
}

function result(name, ok, detail = '', skipped = false) {
    state.results.push({name, ok, detail, skipped});
}

// ---------------------------------------------------------------------------
// session bootstrap
// ---------------------------------------------------------------------------

function installExtension() {
    const extDir = extensionsDir();
    mkdirSync(extDir, {recursive: true});
    for (const f of ['prefs.js', 'metadata.json', 'schemas'])
        cpSync(join(ROOT, f), join(extDir, f), {recursive: true});
}

// Seed distinct values so binds are verifiable in both directions.
function seedDconf() {
    const r = runSync('dbus-run-session', ['--', 'sh', '-c',
        'gsettings set org.gnome.shell.extensions.ringlight ring-mode off && ' +
        'gsettings set org.gnome.shell.extensions.ringlight ring-color-temperature 4000 && ' +
        'gsettings set org.gnome.shell.extensions.ringlight brightness 42 && ' +
        'gsettings set org.gnome.shell.extensions.ringlight ring-radius 60 && ' +
        'gsettings set org.gnome.shell.extensions.ringlight cursor-transparency false && ' +
        'gsettings set org.gnome.shell.extensions.ringlight cursor-radius 100 && ' +
        'gsettings set org.gnome.shell.extensions.ringlight cursor-fade 30 && ' +
        'gsettings set org.gnome.shell.extensions.ringlight show-quick-settings-toggle true && ' +
        'gsettings set org.gnome.shell.extensions.ringlight excluded-monitors "[]"'],
        {env: {...shellEnv(), GSETTINGS_SCHEMA_DIR: schemasDir()}, timeoutMs: 30000});
    if (r.status !== 0)
        throw new Error(`dconf pre-seed failed: ${r.stderr || r.stdout}`);
}

// Compile the base-class shim into a .gresource registered at the two
// resource paths prefs.js tries (GNOME 50 daemon resource, 45-49 shell
// resource), so the real prefs.js module loads in the driver process.
function buildShim() {
    const shimDir = join(state.tmp, 'shim');
    mkdirSync(shimDir);
    cpSync(join(ROOT, 'tests', 'headless', 'prefs-base-shim.js'), join(shimDir, 'prefs.js'));
    writeFileSync(join(shimDir, 'shim.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<gresources>
  <gresource prefix="/org/gnome/Shell/Extensions/js/extensions">
    <file>prefs.js</file>
  </gresource>
  <gresource prefix="/org/gnome/shell/extensions">
    <file>prefs.js</file>
  </gresource>
</gresources>
`);
    const r = runSync('glib-compile-resources',
        ['--target', join(shimDir, 'shim.gresource'), join(shimDir, 'shim.xml')],
        {timeoutMs: 15000, cwd: shimDir}); // <file> resolves against cwd, not the xml
    if (r.status !== 0)
        throw new Error(`glib-compile-resources failed: ${r.stderr || r.stdout}`);
    return join(shimDir, 'shim.gresource');
}

// Xvfb lives inside the dbus session so the session bus and display share a
// process tree; the driver connects to both.
function spawnSession() {
    const addrFile = join(state.tmp, 'addr');
    const child = spawn('dbus-run-session', [
        '--', 'sh', '-c',
        `echo "$DBUS_SESSION_BUS_ADDRESS" > ${addrFile}; exec Xvfb ${DISPLAY} -screen 0 ${SCREEN}`,
    ], {env: shellEnv(), stdio: ['ignore', 'pipe', 'pipe'], detached: true});
    return {child, addrFile};
}

async function waitFor(pred, label, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await pred())
            return true;
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`timed out waiting for ${label}`);
}

async function waitForBus(addrFile, timeoutMs = 30000) {
    await waitFor(() => existsSync(addrFile), 'dbus session address file', timeoutMs);
    state.addr = readFileSync(addrFile, 'utf8').trim();
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
    const keep = process.argv.includes('--keep');

    // display + runtime availability; skip cleanly when the environment can't
    // host a GTK window (Xvfb missing), same policy as monitor-layout-change.
    const missing = ['Xvfb', 'gjs', 'dbus-run-session', 'glib-compile-resources', 'gsettings']
        .filter(c => !have(c));
    if (missing.length > 0) {
        console.log(`  SKIP  prefs-window: missing system tools: ${missing.join(', ')}`);
        console.log('\n0/0 passed, 0 failed, 1 skipped');
        return;
    }

    state.tmp = mkdtempSync(join(tmpdir(), 'ringlight-prefs-'));
    mkdirSync(join(state.tmp, 'runtime'), {mode: 0o700});
    installExtension();
    seedDconf();
    const shim = buildShim();

    let child;
    try {
        const {child: c, addrFile} = spawnSession();
        child = c;
        await waitForBus(addrFile);
        await waitFor(() => existsSync(`/tmp/.X11-unix/X99`), 'Xvfb socket', 10000);

        const r = runSync('gjs', ['-m', join(ROOT, 'tests', 'headless', 'prefs-driver.mjs')], {
            timeoutMs: 60000,
            env: {
                ...shellEnv(),
                DBUS_SESSION_BUS_ADDRESS: state.addr,
                DISPLAY,
                GDK_BACKEND: 'x11',
                GSETTINGS_SCHEMA_DIR: schemasDir(),
                PREF_EXT_DIR: extensionsDir(),
                PREF_SHIM_GRESOURCE: shim,
            },
        });

        const lines = (r.stdout ?? '').split('\n').filter(l => l.startsWith('RESULT|'));
        for (const line of lines) {
            const [, name, ok, ...rest] = line.split('|');
            result(name, ok === '1', rest.join('|'));
        }
        if (r.status !== 0) {
            const stderrTail = (r.stderr ?? '').split('\n').slice(-10).join('\n');
            result('prefs-driver', false, `driver exited ${r.status}; stderr:\n${stderrTail}`);
        } else if (lines.length === 0) {
            result('prefs-driver', false, `driver produced no RESULT lines; stdout: ${(r.stdout ?? '').slice(-200)}`);
        }
    } finally {
        if (child) {
            try { process.kill(-child.pid, 'SIGTERM'); } catch {}
            await new Promise(r => setTimeout(r, 1000));
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
    console.log(`\n${state.results.length - failed.length - skipped.length}/${state.results.length} passed, ` +
        `${failed.length} failed, ${skipped.length} skipped`);
    if (keep)
        console.log(`session files kept in ${state.tmp}`);
    else
        rmSync(state.tmp, {recursive: true, force: true});
    process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(e => {
    console.error(`\nFAILED: ${e.message}`);
    if (state.tmp && !process.argv.includes('--keep'))
        rmSync(state.tmp, {recursive: true, force: true});
    process.exit(1);
});
