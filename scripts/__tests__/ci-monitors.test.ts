/**
 * The CI monitors in scripts/ci run unattended, so the failure that matters is
 * the one where the monitor itself dies on the day it has something to do.
 * These tests run the real scripts with a fake `gh` first on PATH.
 *
 * - required-check-backfill.sh died under `set -e` on a conflicted PR (#1953),
 *   so the armed PRs after it were never updated (runs 39331278797 and the 3
 *   before it).
 * - ci-health.sh died with exit 141 (SIGPIPE from `| head -10` under pipefail)
 *   when a job failed on many PRs (run 39217715410).
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPTS = resolve(__dirname, '../ci');

// The fake answers each `gh` call with what the real one prints after --jq, and
// logs every call. update-branch outcomes come from FAKE_UPDATE_<pr>:
// "conflict", "error" or unset (success). FAKE_FAIL_CHECKS_<sha>=1 makes that
// commit's check-runs call fail.
const FAKE_GH = resolve(__dirname, 'fixtures/fake-gh.sh');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ci-monitors-'));
  copyFileSync(FAKE_GH, join(dir, 'gh'));
  chmodSync(join(dir, 'gh'), 0o755);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(script: string, env: Record<string, string>, args: string[] = []) {
  const res = spawnSync('bash', [join(SCRIPTS, script), ...args], {
    encoding: 'utf8',
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      HOME: dir,
      GITHUB_REPOSITORY: 'o/r',
      FAKE_DIR: dir,
      ...env,
    },
  });
  return { status: res.status, out: `${res.stdout}${res.stderr}` };
}

const read = (name: string) => {
  try {
    return readFileSync(join(dir, name), 'utf8');
  } catch {
    return '';
  }
};
const updated = () => read('updated.log').split('\n').filter(Boolean);

/** One armed PR per row, every head old enough and missing "Menu E2E". */
function prs(...rows: Array<[number, string]>) {
  writeFileSync(
    join(dir, 'prs.tsv'),
    rows.map(([n, mergeable]) => `${n}\tfeat/pr-${n}\tsha${n}\t${mergeable}`).join('\n') + '\n'
  );
}

describe('required-check-backfill.sh', () => {
  it('skips a PR whose update hits a conflict and still backfills the next one', () => {
    // GitHub computes `mergeable` lazily, so a conflicted PR often lists as UNKNOWN
    // and only the update itself says "conflicts" (#1953).
    prs([1953, 'UNKNOWN'], [2000, 'MERGEABLE']);
    const res = run('required-check-backfill.sh', { FAKE_UPDATE_1953: 'conflict' });

    expect(updated()).toEqual(['2000']);
    expect(res.out).toMatch(/#1953 .*conflict/i);
    // A conflict needs the PR's author, not CI: it is a skip, not a failure.
    expect(res.status).toBe(0);
  });

  it('keeps going past a PR whose update fails for another reason, then exits non-zero', () => {
    prs([2001, 'MERGEABLE'], [2002, 'MERGEABLE']);
    const res = run('required-check-backfill.sh', { FAKE_UPDATE_2001: 'error' });

    expect(updated()).toEqual(['2002']);
    expect(res.out).toContain('::error::');
    expect(res.out).toContain('HTTP 502');
    expect(res.status).toBe(1);
  });

  it('keeps going past a PR whose checks cannot be read, then exits non-zero', () => {
    prs([2003, 'MERGEABLE'], [2004, 'MERGEABLE']);
    const res = run('required-check-backfill.sh', { FAKE_FAIL_CHECKS_sha2003: '1' });

    expect(updated()).toEqual(['2004']);
    expect(res.out).toMatch(/::error::.*#2003/);
    expect(res.status).toBe(1);
  });

  it('counts only real updates against MAX, not conflicted skips', () => {
    prs([2005, 'UNKNOWN'], [2006, 'MERGEABLE'], [2007, 'MERGEABLE']);
    const res = run('required-check-backfill.sh', { FAKE_UPDATE_2005: 'conflict', MAX: '1' });

    expect(updated()).toEqual(['2006']);
    expect(res.out).toContain('Reached MAX=1');
    expect(res.status).toBe(0);
  });
});

describe('ci-health.sh', () => {
  // Long branch names push the examples past a pipe buffer, so a `| head -10`
  // closes the pipe while awk is still writing: that is the exit 141.
  const many = { FAKE_RUNS: '300', FAKE_PAD: 'x'.repeat(300) };

  it('reports a job that failed on many PRs instead of dying with SIGPIPE', () => {
    const res = run('ci-health.sh', many, ['--dry-run']);

    expect(res.status).toBe(0);
    expect(res.out).toContain('CI health: "Unit Tests" failing on many PRs (300 PRs)');
  });

  it('files the issue with exactly ten examples', () => {
    const res = run('ci-health.sh', many);

    expect(res.status).toBe(0);
    const body = read('issue-body.md');
    expect(body).toContain('**Unit Tests** failed on **300** different PRs');
    expect(body.split('\n').filter((l) => l.startsWith('- `feat/'))).toHaveLength(10);
  });
});
