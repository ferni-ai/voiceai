/**
 * Human-signal round-trip assert for the remember/reach-out integration sprint (S5).
 *
 * Usage:
 *   node scripts/ops/assert-human-signal-roundtrip.mjs
 *
 * Runs `src/memory/__tests__/human-signal-roundtrip.test.ts` (Task 2 coverage for
 * `mergeHumanSignalSources` + `persistHumanSignals` shard/mirror round-trip) and exits
 * non-zero on failure so the release gate catches regressions.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const result = spawnSync(
  'pnpm',
  ['vitest', 'run', 'src/memory/__tests__/human-signal-roundtrip.test.ts'],
  { cwd: root, encoding: 'utf8' }
);
const ok = result.status === 0;
console.log(JSON.stringify({ ok, name: 'human-signal-roundtrip', status: result.status }));
process.exit(ok ? 0 : 1);
