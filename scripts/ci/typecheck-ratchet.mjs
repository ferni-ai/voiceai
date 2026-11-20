/**
 * Shared by the typecheck ratchets (cli-typecheck-ratchet.mjs,
 * web-tests-typecheck-ratchet.mjs): run tsc over code no plain typecheck
 * covers, count the `error TS` lines in the files it owns, and fail if the
 * count rises above the committed baseline. Errors may only go down.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/** The `error TS` lines whose path starts with one of `prefixes`. */
export function errorsUnder(output, prefixes) {
  return output
    .split('\n')
    .filter((l) => prefixes.some((p) => l.startsWith(p)) && / error TS\d+:/.test(l));
}

/**
 * A tsc that crashes (OOM, signal) prints no `error TS` lines and would read as
 * "0 errors". Only exit 0 with no errors, or exit 1/2 with errors, is a result.
 * Neither is an `error TS` line with no file (a bad option or tsconfig, no inputs):
 * tsc may have checked nothing. With `mustCheck` (tsc run with --listFiles), the
 * listed files must include one it matches, so a tsconfig that stops including the
 * counted files can't read as every error fixed.
 */
export function typecheckVerdict(
  { status, signal, output },
  baseline,
  { errorsOf, label, update, mustCheck }
) {
  const anyErrors = / error TS\d+:/.test(output);
  const finished = !signal && (status === 0 || ((status === 1 || status === 2) && anyErrors));
  if (!finished) {
    return {
      ok: false,
      count: null,
      message: `tsc did not finish (status ${status}, signal ${signal}).`,
    };
  }
  const configError = output.split('\n').find((l) => /^error TS\d+:/.test(l));
  if (configError) return { ok: false, count: null, message: `tsc could not run: ${configError}` };
  if (mustCheck && !output.split('\n').some((l) => mustCheck.test(l))) {
    return { ok: false, count: null, message: `tsc checked no file matching ${mustCheck}.` };
  }
  const count = errorsOf(output).length;
  if (count > baseline) {
    return {
      ok: false,
      count,
      message: `${label} rose from ${baseline} to ${count}. Fix the new ones.`,
    };
  }
  const hint = count < baseline ? ` Lower the baseline: ${update}` : '';
  return { ok: true, count, message: `${label}: ${count} (baseline ${baseline}).${hint}` };
}

/**
 * Runs tsc with `args` in `cwd`, then checks (or, with --update, rewrites) the
 * `{ "errors": n }` baseline file. `verdict` is the script's own
 * `(run, baseline) => typecheckVerdict(...)`.
 */
export function runTypecheckRatchet({ cwd, args, baselineFile, errorsOf, verdict }) {
  const r = spawnSync('npx', ['tsc', ...args], {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
  });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const baseline = JSON.parse(readFileSync(baselineFile, 'utf-8')).errors;
  const v = verdict({ status: r.status, signal: r.signal, output }, baseline);

  if (process.argv.includes('--update')) {
    if (v.count === null) {
      console.error(v.message);
      process.exit(1);
    }
    writeFileSync(baselineFile, `${JSON.stringify({ errors: v.count }, null, 2)}\n`);
    console.log(`Baseline set to ${v.count}.`);
    return;
  }
  console.log(v.message);
  if (!v.ok) {
    console.log(errorsOf(output).slice(0, 50).join('\n'));
    process.exit(1);
  }
}
