/**
 * Outreach delivery-intent assert for the remember/reach-out integration sprint (S5).
 *
 * Usage:
 *   node scripts/ops/assert-outreach-delivery-intent.mjs
 *
 * Runs `apps/async/src/outreach/__tests__/delivery-adapter.test.ts` (Task 4 coverage for
 * the terminal delivery-adapter dry-run path) and exits non-zero on failure so the
 * release gate catches regressions. Channel credentials (Twilio/FCM) are out of scope —
 * this only proves the delivery-intent plumbing, not live sends.
 *
 * Note: `apps/async` has its own `vitest.config.ts` and is excluded from the root
 * vitest project, so this must run with cwd=apps/async (not root + full path).
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const asyncDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/async');
const result = spawnSync(
  'pnpm',
  ['vitest', 'run', 'src/outreach/__tests__/delivery-adapter.test.ts'],
  { cwd: asyncDir, encoding: 'utf8' }
);
const ok = result.status === 0;
console.log(JSON.stringify({ ok, name: 'outreach-delivery-intent', status: result.status }));
process.exit(ok ? 0 : 1);
