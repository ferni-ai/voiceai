#!/usr/bin/env node
/**
 * Web tests typecheck ratchet. apps/web/tsconfig.json covers src/ only, so
 * apps/web/tests was never typechecked (2026-11-12: 503 errors in 103 files).
 * This runs tsc over apps/web/tsconfig.tests.json and fails if the number of
 * errors in apps/web/tests rises above the committed baseline. Errors may only
 * go down.
 *
 *   node scripts/ci/web-tests-typecheck-ratchet.mjs           # check
 *   node scripts/ci/web-tests-typecheck-ratchet.mjs --update  # write the current count
 *
 * Counted: `error TS` lines in tests/ (tsc runs in apps/web, so paths start
 * with tests/). Tests that import root src/ pull ~1,300 root files in, and
 * those report thousands of errors under the web options (noUncheckedIndexedAccess
 * is on here, off at the root). Those are the root typecheck's job, not counted.
 */
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { errorsUnder, runTypecheckRatchet, typecheckVerdict } from './typecheck-ratchet.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const BASELINE = join(ROOT, 'apps/web/tests-tsc-error-baseline.json');

export const webTestErrors = (output) => errorsUnder(output, ['tests/']);

export const verdict = (run, baseline) =>
  typecheckVerdict(run, baseline, {
    errorsOf: webTestErrors,
    label: 'apps/web/tests typecheck errors',
    update: 'node scripts/ci/web-tests-typecheck-ratchet.mjs --update',
    mustCheck: /\/apps\/web\/tests\/.+\.ts$/,
  });

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTypecheckRatchet({
    cwd: join(ROOT, 'apps/web'),
    args: ['--noEmit', '-p', 'tsconfig.tests.json', '--pretty', 'false', '--listFiles'],
    baselineFile: BASELINE,
    errorsOf: webTestErrors,
    verdict,
  });
}
