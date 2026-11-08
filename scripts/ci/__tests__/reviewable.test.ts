/**
 * reviewable.sh decides which changed lines count toward a PR's size, for both the
 * PR Flow check and the pre-push hook. These run its reviewable_lines function in
 * bash with "<path>\t<changed lines>" rows on stdin, the way both callers feed it.
 */
import { spawnSync } from 'child_process';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '../reviewable.sh');

function reviewable(rows: Array<[string, number]>): number {
  const input = rows.map(([path, lines]) => `${path}\t${lines}\n`).join('');
  const run = spawnSync('bash', ['-c', 'source "$1" && reviewable_lines', 'reviewable', SCRIPT], {
    input,
    encoding: 'utf8',
  });
  expect(run.status, run.stderr).toBe(0);
  return Number(run.stdout.trim());
}

describe('reviewable.sh', () => {
  it('leaves out a pinned pip requirements.txt but counts the requirements.in it comes from', () => {
    expect(
      reviewable([
        ['tools/eval/fetch.sh', 20],
        ['tools/eval/score.py', 300],
        ['tools/eval/requirements.in', 10],
        ['tools/eval/requirements.txt', 600],
      ])
    ).toBe(330);
  });

  it('treats any requirements*.txt basename as a lockfile, at the root or nested', () => {
    expect(reviewable([['requirements.txt', 100]])).toBe(0);
    expect(reviewable([['svc/requirements-dev.txt', 50]])).toBe(0);
    expect(reviewable([['svc/requirements_lock.txt', 40]])).toBe(0);
  });

  it('still counts text files that are not pip lockfiles', () => {
    expect(reviewable([['docs/notes.txt', 7]])).toBe(7);
    expect(reviewable([['svc/my-requirements.txt', 4]])).toBe(4);
    expect(reviewable([['docs/requirements.txt.md', 3]])).toBe(3);
    expect(reviewable([['requirements/README.md', 5]])).toBe(5);
  });

  it('keeps the existing exclusions', () => {
    expect(
      reviewable([
        ['pnpm-lock.yaml', 900],
        ['apps/web/package-lock.json', 800],
        ['src/a/__tests__/a.test.ts', 70],
        ['src/a/a.ts', 12],
      ])
    ).toBe(12);
  });
});
