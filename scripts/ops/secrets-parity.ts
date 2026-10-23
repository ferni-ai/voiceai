#!/usr/bin/env tsx
/**
 * Dev vs prod parity of the voice agent's LiveKit secrets. Read-only: runs only
 * `lk agent secrets` (names; LiveKit never returns values) and `lk agent logs`, where each
 * agent's `EFFECTIVE_SETTINGS` boot lines (src/config/effective-settings.ts) show flags as
 * words, persona voice ids as set, and `<set>` for anything secret-shaped. Values are sealed
 * as read (secrets-parity-lib.ts); the report holds names, counts and flag words only.
 *
 *   pnpm ops:secrets-parity --dev-project ferni-dev --dev-config "$PWD/livekit.toml" \
 *     --prod-project ferni-prod --prod-config "$PWD/livekit.prod-cloud.toml"
 *
 * Exit 0 clean, 1 drift, 2 something couldn't be compared or a boot can't be trusted. `--fixtures <dir>` reads
 * {dev,prod}.secrets.json and {dev,prod}.logs.txt instead of calling lk (tests).
 *
 * @module scripts/ops/secrets-parity
 */
import { execFile, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { FLAG_MANIFEST } from '../../src/config/flag-manifest.js';
import {
  BootCollector,
  compare,
  exitCode,
  newSealer,
  parseAllowlist,
  parseSecrets,
  render,
  snapshotOf,
  type Sealer,
  type Secrets,
} from './secrets-parity-lib.js';

const isFlag = (name: string): boolean => Object.hasOwn(FLAG_MANIFEST, name);

type Target = { label: 'dev' | 'prod'; project?: string; config?: string };

const lkArgs = (t: Target) => ['--project', t.project ?? '', '--config', t.config ?? ''];

/** Secret names and update times of one agent. lk's output is never echoed, only which call failed. */
async function lkSecrets(t: Target): Promise<Secrets> {
  try {
    const args = ['agent', 'secrets', ...lkArgs(t), '--json'];
    const { stdout } = await promisify(execFile)('lk', args, { maxBuffer: 64 << 20 });
    return parseSecrets(stdout);
  } catch {
    throw new Error(`lk agent secrets failed for ${t.label} (${lkArgs(t).join(' ')})`);
  }
}

/**
 * Reads `lk agent logs` to the end of its backlog: lk replays the deployment's log in a burst,
 * then tails live. Stops once no line has arrived for IDLE_MS after the first, or at the timeout.
 */
const IDLE_MS = 3000;
function lkBoot(t: Target, collector: BootCollector, timeoutMs: number): Promise<void> {
  const child = spawn('lk', ['agent', 'logs', ...lkArgs(t)], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const lines = createInterface({ input: child.stdout });
  return new Promise((done) => {
    let idle: NodeJS.Timeout | undefined;
    const timer = setTimeout(stop, timeoutMs);
    function stop() {
      clearTimeout(timer);
      clearTimeout(idle);
      lines.close();
      child.kill();
      done();
    }
    lines.on('line', (line) => {
      collector.add(line); // keeps only sealed EFFECTIVE_SETTINGS values; other lines are dropped
      clearTimeout(idle);
      idle = setTimeout(stop, IDLE_MS);
    });
    child.on('exit', stop).on('error', stop);
  });
}

async function snapshot(t: Target, seal: Sealer, fixtures: string | undefined, ms: number) {
  const collector = new BootCollector(isFlag, seal);
  const read = (ext: string) => readFileSync(join(fixtures ?? '', `${t.label}.${ext}`), 'utf8');
  const secrets = fixtures ? parseSecrets(read('secrets.json')) : await lkSecrets(t);
  if (fixtures) for (const line of read('logs.txt').split('\n')) collector.add(line);
  else await lkBoot(t, collector, ms);
  return snapshotOf(t.label, secrets, collector.result());
}

async function main(): Promise<number> {
  const str = { type: 'string' } as const;
  const { values: o } = parseArgs({
    options: {
      'dev-project': str,
      'dev-config': str,
      'prod-project': str,
      'prod-config': str,
      fixtures: str,
      allowlist: {
        type: 'string',
        default: fileURLToPath(new URL('secrets-parity-allowlist.json', import.meta.url)),
      },
      'log-timeout': { type: 'string', default: '90' },
    },
  });
  const fixtures = o.fixtures ? resolve(o.fixtures) : undefined;
  const dev: Target = { label: 'dev', project: o['dev-project'], config: o['dev-config'] };
  const prod: Target = { label: 'prod', project: o['prod-project'], config: o['prod-config'] };
  for (const t of [dev, prod]) {
    if (!fixtures && !(t.project && t.config))
      throw new Error(`pass --${t.label}-project and --${t.label}-config`);
  }

  const seal = newSealer(); // one key for both sides of this run, gone when the run ends
  const ms = Number(o['log-timeout']) * 1000;
  const [d, p] = await Promise.all([dev, prod].map((t) => snapshot(t, seal, fixtures, ms)));
  const known = [...Object.keys(FLAG_MANIFEST), ...d.names, ...p.names];
  const allow = parseAllowlist(readFileSync(o.allowlist, 'utf8'), known, isFlag);
  const rows = compare(d, p, allow, isFlag);
  console.log(render(rows, d, p));
  return exitCode(rows, d, p);
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`secrets-parity: ${err instanceof Error ? err.message : 'failed'}`);
    process.exit(2);
  }
);
