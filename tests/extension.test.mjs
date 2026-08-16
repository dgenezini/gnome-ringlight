// Ring Light extension checks. Zero deps: node:test + node's stdlib.
// Run: node --test tests/extension.test.mjs
//
// Covers what's testable without a live GNOME Shell:
//   - syntax of the GJS entry points (node --check parses without imports)
//   - metadata.json sanity
//   - every GSettings key referenced in code exists in the gschema XML
//   - schemas/gschemas.compiled is in sync with the XML (stale binary = settings silently ignored)
//   - temperatureToRGB pure function (extracted from extension.js source, no GJS import)
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, mkdirSync, mkdtempSync, cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');

const SCHEMA_XML = 'schemas/org.gnome.shell.extensions.ringlight.gschema.xml';
const SCHEMA_BINARY = 'schemas/gschemas.compiled';

test('syntax: node --check parses extension.js and prefs.js', () => {
    // GJS gi:// imports are never resolved at parse time. --check on a bare
    // .js file is a no-op when node detects ESM (import/export present), so
    // force ESM via --input-type=module over stdin — that path really parses.
    for (const f of ['extension.js', 'prefs.js'])
        execFileSync(process.execPath, ['--input-type=module', '--check', '-'], {
            input: read(f),
            cwd: ROOT,
        });
});

test('metadata.json is sane', () => {
    const meta = JSON.parse(read('metadata.json'));
    assert.ok(meta.uuid, 'uuid missing');
    assert.ok(Array.isArray(meta['shell-version']) && meta['shell-version'].length > 0,
        'shell-version must be a non-empty array');
    assert.equal(meta['settings-schema'], 'org.gnome.shell.extensions.ringlight');
});

test('every GSettings key referenced in code exists in the schema XML', () => {
    const xmlKeys = new Set(
        [...read(SCHEMA_XML).matchAll(/<key name="([^"]+)"/g)].map(m => m[1]));
    const code = read('extension.js') + read('prefs.js');
    const refs = [
        ...code.matchAll(/(?:get_string|get_int|get_boolean|set_string|bind)\(\s*'([\w-]+)'/g),
        ...code.matchAll(/changed::([\w-]+)/g),
    ].map(m => m[1]);
    assert.ok(refs.length > 0, 'no settings keys found in code');
    for (const key of new Set(refs))
        assert.ok(xmlKeys.has(key), `key '${key}' referenced in code but missing from gschema XML`);
});

test('schemas/gschemas.compiled matches the current XML', () => {
    const tmp = join(mkdtempSync(join(tmpdir(), 'ringlight-schema-')), 'schemas');
    mkdirSync(tmp);
    cpSync(join(ROOT, SCHEMA_XML), join(tmp, 'org.gnome.shell.extensions.ringlight.gschema.xml'));
    try {
        execFileSync('glib-compile-schemas', [tmp]);
    } catch (e) {
        throw new Error(`glib-compile-schemas failed (install libglib2.0-bin): ${e.message}`);
    }
    assert.deepEqual(readFileSync(join(ROOT, SCHEMA_BINARY)),
        readFileSync(join(tmp, 'gschemas.compiled')),
        'gschemas.compiled is stale — run `glib-compile-schemas schemas/` and commit the binary');
});

// Pull temperatureToRGB out of extension.js so node can test it without
// importing GJS modules. Fails loudly if the function moves or renames.
function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `'function ${name}(' not found in extension.js`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{')
            depth++;
        else if (source[i] === '}' && --depth === 0)
            return source.slice(start, i + 1);
    }
    throw new Error(`unbalanced braces in ${name}`);
}

const temperatureToRGB = eval(`(${extractFunction(read('extension.js'), 'temperatureToRGB')})`);

test('temperatureToRGB: warm end is yellow-ish, cool end is white', () => {
    const warm = temperatureToRGB(2700);
    assert.equal(warm[0], 255, 'red always max in range');
    assert.ok(warm[2] < 255, `blue below max at 2700 K, got ${warm}`);
    assert.ok(warm[1] < 255 && warm[1] >= 0, `green in range at 2700 K, got ${warm}`);
    const cool = temperatureToRGB(6500);
    assert.ok(cool.every(v => v >= 240), `6500 K should be near-white, got ${cool}`);
});

test('temperatureToRGB: output clamped to 0-255 and monotonic across range', () => {
    const samples = [];
    for (let k = 2700; k <= 6500; k += 100)
        samples.push([k, temperatureToRGB(k)]);
    for (const [k, [r, g, b]] of samples) {
        for (const v of [r, g, b])
            assert.ok(Number.isInteger(v) && v >= 0 && v <= 255,
                `${k} K component ${v} out of 0-255`);
    }
    for (let i = 1; i < samples.length; i++) {
        assert.ok(samples[i][1][1] >= samples[i - 1][1][1], 'green must not decrease with temperature');
        assert.ok(samples[i][1][2] >= samples[i - 1][1][2], 'blue must not decrease with temperature');
    }
});

test('temperatureToRGB: piecewise blue branches at their boundaries', () => {
    assert.equal(temperatureToRGB(1900)[2], 0, 'blue forced to 0 at t<=19 (1900 K)');
    assert.equal(temperatureToRGB(1899)[2], 0, 'blue stays 0 below 1900 K');
    assert.equal(temperatureToRGB(6600)[2], 255, 'blue forced to 255 at t>=66 (6600 K)');
    assert.equal(temperatureToRGB(7000)[2], 255, 'blue stays 255 past 6600 K');
    assert.ok(temperatureToRGB(6600)[2] > temperatureToRGB(6500)[2],
        'blue jumps up at the 6600 K boundary');
});

const ringVisible = eval(`(${extractFunction(read('extension.js'), 'ringVisible')})`);

test('ringVisible truth table: off never, always always, auto follows camera', () => {
    assert.equal(ringVisible('off', true), false);
    assert.equal(ringVisible('off', false), false);
    assert.equal(ringVisible('always', true), true);
    assert.equal(ringVisible('always', false), true);
    assert.equal(ringVisible('auto', true), true);
    assert.equal(ringVisible('auto', false), false);
});

test('schema ring-mode default is a known RING_MODES key', () => {
    const modes = eval(`(${read('extension.js').match(/const RING_MODES = (\{[^}]+\})/)[1]})`);
    const def = read(SCHEMA_XML).match(/<key name="ring-mode"[\s\S]*?<default>'([^']+)'/)[1];
    assert.ok(def in modes,
        `schema default ring-mode '${def}' missing from RING_MODES in extension.js`);
});

test('prefs slider bounds match schema ranges', () => {
    // bounds are duplicated: Gtk.Adjustment lower/upper in prefs.js, <range> in
    // the gschema XML. Drift = UI lets the user pick a value the schema rejects.
    const bounds = s => [...s.matchAll(/lower: (\d+),\s*upper: (\d+)/g)]
        .map(m => `${m[1]},${m[2]}`).sort();
    const ranges = s => [...s.matchAll(/<range min="(\d+)" max="(\d+)"/g)]
        .map(m => `${m[1]},${m[2]}`).sort();
    assert.deepEqual(bounds(read('prefs.js')), ranges(read(SCHEMA_XML)),
        'prefs slider bounds and gschema ranges drifted apart — update both');
});
