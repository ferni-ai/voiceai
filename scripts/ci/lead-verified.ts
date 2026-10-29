#!/usr/bin/env node
/**
 * Lead verified (REPORT-ONLY): was the exact code a PR merges independently verified?
 * VERIFIED by (i) a `lead-verify` status = success from ferni-verifier[bot] (the primary,
 * tamper-proof evidence); (ii) an allowed author's never-edited PR comment with a line
 * starting `RESULT_verifier=PASS sha=<40 hex>` equal to the head, outside quotes and code
 * fences (post-lead-verify.sh posts both); or (iii) carry-forward: the head merges a
 * verified SHA with a commit on main, and `git merge-tree --write-tree` of the two is
 * clean with exactly the head's tree (chains up to MAX_DEPTH).
 * Fails closed: any FAIL (status, comment, review or inline comment; any author, any SHA,
 * edited or not, quoted or not) blocks every PASS posted at or before it. Prose PASSes,
 * reviews and auto-merge text never verify. CI runs this from main, never the PR's copy.
 *   node --experimental-strip-types scripts/ci/lead-verified.ts <pr>...
 * Merge groups (QUEUE_REF): the repo squashes queue entries, so the queued PRs are the
 * "(#N)" titles of the commits above main, plus the PR the ref names. Each is judged on its
 * current head; a commit with no PR number blocks the group.
 * Env: PR_NUMBER (+ PR_HEAD) or QUEUE_REF; REPO, LEAD_VERIFIED_AUTHORS, MAIN_REF,
 * LEAD_VERIFIED_ENFORCE=1. Docs: docs/ci/ci-inventory.md.
 */
import { execFileSync, spawnSync } from 'child_process';
import { appendFileSync } from 'fs';
import { pathToFileURL } from 'url';

export const STATUS_CONTEXT = 'lead-verify';
/** The dedicated verifier app; implementers' identities never count. */
export const DEFAULT_AUTHORS = ['ferni-verifier[bot]'];
export const MAX_DEPTH = 5;

const BOUND_PASS = /^ {0,3}RESULT_verifier=PASS\s+sha=([0-9a-fA-F]{40})\b/;
const PROSE_PASS =
  /RESULT_verifier=PASS\b|\b(?:Verifier|Verdict):[\s*]*PASS\b|\b[Ii]ndependent(?:ly)?\s+(?:re-?)?verif\w*\b[^\n]*\bPASS\b/;
const FAIL =
  /RESULT_verifier\s*[=:]\s*[*_`]*FAIL|\b(?:verdict|verifier)\s*[:=][\s*_`]*FAIL(?:ED)?\b|\bverification\s+FAILED\b|\bFAILED\s+(?:independent\s+)?verif|\bFAIL(?:ED)?\b[\s:*]+[0-9a-f]{9,40}\b/i;
const SHA_TOKEN = /\b[0-9a-fA-F]{9,40}\b/g;

export type Commit = { sha: string; parents: string[] };
/** kind: 'issue' (PR conversation; the only kind that can PASS), 'review' or 'inline'. */
export type Comment = {
  author: string;
  createdAt: string;
  updatedAt?: string;
  body: string;
  kind?: 'issue' | 'review' | 'inline';
};
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
  /** Subjects of the commits above main, up to `ref`. */
  queued(ref: string): string[];
};
export type Result = { verdict: 'VERIFIED' | 'NOT_VERIFIED'; reason: string };
/** A PASS names one full SHA; a FAIL blocks whatever it names. */
type Event = { kind: 'pass' | 'fail'; sha: string; at: number; by: string; what: string };
type Check = { ok: boolean; reason: string };

const short = (sha: string) => sha.slice(0, 9);
const no = (reason: string): Check => ({ ok: false, reason });

/**
 * Lines outside fenced code. Quotes (`> ...`), indented code and mid-sentence mentions
 * never match anyway: BOUND_PASS must start the line with at most 3 spaces.
 */
export function visibleLines(body: string): string[] {
  const out: string[] = [];
  let fence = '';
  for (const line of body.split(/\r?\n/)) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line)?.[1] ?? '';
    if (fence) {
      if (f[0] === fence[0] && f.length >= fence.length) fence = '';
    } else if (f) fence = f;
    else out.push(line);
  }
  return out;
}

type Markers = { passShas: string[]; prosePass: boolean; fail: boolean; shas: string[] };
export function markers(body: string): Markers {
  const passShas = visibleLines(body).flatMap((l) => {
    const m = BOUND_PASS.exec(l);
    return m ? [m[1].toLowerCase()] : [];
  });
  return {
    passShas,
    prosePass: PROSE_PASS.test(body),
    fail: FAIL.test(body),
    shas: [...new Set((body.match(SHA_TOKEN) ?? []).map((s) => s.toLowerCase()))],
  };
}

/** gh-readonly-queue/<base>/pr-<N>-<sha> → the PR number and head SHA it queues. */
export function parseQueueRef(ref: string): { base: string; pr: number; sha: string } | null {
  const m = /^(?:refs\/heads\/)?gh-readonly-queue\/(.+)\/pr-(\d+)-([0-9a-f]{40})$/.exec(ref.trim());
  return m ? { base: m[1], pr: Number(m[2]), sha: m[3] } : null;
}

/** PR numbers a merge group covers: the ref's PR plus each "(#N)" squash title; the rest is unnamed. */
export function queueMembers(
  tail: number,
  subjects: string[]
): { members: number[]; unnamed: string[] } {
  const members = new Set([tail]);
  const unnamed: string[] = [];
  for (const s of subjects) {
    const m = /\(#(\d+)\)\s*$/.exec(s);
    if (m) members.add(Number(m[1]));
    else unnamed.push(s);
  }
  return { members: [...members], unnamed };
}

function evidence(pr: PullRequest, allowed: Set<string>, notes: string[]): Event[] {
  const events: Event[] = [];
  for (const s of pr.statuses) {
    if (s.context !== STATUS_CONTEXT) continue;
    const [sha, at, by] = [s.sha.toLowerCase(), Date.parse(s.createdAt), s.creator];
    // Blocking needs no trust: a failure status from anyone counts.
    if (/^(failure|error)$/.test(s.state)) events.push({ kind: 'fail', sha, at, by, what: '' });
    if (s.state !== 'success') continue;
    if (allowed.has(by.toLowerCase()))
      events.push({ kind: 'pass', sha, at, by, what: `${STATUS_CONTEXT} status` });
    else notes.push(`ignored ${STATUS_CONTEXT} status by ${by} (author not allowed)`);
  }
  for (const c of pr.comments) {
    const m = markers(c.body);
    const edited = c.updatedAt !== undefined && c.updatedAt !== c.createdAt;
    // A FAIL counts from any author, at its latest time (an unreadable time blocks too).
    const at = Math.max(Date.parse(c.createdAt), Date.parse(c.updatedAt ?? c.createdAt));
    if (m.fail) {
      events.push({ kind: 'fail', sha: m.shas[0] ?? 'any', at, by: c.author, what: '' });
      continue;
    }
    const who = `${c.author}${edited ? ' (edited)' : ''}`;
    if (m.passShas.length === 0) {
      if (m.prosePass) notes.push(`unbound PASS by ${who} (legacy, not counted)`);
      continue;
    }
    if (edited || (c.kind ?? 'issue') !== 'issue' || !allowed.has(c.author.toLowerCase())) {
      notes.push(
        `PASS ${c.kind === 'review' ? 'review' : 'comment'} by ${who} not counted (edited, review or not allowed)`
      );
      continue;
    }
    for (const sha of m.passShas)
      events.push({ kind: 'pass', sha, at, by: c.author, what: 'PASS comment' });
  }
  return events;
}

type Opts = { authors?: string[]; maxDepth?: number };
/** Evaluate a PR's head. `git` is needed only for carry-forward (iii). */
export function evaluate(pr: PullRequest, git: Git | null, opts: Opts = {}): Result {
  const head = pr.headSha.toLowerCase();
  // Blank entries (LEAD_VERIFIED_AUTHORS=",") would match a null author; none left means the default.
  const listed = (opts.authors ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean);
  const allowed = new Set(listed.length ? listed : DEFAULT_AUTHORS.map((a) => a.toLowerCase()));
  const notes: string[] = [];
  const events = evidence(pr, allowed, notes);
  const parentsOf = new Map(
    pr.commits.map((c) => [c.sha.toLowerCase(), c.parents.map((p) => p.toLowerCase())])
  );
  const newest = (on: (e: Event) => boolean) => events.filter(on).sort((a, b) => b.at - a.at)[0];
  // The FAIL that blocks the most: an unreadable time first, else the newest.
  const fails = events.filter((e) => e.kind === 'fail');
  const fail = fails.find((e) => Number.isNaN(e.at)) ?? newest((e) => e.kind === 'fail');

  /** Rules (i) and (ii): a PASS on exactly this SHA, with no FAIL at or after it. */
  const direct = (sha: string): Check => {
    const pass = newest((e) => e.kind === 'pass' && e.sha === sha);
    if (!pass) return no(`no ${STATUS_CONTEXT} status or bound PASS names ${short(sha)}`);
    // A same-second or unreadable (NaN) FAIL time counts as later: doubt goes to FAIL.
    if (fail && !(fail.at < pass.at)) {
      return no(`FAIL by ${fail.by} (${short(fail.sha)}) at or after the PASS on ${short(sha)}`);
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
    queued: (ref) =>
      out(['log', '--format=%s', `${mainRef}..${ref}`])
        .split('\n')
        .filter(Boolean),
  };
}

/** GitHub REST payloads for one PR; statuses is keyed by SHA (every PR commit). */
export type RawPull = Record<
  'pull' | 'commits' | 'comments' | 'reviews' | 'inline' | 'statuses',
  any
>;

/**
 * Map REST payloads to evidence: PR comments, reviews, inline review comments and
 * statuses. The auto-merge (arm) text is ignored: whoever arms writes it.
 */
export function toPullRequest(number: number, raw: RawPull): PullRequest {
  const comment = (kind: Comment['kind'], c: any, at: unknown): Comment => ({
    ...{ kind, author: String(c.user?.login ?? ''), createdAt: String(at ?? '') },
    ...{ updatedAt: c.updated_at ?? undefined, body: String(c.body ?? '') },
  });
  return {
    number,
    headSha: raw.pull.head.sha,
    commits: raw.commits.map((c: any) => ({
      sha: c.sha,
      parents: c.parents.map((p: any) => p.sha),
    })),
    comments: [
      ...raw.comments.map((c: any) => comment('issue', c, c.created_at)),
      ...raw.reviews.map((r: any) => comment('review', r, r.submitted_at)),
      ...(raw.inline ?? []).map((c: any) => comment('inline', c, c.created_at)),
    ],
    statuses: Object.entries(raw.statuses as Record<string, any[]>).flatMap(([sha, list]) =>
      list.map((s) => ({
        ...{ sha, context: s.context, state: s.state },
        ...{ creator: s.creator?.login ?? '', createdAt: s.created_at },
      }))
    ),
  };
}

export const gh = (args: string[]): any =>
  JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
export const pages = (path: string): any[] => gh(['api', '--paginate', '--slurp', path]).flat();

/** Escape a reason for a markdown table cell: backslashes first, then pipes. */
export function tableCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function loadPull(repo: string, n: number): PullRequest {
  const api = `repos/${repo}/pulls/${n}`;
  const pull = gh(['api', api]);
  const commits = pages(`${api}/commits?per_page=100`);
  // Every PR commit: a carry-forward chain can reach back to any of them.
  const statuses: Record<string, any[]> = {};
  for (const sha of new Set([pull.head.sha, ...commits.map((c) => c.sha)])) {
    statuses[sha] = pages(`repos/${repo}/commits/${sha}/statuses?per_page=100`);
  }
  const comments = pages(`repos/${repo}/issues/${n}/comments?per_page=100`);
  const reviews = pages(`${api}/reviews?per_page=100`);
  const inline = pages(`${api}/comments?per_page=100`);
  return toPullRequest(n, { pull, commits, comments, reviews, inline, statuses });
}

type Row = { pr: string; head: string; verdict: string; reason: string };
const reasonOf = (err: unknown) => `could not evaluate: ${(err as Error).message.split('\n')[0]}`;
const FETCH_MAIN = '+refs/heads/main:refs/remotes/origin/main';

/** One PR on its current head, or on `sha` when the event names one (a pull_request run). */
function checkPr(
  repo: string,
  n: number,
  sha: string | undefined,
  authors: string[],
  mainRef: string
): Row {
  let head = sha ? short(sha) : '';
  let verdict = 'ERROR';
  let reason = '';
  try {
    // Fetched as objects for merge-tree only: never checked out, never run.
    const pull = `+refs/pull/${n}/head:refs/lead-verified/pr-${n}`;
    execFileSync('git', ['fetch', '-q', '--no-tags', 'origin', pull, FETCH_MAIN]);
    const pr = loadPull(repo, n);
    head = short(pr.headSha);
    if (sha && sha.toLowerCase() !== pr.headSha) {
      [verdict, reason] = ['NOT_VERIFIED', `PR head is now ${head}, not ${short(sha)}`];
    } else {
      ({ verdict, reason } = evaluate(pr, gitOps(process.cwd(), mainRef), { authors }));
    }
  } catch (err) {
    reason = reasonOf(err);
  }
  return { pr: `PR #${n}`, head, verdict, reason };
}

/** A merge group: every PR it covers must verify on its own current head. */
function checkQueue(repo: string, ref: string, authors: string[], mainRef: string): Row[] {
  const queued = parseQueueRef(ref);
  if (!queued) {
    return [
      {
        pr: 'merge queue',
        head: '',
        verdict: 'NOT_VERIFIED',
        reason: `no PR number in merge-group ref ${ref}`,
      },
    ];
  }
  try {
    const name = ref.trim().replace(/^refs\/heads\//, '');
    execFileSync('git', [
      'fetch',
      '-q',
      '--no-tags',
      'origin',
      `+refs/heads/${name}:refs/lead-verified/queue`,
      FETCH_MAIN,
    ]);
    const subjects = gitOps(process.cwd(), mainRef).queued('refs/lead-verified/queue');
    const { members, unnamed } = queueMembers(queued.pr, subjects);
    const rows = members.map((n) => checkPr(repo, n, undefined, authors, mainRef));
    if (unnamed.length) {
      rows.push({
        pr: 'merge queue',
        head: '',
        verdict: 'NOT_VERIFIED',
        reason: `queued commit names no PR: ${unnamed.join('; ')}`,
      });
    }
    return rows;
  } catch (err) {
    return [{ pr: 'merge queue', head: '', verdict: 'ERROR', reason: reasonOf(err) }];
  }
}

function main(): void {
  const env = process.env;
  const repo = env.REPO || env.GITHUB_REPOSITORY || 'ferni-ai/voiceai';
  const authors = (env.LEAD_VERIFIED_AUTHORS || DEFAULT_AUTHORS.join(',')).split(',');
  const enforce = env.LEAD_VERIFIED_ENFORCE === '1';
  const mainRef = env.MAIN_REF || 'origin/main';
  const title = `Lead verified (${enforce ? 'ENFORCED' : 'report-only'})`;
  const say = (level: string, msg: string) => console.log(`::${level} title=${title}::${msg}`);

  // The PR numbers and the head SHA under test arrive as data; no PR code runs.
  const rows: Row[] = env.QUEUE_REF
    ? checkQueue(
        repo,
        env.QUEUE_REF,
        authors.map((a) => a.trim()),
        mainRef
      )
    : [];
  const prs: { n: number; sha?: string }[] = process.argv.slice(2).map((a) => ({ n: Number(a) }));
  if (env.PR_NUMBER) prs.push({ n: Number(env.PR_NUMBER), sha: env.PR_HEAD || undefined });
  for (const { n, sha } of prs)
    rows.push(
      checkPr(
        repo,
        n,
        sha,
        authors.map((a) => a.trim()),
        mainRef
      )
    );
  if (rows.length === 0) {
    rows.push({
      pr: 'event',
      head: '',
      verdict: 'NOT_VERIFIED',
      reason: 'no PR number given (argument, PR_NUMBER or QUEUE_REF)',
    });
  }
  for (const r of rows) {
    say(
      r.verdict === 'VERIFIED' ? 'notice' : 'warning',
      `${r.pr} ${r.head}: ${r.verdict}: ${r.reason}`
    );
  }

  const summary = [`### ${title}`, '', '| PR | head | verdict | reason |', '| - | - | - | - |']
    .concat(
      rows.map((r) => `| ${r.pr} | \`${r.head}\` | ${r.verdict} | ${tableCell(r.reason)} |`),
      '',
      'How to mark a PR verified: docs/ci/ci-inventory.md (lead-verified.yml).',
      ''
    )
    .join('\n');
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  else console.log(summary);
  if (enforce && rows.some((r) => r.verdict !== 'VERIFIED')) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
