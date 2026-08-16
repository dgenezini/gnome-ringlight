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
    // --check takes one file; GJS gi:// imports are never resolved at parse time
    for (const f of ['extension.js', 'prefs.js'])
        execFileSync(process.execPath, ['--check', f], {cwd: ROOT});
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
