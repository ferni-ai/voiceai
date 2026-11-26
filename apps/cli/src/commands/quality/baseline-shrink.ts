/**
 * Debt baselines may only shrink, checked against the merge base.
 *
 * The format, mock-paths and web design-value gates each read a committed baseline of
 * today's debt, and each says the baseline "may only shrink". The gates themselves read the
 * PR's own copy, though, so a PR that adds an entry to the baseline passes its own gate.
 * Until 2026-11-26 the only thing stopping that was code-owner review of the baseline
 * files, which held every PR that touched them (most PRs that fix debt do) for the owner's
 * approval. This check enforces the rule directly: compared with the merge base, a
 * baseline may lose entries and lower counts, never gain them.
 *
 * Usage: npx tsx apps/cli/src/commands/quality/baseline-shrink.ts
 *
 * @module quality/baseline-shrink
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { diffAgainstBase, readAtBase, resolveBase } from './merge-base.js';

/** The shrink-only baselines, repo-relative. */
export const SHRINK_ONLY_BASELINES = [
  'apps/cli/src/commands/quality/format-baseline.generated.json',
  'apps/cli/src/commands/quality/mock-paths-baseline.generated.json',
  'scripts/ci/web-design-values-baseline.generated.json',
] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Where `head` allows more than `base`, one line per loosening. Arrays must be subsets,
 * numbers may not rise, object keys may not be added, and anything else must be equal.
 * `renamedFrom` maps a moved file's new path to its old one, so a move isn't new debt.
 */
export function loosened(
  base: unknown,
  head: unknown,
  renamedFrom: ReadonlyMap<string, string> = new Map(),
  at = '$'
): string[] {
  const old = (s: string): string => renamedFrom.get(s) ?? s;
  if (Array.isArray(head)) {
    if (!Array.isArray(base)) return [`${at}: became a list`];
    const allowed = new Set(base.map((v) => JSON.stringify(v)));
    return head
      .filter((v) => !allowed.has(JSON.stringify(typeof v === 'string' ? old(v) : v)))
      .map((v) => `${at}: adds ${JSON.stringify(v)}`);
  }
  if (isRecord(head)) {
    if (!isRecord(base)) return [`${at}: became an object`];
    return Object.entries(head).flatMap(([key, value]) => {
      const baseKey = old(key);
      if (!(baseKey in base)) return [`${at}: adds ${JSON.stringify(key)}`];
      return loosened(base[baseKey], value, renamedFrom, `${at}[${JSON.stringify(key)}]`);
    });
  }
  if (typeof head === 'number' && typeof base === 'number') {
    return head > base ? [`${at}: rises from ${base} to ${head}`] : [];
  }
  return Object.is(head, base)
    ? []
    : [`${at}: changes from ${JSON.stringify(base)} to ${JSON.stringify(head)}`];
}

/** Check every shrink-only baseline in `root` against its merge base. Returns the exit code. */
export function checkBaselines(
  root: string,
  log: (line: string) => void = (l) => process.stdout.write(`${l}\n`)
): number {
  const base = resolveBase(root);
  const atBase = readAtBase(base, [...SHRINK_ONLY_BASELINES], root);
  const { renamedFrom } = diffAgainstBase(base, ['.'], root);
  let failed = 0;
  for (const path of SHRINK_ONLY_BASELINES) {
    const baseText = atBase.get(path);
    const headPath = join(root, path);
    if (baseText === undefined || !existsSync(headPath)) continue; // new or removed baseline: its gate decides
    const problems = loosened(
      JSON.parse(baseText),
      JSON.parse(readFileSync(headPath, 'utf8')),
      renamedFrom
    );
    if (problems.length === 0) continue;
    failed += 1;
    log(`❌ ${path} grew against ${base.slice(0, 9)} (a baseline may only shrink):`);
    for (const p of problems.slice(0, 20)) log(`   ${p}`);
    if (problems.length > 20) log(`   ... and ${problems.length - 20} more`);
  }
  if (failed === 0)
    log(
      `✓ ${SHRINK_ONLY_BASELINES.length} shrink-only baselines did not grow against ${base.slice(0, 9)}`
    );
  else log('Fix the debt instead of adding it to the baseline.');
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(checkBaselines(process.cwd()));
}
