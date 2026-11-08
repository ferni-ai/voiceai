/**
 * The guard scans scripts/ci/, and its own source names the patterns it looks
 * for. Until main has a copy, CI runs the PR's own guard on the PR that adds
 * it, so the script must not flag its own lines or that PR can never merge.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const GUARD = resolve(__dirname, '../ci/gate-files-guard.sh');

let dir: string;

function git(args: string[]) {
  const res = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
}

function runGuard() {
  const res = spawnSync('bash', [GUARD, 'HEAD^', 'HEAD'], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: dir },
  });
  return { status: res.status, out: `${res.stdout}${res.stderr}` };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gate-guard-self-'));
  git(['init', '-q']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'user.name', 't']);
  git(['commit', '-q', '--allow-empty', '-m', 'base']);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('gate-files-guard.sh on its own source', () => {
  it('passes the commit that adds the guard under scripts/ci', () => {
    mkdirSync(join(dir, 'scripts/ci'), { recursive: true });
    writeFileSync(join(dir, 'scripts/ci/gate-files-guard.sh'), readFileSync(GUARD, 'utf8'));
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'add guard']);

    const res = runGuard();
    expect(res.out).not.toMatch(/gate-files-guard\.sh:\d+:/);
    expect(res.status).toBe(0);
  });
});
