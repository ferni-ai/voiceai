/**
 * The files git would show for a checkout: tracked ones, plus untracked ones
 * that .gitignore doesn't exclude.
 *
 * The ratchet's collectors glob or walk the disk, so they also counted
 * gitignored build output. A Storybook build copies seven design-system .ts
 * files into design-system/storybook-static/, and the brand lint then counted
 * 34 more hardcoded colors there, which failed pre-push for a change that
 * touched none of them. CI checks out a clean tree, so it never saw those files.
 * Filtering every collector through this list makes a local run count what CI
 * counts.
 *
 * Untracked files stay in, so a new file is measured before it is committed.
 * Throws when git fails: a ratchet that silently measured nothing would pass.
 *
 * @module quality/git-visible
 */
import { spawnSync } from 'child_process';
import { relative, resolve, sep } from 'path';

function git(cwd: string, args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed in ${cwd}: ${r.error?.message ?? r.stderr.trim()}`
    );
  }
  return r.stdout;
}

const byRoot = new Map<string, (path: string) => boolean>();

/**
 * A predicate for "git would show this file". Paths may be absolute or relative
 * to `root`. git runs once per root per process.
 */
export function gitVisible(root = process.cwd()): (path: string) => boolean {
  const cached = byRoot.get(root);
  if (cached) return cached;
  // Listed from the top of the repo with -z, so paths are repo-relative and never
  // quoted (core.quotePath escapes non-ASCII names in line output).
  const [top = '', prefix = ''] = git(root, [
    'rev-parse',
    '--show-toplevel',
    '--show-prefix',
  ]).split('\n');
  const files = new Set(
    git(top, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0')
  );
  const visible = (path: string): boolean =>
    files.has(prefix + relative(root, resolve(root, path)).split(sep).join('/'));
  byRoot.set(root, visible);
  return visible;
}
