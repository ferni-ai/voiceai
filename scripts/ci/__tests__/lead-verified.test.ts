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
  tableCell,
  toPullRequest,
  type Comment,
  type Git,
  type PullRequest,
  type RawPull,
  type Status,
} from '../lead-verified.js';

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
    expect(r.reason).toContain('PASS comment by ferni-verifier[bot]');
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

  it.each(['sethdford', 'ferni-agent[bot]'])(
    'only ferni-verifier[bot] counts by default: a PASS by %s does not verify',
    (who) => {
      const c = comment(`RESULT_verifier=PASS sha=${HEAD}`, undefined, who);
      expect(evaluate(pr({ comments: [c] }), null).verdict).toBe('NOT_VERIFIED');
      expect(evaluate(pr({ statuses: [status(HEAD, 'success', who)] }), null).verdict).toBe(
        'NOT_VERIFIED'
      );
    }
  );

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

  it('a failure status from any creator blocks', () => {
    const late = status(HEAD, 'failure', 'someone-else', '2026-10-22T13:00:00Z');
    const r = evaluate(pr({ statuses: [status(HEAD, 'success'), late] }), null);
    expect(r.verdict).toBe('NOT_VERIFIED');
  });

  it("a different 40-hex SHA sharing the head's 9-char prefix → NOT_VERIFIED", () => {
    const twin = HEAD.slice(0, 9) + 'f'.repeat(31);
    const r = evaluate(pr({ comments: [comment(`RESULT_verifier=PASS sha=${twin}`)] }), null);
    expect(r.verdict).toBe('NOT_VERIFIED');
  });

  it.each([
    ['quoted', `> RESULT_verifier=PASS sha=${HEAD}\nquoting the bot`],
    ['fenced', 'Once fixed, post:\n```\nRESULT_verifier=PASS sha=' + HEAD + '\n```'],
    ['mid-sentence', `Do NOT post RESULT_verifier=PASS sha=${HEAD} until it is fixed`],
    ['inline code', `\`RESULT_verifier=PASS sha=${HEAD}\``],
    ['indented code', `    RESULT_verifier=PASS sha=${HEAD}`],
  ])('a %s marker does not verify', (_, body) => {
    expect(evaluate(pr({ comments: [comment(body)] }), null).verdict).toBe('NOT_VERIFIED');
  });

  it('the marker after a closed fence still verifies', () => {
    const body = '```\nlog\n```\nRESULT_verifier=PASS sha=' + HEAD;
    expect(evaluate(pr({ comments: [comment(body)] }), null).verdict).toBe('VERIFIED');
  });

  it.each([
    'RESULT_verifier=FAIL',
    'Verdict: FAIL - migration drops rows',
    'verdict: fail',
    'RESULT_verifier: FAIL',
    'Verification FAILED on the rerun',
    `FAIL ${HEAD}`,
    `RESULT_verifier=FAIL sha=${OLD}`,
  ])('FAIL "%s" (any SHA or none) after the PASS → NOT_VERIFIED', (body) => {
    const pass = comment(`RESULT_verifier=PASS sha=${HEAD}`, '2026-10-22T12:00:00Z');
    const later = comment(body, '2026-10-22T13:00:00Z', 'some-reviewer');
    expect(evaluate(pr({ comments: [pass, later] }), null).verdict).toBe('NOT_VERIFIED');
  });

  it('a FAIL in the same comment as a bound PASS → NOT_VERIFIED', () => {
    const body = `RESULT_verifier=PASS sha=${HEAD}\n\nUPDATE: Verdict: FAIL after a rerun`;
    expect(evaluate(pr({ comments: [comment(body)] }), null).verdict).toBe('NOT_VERIFIED');
  });

  it('wording that is not a FAIL marker does not block', () => {
    const pass = comment(`RESULT_verifier=PASS sha=${HEAD}`, '2026-10-22T12:00:00Z');
    const later = comment('Verdict: failing test was a flake, fixed', '2026-10-22T13:00:00Z');
    expect(evaluate(pr({ comments: [pass, later] }), null).verdict).toBe('VERIFIED');
  });
});

describe('markers', () => {
  it('reads bound PASS lines, prose verdicts, FAILs and SHA tokens', () => {
    expect(markers('Verdict: Reject')).toEqual({
      passShas: [],
      prosePass: false,
      fail: false,
      shas: [],
    });
    expect(markers(`RESULT_verifier=PASS sha=${HEAD.toUpperCase()}`).passShas).toEqual([HEAD]);
    expect(markers('tests pass')).toMatchObject({ prosePass: false, fail: false });
  });
});

describe('REST payloads (toPullRequest)', () => {
  const user = { login: VERIFIER };
  const marker = `RESULT_verifier=PASS sha=${HEAD}`;
  const [t0, t1, t2] = ['2026-10-22T12:00:00Z', '2026-10-22T13:00:00Z', '2026-10-22T14:00:00Z'];
  const raw = (over: Partial<RawPull> = {}): RawPull => ({
    pull: { head: { sha: HEAD } },
    commits: [{ sha: HEAD, parents: [{ sha: OLD }] }],
    comments: [],
    reviews: [],
    inline: [],
    statuses: {},
    ...over,
  });
  const verdict = (r: RawPull) => evaluate(toPullRequest(1, r), null).verdict;
  const pass = { user, created_at: t0, updated_at: t0, body: marker };

  it('an auto-merge (arm) reason with a bound PASS does not verify', () => {
    const auto_merge = { enabled_by: user, commit_title: marker, commit_message: marker };
    expect(verdict(raw({ pull: { head: { sha: HEAD }, auto_merge } }))).toBe('NOT_VERIFIED');
  });

  it('an unedited PR comment and a status verify; a review never does', () => {
    expect(verdict(raw({ comments: [pass] }))).toBe('VERIFIED');
    const s = { context: 'lead-verify', state: 'success', creator: user, created_at: t0 };
    expect(verdict(raw({ statuses: { [HEAD]: [s] } }))).toBe('VERIFIED');
    expect(verdict(raw({ reviews: [{ user, submitted_at: t0, body: marker }] }))).toBe(
      'NOT_VERIFIED'
    );
  });

  it('an edited PASS comment does not verify', () => {
    expect(verdict(raw({ comments: [{ ...pass, updated_at: t2 }] }))).toBe('NOT_VERIFIED');
  });

  it('an edited FAIL still blocks, at its edit time', () => {
    const fail = { user, created_at: t0, updated_at: t2, body: 'RESULT_verifier=FAIL' };
    const pass1 = { ...pass, created_at: t1, updated_at: t1 };
    expect(verdict(raw({ comments: [pass1, fail] }))).toBe('NOT_VERIFIED');
  });

  it('a FAIL in an inline review comment or a review blocks', () => {
    const fail = { user: { login: 'x' }, created_at: t1, body: 'Verdict: FAIL' };
    expect(verdict(raw({ comments: [pass], inline: [fail] }))).toBe('NOT_VERIFIED');
    const review = { user: { login: 'x' }, submitted_at: t1, body: 'Verdict: FAIL' };
    expect(verdict(raw({ comments: [pass], reviews: [review] }))).toBe('NOT_VERIFIED');
  });
});

describe('workflow runs trusted code', () => {
  const wf = readFileSync(join(__dirname, '../../../.github/workflows/lead-verified.yml'), 'utf8');

  it('checks out main (never the PR or its base) without persisted credentials', () => {
    const refs = wf.split('\n').filter((l) => /^\s*ref:/.test(l));
    expect(refs).toEqual(['          ref: main']);
    expect(wf.match(/actions\/checkout@/g)).toHaveLength(1);
    expect(wf).toContain('persist-credentials: false');
    expect(wf).toMatch(/actions\/checkout@[0-9a-f]{40} /);
  });

  it('re-runs on evidence changes and passes the head only as data', () => {
    expect(wf).toMatch(/issue_comment:\n\s+types: \[created, edited, deleted\]/);
    expect(wf).toMatch(/types: \[opened, synchronize, reopened, edited\]/);
    expect(wf).toContain('PR_HEAD: ${{ github.event.pull_request.head.sha }}');
    expect(wf).toContain('node --experimental-strip-types scripts/ci/lead-verified.ts');
    expect(wf).not.toMatch(/refs\/pull\/|git (checkout|switch)/);
  });
});

describe('tableCell', () => {
  it('escapes a backslash before a pipe so the pipe stays inside the cell', () => {
    expect(tableCell('a\\|b')).toBe('a\\\\\\|b');
  });
  it('escapes a lone pipe', () => {
    expect(tableCell('x | y')).toBe('x \\| y');
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

  it('a failure status on the verified SHA, two merges back, blocks the chain', () => {
    sh('switch', '-q', '-C', 'chainfail', verified);
    sh('merge', '-q', '--no-edit', 'main');
    const first = sh('rev-parse', 'HEAD');
    sh('switch', '-q', 'main');
    write('e.txt', 'e\n');
    commit('main once more');
    sh('switch', '-q', 'chainfail');
    sh('merge', '-q', '--no-edit', 'main');
    const head = sh('rev-parse', 'HEAD');
    const p = prAt(verified, head);
    p.commits.push({ sha: first, parents: parents(first) });
    expect(evaluate(p, git).verdict).toBe('VERIFIED');
    p.statuses.push({
      sha: verified,
      context: 'lead-verify',
      state: 'failure',
      creator: 'sethdford',
      createdAt: '2026-10-22T13:00:00Z',
    });
    expect(evaluate(p, git).verdict).toBe('NOT_VERIFIED');
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
    expect(r.reason).toContain('FAIL by ferni-verifier[bot]');
  });
});
