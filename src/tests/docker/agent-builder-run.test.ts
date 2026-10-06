/**
 * The agent image's builder RUN must fail when the agent build fails, and
 * fall back to a placeholder only when the optional CLI build fails.
 *
 * It ended `… && (build CLI) || (placeholder)`; with && and || at equal
 * precedence the placeholder ran after ANY failure, build:fast included, so
 * an esbuild error shipped an image with no agent (dev, 2026-10-05). This
 * runs the real RUN body from docker/Dockerfile.agent under /bin/sh -c
 * (Docker's RUN shell) with a stub pnpm.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DOCKERFILE = join(resolve(__dirname, '../../..'), 'docker/Dockerfile.agent');

/** The RUN that builds dist/, joined into one shell command. */
function builderRun(): string {
  const lines = readFileSync(DOCKERFILE, 'utf8').split('\n');
  const first = lines.findIndex((l) => l.startsWith('RUN rm -rf dist && pnpm run build:fast'));
  if (first < 0) throw new Error('builder RUN not found in Dockerfile.agent');
  const body: string[] = [];
  for (let i = first; i < lines.length; i++) {
    body.push(lines[i].replace(/\\$/, ''));
    if (!lines[i].endsWith('\\')) break;
  }
  return body.join('\n').replace(/^RUN\s+/, '');
}

function run(fail: 'build' | 'cli' | 'none'): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'agent-builder-'));
  const bin = join(dir, 'bin');
  const ws = join(dir, 'ws');
  mkdirSync(bin);
  mkdirSync(join(ws, 'src/agents/shared/sanitizer/config'), { recursive: true });
  writeFileSync(join(ws, 'src/agents/shared/sanitizer/config/tool-patterns.json'), '{}');
  // pnpm run build:fast / pnpm exec tsx <script>: each creates what the RUN lists next.
  writeFileSync(
    join(bin, 'pnpm'),
    `#!/bin/sh
case "$*" in
  "run build:fast") ${fail === 'build' ? 'echo "stub esbuild failed"; exit 1' : 'mkdir -p dist'} ;;
  *build-tool-manifest*) echo '{}' > dist/tool-manifest.json ;;
  *build-tool-embeddings*) echo '{}' > dist/tool-embeddings.json ;;
  *bundle-agent*) mkdir -p dist/agents && echo '' > dist/agents/voice-agent-bundle.js ;;
  *build-cli-binary*) ${fail === 'cli' ? 'echo "stub cli failed"; exit 1' : 'mkdir -p dist/ferni-bundle && echo cli > dist/ferni-bundle/ferni.js'} ;;
esac
exit 0
`
  );
  chmodSync(join(bin, 'pnpm'), 0o755);
  const r = spawnSync('/bin/sh', ['-c', builderRun()], {
    cwd: ws,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    encoding: 'utf8',
  });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

describe('Dockerfile.agent builder RUN', () => {
  it('fails the image when the agent build fails', () => {
    const { code, out } = run('build');
    expect(out).toContain('stub esbuild failed');
    expect(out).not.toContain('CLI bundle failed');
    expect(code).not.toBe(0);
  });

  it('falls back to a placeholder CLI when only the CLI build fails', () => {
    const { code, out } = run('cli');
    expect(out).toContain('CLI bundle failed (non-fatal)');
    expect(code).toBe(0);
  });

  it('passes when everything builds', () => {
    const { code, out } = run('none');
    expect(out).not.toContain('CLI bundle failed');
    expect(code).toBe(0);
  });
});
