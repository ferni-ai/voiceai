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
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const BASELINE = join(ROOT, 'apps/cli/tsc-error-baseline.json');

export function cliErrors(output) {
  return output.split('\n').filter((l) => l.startsWith('apps/cli/src/') && / error TS\d+:/.test(l));
}

/**
 * A tsc that crashes (OOM, signal) prints no `error TS` lines and would read as
 * "0 errors". Only exit 0 with no errors, or exit 1/2 with errors, is a result.
 */
export function verdict({ status, signal, output }, baseline) {
  const errors = cliErrors(output);
  const anyErrors = / error TS\d+:/.test(output);
  const finished = !signal && (status === 0 || ((status === 1 || status === 2) && anyErrors));
  if (!finished) {
    return {
      ok: false,
      count: null,
      message: `tsc did not finish (status ${status}, signal ${signal}).`,
    };
  }
  const count = errors.length;
  if (count > baseline) {
    return {
      ok: false,
      count,
      message: `apps/cli typecheck errors rose from ${baseline} to ${count}. Fix the new ones.`,
    };
  }
  const hint =
    count < baseline
      ? ` Lower the baseline: node scripts/ci/cli-typecheck-ratchet.mjs --update`
      : '';
  return {
    ok: true,
    count,
    message: `apps/cli typecheck errors: ${count} (baseline ${baseline}).${hint}`,
  };
}

function main() {
  const r = spawnSync(
    'npx',
    ['tsc', '--noEmit', '-p', 'apps/cli', '--rootDir', '.', '--pretty', 'false'],
    {
      cwd: ROOT,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
    }
  );
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf-8')).errors;
  const v = verdict({ status: r.status, signal: r.signal, output }, baseline);

  if (process.argv.includes('--update')) {
    if (v.count === null) {
      console.error(v.message);
      process.exit(1);
    }
    writeFileSync(BASELINE, `${JSON.stringify({ errors: v.count }, null, 2)}\n`);
    console.log(`Baseline set to ${v.count}.`);
    return;
  }
  console.log(v.message);
  if (!v.ok) {
    console.log(cliErrors(output).slice(0, 50).join('\n'));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
