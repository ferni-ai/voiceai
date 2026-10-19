/**
 * scripts/ci/secret-scan-range.sh gives trufflehog a base and head that exist in the
 * one-commit CI checkout. Until 2026-10-19 they never did: every PR, queue and push
 * scan logged "unable to resolve commit", read 0 bytes and passed. These run the
 * script against real git repos: an origin and a depth-1 clone of it, as CI has.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(__dirname, '..', '..', '..', 'scripts/ci/secret-scan-range.sh');
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();

/** origin with main = c1..c5 and a side branch off c1; a depth-1 clone of c5. */
function repos() {
  const dir = mkdtempSync(join(tmpdir(), 'scan-range-'));
  const origin = join(dir, 'origin');
  execFileSync('git', ['init', '-q', '-b', 'main', origin]);
  git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  const c: string[] = [];
  for (let i = 1; i <= 5; i++) {
    writeFileSync(join(origin, `f${i}.txt`), `${i}\n`);
    git(origin, 'add', '.');
    git(origin, 'commit', '-qm', `c${i}`);
    c.push(git(origin, 'rev-parse', 'HEAD'));
  }
  git(origin, 'switch', '-qc', 'side', c[0]);
  writeFileSync(join(origin, 'side.txt'), 'side\n');
  git(origin, 'add', '.');
  git(origin, 'commit', '-qm', 'side');
  const side = git(origin, 'rev-parse', 'HEAD');
  git(origin, 'switch', '-q', 'main');
  const clone = join(dir, 'clone');
  execFileSync('git', ['clone', '-q', '--depth=1', `file://${origin}`, clone]);
  return { dir, clone, c, side };
}

function scan(cwd: string, dir: string, env: Record<string, string>, mergeBase = '') {
  const bin = join(dir, 'bin');
  execFileSync('mkdir', ['-p', bin]);
  // gh only answers the compare call: the merge base GitHub would report
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash\necho "${mergeBase}"\n`);
  chmodSync(join(bin, 'gh'), 0o755);
  const out = join(dir, 'out');
  writeFileSync(out, '');
  const r = spawnSync('bash', [SCRIPT], {
    cwd,
    env: { PATH: `${bin}:${process.env.PATH}`, HOME: dir, REPO: 'o/r', GITHUB_OUTPUT: out, ...env },
    encoding: 'utf8',
  });
  const outputs = Object.fromEntries(
    readFileSync(out, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('=') as [string, string])
  );
  return { status: r.status, outputs, log: r.stdout + r.stderr };
}

describe('secret-scan-range', () => {
  it('a push scans exactly the pushed commits, with both ends in the clone', () => {
    const { dir, clone, c } = repos();
    expect(spawnSync('git', ['cat-file', '-e', c[1]], { cwd: clone }).status).not.toBe(0); // as CI: absent
    const r = scan(clone, dir, { EVENT: 'push', PUSH_BEFORE: c[1], PUSH_AFTER: c[4] });
    expect(r.status).toBe(0);
    expect(r.outputs).toEqual({ base: c[1], head: c[4], commits: '3' });
    expect(git(clone, 'rev-parse', 'secret-scan-base', 'secret-scan-head').split('\n')).toEqual([
      c[1],
      c[4],
    ]);
  });

  it('a PR or queue group scans from the merge base GitHub reports', () => {
    const { dir, clone, c } = repos();
    const pr = scan(clone, dir, { EVENT: 'pull_request', PR_BASE: c[4], PR_HEAD: c[4] }, c[2]);
    expect(pr.outputs).toMatchObject({ base: c[2], head: c[4], commits: '2' });
    const group = { EVENT: 'merge_group', MG_BASE_REF: 'refs/heads/main', MG_HEAD: c[4] };
    expect(scan(clone, dir, group, c[0]).outputs).toMatchObject({ base: c[0], commits: '4' });
  });

  it('fails, rather than passing unscanned, when the base is not behind the head', () => {
    const { dir, clone, c, side } = repos();
    const r = scan(clone, dir, {
      EVENT: 'push',
      PUSH_BEFORE: side,
      PUSH_AFTER: c[4],
      MAX_DEPTH: '8',
    });
    expect(r.status).not.toBe(0);
    expect(r.log).toMatch(/was not scanned/);
    expect(scan(clone, dir, { EVENT: 'schedule' }).status).not.toBe(0);
  });
});
