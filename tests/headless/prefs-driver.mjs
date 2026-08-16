// Prefs window integration driver. Runs inside the headless suite's session
// as a real GJS/GTK4 process: builds the ring light preferences window from
// the real prefs.js, then asserts the widget tree, the settings binds in both
// directions, the cursor-sensitivity wiring and the per-monitor exclusion
// rows. Prints one RESULT|name|ok|detail line per check on stdout; exits
// non-zero if any check fails.
//
// Env: PREF_EXT_DIR (extension install dir), PREF_SHIM_GRESOURCE (base-class
// shim resource, see prefs.mjs), plus the standard XDG/session-bus/schema
// environment the harness sets up.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Adw from 'gi://Adw?version=1';

const EXT_DIR = GLib.getenv('PREF_EXT_DIR');
const SHIM = GLib.getenv('PREF_SHIM_GRESOURCE');
const SCHEMA = 'org.gnome.shell.extensions.ringlight';
const UUID = 'ringlight@danielgenezini';

const results = [];
let failed = false;

function check(name, ok, detail = '') {
    results.push({name, ok: !!ok, detail});
    if (!ok)
        failed = true;
    print(`RESULT|${name}|${ok ? '1' : '0'}|${detail}`);
}

function pump() {
    const ctx = GLib.MainContext.default();
    while (ctx.pending())
        ctx.iteration(false);
}

function walk(widget, fn) {
    fn(widget);
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        walk(child, fn);
}

function groupsByTitle() {
    const map = {};
    walk(win, w => {
        if (w instanceof Adw.PreferencesGroup)
            map[w.title] = w;
    });
    return map;
}

function rowsOf(group) {
    const rows = [];
    walk(group, w => {
        if (w instanceof Adw.PreferencesRow)
            rows.push(w);
    });
    return rows;
}

function findRow(group, title) {
    return rowsOf(group).find(r => r.title === title);
}

// the color-temperature row is a bare PreferencesRow; its child box holds the
// scale. Find the scale inside the group.
function findScale(group) {
    let scale = null;
    walk(group, w => {
        if (w instanceof Gtk.Scale)
            scale = w;
    });
    return scale;
}

function findSpinRow(group, title) {
    const row = findRow(group, title);
    return row ? row.get_adjustment() : null;
}

function setValue(adj, value) {
    adj.set_value(value);
    pump();
}

function getInt(key) {
    return settings.get_int(key);
}

function setInt(key, value) {
    settings.set_int(key, value);
    pump();
}

function setBool(key, value) {
    settings.set_boolean(key, value);
    pump();
}

// ---------------------------------------------------------------------------

Adw.init();
Gio.resources_register(Gio.Resource.load(SHIM));

const {default: RingLightPreferences} = await import(`file://${EXT_DIR}/prefs.js`);

const prefs = new RingLightPreferences({
    uuid: UUID,
    name: 'Ring Light',
    path: EXT_DIR,
    dir: Gio.File.new_for_path(EXT_DIR),
    'settings-schema': SCHEMA,
});

const win = new Adw.PreferencesWindow();
await prefs.fillPreferencesWindow(win);
win.present();
pump();

const settings = new Gio.Settings({schema_id: SCHEMA});

// ---------------------------------------------------------------------------
// structure
// ---------------------------------------------------------------------------

const groups = groupsByTitle();
const ring = groups['Ring'];
const cursor = groups['Cursor'];
const monitors = groups['Monitors'];
const integration = groups['Integration'];

const titles = Object.keys(groups).filter(t => t).sort().join(',');
check('prefs-groups', ring && cursor && monitors && integration,
    `groups found: ${titles || 'none'}`);

const gdkMonitors = Gdk.Display.get_default()
    ? Gdk.Display.get_default().get_monitors().get_n_items()
    : 0;

check('prefs-ring-rows', ring && rowsOf(ring).length === 3,
    `Ring rows: ${ring ? rowsOf(ring).length : 0} (want 3: temperature, brightness, radius)`);
check('prefs-cursor-rows', cursor && rowsOf(cursor).length === 3,
    `Cursor rows: ${cursor ? rowsOf(cursor).length : 0} (want 3: transparency, radius, fade)`);
check('prefs-integration-rows', integration && rowsOf(integration).length === 1,
    `Integration rows: ${integration ? rowsOf(integration).length : 0} (want 1: quick settings)`);
check('prefs-monitor-rows-count', monitors && rowsOf(monitors).length === gdkMonitors,
    `Monitors rows: ${monitors ? rowsOf(monitors).length : 0} (display reports ${gdkMonitors})`);

// ---------------------------------------------------------------------------
// color temperature slider: range, value, both bind directions
// ---------------------------------------------------------------------------

const scale = ring && findScale(ring);
const tempAdj = scale && scale.get_adjustment();
check('prefs-temp-slider',
    tempAdj && tempAdj.get_lower() === 2700 && tempAdj.get_upper() === 6500 &&
        tempAdj.get_step_increment() === 100 &&
        scale.get_digits() === 0 && scale.get_draw_value() && tempAdj.get_value() === 4000,
    `temp slider: lower=${tempAdj?.get_lower()} upper=${tempAdj?.get_upper()} step=${tempAdj?.get_step_increment()} value=${tempAdj?.get_value()} (want 2700/6500/100/4000)`);

if (tempAdj) {
    setValue(tempAdj, 3000);
    check('prefs-temp-widget-to-settings', getInt('ring-color-temperature') === 3000,
        `widget 3000 -> settings ${getInt('ring-color-temperature')}`);
    setInt('ring-color-temperature', 5500);
    check('prefs-temp-settings-to-widget', tempAdj.get_value() === 5500,
        `settings 5500 -> widget ${tempAdj.get_value()}`);
}

// ---------------------------------------------------------------------------
// SpinRows: range + both bind directions
// ---------------------------------------------------------------------------

const brightnessAdj = findSpinRow(ring, 'Brightness');
check('prefs-brightness-range',
    brightnessAdj && brightnessAdj.get_lower() === 0 && brightnessAdj.get_upper() === 100 &&
        brightnessAdj.get_value() === 42,
    `brightness: lower=${brightnessAdj?.get_lower()} upper=${brightnessAdj?.get_upper()} value=${brightnessAdj?.get_value()} (want 0/100/42)`);
if (brightnessAdj) {
    setValue(brightnessAdj, 58);
    check('prefs-brightness-widget-to-settings', getInt('brightness') === 58,
        `widget 58 -> settings ${getInt('brightness')}`);
    setInt('brightness', 75);
    check('prefs-brightness-settings-to-widget', brightnessAdj.get_value() === 75,
        `settings 75 -> widget ${brightnessAdj.get_value()}`);
}

const radiusAdj = findSpinRow(ring, 'Corner radius');
check('prefs-radius-range',
    radiusAdj && radiusAdj.get_lower() === 0 && radiusAdj.get_upper() === 200 &&
        radiusAdj.get_value() === 60,
    `radius: lower=${radiusAdj?.get_lower()} upper=${radiusAdj?.get_upper()} value=${radiusAdj?.get_value()} (want 0/200/60)`);
if (radiusAdj) {
    setValue(radiusAdj, 90);
    check('prefs-radius-widget-to-settings', getInt('ring-radius') === 90,
        `widget 90 -> settings ${getInt('ring-radius')}`);
    setInt('ring-radius', 120);
    check('prefs-radius-settings-to-widget', radiusAdj.get_value() === 120,
        `settings 120 -> widget ${radiusAdj.get_value()}`);
}

// ---------------------------------------------------------------------------
// cursor transparency switch + radius/fade sensitivity + ranges
// ---------------------------------------------------------------------------

const cursorEnabledRow = findRow(cursor, 'Cursor transparency');
check('prefs-cursor-transparency-seed', cursorEnabledRow && cursorEnabledRow.active === false,
    `cursor transparency seeded active=${cursorEnabledRow?.active} (want false)`);
if (cursorEnabledRow) {
    cursorEnabledRow.active = true;
    pump();
    check('prefs-cursor-transparency-widget-to-settings', settings.get_boolean('cursor-transparency') === true,
        `widget on -> settings ${settings.get_boolean('cursor-transparency')}`);
    setBool('cursor-transparency', false);
    check('prefs-cursor-transparency-settings-to-widget', cursorEnabledRow.active === false,
        `settings off -> widget ${cursorEnabledRow.active}`);
}

const cursorRadiusRow = findRow(cursor, 'Cursor radius');
const cursorFadeRow = findRow(cursor, 'Cursor fade');
// seeded cursor-transparency=false: both rows start insensitive
check('prefs-cursor-sensitivity-off',
    cursorRadiusRow && cursorFadeRow &&
        cursorRadiusRow.sensitive === false && cursorFadeRow.sensitive === false,
    `transparency off: radius.sensitive=${cursorRadiusRow?.sensitive} fade.sensitive=${cursorFadeRow?.sensitive} (want false/false)`);
setBool('cursor-transparency', true);
check('prefs-cursor-sensitivity-on',
    cursorRadiusRow && cursorFadeRow &&
        cursorRadiusRow.sensitive === true && cursorFadeRow.sensitive === true,
    `transparency on: radius.sensitive=${cursorRadiusRow?.sensitive} fade.sensitive=${cursorFadeRow?.sensitive} (want true/true)`);

const cursorRadiusAdj = cursorRadiusRow && cursorRadiusRow.get_adjustment();
check('prefs-cursor-radius-range',
    cursorRadiusAdj && cursorRadiusAdj.get_lower() === 0 && cursorRadiusAdj.get_upper() === 1000 &&
        cursorRadiusAdj.get_value() === 100,
    `cursor radius: lower=${cursorRadiusAdj?.get_lower()} upper=${cursorRadiusAdj?.get_upper()} value=${cursorRadiusAdj?.get_value()} (want 0/1000/100)`);
if (cursorRadiusAdj) {
    setValue(cursorRadiusAdj, 250);
    check('prefs-cursor-radius-widget-to-settings', getInt('cursor-radius') === 250,
        `widget 250 -> settings ${getInt('cursor-radius')}`);
    setInt('cursor-radius', 300);
    check('prefs-cursor-radius-settings-to-widget', cursorRadiusAdj.get_value() === 300,
        `settings 300 -> widget ${cursorRadiusAdj.get_value()}`);
}

const cursorFadeAdj = cursorFadeRow && cursorFadeRow.get_adjustment();
check('prefs-cursor-fade-range',
    cursorFadeAdj && cursorFadeAdj.get_lower() === 0 && cursorFadeAdj.get_upper() === 1000 &&
        cursorFadeAdj.get_value() === 30,
    `cursor fade: lower=${cursorFadeAdj?.get_lower()} upper=${cursorFadeAdj?.get_upper()} value=${cursorFadeAdj?.get_value()} (want 0/1000/30)`);
if (cursorFadeAdj) {
    setValue(cursorFadeAdj, 45);
    check('prefs-cursor-fade-widget-to-settings', getInt('cursor-fade') === 45,
        `widget 45 -> settings ${getInt('cursor-fade')}`);
    setInt('cursor-fade', 60);
    check('prefs-cursor-fade-settings-to-widget', cursorFadeAdj.get_value() === 60,
        `settings 60 -> widget ${cursorFadeAdj.get_value()}`);
}

// ---------------------------------------------------------------------------
// quick settings switch
// ---------------------------------------------------------------------------

const quickRow = findRow(integration, 'Show in Quick Settings');
check('prefs-quick-settings-seed', quickRow && quickRow.active === true,
    `quick settings seeded active=${quickRow?.active} (want true)`);
if (quickRow) {
    quickRow.active = false;
    pump();
    check('prefs-quick-settings-widget-to-settings',
        settings.get_boolean('show-quick-settings-toggle') === false,
        `widget off -> settings ${settings.get_boolean('show-quick-settings-toggle')}`);
    setBool('show-quick-settings-toggle', true);
    check('prefs-quick-settings-settings-to-widget', quickRow.active === true,
        `settings on -> widget ${quickRow.active}`);
}

// ---------------------------------------------------------------------------
// per-monitor exclusion rows: one SwitchRow per connector, toggling updates
// the excluded-monitors string list (rows are not bound back from settings)
// ---------------------------------------------------------------------------

if (monitors) {
    const rows = rowsOf(monitors);
    const conns = rows.map(r => r.title);
    const gdkConns = [];
    for (let i = 0; i < gdkMonitors; i++)
        gdkConns.push(Gdk.Display.get_default().get_monitors().get_item(i).get_connector());
    check('prefs-monitor-titles', JSON.stringify(conns) === JSON.stringify(gdkConns),
        `connectors ${JSON.stringify(conns)} (display: ${JSON.stringify(gdkConns)})`);

    const seededExcluded = settings.get_strv('excluded-monitors');
    check('prefs-monitor-seed-active', rows.every(r => r.active === true),
        `all rows active with excluded-monitors=[] (got ${JSON.stringify(seededExcluded)})`);

    if (rows.length > 0) {
        const target = rows[0].title;
        rows[0].active = false;
        pump();
        const excluded = settings.get_strv('excluded-monitors');
        check('prefs-monitor-toggle-off', excluded.length === 1 && excluded[0] === target,
            `toggle off -> excluded-monitors ${JSON.stringify(excluded)} (want ["${target}"])`);
        rows[0].active = true;
        pump();
        check('prefs-monitor-toggle-on', settings.get_strv('excluded-monitors').length === 0,
            `toggle on -> excluded-monitors [] (got ${JSON.stringify(settings.get_strv('excluded-monitors'))})`);
    }
}

// ---------------------------------------------------------------------------

const count = results.filter(r => r.ok).length;
print(`SUMMARY|${count}|${results.length}`);
if (failed)
    print('FAILED');
else
    print('PASSED');
