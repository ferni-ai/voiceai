#!/usr/bin/env node
/**
 * Lead verified (REPORT-ONLY): was the exact code a PR merges independently verified?
 * The head is VERIFIED by (i) a `lead-verify` status = success from an allowed author
 * (post-lead-verify.sh); (ii) an allowed author's comment, review or auto-merge reason
 * with a PASS marker and a 9+ hex prefix of the head; or (iii) carry-forward: the head
 * merges a verified SHA with a commit on main, and `git merge-tree --write-tree` of the
 * two is clean with exactly the head's tree (chains up to MAX_DEPTH). A FAIL on the same
 * or a later SHA, posted after the PASS, overrides it; FAIL+PASS in one comment is FAIL.
 * Docs: docs/ci/ci-inventory.md. Node builtins only (CI skips pnpm install).
 *
 *   node --experimental-strip-types scripts/ci/lead-verified.ts <pr>...   (or env PR_NUMBER)
 * Env: QUEUE_REF, REPO, LEAD_VERIFIED_AUTHORS, MAIN_REF, LEAD_VERIFIED_ENFORCE=1 (exit 1).
 */
import { execFileSync, spawnSync } from 'child_process';
import { appendFileSync } from 'fs';
import { pathToFileURL } from 'url';

export const STATUS_CONTEXT = 'lead-verify';
export const DEFAULT_AUTHORS = ['sethdford', 'ferni-agent[bot]'];
export const MAX_DEPTH = 5;

const PASS = /RESULT_verifier=PASS\b|\b(?:Verifier|Verdict):[\s*]*PASS\b/;
const PASS_INDEPENDENT = /\b[Ii]ndependent(?:ly)?\s+(?:re-?)?verif\w*\b[^\n]*\bPASS\b/;
const FAIL = /RESULT_verifier=FAIL\b|\b(?:Verifier|Verdict):[\s*]*FAIL(?:ED)?\b|\bFAILED\s+verif/;
const SHA_TOKEN = /\b[0-9a-fA-F]{9,40}\b/g;

export type Commit = { sha: string; parents: string[] };
export type Comment = { author: string; createdAt: string; body: string };
export type Status = {
  sha: string;
  context: string;
  state: string;
  creator: string;
  createdAt: string;
};
export type PullRequest = {
  number: number;
  headSha: string;
  commits: Commit[];
  comments: Comment[];
  statuses: Status[];
};
type Merge = { clean: true; tree: string } | { clean: false; conflicts: string[] };
export type Git = {
  onMain(sha: string): boolean;
  mergeTree(a: string, b: string): Merge;
  treeOf(sha: string): string;
  diffPaths(treeA: string, treeB: string): string[];
};
export type Result = { verdict: 'VERIFIED' | 'NOT_VERIFIED'; reason: string };
/** sha: full (status) or a 9+ hex prefix (comment). */
type Event = { sha: string; kind: 'pass' | 'fail'; at: number; by: string; what: string };
type Check = { ok: boolean; reason: string };

const short = (sha: string) => sha.slice(0, 9);
const no = (reason: string): Check => ({ ok: false, reason });

export function markers(body: string): { pass: boolean; fail: boolean; shas: string[] } {
  return {
    pass: PASS.test(body) || PASS_INDEPENDENT.test(body),
    fail: FAIL.test(body),
    shas: [...new Set((body.match(SHA_TOKEN) ?? []).map((s) => s.toLowerCase()))],
  };
}

/** gh-readonly-queue/<base>/pr-<N>-<sha> → the PR number and head SHA it queues. */
export function parseQueueRef(ref: string): { base: string; pr: number; sha: string } | null {
  const m = /^(?:refs\/heads\/)?gh-readonly-queue\/(.+)\/pr-(\d+)-([0-9a-f]{40})$/.exec(ref.trim());
  return m ? { base: m[1], pr: Number(m[2]), sha: m[3] } : null;
}

function evidence(pr: PullRequest, allowed: Set<string>, ignored: string[]): Event[] {
  const events: Event[] = [];
  for (const s of pr.statuses) {
    if (s.context !== STATUS_CONTEXT) continue;
    const kind = s.state === 'success' ? 'pass' : /^(failure|error)$/.test(s.state) ? 'fail' : null;
    if (!kind) continue;
    if (!allowed.has(s.creator.toLowerCase())) {
      ignored.push(`${STATUS_CONTEXT} status by ${s.creator}`);
      continue;
    }
    const [sha, at] = [s.sha.toLowerCase(), Date.parse(s.createdAt)];
    events.push({ sha, kind, at, by: s.creator, what: `${STATUS_CONTEXT} status` });
  }
  for (const c of pr.comments) {
    const m = markers(c.body);
    if (!m.pass && !m.fail) continue;
    if (!allowed.has(c.author.toLowerCase())) {
      ignored.push(`${m.fail ? 'FAIL' : 'PASS'} comment by ${c.author}`);
      continue;
    }
    const kind = m.fail ? 'fail' : 'pass';
    const at = Date.parse(c.createdAt);
    for (const sha of m.shas) events.push({ sha, kind, at, by: c.author, what: 'PASS comment' });
  }
  return events;
}

/** Evaluate a PR's head. `git` is needed only for carry-forward (iii). */
export function evaluate(
  pr: PullRequest,
  git: Git | null,
  opts: { authors?: string[]; maxDepth?: number } = {}
): Result {
  const head = pr.headSha.toLowerCase();
  const allowed = new Set((opts.authors ?? DEFAULT_AUTHORS).map((a) => a.toLowerCase()));
  const ignored: string[] = [];
  const events = evidence(pr, allowed, ignored);
  const parentsOf = new Map(
    pr.commits.map((c) => [c.sha.toLowerCase(), c.parents.map((p) => p.toLowerCase())])
  );

  const ancestors = (sha: string): Set<string> => {
    const seen = new Set<string>();
    for (const todo = [sha]; todo.length;) {
      const s = todo.pop() as string;
      if (seen.has(s)) continue;
      seen.add(s);
      todo.push(...(parentsOf.get(s) ?? []));
    }
    return seen;
  };
  const headAncestors = ancestors(head);
  // Commits from `sha` up to the head: a FAIL on one is on "the same or a later SHA".
  const laterOrSame = (sha: string) =>
    [...headAncestors].filter((x) => x === sha || ancestors(x).has(sha));
  const names = (e: Event, sha: string) => sha.startsWith(e.sha);
  const newest = (kind: Event['kind'], on: (e: Event) => boolean) =>
    events.filter((e) => e.kind === kind && on(e)).sort((a, b) => b.at - a.at)[0];

  /** Rules (i) and (ii), with the FAIL override. */
  const direct = (sha: string): Check => {
    const pass = newest('pass', (e) => names(e, sha));
    if (!pass) return no(`no ${STATUS_CONTEXT} status or verifier PASS names ${short(sha)}`);
    const scope = laterOrSame(sha);
    const fail = newest('fail', (e) => scope.some((x) => names(e, x)));
    // A same-second or unreadable (NaN) FAIL time counts as later: doubt goes to FAIL.
    if (fail && !(fail.at < pass.at)) {
      return no(
        `FAIL by ${fail.by} on ${short(fail.sha)} was posted after the PASS on ${short(sha)}`
      );
    }
    return { ok: true, reason: `${pass.what} by ${pass.by} on ${short(sha)}` };
  };

  /** Rule (iii): a pure merge of a verified commit and a commit on main. */
  const carried = (sha: string, depth: number): Check => {
    const parents = parentsOf.get(sha) ?? [];
    if (parents.length !== 2) return no(`${short(sha)} is not a two-parent merge`);
    if (!git) return no('no git repository to check the merge');
    const why: string[] = [];
    for (const [v, m] of [parents, [parents[1], parents[0]]]) {
      let pv = direct(v);
      if (!pv.ok && depth > 1) {
        const deeper = carried(v, depth - 1);
        if (deeper.ok) pv = deeper;
      }
      if (!pv.ok) {
        why.push(pv.reason);
        continue;
      }
      if (!git.onMain(m)) {
        why.push(`parent ${short(m)} is not on main`);
        continue;
      }
      const into = `main ${short(m)} into verified ${short(v)}`;
      const mt = git.mergeTree(v, m);
      if (!mt.clean) {
        const files = mt.conflicts.join(', ');
        return no(
          `merging ${into} conflicts (${files}); the resolution in ${short(sha)} is unverified`
        );
      }
      const tree = git.treeOf(sha);
      if (mt.tree !== tree) {
        const paths = git.diffPaths(mt.tree, tree).join(', ');
        return no(`${short(sha)} is not a pure merge of ${into}: extra edits in ${paths}`);
      }
      return { ok: true, reason: `pure merge of ${into} (${pv.reason})` };
    }
    return no(why.join('; '));
  };

  const d = direct(head);
  if (d.ok) return { verdict: 'VERIFIED', reason: d.reason };
  let reason = d.reason;
  if ((parentsOf.get(head) ?? []).length === 2) {
    const c = carried(head, opts.maxDepth ?? MAX_DEPTH);
    if (c.ok) return { verdict: 'VERIFIED', reason: `carried forward: ${c.reason}` };
    reason += `; carry-forward: ${c.reason}`;
  }
  if (ignored.length) reason += `; ignored (author not allowed): ${ignored.join(', ')}`;
  return { verdict: 'NOT_VERIFIED', reason };
}

/** Git operations against a local clone; mainRef must be fetched. */
export function gitOps(cwd: string, mainRef = 'origin/main'): Git {
  const run = (args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  const out = (args: string[]) => {
    const r = run(args);
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
    return r.stdout.trim();
  };
  return {
    onMain: (sha) => run(['merge-base', '--is-ancestor', sha, mainRef]).status === 0,
    mergeTree: (a, b) => {
      // Exit 0: clean, line 1 is the tree. Exit 1: conflicts, file names until a blank line.
      const r = run(['merge-tree', '--write-tree', '--name-only', '--no-messages', a, b]);
      const lines = r.stdout.split('\n');
      if (r.status === 0) return { clean: true, tree: lines[0].trim() };
      if (r.status === 1) {
        const end = lines.indexOf('', 1);
        return {
          clean: false,
          conflicts: [...new Set(lines.slice(1, end === -1 ? undefined : end))],
        };
      }
      throw new Error(`git merge-tree ${a} ${b}: ${r.stderr.trim()}`);
    },
    treeOf: (sha) => out(['rev-parse', `${sha}^{tree}`]),
    diffPaths: (a, b) => out(['diff', '--name-only', a, b]).split('\n').filter(Boolean),
  };
}

const gh = (args: string[]): any =>
  JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const pages = (path: string): any[] => gh(['api', '--paginate', '--slurp', path]).flat();
const asComment = (login: unknown, at: unknown, body: unknown): Comment => ({
  author: String(login ?? ''),
  createdAt: String(at ?? ''),
  body: String(body ?? ''),
});

function loadPull(repo: string, n: number): PullRequest {
  const api = `repos/${repo}`;
  const headSha: string = gh(['api', `${api}/pulls/${n}`]).head.sha;
  const commits: Commit[] = pages(`${api}/pulls/${n}/commits?per_page=100`).map((c) => ({
    sha: c.sha,
    parents: c.parents.map((p: { sha: string }) => p.sha),
  }));
  const comments = [
    ...pages(`${api}/issues/${n}/comments?per_page=100`).map((c) =>
      asComment(c.user?.login, c.created_at, c.body)
    ),
    ...pages(`${api}/pulls/${n}/reviews?per_page=100`).map((r) =>
      asComment(r.user?.login, r.submitted_at, r.body)
    ),
  ];
  // The merge-queue arm reason, while auto-merge is armed.
  const view = ['pr', 'view', `${n}`, '-R', repo, '--json', 'autoMergeRequest'];
  const arm = gh(view).autoMergeRequest;
  const reason = `${arm?.commitHeadline}\n${arm?.commitBody}`;
  if (arm) comments.push(asComment(arm.enabledBy?.login, arm.enabledAt, reason));
  const parents = commits.find((c) => c.sha === headSha)?.parents ?? [];
  const statuses: Status[] = [headSha, ...parents].flatMap((sha) =>
    pages(`${api}/commits/${sha}/statuses?per_page=100`).map((s) => ({
      ...{ sha, context: s.context, state: s.state },
      ...{ creator: s.creator?.login ?? '', createdAt: s.created_at },
    }))
  );
  return { number: n, headSha, commits, comments, statuses };
}

function main(): void {
  const env = process.env;
  const repo = env.REPO || env.GITHUB_REPOSITORY || 'ferni-ai/voiceai';
  const authors = (env.LEAD_VERIFIED_AUTHORS || DEFAULT_AUTHORS.join(',')).split(',');
  const enforce = env.LEAD_VERIFIED_ENFORCE === '1';
  const title = `Lead verified (${enforce ? 'ENFORCED' : 'report-only'})`;
  const say = (level: string, msg: string) => console.log(`::${level} title=${title}::${msg}`);

  const prs = [...process.argv.slice(2), env.PR_NUMBER ?? ''].filter(Boolean).map(Number);
  const queued = env.QUEUE_REF ? parseQueueRef(env.QUEUE_REF) : null;
  if (queued) prs.push(queued.pr);
  else if (env.QUEUE_REF) say('warning', `no PR number in merge-group ref ${env.QUEUE_REF}`);
  if (prs.length === 0) say('warning', 'no PR number given (argument, PR_NUMBER or QUEUE_REF)');

  const rows: string[] = [];
  let failed = prs.length === 0;
  for (const n of new Set(prs)) {
    let head = '';
    let verdict = 'ERROR';
    let reason: string;
    try {
      const pull = `+refs/pull/${n}/head:refs/lead-verified/pr-${n}`;
      const main = '+refs/heads/main:refs/remotes/origin/main';
      execFileSync('git', ['fetch', '-q', '--no-tags', 'origin', pull, main]);
      const pr = loadPull(repo, n);
      head = short(pr.headSha);
      const git = gitOps(process.cwd(), env.MAIN_REF || 'origin/main');
      ({ verdict, reason } = evaluate(pr, git, { authors: authors.map((a) => a.trim()) }));
    } catch (err) {
      reason = `could not evaluate: ${(err as Error).message.split('\n')[0]}`;
    }
    if (verdict !== 'VERIFIED') failed = true;
    say(verdict === 'VERIFIED' ? 'notice' : 'warning', `PR #${n} ${head}: ${verdict}: ${reason}`);
    rows.push(`| #${n} | \`${head}\` | ${verdict} | ${reason.replace(/\|/g, '\\|')} |`);
  }

  const summary = [`### ${title}`, '', '| PR | head | verdict | reason |', '| - | - | - | - |']
    .concat(rows, '', 'How to mark a PR verified: docs/ci/ci-inventory.md (lead-verified.yml).', '')
    .join('\n');
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  else console.log(summary);
  if (enforce && failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
