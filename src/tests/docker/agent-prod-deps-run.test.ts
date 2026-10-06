/**
 * The agent image's prod-deps RUN must fail when `pnpm install --prod` fails.
 *
 * `a && b || c` runs c when ANY step before it fails (|| and && share
 * precedence), so a trailing `… || echo …` or `… || true` silently turned a failed
 * install into exit 0 and LiveKit Cloud shipped an image without node_modules.
 * This runs the real RUN body from docker/Dockerfile.agent under /bin/sh -c
 * (Docker's RUN shell) with a stub pnpm, once failing and once succeeding.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const DOCKERFILE = join(ROOT, 'docker/Dockerfile.agent');
const VERIFY = join(ROOT, 'scripts/docker/verify-node-modules.cjs');

/** The RUN that builds /prod-deps, joined into one shell command. */
function prodDepsRun(): string {
  const lines = readFileSync(DOCKERFILE, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.includes('Preparing production node_modules'));
  if (start < 0) throw new Error('prod-deps RUN not found in Dockerfile.agent');
  let first = start;
  while (!lines[first].startsWith('RUN ')) first--;
  const body: string[] = [];
  for (let i = first; i < lines.length; i++) {
    body.push(lines[i].replace(/\\$/, ''));
    if (!lines[i].endsWith('\\')) break;
  }
  return body.join('\n').replace(/^RUN --mount=\S+\s*/, '');
}

function run(install: 'fail' | 'ok'): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'prod-deps-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const ws = join(dir, 'ws');
  const apps = ['apps/rust-audio', 'apps/rust-perf', 'design-system', 'apps/cli', 'apps/web',
    'apps/async', 'apps/intelligence-worker', 'packages/shared-types'];
  for (const d of ['', ...apps]) {
    mkdirSync(join(ws, d), { recursive: true });
    writeFileSync(join(ws, d, 'package.json'), '{"name":"x","dependencies":{"dotenv":"1"}}');
  }
  mkdirSync(join(ws, 'patches'));
  for (const f of ['pnpm-workspace.yaml', '.npmrc', 'pnpm-lock.yaml']) writeFileSync(join(ws, f), '');
  writeFileSync(
    join(bin, 'pnpm'),
    `#!/bin/sh\nif [ "$1" = install ]; then ${
      install === 'fail'
        ? 'echo "stub install failed"; exit 1'
        : 'mkdir -p node_modules/dotenv && echo "{}" > node_modules/dotenv/package.json'
    }; fi\nexit 0\n`
  );
  chmodSync(join(bin, 'pnpm'), 0o755);
  writeFileSync(join(dir, 'verify.cjs'), readFileSync(VERIFY));
  const script = prodDepsRun()
    .replaceAll('/prod-deps', join(dir, 'prod-deps'))
    .replaceAll('/tmp/verify-node-modules.cjs', join(dir, 'verify.cjs'));
  const r = spawnSync('/bin/sh', ['-c', script], {
    cwd: ws,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    encoding: 'utf8',
  });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

describe('Dockerfile.agent prod-deps RUN', () => {
  it('fails the build when pnpm install fails', () => {
    const { code, out } = run('fail');
    expect(out).toContain('stub install failed');
    expect(code).not.toBe(0);
    expect(out).not.toContain('Production node_modules ready');
  });

  it('passes and verifies dependencies when the install succeeds', () => {
    const { code, out } = run('ok');
    expect(out).toContain('production dependencies present');
    expect(code).toBe(0);
  });

  it('can find node for the verify step', () => {
    expect(() => execFileSync('node', ['--version'])).not.toThrow();
  });
});
