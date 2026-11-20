#!/usr/bin/env node
/**
 * CLI typecheck ratchet. The root tsconfig covers src/** only, so apps/cli was
 * never typechecked (CLI audit 2026-10-17: 308 errors). This runs
 * `tsc -p apps/cli` and fails if the number of errors in apps/cli/src rises
 * above the committed baseline. Errors may only go down.
 *
 *   node scripts/ci/cli-typecheck-ratchet.mjs           # check
 *   node scripts/ci/cli-typecheck-ratchet.mjs --update  # write the current count
 *
 * Counted: `error TS` lines in apps/cli/src. Root src/ files the CLI imports are
 * the root typecheck's job. `--rootDir .` stops tsc reporting every one of
 * those imports as outside rootDir (TS6059), which is noise for --noEmit.
 */
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { errorsUnder, runTypecheckRatchet, typecheckVerdict } from './typecheck-ratchet.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const BASELINE = join(ROOT, 'apps/cli/tsc-error-baseline.json');

export const cliErrors = (output) => errorsUnder(output, ['apps/cli/src/']);

export const verdict = (run, baseline) =>
  typecheckVerdict(run, baseline, {
    errorsOf: cliErrors,
    label: 'apps/cli typecheck errors',
    update: 'node scripts/ci/cli-typecheck-ratchet.mjs --update',
  });

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTypecheckRatchet({
    cwd: ROOT,
    args: ['--noEmit', '-p', 'apps/cli', '--rootDir', '.', '--pretty', 'false'],
    baselineFile: BASELINE,
    errorsOf: cliErrors,
    verdict,
  });
}
