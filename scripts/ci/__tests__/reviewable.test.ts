/**
 * reviewable.sh decides which changed lines count toward a PR's size, for both the
 * PR Flow check and the pre-push hook. These run its reviewable_lines function in
 * bash with "<path>\t<changed lines>" rows on stdin, the way both callers feed it.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join, resolve } from 'path';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '../reviewable.sh');

function reviewable(rows: Array<[string, number]>, env: NodeJS.ProcessEnv = process.env): number {
  const input = rows.map(([path, lines]) => `${path}\t${lines}\n`).join('');
  const run = spawnSync('bash', ['-c', 'source "$1" && reviewable_lines', 'reviewable', SCRIPT], {
    input,
    encoding: 'utf8',
    env,
  });
  expect(run.status, run.stderr).toBe(0);
  return Number(run.stdout.trim());
}

/**
 * Every distinct awk on this machine (the default one, plus gawk/mawk/nawk if
 * installed), each as an env whose PATH puts it first under the name `awk`.
 * BSD awk, gawk and mawk treat escapes differently, and the pre-push hook runs
 * on a laptop while PR Flow runs on Linux, so the count must agree across them.
 */
const shimRoot = mkdtempSync(join(tmpdir(), 'reviewable-awk-'));
afterAll(() => rmSync(shimRoot, { recursive: true, force: true }));

function awkEnvs(): Array<[string, NodeJS.ProcessEnv]> {
  const seen = new Set<string>();
  const envs: Array<[string, NodeJS.ProcessEnv]> = [];
  for (const name of ['awk', 'gawk', 'mawk', 'nawk', 'original-awk']) {
    const found = spawnSync('bash', ['-c', 'command -v "$1"', 'which', name], { encoding: 'utf8' });
    const path = found.stdout.trim();
    if (found.status !== 0 || !path) continue;
    const real = realpathSync(path);
    if (seen.has(real)) continue;
    seen.add(real);
    const dir = join(shimRoot, String(envs.length));
    spawnSync('mkdir', ['-p', dir]);
    symlinkSync(real, join(dir, 'awk'));
    envs.push([name, { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH ?? ''}` }]);
  }
  return envs;
}

const AWKS = awkEnvs();

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

  it('finds at least one awk to run under', () => {
    expect(AWKS.length).toBeGreaterThan(0);
  });

  // `awk -v` runs escape processing on its value, so BSD awk and gawk used to turn
  // `\.test\.` into `.test.`, where each dot matches any character. These paths only
  // match the skip list through that wildcard, so they must still be counted.
  describe.each(AWKS)('under %s', (_name, env) => {
    it('still skips real tests and lockfiles', () => {
      expect(
        reviewable(
          [
            ['src/foo.test.ts', 40],
            ['src/foo.spec.ts', 30],
            ['pnpm-lock.yaml', 900],
            ['src/__snapshots__/foo.ts.snap', 25],
            ['src/types.generated.ts', 60],
            ['assets/logo.png', 1],
          ],
          env
        )
      ).toBe(0);
    });

    it('counts paths where a dot in the skip list would only match as a wildcard', () => {
      const rows: Array<[string, number]> = [
        ['src/contest-utils.ts', 11], // "ntest-" vs \.test\.
        ['src/respec/index.ts', 13], // "respec/" vs \.spec\.
        ['src/latest_snap', 17], // "_snap" vs \.snap$
        ['src/regenerated_ids.ts', 19], // "regenerated_" vs \.generated\.
        ['src/sprite-png', 23], // "-png" vs \.(png|...)$
        ['tools/pnpm-lock-yaml', 29], // "-yaml" vs pnpm-lock\.yaml$
      ];
      for (const row of rows) expect(reviewable([row], env), row[0]).toBe(row[1]);
      expect(reviewable(rows, env)).toBe(112);
    });
  });
});
