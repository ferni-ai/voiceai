/**
 * Fails when a package would publish with an entry point that isn't in its tarball.
 *
 * Usage: pnpm tsx scripts/ci/check-package-exports.ts <package-dir> [<package-dir> ...]
 *
 * It packs each package (`npm pack --dry-run --json`, the exact file list npm would upload)
 * and checks that every `main`, `module`, `types` and `exports` target is in it, and that
 * `repository.url` names this repo (npm rejects a provenance publish whose repository
 * doesn't match the repo that built it). Run it after the package's build.
 *
 * Why: @ferni/design-system 2.0.0 had 9 of its 26 exports pointing at files that weren't
 * shipped (`tokens/*.json` missing from `files`, `dist/*-utils.ts` never built), and
 * @ferni/react named the wrong repository. A version on npm can't be republished, so
 * this runs on every pull request that touches the packages, before anything publishes.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY = 'github.com/ferni-ai/voiceai';

export interface PackageJson {
  name?: string;
  main?: string;
  module?: string;
  types?: string;
  exports?: unknown;
  repository?: string | { url?: string };
}

/** Every file path an `exports` value can resolve to, through nested conditions. */
export function exportTargets(exports: unknown): string[] {
  if (typeof exports === 'string') return [exports];
  if (Array.isArray(exports)) return exports.flatMap(exportTargets);
  if (exports !== null && typeof exports === 'object') {
    return Object.values(exports).flatMap(exportTargets);
  }
  return [];
}

const normalise = (p: string): string => p.replace(/^\.\//, '');

/** The problems that would ship: entry points missing from `packed`, and a wrong repository. */
export function packageProblems(pkg: PackageJson, packed: readonly string[]): string[] {
  const files = new Set(packed.map(normalise));
  const targets = [pkg.main, pkg.module, pkg.types, ...exportTargets(pkg.exports)]
    .filter((t): t is string => typeof t === 'string')
    // A pattern export ("./*": "./dist/*.js") names no single file; skip it.
    .filter((t) => !t.includes('*'));
  const problems = [...new Set(targets)]
    .filter((t) => !files.has(normalise(t)))
    .map((t) => `${t} is an entry point but is not in the tarball`);

  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (!repo?.includes(REPOSITORY)) {
    problems.push(
      `repository.url is ${repo ? `"${repo}"` : 'missing'}; it must name ${REPOSITORY}`
    );
  }
  return problems;
}

function packedFiles(dir: string): string[] {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: dir,
    encoding: 'utf8',
  });
  const [result] = JSON.parse(out) as Array<{ files: Array<{ path: string }> }>;
  return result.files.map((f) => f.path);
}

function main(dirs: string[]): number {
  if (dirs.length === 0) {
    process.stderr.write('usage: check-package-exports.ts <package-dir> [...]\n');
    return 2;
  }
  let failed = false;
  for (const dir of dirs) {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson;
    const packed = packedFiles(dir);
    const problems = packageProblems(pkg, packed);
    if (problems.length === 0) {
      process.stdout.write(`${pkg.name}: ${packed.length} files, every entry point shipped\n`);
      continue;
    }
    failed = true;
    for (const p of problems) process.stdout.write(`::error::${pkg.name}: ${p}\n`);
  }
  return failed ? 1 : 0;
}

// Compare real paths: run through a symlink (macOS /tmp is one), a plain URL
// comparison is false and the gate would exit 0 without checking anything.
const entry = process.argv[1];
if (entry !== undefined && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
