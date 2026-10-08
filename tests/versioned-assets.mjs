// Files asked for with ?v= are kept by the browser for a year without asking again (server/create-server.cjs, 2026-10-07).
// tools/versioned-assets.json records each one's ?v= and a fingerprint of its contents (tools/sync-versions.cjs): a file that
// changed while its ?v= stayed the same would reach past visitors only a year later, so this fails until the ?v= changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const {current, compare, read} = require('../tools/sync-versions.cjs');

const now = current(), {stale, forgot} = compare(read(), now);
assert.deepEqual(forgot, [], 'a versioned file changed and its ?v= did not: change the ?v=, then run node tools/sync-versions.cjs');
assert.deepEqual(stale, [], 'tools/versioned-assets.json out of date: run node tools/sync-versions.cjs');

// What it covers: every 3D model, every gallery view and every font.
const files = Object.keys(now);
for (const m of fs.readFileSync(path.join(root, 'dist/asset-models.js'), 'utf8').matchAll(/'\.\/(assets\/models\/[\w-]+\.glb)\?v=([\w.-]+)'/g)) assert.equal(now[m[1]]?.v, m[2], `${m[1]} recorded with ?v=${m[2]}`);
for (const name of fs.readdirSync(path.join(root, 'dist/assets/vistas'))) assert(files.includes(`assets/vistas/${name}`), `assets/vistas/${name} recorded`);
for (const name of fs.readdirSync(path.join(root, 'dist/assets/fonts')).filter(f => f.endsWith('.woff2'))) assert(files.includes(`assets/fonts/${name}`), `assets/fonts/${name} recorded`);

// The rule itself.
const before = {'assets/a.glb': {v: '1', sha256: 'aaaa'}};
assert.equal(compare(before, {'assets/a.glb': {v: '1', sha256: 'bbbb'}}).forgot.length, 1, 'changed, same ?v=: caught');
assert.deepEqual(compare(before, {'assets/a.glb': {v: '2', sha256: 'bbbb'}}), {stale: ['assets/a.glb: ?v=1 → ?v=2'], forgot: []}, 'changed with a new ?v=: only to record');
assert.deepEqual(compare(before, before), {stale: [], forgot: []});
assert.equal(compare(before, {}).stale.length, 1, 'no longer versioned: to record');
assert.equal(compare({}, before).stale.length, 1, 'newly versioned: to record');

console.log(`PASS: versioned-assets — ${files.length} files with ?v= (models, gallery views, fonts) recorded with their contents; none changed without a new ?v=.`);
