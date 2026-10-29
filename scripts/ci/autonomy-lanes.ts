#!/usr/bin/env node
/**
 * Autonomy lanes: which protected lanes a PR touches, and whether it carries what each
 * lane needs before it may merge. The lanes and who may pass them live in
 * autonomy-policy.json next to this file (main's copy in CI, never the PR's).
 *
 * - crisis: a file under a crisis path (any author), or, for PRs by the loop
 *   (`loopAuthors`), a changed line matching a crisis pattern in any file. Needs an
 *   APPROVED review from `approvers.crisis` on the exact head commit. Other authors'
 *   content-only crisis edits keep the local arm gate's verifier rule instead.
 * - evaluator: a file under an evaluator path. Needs an `evaluatorAuthors` author, or an
 *   approval as for crisis.
 * - privacy: a file under its paths whose path matches `pathPattern` (the LANE rule of
 *   ~/.claude/hooks/pdlc/verify_arm_gate.py minus the crisis terms). Reported only: the arm
 *   gate already requires an independent verifier PASS there.
 *
 * Globs: `**` crosses directories, `*` and `?` stay in one, a leading `!` excludes.
 * Changed lines are the `+`/`-` lines of the diff against the merge base, so a removed
 * line counts as much as an added one.
 *
 *   node --experimental-strip-types scripts/ci/autonomy-lanes.ts <pr>...
 * Env: PR_NUMBER (+ PR_HEAD) or QUEUE_REF (every PR a merge group covers), REPO, MAIN_REF,
 * AUTONOMY_LANES_ENFORCE=1 (exit 1 when a PR lacks what its lanes need; otherwise report
 * only), AUTONOMY_LANES_FIXTURE (a JSON PullInput, for tests). Docs: docs/ci/ci-inventory.md.
 */
import { execFileSync } from 'child_process';
import { appendFileSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { gh, gitOps, pages, parseQueueRef, queueMembers, tableCell } from './lead-verified.ts';

export type Lane = 'crisis' | 'privacy' | 'evaluator';
export type Policy = {
  version: number;
  lanes: {
    crisis: { paths: string[]; changedLinePatterns: string[] };
    privacy: { paths: string[]; pathPattern: string };
    evaluator: { paths: string[] };
  };
  approvers: { crisis: string[] };
  evaluatorAuthors: string[];
  loopAuthors: string[];
};
export type Review = { login: string; state: string; commitId: string };
export type PullInput = {
  head: string;
  author: string;
  files: string[];
  changedLines: string[];
  reviews: Review[];
  /** Files git reports as binary: their content can't be screened line by line. */
  binaryFiles?: string[];
};
export type Verdict = { ok: boolean; reasons: string[] };

export const POLICY_PATH = join(dirname(fileURLToPath(import.meta.url)), 'autonomy-policy.json');

export function loadPolicy(path = POLICY_PATH): Policy {
  return JSON.parse(readFileSync(path, 'utf8')) as Policy;
}

/** One login form: gh prints an App as `app/<slug>`, REST as `<slug>[bot]`. */
export function normalizeLogin(login: string): string {
  const l = login.trim().toLowerCase();
  return l.startsWith('app/') ? `${l.slice(4)}[bot]` : l;
}

const globCache = new Map<string, RegExp>();
function globRegExp(glob: string): RegExp {
  let re = globCache.get(glob);
  if (!re) {
    const body = glob
      .split(/(\*\*\/|\*\*|\*|\?)/)
      .map((part) => {
        if (part === '**/') return '(?:.*/)?';
        if (part === '**') return '.*';
        if (part === '*') return '[^/]*';
        if (part === '?') return '[^/]';
        return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    re = new RegExp(`^${body}$`);
    globCache.set(glob, re);
  }
  return re;
}

export function matchesGlob(path: string, glob: string): boolean {
  return globRegExp(glob).test(path);
}

/** In at least one positive glob and no `!` glob. */
export function inPaths(path: string, globs: string[]): boolean {
  const excluded = globs.some((g) => g.startsWith('!') && matchesGlob(path, g.slice(1)));
  return !excluded && globs.some((g) => !g.startsWith('!') && matchesGlob(path, g));
}

/**
 * The added and removed lines of a unified diff. `---`/`+++` are file headers only between
 * a `diff --git` line and that file's first `@@`; inside a hunk, an added line whose text
 * starts with `++ ` renders as `+++ ...` and is content like any other.
 */
export function changedLinesOf(diff: string): string[] {
  const lines: string[] = [];
  let inHunk = false;
  for (const l of diff.split('\n')) {
    if (l.startsWith('diff --git ')) inHunk = false;
    else if (l.startsWith('@@')) inHunk = true;
    else if (inHunk && /^[+-]/.test(l)) lines.push(l);
  }
  return lines;
}

/** A path git had to quote, or with a control character: can't be matched reliably. */
const isOddPath = (path: string) => path.startsWith('"') || /[\u0000-\u001f\u007f]/.test(path);
const ALL_LANES: Lane[] = ['crisis', 'privacy', 'evaluator'];

/**
 * Fails closed: an odd path is in every lane, and a binary file in a loop PR is crisis
 * (its content can't be screened). Binary files count by path like any other file.
 */
export function classify(
  changedFiles: string[],
  changedLines: string[],
  author: string,
  policy: Policy,
  binaryFiles: string[] = []
): Lane[] {
  const files = [...changedFiles, ...binaryFiles];
  if (files.some(isOddPath)) return [...ALL_LANES];
  const { crisis, privacy, evaluator } = policy.lanes;
  const isLoop = policy.loopAuthors.map(normalizeLogin).includes(normalizeLogin(author));
  const crisisLine = crisis.changedLinePatterns.map((p) => new RegExp(p, 'i'));
  const privacyPath = new RegExp(privacy.pathPattern, 'i');
  const lanes: Lane[] = [];
  if (
    files.some((f) => inPaths(f, crisis.paths)) ||
    (isLoop && binaryFiles.length > 0) ||
    (isLoop && changedLines.some((l) => crisisLine.some((re) => re.test(l))))
  ) {
    lanes.push('crisis');
  }
  if (files.some((f) => inPaths(f, privacy.paths) && privacyPath.test(f))) lanes.push('privacy');
  if (files.some((f) => inPaths(f, evaluator.paths))) lanes.push('evaluator');
  return lanes;
}

const short = (sha: string) => sha.slice(0, 9);

/**
 * An approver's review decides on the exact head: their latest APPROVED or
 * CHANGES_REQUESTED review on that commit must be APPROVED. Reviews on other commits,
 * comments and dismissed reviews never count.
 */
function approvedOnHead(pr: PullInput, approvers: string[]): string | null {
  const allowed = new Set(approvers.map(normalizeLogin));
  const head = pr.head.toLowerCase();
  const decided = new Map<string, string>();
  for (const r of pr.reviews) {
    const login = normalizeLogin(r.login);
    if (!allowed.has(login) || r.commitId.toLowerCase() !== head) continue;
    if (r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED') decided.set(login, r.state);
  }
  return [...decided].find(([, state]) => state === 'APPROVED')?.[0] ?? null;
}

/**
 * Crisis needs an approver's sign-off on the head: their approving review, or their own
 * authorship (GitHub won't let an author approve their own PR). Only the user login
 * counts; a bot or app form of it never does. Evaluator needs an evaluator author or the
 * same sign-off.
 */
export function evaluate(pr: PullInput, policy: Policy): Verdict {
  const lanes = classify(pr.files, pr.changedLines, pr.author, policy, pr.binaryFiles);
  if (lanes.length === 0) return { ok: true, reasons: ['no autonomy lane'] };
  const author = normalizeLogin(pr.author);
  const approvers = policy.approvers.crisis;
  const approver = approvedOnHead(pr, approvers);
  const signed = approver
    ? `approved by ${approver} on ${short(pr.head)}`
    : approvers.map(normalizeLogin).includes(author)
      ? `authored by approver ${author}`
      : null;
  const needApproval = `needs ${approvers.join(' or ')} approval on ${short(pr.head)}`;
  let ok = true;
  const reasons: string[] = [];
  for (const lane of lanes) {
    if (lane === 'crisis') {
      ok &&= signed !== null;
      reasons.push(`crisis lane: ${signed ?? needApproval}`);
    } else if (lane === 'evaluator') {
      const isEvaluator = policy.evaluatorAuthors.map(normalizeLogin).includes(author);
      ok &&= isEvaluator || signed !== null;
      const notEvaluator = `author ${author} is not an evaluator author; ${needApproval}`;
      reasons.push(
        `evaluator lane: ${isEvaluator ? `authored by ${author}` : (signed ?? notEvaluator)}`
      );
    } else {
      reasons.push('privacy lane: the local arm gate requires an independent verifier PASS');
    }
  }
  return { ok, reasons };
}

/**
 * Files, binary files and changed lines of a diff range. Names come NUL-separated and
 * unquoted; content is diffed as text with no textconv or external driver, so no filter
 * can hide what changed. --no-renames: a file moved out of a lane still shows its old path.
 */
export function diffInputs(
  range: string,
  cwd = process.cwd()
): Pick<PullInput, 'files' | 'binaryFiles' | 'changedLines'> {
  const diff = (...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'core.quotePath=false',
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--no-renames',
        ...args,
        range,
      ],
      { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 }
    );
  const binaryFiles = diff('--numstat', '-z')
    .split('\0')
    .filter((entry) => entry.startsWith('-\t-\t'))
    .map((entry) => entry.slice(4));
  return {
    files: diff('--name-only', '-z').split('\0').filter(Boolean),
    binaryFiles,
    changedLines: changedLinesOf(diff('--text', '--no-textconv', '-U0')),
  };
}

type Context = { repo: string; policy: Policy; mainRef: string };

const FETCH_MAIN = '+refs/heads/main:refs/remotes/origin/main';
/** Fetch a ref (and main) as objects to diff only: never checked out, never run. */
const fetchRef = (refspec: string) =>
  execFileSync('git', ['fetch', '-q', '--no-tags', 'origin', refspec, FETCH_MAIN]);

/** A PR's lane inputs: author and reviews from GitHub, files and lines from git. */
function loadPull({ repo, mainRef }: Context, n: number): PullInput {
  fetchRef(`+refs/pull/${n}/head:refs/autonomy-lanes/pr-${n}`);
  const api = `repos/${repo}/pulls/${n}`;
  const pull = gh(['api', api]);
  const head: string = pull.head.sha;
  return {
    head,
    author: String(pull.user?.login ?? ''),
    ...diffInputs(`${mainRef}...${head}`),
    reviews: pages(`${api}/reviews?per_page=100`).map((r) => ({
      login: String(r.user?.login ?? ''),
      state: String(r.state ?? ''),
      commitId: String(r.commit_id ?? ''),
    })),
  };
}

type Row = { pr: string; head: string; verdict: 'OK' | 'NEEDS' | 'ERROR'; reason: string };
const reasonOf = (err: unknown) => `could not evaluate: ${(err as Error).message.split('\n')[0]}`;

function rowOf(label: string, input: PullInput, policy: Policy): Row {
  const v = evaluate(input, policy);
  return {
    pr: label,
    head: short(input.head),
    verdict: v.ok ? 'OK' : 'NEEDS',
    reason: v.reasons.join('; '),
  };
}

/** One PR on its current head; `sha` is the head the event names, which must still be it. */
function checkPr(ctx: Context, n: number, sha?: string): Row {
  try {
    const input = loadPull(ctx, n);
    if (sha && sha.toLowerCase() !== input.head.toLowerCase()) {
      const reason = `PR head is now ${short(input.head)}, not ${short(sha)}`;
      return { pr: `PR #${n}`, head: short(sha), verdict: 'NEEDS', reason };
    }
    return rowOf(`PR #${n}`, input, ctx.policy);
  } catch (err) {
    return { pr: `PR #${n}`, head: sha ? short(sha) : '', verdict: 'ERROR', reason: reasonOf(err) };
  }
}

/** A merge group: every PR it covers, the queued one on the head the ref names. */
function checkQueue(ctx: Context, ref: string): Row[] {
  const queued = parseQueueRef(ref);
  if (!queued) {
    const reason = `no PR number in merge-group ref ${ref}`;
    return [{ pr: 'merge queue', head: '', verdict: 'ERROR', reason }];
  }
  try {
    const name = ref.trim().replace(/^refs\/heads\//, '');
    const local = 'refs/autonomy-lanes/queue';
    fetchRef(`+refs/heads/${name}:${local}`);
    const subjects = gitOps(process.cwd(), ctx.mainRef).queued(local);
    const { members, unnamed } = queueMembers(queued.pr, subjects);
    const rows = members.map((n) => checkPr(ctx, n, n === queued.pr ? queued.sha : undefined));
    if (unnamed.length) {
      const reason = `queued commit names no PR: ${unnamed.join('; ')}`;
      rows.push({ pr: 'merge queue', head: '', verdict: 'ERROR', reason });
    }
    return rows;
  } catch (err) {
    return [{ pr: 'merge queue', head: '', verdict: 'ERROR', reason: reasonOf(err) }];
  }
}

function main(): void {
  const env = process.env;
  const enforce = env.AUTONOMY_LANES_ENFORCE === '1';
  const policy = loadPolicy();
  const ctx: Context = {
    repo: env.REPO || env.GITHUB_REPOSITORY || 'ferni-ai/voiceai',
    mainRef: env.MAIN_REF || 'origin/main',
    policy,
  };
  const title = `Autonomy lanes (${enforce ? 'ENFORCED' : 'report-only'})`;
  const say = (level: string, msg: string) => console.log(`::${level} title=${title}::${msg}`);

  // PR numbers and heads arrive as data; no PR code runs.
  const rows: Row[] = [];
  if (env.AUTONOMY_LANES_FIXTURE) {
    const input = JSON.parse(readFileSync(env.AUTONOMY_LANES_FIXTURE, 'utf8')) as PullInput;
    rows.push(rowOf('fixture', input, policy));
  }
  if (env.QUEUE_REF) rows.push(...checkQueue(ctx, env.QUEUE_REF));
  const prs: { n: number; sha?: string }[] = process.argv.slice(2).map((a) => ({ n: Number(a) }));
  if (env.PR_NUMBER) prs.push({ n: Number(env.PR_NUMBER), sha: env.PR_HEAD || undefined });
  for (const { n, sha } of prs) rows.push(checkPr(ctx, n, sha));
  if (rows.length === 0) {
    const reason = 'no PR given (argument, PR_NUMBER, QUEUE_REF or AUTONOMY_LANES_FIXTURE)';
    rows.push({ pr: 'event', head: '', verdict: 'ERROR', reason });
  }
  for (const r of rows) {
    say(r.verdict === 'OK' ? 'notice' : 'warning', `${r.pr} ${r.head}: ${r.verdict}: ${r.reason}`);
  }

  const summary = [`### ${title}`, '', '| PR | head | verdict | reason |', '| - | - | - | - |']
    .concat(
      rows.map((r) => `| ${r.pr} | \`${r.head}\` | ${r.verdict} | ${tableCell(r.reason)} |`),
      '',
      'Lanes and approvers: scripts/ci/autonomy-policy.json.',
      ''
    )
    .join('\n');
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  else console.log(summary);
  if (enforce && rows.some((r) => r.verdict !== 'OK')) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
