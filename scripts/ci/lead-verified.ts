#!/usr/bin/env node
/**
 * Lead verified (REPORT-ONLY): was the exact code a PR merges independently verified?
 * VERIFIED by (i) a `lead-verify` status = success from an allowed author; (ii) an allowed
 * author's comment or review `RESULT_verifier=PASS sha=<40 hex>` naming the head exactly
 * (post-lead-verify.sh posts both); or (iii) carry-forward: the head merges a verified
 * SHA with a commit on main, and `git merge-tree --write-tree` of the two is clean with
 * exactly the head's tree (chains up to MAX_DEPTH). A FAIL on the same or a later SHA,
 * posted after the PASS, overrides it. Prose verdicts are reported as unbound and never
 * verify; prose FAILs still block. CI runs this from the base branch, never the PR.
 *   node --experimental-strip-types scripts/ci/lead-verified.ts <pr>...
 * Env: PR_NUMBER + PR_HEAD or QUEUE_REF; REPO, LEAD_VERIFIED_AUTHORS, MAIN_REF,
 * LEAD_VERIFIED_ENFORCE=1. Docs: docs/ci/ci-inventory.md.
 */
import { execFileSync, spawnSync } from 'child_process';
import { appendFileSync } from 'fs';
import { pathToFileURL } from 'url';

export const STATUS_CONTEXT = 'lead-verify';
export const DEFAULT_AUTHORS = ['sethdford', 'ferni-agent[bot]'];
export const MAX_DEPTH = 5;

const BOUND = /\bRESULT_verifier=(PASS|FAIL)\s+sha=([0-9a-fA-F]{40})\b/g;
const PROSE_PASS =
  /RESULT_verifier=PASS\b|\b(?:Verifier|Verdict):[\s*]*PASS\b|\b[Ii]ndependent(?:ly)?\s+(?:re-?)?verif\w*\b[^\n]*\bPASS\b/;
const PROSE_FAIL =
  /RESULT_verifier=FAIL\b|\b(?:Verifier|Verdict):[\s*]*FAIL(?:ED)?\b|\bFAILED\s+verif/;
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
/** sha: 40 hex (status, bound marker) or a 9+ hex prefix (prose FAIL). */
type Event = { sha: string; kind: 'pass' | 'fail'; at: number; by: string; what?: string };
type Check = { ok: boolean; reason: string };

const short = (sha: string) => sha.slice(0, 9);
const no = (reason: string): Check => ({ ok: false, reason });

type Bound = { kind: 'pass' | 'fail'; sha: string };
type Markers = { bound: Bound[]; pass: boolean; fail: boolean; shas: string[] };
export function markers(body: string): Markers {
  const bound = [...body.matchAll(BOUND)].map((m) => ({
    kind: m[1] === 'PASS' ? ('pass' as const) : ('fail' as const),
    sha: m[2].toLowerCase(),
  }));
  return {
    bound,
    pass: PROSE_PASS.test(body),
    fail: PROSE_FAIL.test(body),
    shas: [...new Set((body.match(SHA_TOKEN) ?? []).map((s) => s.toLowerCase()))],
  };
}

/** gh-readonly-queue/<base>/pr-<N>-<sha> → the PR number and head SHA it queues. */
export function parseQueueRef(ref: string): { base: string; pr: number; sha: string } | null {
  const m = /^(?:refs\/heads\/)?gh-readonly-queue\/(.+)\/pr-(\d+)-([0-9a-f]{40})$/.exec(ref.trim());
  return m ? { base: m[1], pr: Number(m[2]), sha: m[3] } : null;
}

function evidence(pr: PullRequest, allowed: Set<string>, notes: string[]): Event[] {
  const events: Event[] = [];
  for (const s of pr.statuses) {
    if (s.context !== STATUS_CONTEXT) continue;
    const kind = s.state === 'success' ? 'pass' : /^(failure|error)$/.test(s.state) ? 'fail' : null;
    if (!kind) continue;
    if (!allowed.has(s.creator.toLowerCase())) {
      notes.push(`ignored ${STATUS_CONTEXT} status by ${s.creator} (author not allowed)`);
      continue;
    }
    const [sha, at] = [s.sha.toLowerCase(), Date.parse(s.createdAt)];
    events.push({ sha, kind, at, by: s.creator, what: `${STATUS_CONTEXT} status` });
  }
  for (const c of pr.comments) {
    const m = markers(c.body);
    if (!m.bound.length && !m.pass && !m.fail) continue;
    if (!allowed.has(c.author.toLowerCase())) {
      notes.push(`ignored verdict comment by ${c.author} (author not allowed)`);
      continue;
    }
    const at = Date.parse(c.createdAt);
    for (const b of m.bound) events.push({ ...b, at, by: c.author });
    if (m.bound.length) continue;
    // Prose names a SHA loosely: a FAIL still counts (it can only block), a PASS never does.
    if (m.fail) for (const sha of m.shas) events.push({ sha, kind: 'fail', at, by: c.author });
    else if (m.shas.length)
      notes.push(
        `unbound PASS by ${c.author} on ${m.shas.map(short).join('/')} (legacy, not counted)`
      );
  }
  return events;
}

/** Evaluate a PR's head. `git` is needed only for carry-forward (iii). */
type Opts = { authors?: string[]; maxDepth?: number };
export function evaluate(pr: PullRequest, git: Git | null, opts: Opts = {}): Result {
  const head = pr.headSha.toLowerCase();
  const allowed = new Set((opts.authors ?? DEFAULT_AUTHORS).map((a) => a.toLowerCase()));
  const notes: string[] = [];
  const events = evidence(pr, allowed, notes);
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
  // Only a FAIL may name a SHA by prefix; every PASS event carries the full SHA.
  const names = (e: Event, sha: string) =>
    e.kind === 'pass' ? e.sha === sha : sha.startsWith(e.sha);
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
    return { ok: true, reason: `${pass.what ?? 'PASS comment'} by ${pass.by} on ${short(sha)}` };
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
  if (notes.length) reason += `; ${notes.join('; ')}`;
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
        const conflicts = [...new Set(lines.slice(1, end === -1 ? undefined : end))];
        return { clean: false, conflicts };
      }
      throw new Error(`git merge-tree ${a} ${b}: ${r.stderr.trim()}`);
    },
    treeOf: (sha) => out(['rev-parse', `${sha}^{tree}`]),
    diffPaths: (a, b) => out(['diff', '--name-only', a, b]).split('\n').filter(Boolean),
  };
}

/** GitHub REST payloads for one PR; statuses is keyed by SHA (the head and its parents). */
export type RawPull = Record<'pull' | 'commits' | 'comments' | 'reviews' | 'statuses', any>;

/**
 * Map REST payloads to evidence. Only comments, reviews and statuses count. The
 * auto-merge (arm) text is ignored: whoever arms writes it, so it proves nothing.
 */
export function toPullRequest(number: number, raw: RawPull): PullRequest {
  const comment = (login: unknown, at: unknown, body: unknown): Comment => ({
    ...{ author: String(login ?? ''), createdAt: String(at ?? '') },
    body: String(body ?? ''),
  });
  return {
    number,
    headSha: raw.pull.head.sha,
    commits: raw.commits.map((c: any) => ({
      sha: c.sha,
      parents: c.parents.map((p: any) => p.sha),
    })),
    comments: [
      ...raw.comments.map((c: any) => comment(c.user?.login, c.created_at, c.body)),
      ...raw.reviews.map((r: any) => comment(r.user?.login, r.submitted_at, r.body)),
    ],
    statuses: Object.entries(raw.statuses as Record<string, any[]>).flatMap(([sha, list]) =>
      list.map((s) => ({
        ...{ sha, context: s.context, state: s.state },
        ...{ creator: s.creator?.login ?? '', createdAt: s.created_at },
      }))
    ),
  };
}

const gh = (args: string[]): any =>
  JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const pages = (path: string): any[] => gh(['api', '--paginate', '--slurp', path]).flat();

function loadPull(repo: string, n: number): PullRequest {
  const api = `repos/${repo}`;
  const pull = gh(['api', `${api}/pulls/${n}`]);
  const commits = pages(`${api}/pulls/${n}/commits?per_page=100`);
  const parents = commits.find((c) => c.sha === pull.head.sha)?.parents ?? [];
  const statuses: Record<string, any[]> = {};
  for (const sha of [pull.head.sha, ...parents.map((p: any) => p.sha)]) {
    statuses[sha] = pages(`${api}/commits/${sha}/statuses?per_page=100`);
  }
  const comments = pages(`${api}/issues/${n}/comments?per_page=100`);
  const reviews = pages(`${api}/pulls/${n}/reviews?per_page=100`);
  return toPullRequest(n, { pull, commits, comments, reviews, statuses });
}

function main(): void {
  const env = process.env;
  const repo = env.REPO || env.GITHUB_REPOSITORY || 'ferni-ai/voiceai';
  const authors = (env.LEAD_VERIFIED_AUTHORS || DEFAULT_AUTHORS.join(',')).split(',');
  const enforce = env.LEAD_VERIFIED_ENFORCE === '1';
  const title = `Lead verified (${enforce ? 'ENFORCED' : 'report-only'})`;
  const say = (level: string, msg: string) => console.log(`::${level} title=${title}::${msg}`);

  // The PR number and the head SHA under test arrive as data; no PR code runs.
  const prs: { n: number; sha?: string }[] = process.argv.slice(2).map((a) => ({ n: Number(a) }));
  if (env.PR_NUMBER) prs.push({ n: Number(env.PR_NUMBER), sha: env.PR_HEAD });
  const queued = env.QUEUE_REF ? parseQueueRef(env.QUEUE_REF) : null;
  if (queued) prs.push({ n: queued.pr, sha: queued.sha });
  else if (env.QUEUE_REF) say('warning', `no PR number in merge-group ref ${env.QUEUE_REF}`);
  if (prs.length === 0) say('warning', 'no PR number given (argument, PR_NUMBER or QUEUE_REF)');

  const rows: string[] = [];
  let failed = prs.length === 0;
  for (const { n, sha } of prs) {
    let head = sha ? short(sha) : '';
    let verdict = 'ERROR';
    let reason: string;
    try {
      // Fetched as objects for merge-tree only: never checked out, never run.
      const pull = `+refs/pull/${n}/head:refs/lead-verified/pr-${n}`;
      const main = '+refs/heads/main:refs/remotes/origin/main';
      execFileSync('git', ['fetch', '-q', '--no-tags', 'origin', pull, main]);
      const pr = loadPull(repo, n);
      head = short(pr.headSha);
      if (sha && sha.toLowerCase() !== pr.headSha) {
        [verdict, reason] = ['NOT_VERIFIED', `PR head is now ${head}, not ${short(sha)}`];
      } else {
        const git = gitOps(process.cwd(), env.MAIN_REF || 'origin/main');
        ({ verdict, reason } = evaluate(pr, git, { authors: authors.map((a) => a.trim()) }));
      }
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
