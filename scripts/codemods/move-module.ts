#!/usr/bin/env npx tsx
/**
 * Codemod: move files or folders and fix every path that names them.
 *
 * The DDD cleanup moves many folders onto the layer map (architecture-layers.ts). By hand,
 * each move goes stale in places tests can't see (a stale vi.mock string loads the real
 * module and the test still passes), so every move is a run of this script instead:
 *
 * 1. `git mv` each mapping (history is kept).
 * 2. Every module specifier in every tracked .ts/.tsx/.mts/.cts/.js/.mjs/.cjs file, from the AST:
 *    imports and exports (type-only too), `import()`, `require()`, `typeof import()`, and
 *    vi.mock / doMock / unmock / importActual / importMock strings. The `.js` suffix and
 *    folder (index) imports keep their form.
 * 3. Relative path strings that resolve to a moved module (CALL_PATH / TURN_PATH,
 *    DOMAIN_MODULES, `const spec = '../x.js'`), and repo-relative strings ('src/x/y.ts').
 * 4. Repo paths in config and docs: log-markers.json, knip.json, the quality baselines,
 *    package.json scripts, Dockerfile COPY lines (and their dist/ mirror), workflows,
 *    CODEOWNERS, shell scripts, and markdown (inline paths and relative links).
 *
 * Specifiers are resolved like the architecture gate (resolveModule). A rewritten
 * specifier that doesn't resolve after the move fails the run (exit 1); template literals
 * it can't rewrite (`./locales/${x}.json`) and specifiers already broken are listed.
 * Idempotent: once moved, a second run changes nothing.
 *
 * usage:
 *   npx tsx scripts/codemods/move-module.ts [--write] <from>=<to> ...
 *   npx tsx scripts/codemods/move-module.ts [--write] --map moves.json   ({ "from": "to" })
 *   (dry run by default)
 *
 * @module scripts/codemods/move-module
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, extname, join, posix } from 'path';
import { pathToFileURL } from 'url';
import {
  CODE_FILE,
  findSites,
  relativeSpec,
  resolveModule,
  specPath,
} from '../../apps/cli/src/commands/quality/module-specifiers.js';
import { mapPath, type Move, rewriteLinks, rewriteText, strip } from './move-paths.js';

export type { Move };

interface Edit {
  start: number;
  end: number;
  text: string;
}

export interface Plan {
  moves: Array<Move & { files: number; done: boolean }>;
  /** old path → new contents, for every file that changes */
  writes: Map<string, string>;
  /** extension (or 'markdown links') → rewrites */
  byType: Record<string, number>;
  /** site kind or 'repo path' → rewrites */
  byKind: Record<string, number>;
  samples: string[];
  warnings: string[];
  /** rewritten specifiers that don't resolve after the move */
  failures: string[];
}

const TEXT_FILE =
  /(^|\/)(Dockerfile[^/]*|CODEOWNERS|[^/]+\.(json|ya?ml|md|sh))$|^(docker|\.husky)\//;
const SKIP_TEXT = /(^|\/)(pnpm-lock\.yaml|package-lock\.json)$/;
const bump = (m: Record<string, number>, k: string): void => void (m[k] = (m[k] ?? 0) + 1);

const applyEdits = (text: string, edits: Edit[]): string =>
  edits
    .sort((a, b) => b.start - a.start)
    .reduce((t, e) => t.slice(0, e.start) + e.text + t.slice(e.end), text);

export function plan(root: string, input: Move[]): Plan {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
    .split('\0')
    .filter(Boolean);
  const tracked = new Set(files);
  const onDisk = (p: string): boolean =>
    existsSync(join(root, p)) && statSync(join(root, p)).isFile();
  const under = (p: string, dir: string): boolean => p === dir || p.startsWith(`${dir}/`);
  const result: Plan = {
    moves: [],
    writes: new Map(),
    byType: {},
    byKind: {},
    samples: [],
    warnings: [],
    failures: [],
  };
  const moves = input.map(({ from, to }) => ({
    from: posix.normalize(from).replace(/\/$/, ''),
    to: posix.normalize(to).replace(/\/$/, ''),
  }));
  for (const m of moves) {
    if (under(m.to, m.from))
      throw new Error(`${m.from} → ${m.to}: the target is inside the source`);
    const count = (dir: string): number => files.filter((f) => under(f, dir)).length;
    const [had, has] = [count(m.from), count(m.to) || (existsSync(join(root, m.to)) ? 1 : 0)];
    if (had > 0 && has > 0) throw new Error(`${m.to} already exists; move into a new path`);
    if (had === 0 && has === 0) throw new Error(`${m.from} is not tracked`);
    result.moves.push({ ...m, files: had || count(m.to), done: had === 0 });
  }
  const isOld = (p: string): boolean => tracked.has(p) || onDisk(p);
  const newTree = new Set(files.map((f) => mapPath(f, moves)));
  const touched = (p: string): boolean => moves.some((m) => under(p, m.from) || under(p, m.to));
  const isNew = (p: string): boolean =>
    newTree.has(p) || (!tracked.has(p) && !touched(p) && onDisk(p));
  // A path from outside into a moved module names its basename (or its folder, for an index).
  const tokens = [
    ...new Set(
      moves.map(({ from }) =>
        posix.basename(strip(from)) === 'index'
          ? posix.basename(posix.dirname(from))
          : posix.basename(strip(from))
      )
    ),
  ];
  const read = (f: string): string => readFileSync(join(root, f), 'utf8');

  for (const file of files) {
    if (!onDisk(file)) continue;
    const newFile = mapPath(file, moves);
    const moved = newFile !== file;
    const isCode = CODE_FILE.test(file);
    if (!isCode && (!TEXT_FILE.test(file) || SKIP_TEXT.test(file))) continue;
    const text = read(file);
    if (!moved && !tokens.some((t) => text.includes(t))) continue;
    const type = isCode
      ? extname(file)
      : posix.basename(file).startsWith('Dockerfile')
        ? 'Dockerfile'
        : extname(file) || posix.basename(file);
    let next = text;
    if (isCode) {
      const edits: Edit[] = [];
      for (const site of findSites(file, text, true)) {
        const relative = site.spec.startsWith('./') || site.spec.startsWith('../');
        const where = `${file}:${site.line}`;
        if (site.kind === 'template') {
          const head = specPath(file, site.spec);
          if (
            relative &&
            (mapPath(head, moves) !== head || (moved && site.spec.startsWith('../')))
          ) {
            result.warnings.push(
              `${where} template path \`${site.spec}\${…}\` not rewritten: check it by hand`
            );
          }
          continue;
        }
        if (!relative) {
          const spec = site.kind === 'string' ? rewriteText(site.spec, moves) : site.spec;
          if (spec !== site.spec) {
            edits.push({ start: site.start, end: site.end, text: spec });
            bump(result.byKind, 'repo path');
            bump(result.byType, type);
          }
          continue;
        }
        const target = resolveModule(file, site.spec, isOld);
        const p = specPath(file, site.spec);
        if (!target) {
          if (site.kind !== 'string' && (moved || mapPath(p, moves) !== p))
            result.warnings.push(`${where} already unresolved before the move: ${site.spec}`);
          continue;
        }
        const newTarget = mapPath(target, moves);
        let newP = mapPath(p, moves);
        if (newP === p && newTarget !== target) newP = `${strip(newTarget)}.js`; // folder import of a moved index
        if (newP === p && !moved) continue;
        const spec = relativeSpec(newFile, newP);
        if (spec === site.spec) continue;
        if (resolveModule(newFile, spec, isNew) !== newTarget)
          result.failures.push(`${where} ${site.spec} → ${spec} does not resolve to ${newTarget}`);
        edits.push({ start: site.start, end: site.end, text: spec });
        bump(result.byKind, site.kind);
        bump(result.byType, type);
        if (result.samples.length < 12) result.samples.push(`${where}  ${site.spec} → ${spec}`);
      }
      next = applyEdits(text, edits);
    } else {
      next = rewriteText(text, moves, type === 'Dockerfile');
      if (next !== text) {
        bump(result.byType, type);
        bump(result.byKind, 'repo path');
      }
      if (file.endsWith('.md')) {
        const links = rewriteLinks(
          file,
          next,
          moves,
          (p) => isOld(p) || files.some((f) => f.startsWith(`${p}/`))
        );
        next = links.text;
        for (let i = 0; i < links.n; i++) bump(result.byType, 'markdown links');
      }
    }
    if (next !== text) result.writes.set(file, next);
  }
  return result;
}

export function apply(root: string, result: Plan): void {
  for (const m of result.moves.filter((x) => !x.done)) {
    mkdirSync(join(root, dirname(m.to)), { recursive: true });
    execFileSync('git', ['mv', m.from, m.to], { cwd: root });
  }
  for (const [file, text] of result.writes)
    writeFileSync(join(root, mapPath(file, result.moves)), text);
}

function parseArgs(args: string[]): Move[] {
  const at = args.indexOf('--map');
  const pairs: Array<[string, string]> =
    at >= 0
      ? Object.entries(JSON.parse(readFileSync(args[at + 1]!, 'utf8')) as Record<string, string>)
      : [];
  for (const a of args.filter((x, i) => !x.startsWith('--') && (at < 0 || i !== at + 1))) {
    const [from, to] = a.split('=');
    if (!from || !to) throw new Error(`expected <from>=<to>, got ${a}`);
    pairs.push([from, to]);
  }
  if (pairs.length === 0)
    throw new Error('usage: move-module.ts [--write] <from>=<to> ... | --map moves.json');
  return pairs.map(([from, to]) => ({ from, to }));
}

function main(args: string[]): void {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const result = plan(root, parseArgs(args));
  const write = args.includes('--write');
  const list = (m: Record<string, number>): string =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(', ') || 'none';
  console.log(`${write ? 'Moving' : 'Dry run (no --write)'}:`);
  for (const m of result.moves)
    console.log(`  ${m.from} → ${m.to}  (${m.files} file(s)${m.done ? ', already moved' : ''})`);
  console.log(`Files changed: ${result.writes.size}`);
  console.log(`Rewrites by file type: ${list(result.byType)}`);
  console.log(`Rewrites by kind: ${list(result.byKind)}`);
  if (result.samples.length > 0) console.log(`Sample:\n  ${result.samples.join('\n  ')}`);
  if (result.warnings.length > 0)
    console.log(
      `Left for a person (${result.warnings.length}):\n  ${result.warnings.join('\n  ')}`
    );
  if (result.failures.length > 0) {
    console.log(
      `❌ ${result.failures.length} rewritten specifier(s) would not resolve; nothing written:\n  ${result.failures.join('\n  ')}`
    );
    process.exit(1);
  }
  if (write) apply(root, result);
  console.log(
    write
      ? '✅ Done. Run pnpm typecheck, quality:arch and quality:mock-paths.'
      : 'Re-run with --write to apply.'
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2));
