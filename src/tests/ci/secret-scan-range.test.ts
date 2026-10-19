/**
 * scripts/ci/secret-scan-range.sh gives trufflehog a base and head that exist in the
 * one-commit CI checkout, and only once base..head is provably complete. Until
 * 2026-10-19 neither held: every PR, queue and push scan logged "unable to resolve
 * commit", read 0 bytes and passed. These run the script against real git repos: an
 * origin and a depth-1 clone of it, as CI has. gh answers only the compare call.
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

function commit(repo: string, file: string): string {
  writeFileSync(join(repo, file), `${file}\n`);
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', file);
  return git(repo, 'rev-parse', 'HEAD');
}

/**
 * origin: main = c0..c4; `side` = 24 commits off c0, merged into main as `merge`
 * (so the merge's second parent runs deeper than the first fetch); a depth-1 clone.
 */
function repos() {
  const dir = mkdtempSync(join(tmpdir(), 'scan-range-'));
  const origin = join(dir, 'origin');
  execFileSync('git', ['init', '-q', '-b', 'main', origin]);
  git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  const c = [0, 1, 2, 3, 4].map((i) => commit(origin, `c${i}`));
  git(origin, 'switch', '-qc', 'side', c[0]);
  const side = Array.from({ length: 24 }, (_, i) => commit(origin, `s${i}`));
  git(origin, 'switch', '-q', 'main');
  git(origin, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side');
  const merge = git(origin, 'rev-parse', 'HEAD');
  const clone = join(dir, 'clone');
  execFileSync('git', ['clone', '-q', '--depth=1', `file://${origin}`, clone]);
  return { dir, clone, c, side, merge };
}

/** Runs the script; `compare` is what GitHub reports: the merge base and total_commits. */
function scan(cwd: string, dir: string, env: Record<string, string>, compare: [string, number]) {
  const bin = join(dir, 'bin');
  execFileSync('mkdir', ['-p', bin]);
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash\necho "${compare[0]} ${compare[1]}"\n`);
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
    const push = { EVENT: 'push', PUSH_BEFORE: c[1], PUSH_AFTER: c[4] };
    expect(spawnSync('git', ['cat-file', '-e', c[1]], { cwd: clone }).status).not.toBe(0);
    const r = scan(clone, dir, push, [c[1], 3]);
    expect(r.status).toBe(0);
    expect(r.outputs).toEqual({ base: c[1], head: c[4], commits: '3' });
    const tags = git(clone, 'rev-parse', 'secret-scan-base', 'secret-scan-head');
    expect(tags.split('\n')).toEqual([c[1], c[4]]);
  });

  it('a merge whose other side crosses the shallow boundary is scanned whole', () => {
    const { dir, clone, c, side, merge } = repos();
    // c4..merge = the merge + all 24 side commits; a depth-16 fetch reaches c4 first
    const r = scan(clone, dir, { EVENT: 'push', PUSH_BEFORE: c[4], PUSH_AFTER: merge }, [c[4], 25]);
    expect(r.status).toBe(0);
    expect(r.outputs.commits).toBe('25');
    expect(git(clone, 'rev-list', `${c[4]}..${merge}`).split('\n')).toContain(side[0]);
  });

  it('a PR or queue group scans from the merge base GitHub reports', () => {
    const { dir, clone, c } = repos();
    const pr = scan(clone, dir, { EVENT: 'pull_request', PR_BASE: c[4], PR_HEAD: c[4] }, [c[2], 2]);
    expect(pr.outputs).toMatchObject({ base: c[2], head: c[4], commits: '2' });
    const group = { EVENT: 'merge_group', MG_BASE_REF: 'refs/heads/main', MG_HEAD: c[4] };
    expect(scan(clone, dir, group, [c[0], 4]).outputs).toMatchObject({ base: c[0], commits: '4' });
  });

  it('fails closed when the range cannot be proven complete', () => {
    const { dir, clone, c } = repos();
    const push = { EVENT: 'push', PUSH_BEFORE: c[1], PUSH_AFTER: c[4], MAX_DEPTH: '64' };
    const wrong = scan(clone, dir, push, [c[1], 7]); // GitHub counts commits we can't see
    expect(wrong.status).not.toBe(0);
    expect(wrong.log).toMatch(/not complete .* so it was not scanned/);
    expect(wrong.outputs).toEqual({});
    expect(scan(clone, dir, { EVENT: 'schedule' }, ['', 0]).status).not.toBe(0);
    const created = { EVENT: 'push', PUSH_BEFORE: '0'.repeat(40), PUSH_AFTER: c[4] };
    expect(scan(clone, dir, created, ['', 0]).status).not.toBe(0);
  });
});
