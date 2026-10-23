/**
 * Lead-verified rules: a PR is VERIFIED only by evidence on its exact head, or by a
 * pure "merge main in" on top of a verified SHA. The merge-tree cases run real git
 * in a throwaway repo; nothing touches the network.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  evaluate,
  gitOps,
  markers,
  parseQueueRef,
  toPullRequest,
  type Comment,
  type Git,
  type PullRequest,
  type RawPull,
  type Status,
} from '../lead-verified.js';

const HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const OLD = 'ffeeddccbbaa99887766554433221100ffeeddcc';

const comment = (body: string, at = '2026-10-22T12:00:00Z', author = 'sethdford'): Comment => ({
  author,
  createdAt: at,
  body,
});
const status = (
  sha: string,
  state: string,
  creator = 'sethdford',
  at = '2026-10-22T12:00:00Z'
): Status => ({
  sha,
  context: 'lead-verify',
  state,
  creator,
  createdAt: at,
});
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

describe('direct evidence on the head', () => {
  it('status lead-verify=success on the head → VERIFIED', () => {
    const r = evaluate(pr({ statuses: [status(HEAD, 'success')] }), null);
    expect(r.verdict).toBe('VERIFIED');
    expect(r.reason).toContain('lead-verify status');
  });

  it('status from an author not on the list → NOT_VERIFIED', () => {
    const r = evaluate(pr({ statuses: [status(HEAD, 'success', 'github-actions[bot]')] }), null);
    expect(r.verdict).toBe('NOT_VERIFIED');
    expect(r.reason).toContain('github-actions[bot]');
  });

  it('bound PASS comment naming the full head SHA → VERIFIED', () => {
    const r = evaluate(
      pr({ comments: [comment(`RESULT_verifier=PASS sha=${HEAD} (suite 23/23)`)] }),
      null
    );
    expect(r.verdict).toBe('VERIFIED');
    expect(r.reason).toContain('PASS comment by sethdford');
  });

  it('bound marker with a short (9-hex) prefix of the head → NOT_VERIFIED', () => {
    const r = evaluate(
      pr({ comments: [comment(`RESULT_verifier=PASS sha=${HEAD.slice(0, 9)}`)] }),
      null
    );
    expect(r.verdict).toBe('NOT_VERIFIED');
    expect(r.reason).toContain('unbound PASS');
  });

  it.each([
    `RESULT_verifier=PASS at ${HEAD}`,
    `Verifier: PASS (${HEAD})`,
    `**Verdict: PASS** on ${HEAD.slice(0, 12)}`,
    `Independent verify on ${HEAD}: PASS`,
  ])('prose verdict "%s" is unbound legacy evidence → NOT_VERIFIED', (body) => {
    const r = evaluate(pr({ comments: [comment(body, undefined, 'ferni-agent[bot]')] }), null);
    expect(r.verdict).toBe('NOT_VERIFIED');
    expect(r.reason).toContain('unbound PASS by ferni-agent[bot]');
  });

  it('bound PASS on an older SHA → NOT_VERIFIED', () => {
    const r = evaluate(pr({ comments: [comment(`RESULT_verifier=PASS sha=${OLD}`)] }), null);
    expect(r.verdict).toBe('NOT_VERIFIED');
    expect(r.reason).toContain(HEAD.slice(0, 9));
  });

  it('bound PASS from an author not on the list → NOT_VERIFIED', () => {
    const c = comment(`RESULT_verifier=PASS sha=${HEAD}`, undefined, 'someone-else');
    const r = evaluate(pr({ comments: [c] }), null);
    expect(r.verdict).toBe('NOT_VERIFIED');
    expect(r.reason).toContain('comment by someone-else');
    // The same comment counts once the author is allowed.
    const allowed = evaluate(pr({ comments: [c] }), null, { authors: ['someone-else'] });
    expect(allowed.verdict).toBe('VERIFIED');
  });

  it('bound FAIL posted after the PASS on the same SHA → NOT_VERIFIED', () => {
    const r = evaluate(
      pr({
        comments: [
          comment(`RESULT_verifier=PASS sha=${HEAD}`, '2026-10-22T12:00:00Z'),
          comment(`RESULT_verifier=FAIL sha=${HEAD}`, '2026-10-22T13:00:00Z', 'ferni-agent[bot]'),
        ],
      }),
      null
    );
    expect(r.verdict).toBe('NOT_VERIFIED');
    expect(r.reason).toContain('FAIL by ferni-agent[bot]');
  });

  it('prose FAIL naming a prefix of the head, after the PASS → NOT_VERIFIED', () => {
    const r = evaluate(
      pr({
        comments: [
          comment(`RESULT_verifier=PASS sha=${HEAD}`, '2026-10-22T12:00:00Z'),
          comment(`**Verdict: FAIL** on ${HEAD.slice(0, 10)}`, '2026-10-22T13:00:00Z'),
        ],
      }),
      null
    );
    expect(r.verdict).toBe('NOT_VERIFIED');
  });

  it('a PASS and a FAIL bound to the head in one comment → NOT_VERIFIED', () => {
    const body = `RESULT_verifier=PASS sha=${HEAD} then RESULT_verifier=FAIL sha=${HEAD}`;
    expect(evaluate(pr({ comments: [comment(body)] }), null).verdict).toBe('NOT_VERIFIED');
  });

  it('FAIL then a newer bound PASS on the same SHA → VERIFIED', () => {
    const r = evaluate(
      pr({
        comments: [
          comment(`FAILED verify at ${HEAD}`, '2026-10-22T12:00:00Z'),
          comment(`RESULT_verifier=PASS sha=${HEAD}`, '2026-10-22T13:00:00Z'),
        ],
      }),
      null
    );
    expect(r.verdict).toBe('VERIFIED');
  });

  it('failure status after a success status → NOT_VERIFIED', () => {
    const late = status(HEAD, 'failure', 'sethdford', '2026-10-22T13:00:00Z');
    const r = evaluate(pr({ statuses: [status(HEAD, 'success'), late] }), null);
    expect(r.verdict).toBe('NOT_VERIFIED');
  });
});

describe('markers', () => {
  it('reads bound markers, prose verdicts and SHA tokens', () => {
    expect(markers('Verdict: Reject')).toEqual({ bound: [], pass: false, fail: false, shas: [] });
    expect(markers(`RESULT_verifier=FAIL sha=${HEAD.toUpperCase()}`).bound).toEqual([
      { kind: 'fail', sha: HEAD },
    ]);
    expect(markers('tests pass')).toMatchObject({ pass: false });
  });
});

describe('REST payloads (toPullRequest)', () => {
  const raw = (over: Partial<RawPull> = {}): RawPull => ({
    pull: { head: { sha: HEAD } },
    commits: [{ sha: HEAD, parents: [{ sha: OLD }] }],
    comments: [],
    reviews: [],
    statuses: {},
    ...over,
  });

  it('an auto-merge (arm) reason with a bound PASS does not verify', () => {
    const marker = `RESULT_verifier=PASS sha=${HEAD}`;
    const auto_merge = {
      enabled_by: { login: 'sethdford' },
      commit_title: marker,
      commit_message: marker,
    };
    const r = evaluate(toPullRequest(1, raw({ pull: { head: { sha: HEAD }, auto_merge } })), null);
    expect(r.verdict).toBe('NOT_VERIFIED');
  });

  it('comments, reviews and statuses map to evidence', () => {
    const user = { login: 'sethdford' };
    const marker = `RESULT_verifier=PASS sha=${HEAD}`;
    const at = '2026-10-22T12:00:00Z';
    const viaReview = raw({ reviews: [{ user, submitted_at: at, body: marker }] });
    expect(evaluate(toPullRequest(1, viaReview), null).verdict).toBe('VERIFIED');
    const viaComment = raw({ comments: [{ user, created_at: at, body: marker }] });
    expect(evaluate(toPullRequest(1, viaComment), null).verdict).toBe('VERIFIED');
    const s = { context: 'lead-verify', state: 'success', creator: user, created_at: at };
    expect(evaluate(toPullRequest(1, raw({ statuses: { [HEAD]: [s] } })), null).verdict).toBe(
      'VERIFIED'
    );
  });
});

describe('workflow runs trusted code', () => {
  const wf = readFileSync(join(__dirname, '../../../.github/workflows/lead-verified.yml'), 'utf8');

  it('checks out the base SHA (main in the queue), never the PR head', () => {
    const refs = wf.split('\n').filter((l) => /^\s*ref:/.test(l));
    expect(refs).toEqual(["          ref: ${{ github.event.pull_request.base.sha || 'main' }}"]);
    expect(wf.match(/actions\/checkout@/g)).toHaveLength(1);
  });

  it('passes the head SHA only as data and runs the checked-out evaluator', () => {
    expect(wf).toContain('PR_HEAD: ${{ github.event.pull_request.head.sha }}');
    expect(wf).toContain('node --experimental-strip-types scripts/ci/lead-verified.ts');
    expect(wf).not.toMatch(/refs\/pull\/|head_ref\s*}}\s*$|git (checkout|switch)/m);
  });
});

describe('merge_group head_ref', () => {
  it('parses the PR number and head SHA', () => {
    expect(parseQueueRef(`gh-readonly-queue/main/pr-2476-${HEAD}`)).toEqual({
      base: 'main',
      pr: 2476,
      sha: HEAD,
    });
    expect(parseQueueRef(`refs/heads/gh-readonly-queue/main/pr-12-${HEAD}`)?.pr).toBe(12);
  });
  it('rejects anything else', () => {
    expect(parseQueueRef('feature/pr-12')).toBeNull();
    expect(parseQueueRef(`gh-readonly-queue/main/pr-12-${HEAD.slice(0, 20)}`)).toBeNull();
  });
});

// ---- carry-forward over real git -------------------------------------------------

let repo: string;
let git: Git;
const sh = (...args: string[]) =>
  execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.invalid',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.invalid',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  }).trim();
const write = (file: string, text: string) => writeFileSync(join(repo, file), text);
const commit = (msg: string) => {
  sh('add', '-A');
  sh('commit', '-q', '--no-verify', '-m', msg);
  return sh('rev-parse', 'HEAD');
};
const parents = (sha: string) => sh('rev-list', '--parents', '-n', '1', sha).split(' ').slice(1);
/** A PR whose verified commit is `verified` and whose head is `head`. */
const prAt = (verified: string, head: string): PullRequest => ({
  number: 2,
  headSha: head,
  commits: [verified, head].map((sha) => ({ sha, parents: parents(sha) })),
  comments: [comment(`RESULT_verifier=PASS sha=${verified}`)],
  statuses: [],
});

let base: string;
let verified: string;

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'lead-verified-'));
  sh('init', '-q', '-b', 'main');
  write('a.txt', 'one\ntwo\nthree\n');
  write('b.txt', 'b\n');
  base = commit('base');
  sh('switch', '-q', '-c', 'pr');
  write('a.txt', 'ONE\ntwo\nthree\n');
  verified = commit('pr change');
  sh('switch', '-q', 'main');
  write('b.txt', 'b changed on main\n');
  commit('main change');
  git = gitOps(repo, 'main');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('carry-forward (merge main in)', () => {
  it('pure main-merge of a verified SHA → VERIFIED', () => {
    sh('switch', '-q', '-C', 'pure', verified);
    sh('merge', '-q', '--no-edit', 'main');
    const head = sh('rev-parse', 'HEAD');
    const r = evaluate(prAt(verified, head), git);
    expect(r.verdict).toBe('VERIFIED');
    expect(r.reason).toContain('carried forward');
  });

  it('two pure main-merges in a row → VERIFIED', () => {
    sh('switch', '-q', '-C', 'twice', verified);
    sh('merge', '-q', '--no-edit', 'main');
    const first = sh('rev-parse', 'HEAD');
    sh('switch', '-q', 'main');
    write('c.txt', 'c\n');
    commit('main again');
    sh('switch', '-q', 'twice');
    sh('merge', '-q', '--no-edit', 'main');
    const head = sh('rev-parse', 'HEAD');
    const p = prAt(verified, head);
    p.commits.push({ sha: first, parents: parents(first) });
    expect(evaluate(p, git).verdict).toBe('VERIFIED');
  });

  it('main-merge plus an extra edit → NOT_VERIFIED, naming the file', () => {
    sh('switch', '-q', '-C', 'extra', verified);
    sh('merge', '-q', '--no-edit', 'main');
    write('sneaky.txt', 'not verified\n');
    sh('add', '-A');
    sh('commit', '-q', '--no-verify', '--amend', '--no-edit');
    const head = sh('rev-parse', 'HEAD');
    const r = evaluate(prAt(verified, head), git);
    expect(r.verdict).toBe('NOT_VERIFIED');
    expect(r.reason).toContain('extra edits in sneaky.txt');
  });

  it('conflicted main-merge → NOT_VERIFIED, naming the conflict', () => {
    sh('switch', '-q', '-C', 'main2', base);
    write('a.txt', 'uno\ntwo\nthree\n');
    commit('conflicting main change');
    git = gitOps(repo, 'main2');
    sh('switch', '-q', '-C', 'conflict', verified);
    try {
      sh('merge', '-q', '--no-edit', 'main2');
    } catch {
      // expected: resolve by hand, as a queue-fixer would
    }
    write('a.txt', 'ONE uno\ntwo\nthree\n');
    sh('add', '-A');
    sh('commit', '-q', '--no-verify', '--no-edit');
    const head = sh('rev-parse', 'HEAD');
    const r = evaluate(prAt(verified, head), git);
    git = gitOps(repo, 'main');
    expect(r.verdict).toBe('NOT_VERIFIED');
    expect(r.reason).toContain('conflicts (a.txt)');
  });

  it('merge whose other parent is not on main → NOT_VERIFIED', () => {
    sh('switch', '-q', '-C', 'side', base);
    write('d.txt', 'side branch\n');
    const side = commit('side');
    sh('switch', '-q', '-C', 'notmain', verified);
    sh('merge', '-q', '--no-edit', side);
    const head = sh('rev-parse', 'HEAD');
    const r = evaluate(prAt(verified, head), git);
    expect(r.verdict).toBe('NOT_VERIFIED');
    expect(r.reason).toContain('not on main');
  });

  it('FAIL on the merge head after the PASS on the verified SHA → NOT_VERIFIED', () => {
    sh('switch', '-q', '-C', 'failed', verified);
    sh('merge', '-q', '--no-edit', 'main');
    const head = sh('rev-parse', 'HEAD');
    const p = prAt(verified, head);
    p.comments.push(comment(`RESULT_verifier=FAIL sha=${head}`, '2026-10-22T13:00:00Z'));
    const r = evaluate(p, git);
    expect(r.verdict).toBe('NOT_VERIFIED');
    expect(r.reason).toContain('FAIL by sethdford');
  });
});
