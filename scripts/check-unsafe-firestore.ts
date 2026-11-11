#!/usr/bin/env npx tsx
/**
 * Unsafe Firestore writes: a direct .set() / .update() / .add() whose surrounding lines
 * use none of the safe wrappers (cleanForFirestore, safeSet, ...). Firestore rejects a
 * document holding `undefined`, so an unwrapped write of a partly filled object throws at
 * runtime.
 *
 * A ratchet on what a change adds, measured against its merge base (the quality gates'
 * merge-base.ts). Until 2026-11-02 this script only printed its findings and exited 0, and
 * no workflow ran it, so ~316 sites accumulated. Each site is keyed by (file at the base,
 * kind, the line's trimmed text), counted: moving or re-indenting a site within its file,
 * or moving the file, keeps its key; a second copy of a known line is new.
 *
 *   pnpm quality:firestore          fail on new sites (CI, Quality Gates)
 *   pnpm quality:firestore --all    list every site in src/ (exit 0)
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { pathToFileURL } from 'url';
import {
  basePathOf,
  diffAgainstBase,
  readAtBase,
  resolveBase,
} from '../apps/cli/src/commands/quality/merge-base.js';

export interface UnsafeWrite {
  file: string;
  line: number;
  code: string;
  type: 'set' | 'update' | 'add';
}

const SAFE_PATTERNS = [
  'cleanForFirestore',
  'safeSet',
  'safeUpdate',
  'safeAdd',
  'removeUndefined',
  'deepRemoveUndefined',
  'createSafeBatch',
];

const EXCLUDE_PATTERNS = [
  'node_modules',
  '__tests__',
  '.test.',
  '.spec.',
  'safe-firestore.ts', // The safe wrapper itself
  'firestore-utils.ts', // Utilities
  '.d.ts',
];

const scanned = (path: string): boolean =>
  path.endsWith('.ts') && !EXCLUDE_PATTERNS.some((p) => path.includes(p));

/** Every unsafe write in one file's text. */
export function findUnsafeWrites(file: string, content: string): UnsafeWrite[] {
  const results: UnsafeWrite[] = [];
  const touchesFirestore =
    content.includes('firestore') ||
    content.includes('Firestore') ||
    content.includes('.collection(') ||
    content.includes('.doc(');
  if (!touchesFirestore) return results;

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 3)).join('\n');
    if (SAFE_PATTERNS.some((p) => context.includes(p))) continue;
    const site = (type: UnsafeWrite['type']): void => {
      results.push({ file, line: i + 1, code: line.trim(), type });
    };

    if (line.includes('.set(') && (line.includes('.doc(') || context.includes('.doc('))) {
      // Map.set() and other in-memory writes: the line is skipped entirely
      const inMemory =
        line.includes('Map') ||
        line.includes('cache.') ||
        line.includes('Cache') ||
        context.includes('new Map') ||
        context.includes('= new');
      if (inMemory) continue;
      site('set');
    }
    if (line.includes('.update(') && context.includes('.doc(')) site('update');
    if (line.includes('.add(') && context.includes('.collection(')) site('add');
  }
  return results;
}

/** A site's identity across commits: no line number, so moving it doesn't make it new. */
const siteKey = (file: string, w: UnsafeWrite): string =>
  `${file}\0${w.type}\0${w.code}`;

/** The sites in `root`'s working tree under src/ that its merge base doesn't have. */
export function newUnsafeWrites(
  root = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
): { base: string; added: UnsafeWrite[] } {
  const base = resolveBase(root, env);
  const diff = diffAgainstBase(base, ['src'], root);
  const files = diff.changed.filter(scanned);
  const basePaths = files.map((f) => basePathOf(diff, f)).filter((p): p is string => p !== null);
  const baseTexts = readAtBase(base, basePaths, root);

  const known = new Map<string, number>();
  for (const [path, text] of baseTexts)
    for (const w of findUnsafeWrites(path, text)) {
      const k = siteKey(path, w);
      known.set(k, (known.get(k) ?? 0) + 1);
    }

  const added: UnsafeWrite[] = [];
  for (const file of files) {
    const basePath = basePathOf(diff, file);
    for (const w of findUnsafeWrites(file, readFileSync(join(root, file), 'utf8'))) {
      const k = siteKey(basePath ?? file, w);
      const left = known.get(k) ?? 0;
      if (left > 0) known.set(k, left - 1);
      else added.push(w);
    }
  }
  return { base, added };
}

function listAll(root: string): UnsafeWrite[] {
  const walk = (dir: string): UnsafeWrite[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (EXCLUDE_PATTERNS.some((p) => path.includes(p))) return [];
      if (statSync(path).isDirectory()) return walk(path);
      return scanned(path)
        ? findUnsafeWrites(relative(root, path), readFileSync(path, 'utf8'))
        : [];
    });
  return walk(join(root, 'src'));
}

const show = (w: UnsafeWrite): string =>
  `${w.file}:${w.line}  unsafe-${w.type}  ${w.code.length > 100 ? `${w.code.slice(0, 100)}...` : w.code}`;

function main(args: string[]): void {
  const root = process.cwd();
  if (args.includes('--all')) {
    const all = listAll(root);
    for (const w of all) console.log(show(w));
    console.log(`\n${all.length} unsafe Firestore writes in src/`);
    return;
  }
  const { base, added } = newUnsafeWrites(root);
  if (added.length === 0) {
    console.log(`No new unsafe Firestore writes against ${base.slice(0, 9)}.`);
    return;
  }
  console.log(`${added.length} new unsafe Firestore write(s) against ${base.slice(0, 9)}:\n`);
  for (const w of added) console.log(`::error file=${w.file},line=${w.line}::unsafe-${w.type}`);
  for (const w of added) console.log(show(w));
  console.log(
    '\nFix: await safeSet(docRef, data) / safeUpdate / safeAdd (src/utils/safe-firestore.ts), ' +
      'or cleanForFirestore(data) before the write.'
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(`quality:firestore could not run: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
