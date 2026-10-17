import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findProjectRoot } from '../utils/project-root.js';

// The voice agent deploys only through the deploy-agent skill's gated chain.
// Each CLI entry point that used to drive `lk` must refuse, point there, and
// never run lk. A fake `lk` first on PATH records any call.
const root = findProjectRoot();
const tsx = join(root, 'node_modules', '.bin', 'tsx');

function runCli(script: string, args: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'ferni-fake-lk-'));
  const calls = join(dir, 'lk-calls.log');
  writeFileSync(join(dir, 'lk'), `#!/bin/sh\necho "$@" >> "${calls}"\n`);
  chmodSync(join(dir, 'lk'), 0o755);
  const r = spawnSync(tsx, [join(root, 'apps/cli/src', script), ...args], {
    cwd: root,
    encoding: 'utf-8',
    input: 'y\n',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    timeout: 60_000,
  });
  return {
    status: r.status,
    output: `${r.stdout}${r.stderr}`,
    lkCalls: existsSync(calls) ? readFileSync(calls, 'utf-8') : '',
  };
}

describe.each([
  ['ferni deploy agent --dry-run', 'commands/deploy/deploy.ts', ['agent', '--dry-run']],
  ['ferni deploy agent --prod', 'commands/deploy/deploy.ts', ['agent', '--prod', '--dry-run']],
  ['ferni restart agent', 'index.ts', ['restart', 'agent', '--prod']],
  ['ferni rollback agent', 'index.ts', ['rollback', 'agent', '--prod']],
])('%s', (_name, script, args) => {
  it('refuses, points at the deploy-agent skill and never runs lk', () => {
    const r = runCli(script, args);
    expect(r.output).toContain('.claude/skills/deploy-agent/SKILL.md');
    expect(r.lkCalls).toBe('');
    expect(r.status).toBe(1);
  });
});
