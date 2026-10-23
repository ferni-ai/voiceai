/**
 * What a change adds, measured against its merge base: the shared core of the quality gates.
 *
 * Gates used to compare the tree with a committed list of today's violations. On a repo
 * merging ~120 commits a day those lists went stale within hours, and every PR then failed
 * for debt it didn't add (2026-10-23 guardrail review). Instead each gate measures the PR
 * head AND the commit it branches from, and fails only on what the diff adds. Moves and
 * splits are free: git rename detection (renameLimit=0, so it is never skipped) maps a
 * moved file to its old path.
 *
 * The base, in order: QUALITY_BASE; in GitHub Actions the event's merge-group base,
 * pull-request base or pre-push commit; otherwise `git merge-base HEAD origin/main`. A base
 * missing from a shallow checkout is fetched (one commit, depth 1).
 *
 * Keep this file identical across the gate PRs that add it.
 *
 * @module quality/merge-base
 */
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

export interface BaseDiff {
  base: string;
  /** head path → base path, for files git matched as renames */
  renamedFrom: Map<string, string>;
  /** head paths that are new in this change (not renames), untracked files included */
  added: Set<string>;
  /** head paths added, modified or renamed (not deleted) */
  changed: string[];
  /** base paths deleted (not renamed) */
  deleted: string[];
}

interface Run {
  status: number | null;
  stdout: Buffer;
  stderr: string;
}

function git(root: string, args: string[], input?: string): Run {
  const r = spawnSync('git', args, { cwd: root, input, maxBuffer: 1024 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout ?? Buffer.alloc(0), stderr: r.stderr?.toString() ?? '' };
}
const out = (r: Run): string => r.stdout.toString('utf8');
const hasCommit = (root: string, sha: string): boolean => git(root, ['cat-file', '-e', `${sha}^{commit}`]).status === 0;
const ZERO = /^0+$/;

/** The base commit a change is measured against (see the module comment). Throws when there is none. */
export function resolveBase(root = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  let sha = env.QUALITY_BASE?.trim();
  if (!sha && env.GITHUB_EVENT_PATH && existsSync(env.GITHUB_EVENT_PATH)) {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) as {
      merge_group?: { base_sha?: string };
      pull_request?: { base?: { sha?: string } };
      before?: string;
    };
    sha = event.merge_group?.base_sha ?? event.pull_request?.base?.sha ?? event.before;
    if (sha && ZERO.test(sha)) sha = undefined; // a new branch's push has no "before"
  }
  if (sha) {
    if (!hasCommit(root, sha)) git(root, ['fetch', '--no-tags', '--quiet', '--depth=1', 'origin', sha]);
    if (!hasCommit(root, sha)) throw new Error(`Base commit ${sha} is not in this checkout and could not be fetched.`);
    return sha;
  }
  const mb = git(root, ['merge-base', 'HEAD', 'origin/main']);
  if (mb.status !== 0) {
    throw new Error(`No base commit: set QUALITY_BASE, or fetch origin/main (git merge-base failed: ${mb.stderr.trim()})`);
  }
  return out(mb).trim();
}

/** Every path matching `pathspecs` that differs between `base` and the working tree. */
export function diffAgainstBase(base: string, pathspecs: string[], root = process.cwd()): BaseDiff {
  const r = git(root, ['-c', 'diff.renameLimit=0', 'diff', '--no-color', '--name-status', '-M', base, '--', ...pathspecs]);
  if (r.status !== 0) throw new Error(`git diff against ${base} failed: ${r.stderr.trim()}`);
  if (/rename detection was skipped|too many files/i.test(r.stderr)) {
    throw new Error(`git skipped rename detection, so moved files would look new: ${r.stderr.trim()}`);
  }
  const diff: BaseDiff = { base, renamedFrom: new Map(), added: new Set(), changed: [], deleted: [] };
  for (const line of out(r).split('\n').filter(Boolean)) {
    const [status = '', a = '', b] = line.split('\t');
    if (status.startsWith('R') && b) {
      diff.renamedFrom.set(b, a);
      diff.changed.push(b);
    } else if (status === 'D') diff.deleted.push(a);
    else {
      if (status === 'A') diff.added.add(a);
      diff.changed.push(a);
    }
  }
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '--', ...pathspecs]);
  for (const f of out(untracked).split('\n').filter(Boolean)) {
    if (!diff.added.has(f)) diff.changed.push(f);
    diff.added.add(f);
  }
  diff.changed.sort();
  return diff;
}

/** The base path of a head path: its old name when renamed, null when it is new. */
export const basePathOf = (diff: BaseDiff, headPath: string): string | null =>
  diff.added.has(headPath) ? null : (diff.renamedFrom.get(headPath) ?? headPath);

/** File texts at `base` (one `git cat-file --batch`); paths missing there are left out. */
export function readAtBase(base: string, paths: string[], root = process.cwd()): Map<string, string> {
  const texts = new Map<string, string>();
  if (paths.length === 0) return texts;
  const r = git(root, ['cat-file', '--batch'], paths.map((p) => `${base}:${p}\n`).join(''));
  if (r.status !== 0) throw new Error(`git cat-file failed: ${r.stderr.trim()}`);
  let at = 0;
  for (const path of paths) {
    const eol = r.stdout.indexOf(0x0a, at);
    const header = r.stdout.subarray(at, eol).toString('utf8').split(' ');
    at = eol + 1;
    if (header[1] === 'missing' || header.length < 3) continue;
    const size = Number(header[2]);
    texts.set(path, r.stdout.subarray(at, at + size).toString('utf8'));
    at += size + 1;
  }
  return texts;
}

/** Every file under `dirs` at `base`. */
export function listAtBase(base: string, dirs: string[], root = process.cwd()): string[] {
  const r = git(root, ['ls-tree', '-r', '--name-only', base, '--', ...dirs]);
  if (r.status !== 0) throw new Error(`git ls-tree ${base} failed: ${r.stderr.trim()}`);
  return out(r).split('\n').filter(Boolean);
}
