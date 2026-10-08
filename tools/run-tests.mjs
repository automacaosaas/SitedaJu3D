#!/usr/bin/env node
// Runs every suite in tests/ one after another (each is a plain Node script) and stops with an error if any fails.
//   npm test            → all suites
//   npm test -- carousel → only suites whose file name contains "carousel"
//   TEST_SKIP=model-details,other npm test → all but the suites whose name contains one of these (the own server's
//   deploy skips the slow 3D-model suite, which the GitHub check already runs; deploy/deploy.sh)
import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const dir = fileURLToPath(new URL('../tests/', import.meta.url));
const filter = process.argv[2] || '';
const skip = String(process.env.TEST_SKIP || '').split(',').map(s => s.trim()).filter(Boolean);
const matching = readdirSync(dir).filter(f => /\.(mjs|cjs)$/.test(f) && f.includes(filter)).sort();
const skipped = matching.filter(f => skip.some(s => f.includes(s)));
const suites = matching.filter(f => !skipped.includes(f));
if (!suites.length) { console.error(`Nenhuma suíte em tests/ contém "${filter}"${skipped.length ? ` fora as puladas (TEST_SKIP: ${skipped.join(', ')})` : ''}.`); process.exit(1); }
for (const suite of skipped) console.log(`pulada ${suite} (TEST_SKIP)`);

const failed = [];
for (const suite of suites) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [dir + suite], {encoding: 'utf8'});
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status === 0) console.log(`ok    ${suite} (${seconds}s)`);
  else { failed.push(suite); console.log(`FALHA ${suite} (${seconds}s)\n${(result.stdout + result.stderr).trim().split('\n').slice(-15).join('\n')}\n`); }
}
console.log(`\n${suites.length - failed.length}/${suites.length} suítes passaram${skipped.length ? ` (${skipped.length} pulada${skipped.length > 1 ? 's' : ''}: ${skipped.join(', ')})` : ''}.`);
process.exit(failed.length ? 1 : 0);
