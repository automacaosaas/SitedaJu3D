// mapLimit: results in the order of the items, never more than the limit in flight, parallel up to it, empty lists,
// odd limits and the first error rejecting the run. Also the index the order list needs (db/migrations).
// Run: node tests/concurrency.mjs — no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {mapLimit} = require('../api/_lib/concurrency');
const {statements} = require('../api/_lib/migrate');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Counts how many calls run at once; each one waits a little, longer for the first items so they finish out of order.
function tracker() {
  const t = {active: 0, peak: 0, calls: 0};
  t.fn = async (item, index) => { t.calls++; t.active++; t.peak = Math.max(t.peak, t.active); await wait(20 - index); t.active--; return item * 10; };
  return t;
}

{
  const t = tracker();
  assert.deepEqual(await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, t.fn), [10, 20, 30, 40, 50, 60, 70], 'results in the order of the items');
  assert.equal(t.peak, 3, 'never more than the limit at once, and really parallel up to it');
  assert.equal(t.calls, 7, 'each item once');
}
{
  const t = tracker();
  assert.deepEqual(await mapLimit([1, 2], 5, t.fn), [10, 20]); assert.equal(t.peak, 2, 'no more workers than items');
}
{
  const t = tracker();
  assert.deepEqual(await mapLimit([], 3, t.fn), []); assert.equal(t.calls, 0, 'an empty list calls nothing');
  for (const limit of [0, -1, NaN, undefined, 'x']) {
    const s = tracker();
    assert.deepEqual(await mapLimit([1, 2, 3], limit, s.fn), [10, 20, 30]); assert.equal(s.peak, 1, `limit ${String(limit)} runs one at a time`);
  }
  const fromSet = tracker();
  assert.deepEqual(await mapLimit(new Set([4, 5]), 2, fromSet.fn), [40, 50], 'any iterable');
}
{
  const started = Date.now();
  await mapLimit([1, 2, 3, 4, 5, 6], 6, () => wait(50));
  assert(Date.now() - started < 200, 'six calls of 50 ms in parallel take about 50 ms, not 300');
}
await assert.rejects(mapLimit([1, 2, 3], 2, async item => { if (item === 2) throw new Error('boom'); return item; }), /boom/, 'the first error rejects the run');

// The panel lists orders by created_at (newest first): the index that lets MySQL stop at the limit.
{
  const sql = fs.readFileSync(path.join(root, 'db/migrations/010_pedidos_lista.sql'), 'utf8');
  assert.deepEqual(statements(sql), ['ALTER TABLE orders ADD KEY ix_orders_created (created_at)']);
  assert.match(fs.readFileSync(path.join(root, 'api/_lib/store-mysql.js'), 'utf8'), /FROM orders WHERE status IN \([^`]*ORDER BY created_at DESC LIMIT/, 'the query the index serves');
}

console.log('PASS: concurrency — mapLimit keeps the order, caps the calls in flight and runs in parallel up to the cap; the index for the order list.');
