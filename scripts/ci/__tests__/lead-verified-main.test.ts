/**
 * Lead-verified, part 2: evidence ordering, the authors list, merge-group membership, and
 * main() run as a subprocess against a stubbed gh and a real bare origin with a squash queue.
 */
import { execFileSync, spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  evaluate,
  queueMembers,
  type Comment,
  type PullRequest,
  type Status,
} from '../lead-verified.js';
import { FAKE_GH } from './fake-gh.js';

const VERIFIER = 'ferni-verifier[bot]';
const HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const OLD = 'ffeeddccbbaa99887766554433221100ffeeddcc';

const comment = (body: string, at = '2026-10-22T12:00:00Z', author = VERIFIER): Comment => ({
  author,
  createdAt: at,
  body,
});
const status = (
  sha: string,
  state: string,
  creator = VERIFIER,
  at = '2026-10-22T12:00:00Z'
): Status => ({ sha, context: 'lead-verify', state, creator, createdAt: at });
const pr = (over: Partial<PullRequest> = {}): PullRequest => ({
  number: 1,
  headSha: HEAD,
  commits: [
    { sha: OLD, parents: ['0000000000000000000000000000000000000000'] },
    { sha: HEAD, parents: [OLD] },
  ],
  comments: [],
  statuses: [],
  ...over,
});

describe('evidence ordering', () => {
  it('an error status counts as a FAIL after a success', () => {
    const r = evaluate(
      pr({
        statuses: [
          status(HEAD, 'success', VERIFIER, '2026-10-22T12:00:00Z'),
          status(HEAD, 'error', VERIFIER, '2026-10-22T13:00:00Z'),
        ],
      }),
      null
    );
    expect(r.verdict).toBe('NOT_VERIFIED');
    expect(r.reason).toContain('FAIL by ferni-verifier[bot]');
  });

  it('a FAIL in the same second as a PASS blocks it', () => {
    const T = '2026-10-22T12:00:00Z';
    const r = evaluate(
      pr({
        statuses: [status(HEAD, 'success', VERIFIER, T)],
        comments: [comment(`RESULT_verifier=FAIL sha=${HEAD}`, T)],
      }),
      null
    );
    expect(r.verdict).toBe('NOT_VERIFIED');
  });

  it('a FAIL with an unreadable time blocks, though the newest readable FAIL is older', () => {
    const r = evaluate(
      pr({
        comments: [
          comment(`RESULT_verifier=PASS sha=${HEAD}`, '2026-10-22T13:00:00Z'),
          comment(`RESULT_verifier=FAIL sha=${OLD}`, '2026-10-22T12:00:00Z'),
          comment('RESULT_verifier=FAIL', 'not-a-time'),
        ],
      }),
      null
    );
    expect(r.verdict).toBe('NOT_VERIFIED');
  });
});

describe('authors list', () => {
  it('blank entries do not allow a status from a null author', () => {
    const r = evaluate(pr({ statuses: [status(HEAD, 'success', '')] }), null, {
      authors: ['', ' '],
    });
    expect(r.verdict).toBe('NOT_VERIFIED');
  });

  it('with only blank entries the default verifier still counts', () => {
    // What main() passes for LEAD_VERIFIED_AUTHORS=",".
    const r = evaluate(pr({ statuses: [status(HEAD, 'success')] }), null, {
      authors: ','.split(','),
    });
    expect(r.verdict).toBe('VERIFIED');
  });
});

describe('merge-group membership', () => {
  it('the ref PR plus every "(#N)" squash title above main', () => {
    expect(queueMembers(9, ['land 9 (#9)', 'land 7 (#7)'])).toEqual({
      members: [9, 7],
      unnamed: [],
    });
  });

  it('a title with no PR number is unnamed and reported', () => {
    expect(queueMembers(9, ['chore', 'land 9 (#9)'])).toEqual({ members: [9], unnamed: ['chore'] });
  });
});

// ---- main() against a stubbed gh and a real bare origin with a squash queue ------

describe('main() against a stubbed gh and a squash queue', () => {
  const R = 'ferni-ai/voiceai';
  const SCRIPT = join(__dirname, '../lead-verified.ts');
  const T0 = '2026-10-22T12:00:00Z';
  const T1 = '2026-10-22T13:00:00Z';
  const OLD = 'f'.repeat(40);
  const GIT_ENV = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.invalid',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.invalid',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  } as Record<string, string>;
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV }).trim();

  let root: string;
  let seed: string;
  let work: string;
  let bin: string;
  let fixtures: string;
  let A: string, B7: string, B9: string, B9b: string, Qs: string, Qm: string, Q1: string;
  let Q2: string, Qu: string;

  /** A commit on top of `from`, detached, so the seed repo keeps one branch. */
  const commitOn = (from: string, file: string, msg: string) => {
    git(seed, 'checkout', '-q', '--detach', from);
    writeFileSync(join(seed, file), `${msg}\n`);
    git(seed, 'add', '-A');
    git(seed, 'commit', '-q', '-m', msg);
    return git(seed, 'rev-parse', 'HEAD');
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'lead-main-'));
    seed = join(root, 'seed');
    work = join(root, 'work');
    bin = join(root, 'bin');
    fixtures = join(root, 'fixtures.json');
    mkdirSync(seed);
    mkdirSync(bin);
    writeFileSync(join(bin, 'gh'), FAKE_GH);
    chmodSync(join(bin, 'gh'), 0o755);

    git(seed, 'init', '-q', '-b', 'main');
    writeFileSync(join(seed, 'base.txt'), 'base\n');
    git(seed, 'add', '-A');
    git(seed, 'commit', '-q', '-m', 'base');
    A = git(seed, 'rev-parse', 'HEAD');
    B7 = commitOn(A, 'pr7.txt', 'pr 7');
    B9 = commitOn(A, 'pr9.txt', 'pr 9');
    B9b = commitOn(A, 'pr9b.txt', 'pr 9 pushed again');
    Qs = commitOn(A, 'qs.txt', 'land 9 (#9)');
    Qm = commitOn(A, 'qm.txt', 'land 9 again (#9)');
    Q1 = commitOn(A, 'q1.txt', 'land 7 (#7)');
    Q2 = commitOn(Q1, 'q2.txt', 'land 9 (#9)');
    Qu = commitOn(A, 'qu.txt', 'chore without a number');

    const origin = join(root, 'origin.git');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(
      seed,
      'push',
      '-q',
      origin,
      `${A}:refs/heads/main`,
      `${B7}:refs/pull/7/head`,
      `${B9}:refs/pull/9/head`,
      ...[Qs, Qm, Q2, Qu].map((q) => `${q}:refs/heads/gh-readonly-queue/main/pr-9-${q}`)
    );
    git(root, 'clone', '-q', origin, work);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const passC = (sha: string, at: string) => ({
    user: { login: VERIFIER },
    created_at: at,
    updated_at: at,
    body: `RESULT_verifier=PASS sha=${sha} (suite)`,
  });
  const failC = (sha: string, at: string) => ({
    user: { login: VERIFIER },
    created_at: at,
    updated_at: at,
    body: `RESULT_verifier=FAIL sha=${sha} (broke)`,
  });

  /** Writes the gh fixtures: each PR's head, its comments (as pages) and its statuses. */
  type Served = {
    head: string;
    comments?: unknown[][] | { error: number } | { raw: string };
    statuses?: unknown[];
  };
  const serve = (pulls: Record<number, Served | { error: number }>) => {
    const fx: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(pulls)) {
      const n = Number(key);
      const api = `repos/${R}/pulls/${n}`;
      if ('error' in v) {
        fx[api] = { error: v.error };
        continue;
      }
      fx[api] = { pages: [{ number: n, head: { sha: v.head } }] };
      fx[`${api}/commits`] = { pages: [[{ sha: v.head, parents: [] }]] };
      fx[`repos/${R}/commits/${v.head}/statuses`] = { pages: [v.statuses ?? []] };
      const c = v.comments ?? [[]];
      fx[`repos/${R}/issues/${n}/comments`] = Array.isArray(c) ? { pages: c } : c;
      fx[`${api}/reviews`] = { pages: [[]] };
      fx[`${api}/comments`] = { pages: [[]] };
    }
    writeFileSync(fixtures, JSON.stringify(fx));
  };

  const run = (args: string[], env: Record<string, string> = {}) => {
    const base: Record<string, string> = { ...process.env } as Record<string, string>;
    for (const k of [
      'GITHUB_STEP_SUMMARY',
      'GITHUB_REPOSITORY',
      'PR_NUMBER',
      'PR_HEAD',
      'QUEUE_REF',
      'LEAD_VERIFIED_AUTHORS',
    ]) {
      delete base[k];
    }
    const r = spawnSync(process.execPath, ['--experimental-strip-types', SCRIPT, ...args], {
      cwd: work,
      encoding: 'utf8',
      env: {
        ...base,
        PATH: `${bin}:${process.env.PATH}`,
        FAKE_GH_FIXTURES: fixtures,
        REPO: R,
        LEAD_VERIFIED_ENFORCE: '1',
        ...env,
      },
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const queue = (sha: string) => `gh-readonly-queue/main/pr-9-${sha}`;
  const okStatus = (sha: string) => ({
    context: 'lead-verify',
    state: 'success',
    creator: { login: VERIFIER },
    created_at: T0,
  });

  it('a single-PR group whose PR is verified on its head passes', () => {
    serve({ 9: { head: B9, comments: [[passC(B9, T0)]] } });
    const r = run([], { QUEUE_REF: queue(Qs) });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/PR #9 \w+: VERIFIED:/);
  });

  it('a multi-PR group fails when one PR is unverified, even if the other passes', () => {
    serve({ 7: { head: B7 }, 9: { head: B9, comments: [[passC(B9, T0)]] } });
    const r = run([], { QUEUE_REF: queue(Q2) });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/PR #7 \w+: NOT_VERIFIED:/);
    expect(r.out).toMatch(/PR #9 \w+: VERIFIED:/);
  });

  it('a group whose PR head moved past its verified head fails', () => {
    serve({ 9: { head: B9b, comments: [[passC(B9, T0)]] } });
    const r = run([], { QUEUE_REF: queue(Qm) });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/PR #9 \w+: NOT_VERIFIED: no lead-verify status or bound PASS names/);
  });

  it('a queued commit with no PR number blocks the group', () => {
    serve({ 9: { head: B9, comments: [[passC(B9, T0)]] } });
    const r = run([], { QUEUE_REF: queue(Qu) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('queued commit names no PR: chore without a number');
  });

  it('an API error gives ERROR and exit 1 under enforcement', () => {
    serve({ 9: { error: 502 } });
    const r = run(['9']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/PR #9 \w*: ERROR: could not evaluate/);
  });

  it('a merge-group ref missing on origin gives ERROR and exit 1', () => {
    serve({ 9: { head: B9, comments: [[passC(B9, T0)]] } });
    const r = run([], { QUEUE_REF: queue('0'.repeat(40)) });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/merge queue : ERROR: could not evaluate/);
    expect(r.out).not.toMatch(/VERIFIED:/);
  });

  it('a 502 on the comments gives ERROR even with a verifier success status', () => {
    // Control: the status alone verifies, so only the failed comments call can block it.
    serve({ 9: { head: B9, statuses: [okStatus(B9)] } });
    expect(run(['9']).code).toBe(0);
    serve({ 9: { head: B9, statuses: [okStatus(B9)], comments: { error: 502 } } });
    const r = run(['9']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/PR #9 \w*: ERROR: could not evaluate: .*issues\/9\/comments/);
  });

  it('non-JSON gh output gives ERROR, not an empty list', () => {
    serve({
      9: { head: B9, statuses: [okStatus(B9)], comments: { raw: '<html>502 Bad Gateway</html>' } },
    });
    const r = run(['9']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/PR #9 \w*: ERROR: could not evaluate/);
  });

  it('a FAIL on page 2 of the comments is seen', () => {
    serve({ 9: { head: B9, comments: [[passC(B9, T0)], [failC(B9, T1)]] } });
    const r = run(['9']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/NOT_VERIFIED: FAIL by ferni-verifier\[bot\]/);
  });

  it('a PR_HEAD that is no longer the head gives NOT_VERIFIED', () => {
    serve({ 9: { head: B9, comments: [[passC(B9, T0)]] } });
    const r = run([], { PR_NUMBER: '9', PR_HEAD: OLD });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/PR #9 \w+: NOT_VERIFIED: PR head is now \w+, not f{9}/);
  });

  it('a PR_HEAD that matches a verified head passes', () => {
    serve({ 9: { head: B9, comments: [[passC(B9, T0)]] } });
    const r = run([], { PR_NUMBER: '9', PR_HEAD: B9 });
    expect(r.code).toBe(0);
  });
});
