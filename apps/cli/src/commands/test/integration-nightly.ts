/**
 * Nightly integration smoke: `test-all-integrations.ts --nightly`.
 *
 * Read-only probes of every external integration (integration-probes.ts),
 * compared with what we expect of each in scripts/ops/integration-expected.json
 * (`working` or `unavailable`). Exit 0 only when every probe matches, with one
 * summary line; exit 1 when any does not, and the summary names them; exit 2
 * when the harness could not run (unreadable expectations, `--live`).
 *
 * A job that cannot go red proves nothing. The integration audit (2026-10-29)
 * found Spotify's refresh token revoked since 10-22 with every dashboard green.
 * A probe failing where `working` is expected turns this red until the
 * integration is fixed or the expectation is changed on purpose; a probe
 * passing where `unavailable` is expected turns it red too (stale baseline).
 *
 * @module commands/test/integration-nightly
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export type ProbeState = 'working' | 'unavailable';
export type Env = Readonly<Record<string, string | undefined>>;
export interface ProbeOutcome {
  ok: boolean;
  /** Status codes and provider error codes only, never a secret or a URL. */
  detail: string;
}
export interface Probe {
  id: string;
  /** Env vars the probe needs; if one is unset the integration is unavailable (not configured). */
  needs: readonly string[];
  /** Read-only: a GET, a search or a token endpoint. Never a send, a play, a call or a write. */
  run: (env: Env) => Promise<ProbeOutcome>;
}
export interface ProbeResult {
  id: string;
  state: ProbeState;
  detail: string;
}
export type Expected = Readonly<Record<string, { state: ProbeState; why?: string }>>;
export interface Anomaly {
  id: string;
  kind: 'regression' | 'stale-baseline' | 'no-expectation' | 'no-probe';
  detail: string;
}

export const EXPECTED_PATH = fileURLToPath(
  new URL('../../../../../scripts/ops/integration-expected.json', import.meta.url)
);
const PROBE_TIMEOUT_MS = 15_000;

export async function runProbe(probe: Probe, env: Env): Promise<ProbeResult> {
  const missing = probe.needs.filter((name) => !env[name]);
  if (missing.length > 0) {
    return { id: probe.id, state: 'unavailable', detail: `not configured: ${missing.join(', ')}` };
  }
  const timeout = new Promise<ProbeOutcome>((resolve) =>
    setTimeout(() => resolve({ ok: false, detail: 'timeout' }), PROBE_TIMEOUT_MS).unref()
  );
  try {
    const { ok, detail } = await Promise.race([probe.run(env), timeout]);
    return { id: probe.id, state: ok ? 'working' : 'unavailable', detail };
  } catch (error) {
    // A message can carry the request URL and some URLs carry a key: name the class only.
    return { id: probe.id, state: 'unavailable', detail: `threw ${(error as Error)?.name}` };
  }
}

export function compareToExpected(results: readonly ProbeResult[], expected: Expected): Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const { id, state, detail } of results) {
    const want = expected[id];
    if (!want) {
      anomalies.push({ id, kind: 'no-expectation', detail: `not in the expected file; ${detail}` });
    } else if (want.state === 'working' && state === 'unavailable') {
      anomalies.push({ id, kind: 'regression', detail: `expected working, got ${detail}` });
    } else if (want.state === 'unavailable' && state === 'working') {
      anomalies.push({
        id,
        kind: 'stale-baseline',
        detail: `expected unavailable (${want.why ?? 'no reason'}), now working`,
      });
    }
  }
  const probed = new Set(results.map((r) => r.id));
  for (const id of Object.keys(expected).filter((name) => !probed.has(name))) {
    anomalies.push({ id, kind: 'no-probe', detail: 'in the expected file, no probe runs it' });
  }
  return anomalies;
}

export function summaryLine(
  results: readonly ProbeResult[],
  anomalies: readonly Anomaly[]
): string {
  if (anomalies.length === 0) {
    const working = results.filter((r) => r.state === 'working').length;
    return `integration-nightly OK: ${results.length}/${results.length} probes match (${working} working, ${results.length - working} expected unavailable)`;
  }
  const names = [...new Set(anomalies.map((a) => a.id))].join(', ');
  return `integration-nightly ANOMALIES: ${anomalies.length} of ${results.length} probes: ${names}`;
}

/** A bad expected file is a harness error, never a pass. */
export async function readExpected(path = EXPECTED_PATH): Promise<Expected> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as { integrations?: Expected };
  const entries = Object.entries(parsed.integrations ?? {});
  if (entries.length === 0) throw new Error(`${path}: no integrations listed`);
  const bad = entries.find(
    ([, want]) => want?.state !== 'working' && want?.state !== 'unavailable'
  );
  if (bad) throw new Error(`${path}: ${bad[0]}: state must be working or unavailable`);
  return parsed.integrations!;
}

/** Runs every probe, prints the summary (and one line per anomaly), returns the exit code. */
export async function runNightlyProbes(
  probes: readonly Probe[],
  expected: Expected,
  env: Env,
  print: (line: string) => void = console.log
): Promise<0 | 1> {
  const results = await Promise.all(probes.map((probe) => runProbe(probe, env)));
  const anomalies = compareToExpected(results, expected);
  print(summaryLine(results, anomalies));
  for (const a of anomalies) print(`  ${a.kind}: ${a.id}: ${a.detail}`);
  return anomalies.length === 0 ? 0 : 1;
}

/** Entry for `--nightly`: 0 healthy, 1 anomalies, 2 the harness could not run. */
export async function runNightly(
  argv: readonly string[],
  env: Env = process.env
): Promise<0 | 1 | 2> {
  try {
    if (argv.includes('--live'))
      throw new Error('--nightly is read-only and cannot be combined with --live');
    process.env.LOG_LEVEL ??= 'warn'; // the repo tools the probes run log at info: keep the summary line alone
    const { NIGHTLY_PROBES } = await import('./integration-probes.js');
    return await runNightlyProbes(NIGHTLY_PROBES, await readExpected(), env);
  } catch (error) {
    console.error(`integration-nightly HARNESS ERROR: ${(error as Error).message}`);
    return 2;
  }
}
