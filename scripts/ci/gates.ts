#!/usr/bin/env npx tsx
/**
 * The quality gates, as one list (gates.json beside this file) run one way by CI's Quality
 * Gates job, by .husky/pre-push and by anyone asking "would CI pass?" before a push.
 *
 * Until 2026-11-27 pre-push ran 3 of the 16 checks CI ran, and lanes hand-copied the rest
 * into private scripts that drifted. Each gap cost a CI round trip, often in the merge queue,
 * where one failure also ejects the PRs queued with it.
 *
 *   pnpm gates             every gate: what CI's Quality Gates job runs
 *   pnpm gates --pre-push  the gates marked prePush (seconds each, local, no network or token)
 *
 * Every selected gate runs even after one fails, so one push shows every failure. In GitHub
 * Actions each gate is one log group and a failure one ::error; locally each gate writes its
 * own log, named when it fails. A gate gets the GitHub token only if its entry lists it in
 * `env`, so one step can run them all without handing the token to each. Some gates read the
 * gitignored lists: run it after `pnpm install` (or `pnpm gen:lists`).
 *
 * @module scripts/ci/gates
 */
import { spawnSync, type StdioOptions } from 'child_process';
import { closeSync, mkdtempSync, openSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

export interface Gate {
  name: string;
  /** argv, run without a shell from the repo root. */
  run: string[];
  prePush: boolean;
  /** Printed with a failure: the fix, or why the gate is (not) in the pre-push set. */
  why?: string;
  /** Token variables this gate may read; every other gate runs without them. */
  env?: string[];
}

export const GATES_FILE = join(dirname(fileURLToPath(import.meta.url)), 'gates.json');
export const TOKEN_VARS = ['GH_TOKEN', 'GITHUB_TOKEN'];
/** Today's three pre-push gates took ≈8 s; past this, move the slowest gate to CI only. */
export const PRE_PUSH_BUDGET_SECONDS = 30;

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s !== '');

/** Parses gates.json; throws on any entry this runner can't run exactly as written. */
export function readGates(text: string): Gate[] {
  const list: unknown = JSON.parse(text);
  if (!Array.isArray(list) || list.length === 0) throw new Error('gates.json: not a list');
  const seen = new Set<string>();
  return list.map((raw, i) => {
    const g = raw as Partial<Gate>;
    const bad = (what: string): Error => new Error(`gates.json entry ${i}: ${what}`);
    if (typeof g?.name !== 'string' || g.name === '') throw bad('no name');
    if (seen.has(g.name)) throw bad(`duplicate name ${g.name}`);
    seen.add(g.name);
    if (!isStrings(g.run)) throw bad('run must be a non-empty list of strings');
    if (typeof g.prePush !== 'boolean') throw bad('prePush must be true or false');
    if (g.why !== undefined && (typeof g.why !== 'string' || g.why === '')) throw bad('empty why');
    if (g.env !== undefined && !isStrings(g.env)) throw bad('env must be a list of names');
    return { ...g, name: g.name, run: g.run, prePush: g.prePush };
  });
}

export const selectGates = (gates: readonly Gate[], prePush: boolean): Gate[] =>
  gates.filter((g) => !prePush || g.prePush);

export function gateEnv(gate: Gate, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const name of TOKEN_VARS) if (!gate.env?.includes(name)) delete out[name];
  return out;
}

/** `code` 0 passes; anything else fails, null (killed, never started) included. */
export type GateResult = { code: number | null; detail?: string; log?: string };
export type ExecGate = (gate: Gate, env: NodeJS.ProcessEnv) => GateResult;

/** Runs a gate as a child process; with `logDir`, its output goes to a file there. */
export const execGate =
  (logDir?: string): ExecGate =>
  (gate, env) => {
    const [cmd, ...args] = gate.run as [string, ...string[]];
    const log = logDir && join(logDir, `${gate.name.replace(/\W+/g, '-').toLowerCase()}.log`);
    const fd = log ? openSync(log, 'w') : undefined;
    try {
      const stdio: StdioOptions = fd === undefined ? 'inherit' : ['ignore', fd, fd];
      const r = spawnSync(cmd, args, { env, stdio });
      const detail = r.error?.message ?? (r.signal ? `killed by ${r.signal}` : undefined);
      return { code: r.status, detail, log: log || undefined };
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  };

export interface RunDeps {
  exec: ExecGate;
  env: NodeJS.ProcessEnv;
  print: (line: string) => void;
  now?: () => number;
}

/** Runs every gate in order, whatever fails, and returns the names of those that failed. */
export function runGates(gates: readonly Gate[], deps: RunDeps): string[] {
  const { exec, env, print, now = Date.now } = deps;
  const ci = Boolean(env.GITHUB_ACTIONS);
  const failed: string[] = [];
  for (const gate of gates) {
    const started = now();
    if (ci) print(`::group::${gate.name}`);
    const r = exec(gate, gateEnv(gate, env));
    if (ci) print('::endgroup::');
    const took = `${((now() - started) / 1000).toFixed(1)} s`;
    if (r.code === 0) {
      print(`  ✅ ${gate.name} (${took})`);
      continue;
    }
    failed.push(gate.name);
    const how = `${r.detail ?? `exit ${r.code}`}${r.log ? `, output in ${r.log}` : ''}`;
    const why = gate.why ? ` ${gate.why}` : '';
    // A `:` or `,` in an annotation property ends it early (GitHub's escaping).
    const title = gate.name.replace(/%/g, '%25').replace(/:/g, '%3A').replace(/,/g, '%2C');
    const local = `  ❌ ${gate.name} (${took}, ${how}).${why}`;
    print(ci ? `::error title=${title}::${how}.${why}` : local);
  }
  return failed;
}

/** The command: returns the exit code (0 all passed, 1 a gate failed, 2 usage). */
export function main(args: string[], deps: RunDeps & { gates: readonly Gate[] }): number {
  if (args.some((a) => a !== '--pre-push')) {
    deps.print('usage: pnpm gates [--pre-push]');
    return 2;
  }
  const prePush = args.length > 0;
  const gates = selectGates(deps.gates, prePush);
  const now = deps.now ?? Date.now;
  const started = now();
  const failed = runGates(gates, deps);
  const seconds = (now() - started) / 1000;
  if (prePush && seconds > PRE_PUSH_BUDGET_SECONDS) {
    deps.print(
      `  ⚠️  pre-push gates took ${seconds.toFixed(0)} s, over the budget of ` +
        `${PRE_PUSH_BUDGET_SECONDS} s: set the slowest one prePush: false in scripts/ci/gates.json.`
    );
  }
  const summary = failed.length
    ? `${failed.length} of ${gates.length} failed: ${failed.join(', ')}`
    : `all ${gates.length} passed`;
  deps.print(`gates: ${summary} (${seconds.toFixed(1)} s).`);
  return failed.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ci = Boolean(process.env.GITHUB_ACTIONS);
  process.exitCode = main(process.argv.slice(2), {
    gates: readGates(readFileSync(GATES_FILE, 'utf8')),
    exec: execGate(ci ? undefined : mkdtempSync(join(tmpdir(), 'gates-'))),
    env: process.env,
    print: (line) => process.stdout.write(`${line}\n`),
  });
}
