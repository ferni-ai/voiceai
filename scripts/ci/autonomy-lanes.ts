#!/usr/bin/env node
/**
 * Autonomy lanes: which protected lanes a PR touches, and whether it carries what each
 * lane needs before it may merge. The lanes and who may pass them live in
 * autonomy-policy.json next to this file (main's copy in CI, never the PR's).
 *
 * - crisis: a file under a crisis path (any author), or, in a loop PR, a changed line
 *   matching a crisis pattern or naming a crisis module's export (`symbolsFile`), a binary
 *   file, or an import of a crisis module. A loop PR is one whose head branch starts with
 *   `loopBranchPrefix`: that's the anchor GitHub enforces, through a ruleset that lets the
 *   loop's app push only there (SETUP.md). Commit logins (`loopAuthors` as opener, author
 *   or committer, or no linked account) also count, but they come from emails anyone can
 *   set, so they only add screening. Needs an APPROVED review from `approvers.crisis` on
 *   the exact head commit. Other authors' content-only crisis edits keep the local arm
 *   gate's verifier rule instead.
 * - evaluator: a file under an evaluator path. Needs an `evaluatorAuthors` opener whose
 *   every commit GitHub verified with it as committer, or the crisis approval.
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
import { dirname, join, posix } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { gh, gitOps, pages, parseQueueRef, queueMembers, tableCell } from './lead-verified.ts';

export type Lane = 'crisis' | 'privacy' | 'evaluator';
export type Policy = {
  version: number;
  lanes: {
    crisis: {
      paths: string[];
      changedLinePatterns: string[];
      importFallbackPattern: string;
      /** JSON list of every name the crisis modules export, next to the policy. */
      symbolsFile: string;
      /** Filled by loadPolicy from symbolsFile. */
      symbols?: string[];
    };
    privacy: { paths: string[]; pathPattern: string };
    evaluator: { paths: string[] };
  };
  approvers: { crisis: string[] };
  evaluatorAuthors: string[];
  loopAuthors: string[];
  /** Head branches only the loop's app can push to (a ruleset enforces it). */
  loopBranchPrefix: string;
};
export type Review = { login: string; state: string; commitId: string };
/**
 * A commit's GitHub logins ('' when its email isn't linked to an account) and whether
 * GitHub verified its signature. Logins come from the commit's email, so anyone who can
 * push can claim any of them; only a verified signature proves who made the commit.
 */
export type CommitIdentity = { author: string; committer: string; verified: boolean };
export type PullInput = {
  head: string;
  author: string;
  files: string[];
  changedLines: string[];
  reviews: Review[];
  /** Files git reports as binary: their content can't be screened line by line. */
  binaryFiles?: string[];
  /** The PR's head branch name. */
  headRef?: string;
  /** Specifiers on changed lines, for the loop's crisis-import screen. */
  imports?: ImportRef[];
  /** Every commit's identities; null when they couldn't be read (fails closed). */
  commits?: CommitIdentity[] | null;
};
/** A module specifier imported, required or re-exported on a changed line of `file`. */
export type ImportRef = { file: string; specifier: string };
export type Verdict = { ok: boolean; reasons: string[] };

export const POLICY_PATH = join(dirname(fileURLToPath(import.meta.url)), 'autonomy-policy.json');

export function loadPolicy(path = POLICY_PATH): Policy {
  const policy = JSON.parse(readFileSync(path, 'utf8')) as Policy;
  const symbols = join(dirname(path), policy.lanes.crisis.symbolsFile);
  policy.lanes.crisis.symbols = JSON.parse(readFileSync(symbols, 'utf8')) as string[];
  return policy;
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
  return hunkLines(diff).map((l) => l.line);
}

/**
 * Each changed line with the file it belongs to: the `+++ b/` path, or the `--- a/` path
 * of a deleted file. '' when git quoted the name (the caller can't resolve against it).
 */
function hunkLines(diff: string): { file: string; line: string }[] {
  const lines: { file: string; line: string }[] = [];
  let inHunk = false;
  let file = '';
  for (const l of diff.split('\n')) {
    if (l.startsWith('diff --git ')) [inHunk, file] = [false, ''];
    else if (l.startsWith('@@')) inHunk = true;
    else if (inHunk) {
      if (/^[+-]/.test(l)) lines.push({ file, line: l });
    } else if (l.startsWith('--- a/') || l.startsWith('+++ b/'))
      file = l.slice(6).replace(/\t$/, '');
  }
  return lines;
}

const SPECIFIER = /(?:\bimport\b|\brequire\s*\(|\bfrom\b)[^'"`]*['"`]([^'"`]+)['"`]/g;

/** Every import, require or `from` specifier on a changed line of a unified diff. */
export function importsOf(diff: string): ImportRef[] {
  return hunkLines(diff).flatMap(({ file, line }) =>
    [...line.matchAll(SPECIFIER)].map((m) => ({ file, specifier: m[1] }))
  );
}

/**
 * The repository paths a relative specifier can load, resolved against its file's
 * directory: as written, with a .js-style extension swapped for .ts, with .ts added, and
 * as a directory's index.ts. Null when it can't be resolved (not relative, file unknown,
 * or outside the repository).
 */
export function importTargets({ file, specifier }: ImportRef): string[] | null {
  if (!file || !specifier.startsWith('.')) return null;
  const path = posix.normalize(posix.join(posix.dirname(file), specifier));
  if (path.startsWith('..')) return null;
  const ext = posix.extname(path);
  if (ext && !/^\.[cm]?jsx?$/.test(ext)) return [path];
  const stem = ext ? path.slice(0, -ext.length) : path;
  return [path, `${stem}.ts`, `${stem}/index.ts`];
}

/** A path git had to quote, or with a control character: can't be matched reliably. */
const isOddPath = (path: string) => path.startsWith('"') || /[\u0000-\u001f\u007f]/.test(path);
const ALL_LANES: Lane[] = ['crisis', 'privacy', 'evaluator'];

/**
 * Fails closed: an odd path is in every lane, and a binary file in a loop PR is crisis
 * (its content can't be screened). Binary files count by path like any other file. A loop
 * PR's import of a crisis module is crisis: a relative specifier by the path it resolves
 * to, any other by `importFallbackPattern`.
 */
export function classify(
  changedFiles: string[],
  changedLines: string[],
  contributors: string | string[],
  policy: Policy,
  { binaryFiles = [], imports = [] }: Pick<PullInput, 'binaryFiles' | 'imports'> = {}
): Lane[] {
  const files = [...changedFiles, ...binaryFiles];
  if (files.some(isOddPath)) return [...ALL_LANES];
  const { crisis, privacy, evaluator } = policy.lanes;
  const loop = new Set(policy.loopAuthors.map(normalizeLogin));
  const isLoop = [contributors].flat().some((login) => loop.has(normalizeLogin(login)));
  const crisisLine = crisis.changedLinePatterns.map((p) => new RegExp(p, 'i'));
  const symbols = crisis.symbols ?? [];
  if (symbols.length) crisisLine.push(wholeWords(symbols));
  const fallback = new RegExp(crisis.importFallbackPattern, 'i');
  const crisisImport = (ref: ImportRef) => {
    const targets = importTargets(ref);
    return targets ? targets.some((t) => inPaths(t, crisis.paths)) : fallback.test(ref.specifier);
  };
  const privacyPath = new RegExp(privacy.pathPattern, 'i');
  const lanes: Lane[] = [];
  if (
    files.some((f) => inPaths(f, crisis.paths)) ||
    (isLoop && binaryFiles.length > 0) ||
    (isLoop && changedLines.some((l) => crisisLine.some((re) => re.test(l)))) ||
    (isLoop && imports.some(crisisImport))
  ) {
    lanes.push('crisis');
  }
  if (files.some((f) => inPaths(f, privacy.paths) && privacyPath.test(f))) lanes.push('privacy');
  if (files.some((f) => inPaths(f, evaluator.paths))) lanes.push('evaluator');
  return lanes;
}

/** One case-sensitive regex matching any of `names` as a whole identifier. */
function wholeWords(names: string[]): RegExp {
  const alternatives = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`(?<![\\w$])(?:${alternatives})(?![\\w$])`);
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
 * Who put code in the PR: its opener and every commit's author and committer. A head
 * branch under `loopBranchPrefix` is the loop's: commit logins come from emails anyone
 * can set, but a ruleset lets only the loop's app push there (and only there). Commits
 * that couldn't be read, or with an author or committer no account is linked to, count
 * as the loop's too (fails closed).
 */
function contributorsOf(pr: PullInput, policy: Policy): string[] {
  const commits = pr.commits ?? [];
  const unattributed = commits.some((c) => !c.author || !c.committer);
  const loopBranch = (pr.headRef ?? '').startsWith(policy.loopBranchPrefix);
  const loop = pr.commits === null || unattributed || loopBranch ? policy.loopAuthors : [];
  return [pr.author, ...commits.flatMap((c) => [c.author, c.committer]), ...loop];
}

/**
 * The opener's login when it is one of `logins` and GitHub verified every commit's
 * signature with the opener as committer: what the ferni-eval app gets by committing
 * through the GitHub API, and what a git push by anyone else can't produce. Null
 * otherwise, and when the commits are unknown.
 */
function verifiedBy(pr: PullInput, logins: string[]): string | null {
  const opener = normalizeLogin(pr.author);
  if (!logins.map(normalizeLogin).includes(opener)) return null;
  const commits = pr.commits ?? [];
  const own = (c: CommitIdentity) => c.verified && normalizeLogin(c.committer) === opener;
  return commits.length > 0 && commits.every(own) ? opener : null;
}

/**
 * Crisis needs an APPROVED review by an approver on the exact head, with no exception:
 * commit logins can be spoofed, so authorship never signs. Seth's own crisis PRs (he
 * can't approve them) merge with his ruleset admin bypass. Evaluator needs an evaluator
 * author whose every commit is verified (see verifiedBy), or the same approval.
 */
export function evaluate(pr: PullInput, policy: Policy): Verdict {
  const contributors = contributorsOf(pr, policy);
  const lanes = classify(pr.files, pr.changedLines, contributors, policy, pr);
  if (lanes.length === 0) return { ok: true, reasons: ['no autonomy lane'] };
  const approvers = policy.approvers.crisis;
  const approver = approvedOnHead(pr, approvers);
  const approved = approver ? `approved by ${approver} on ${short(pr.head)}` : null;
  const needApproval = `needs ${approvers.join(' or ')} approval on ${short(pr.head)}`;
  let ok = true;
  const reasons: string[] = [];
  for (const lane of lanes) {
    if (lane === 'crisis') {
      ok &&= approved !== null;
      reasons.push(`crisis lane: ${approved ?? needApproval}`);
    } else if (lane === 'evaluator') {
      const evaluator = verifiedBy(pr, policy.evaluatorAuthors);
      ok &&= evaluator !== null || approved !== null;
      const author = normalizeLogin(pr.author);
      const notEvaluator = `${author} is not an evaluator author with verified commits; ${needApproval}`;
      reasons.push(
        `evaluator lane: ${evaluator ? `verified commits by ${evaluator}` : (approved ?? notEvaluator)}`
      );
    } else {
      reasons.push('privacy lane: the local arm gate requires an independent verifier PASS');
    }
  }
  if (pr.commits === null) reasons.push('commits unreadable: screened as the loop');
  return { ok, reasons };
}

/**
 * Commit identities from a REST `pulls/{n}/commits` read; null when the read fails or
 * returns fewer than the PR's `expected` commits (the list stops at 250), so a missing
 * loop commit can't go unseen.
 */
export function readCommits(read: () => any[], expected: number): CommitIdentity[] | null {
  try {
    const commits = read().map((c) => ({
      author: String(c.author?.login ?? ''),
      committer: String(c.committer?.login ?? ''),
      verified: c.commit?.verification?.verified === true,
    }));
    return commits.length === expected ? commits : null;
  } catch {
    return null;
  }
}

/**
 * Files, binary files and changed lines of a diff range. Names come NUL-separated and
 * unquoted; content is diffed as text with no textconv or external driver, so no filter
 * can hide what changed. --no-renames: a file moved out of a lane still shows its old path.
 */
export function diffInputs(
  range: string,
  cwd = process.cwd()
): Pick<PullInput, 'files' | 'binaryFiles' | 'changedLines' | 'imports'> {
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
  const content = diff('--text', '--no-textconv', '-U0');
  return {
    files: diff('--name-only', '-z').split('\0').filter(Boolean),
    binaryFiles,
    changedLines: changedLinesOf(content),
    imports: importsOf(content),
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
    headRef: String(pull.head.ref ?? ''),
    ...diffInputs(`${mainRef}...${head}`),
    commits: readCommits(() => pages(`${api}/commits?per_page=100`), Number(pull.commits)),
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
    // Each PR on its current head: the ref's sha is the commit the entry is built on, not
    // the PR head, and a push ejects the PR from the queue anyway.
    const rows = members.map((n) => checkPr(ctx, n));
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
