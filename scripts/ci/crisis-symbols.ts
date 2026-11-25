#!/usr/bin/env node
/**
 * The names exported by modules under the crisis paths of autonomy-policy.json in src/,
 * written to the policy's `symbolsFile` as `exported` (all of them) and `screened`. Crisis
 * paths outside src/ (this tooling, the release check) are owned for review, but they
 * aren't crisis behaviour, so their exports are not crisis symbols. A loop PR whose
 * changed line mentions a screened name (a call site disabled, a barrel import dropped) is
 * in the crisis lane. A name some non-crisis module in src/ also exports (`domain`), or a
 * built-in method's name (`normalize`), can't identify crisis wiring, so only the other
 * names are screened, plus the policy's reviewed `alwaysScreen` list. The unit test
 * scripts/ci/__tests__/crisis-symbols.test.ts fails when the file differs from the source,
 * so a new export can't be missed.
 *
 *   node --experimental-strip-types scripts/ci/crisis-symbols.ts --write
 *
 * Exports are read syntactically: declarations, `export { a as b }` and `export * as ns`.
 * `export *` re-exports add nothing (their names are counted where they are declared, when
 * that module is itself under a crisis path), and a default export (`export default`,
 * `export { x as default }`) has no name a caller writes. Once screened, a name stays in
 * `previouslyScreened`; it may leave the screen only through the policy's `unscreened`.
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import ts from 'typescript';
import { importTargets, inPaths, POLICY_PATH, type Policy } from './autonomy-lanes.ts';

/** The policy as written (without the symbols it points at, which this file generates). */
const rawPolicy = (): Policy => JSON.parse(readFileSync(POLICY_PATH, 'utf8')) as Policy;
export const symbolsPath = (): string =>
  join(dirname(POLICY_PATH), rawPolicy().lanes.crisis.symbolsFile);
/** The symbols file's path in the repo, as `git show <ref>:<path>` reads it. */
export const symbolsInRepo = (): string =>
  relative(join(dirname(POLICY_PATH), '..', '..'), symbolsPath());
const git = (root: string, args: string[]): string =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const TEST = /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

type ModuleExports = {
  /** Every exported name, re-exports included. */
  all: string[];
  /** Exported names the module itself declares (not re-exports of an import). */
  declared: string[];
  /** Named imports: the imported (original) name and where from. */
  imports: { name: string; specifier: string }[];
};

function moduleExports(path: string, text: string): ModuleExports {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false);
  const all: string[] = [];
  const declared: string[] = [];
  const locals = new Set<string>();
  const localExports: { local: string; name: string }[] = [];
  const imports: ModuleExports['imports'] = [];
  const names = (name: ts.BindingName): string[] =>
    ts.isIdentifier(name)
      ? [name.text]
      : name.elements.flatMap((e) => (ts.isBindingElement(e) ? names(e.name) : []));
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const bindings = st.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const e of bindings.elements) {
          const name = (e.propertyName ?? e.name).text;
          imports.push({ name, specifier: st.moduleSpecifier.text });
        }
      }
      continue;
    }
    if (ts.isExportDeclaration(st)) {
      const clause = st.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const e of clause.elements) {
          all.push(e.name.text);
          // `export { a as b }` with no `from` names a local; with `from` it re-exports.
          if (!st.moduleSpecifier) {
            localExports.push({ local: (e.propertyName ?? e.name).text, name: e.name.text });
          }
        }
      } else if (clause && ts.isNamespaceExport(clause)) all.push(clause.name.text);
      continue;
    }
    const declaredHere = ts.isVariableStatement(st)
      ? st.declarationList.declarations.flatMap((d) => names(d.name))
      : 'name' in st && st.name && ts.isIdentifier(st.name as ts.Node)
        ? [(st.name as ts.Identifier).text]
        : [];
    declaredHere.forEach((n) => locals.add(n));
    const mods = ts.canHaveModifiers(st) ? (ts.getModifiers(st) ?? []) : [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) continue;
    all.push(...declaredHere);
    declared.push(...declaredHere);
  }
  for (const { local, name } of localExports) if (locals.has(local)) declared.push(name);
  return { all, declared, imports };
}

export type CrisisSymbols = {
  exported: string[];
  screened: string[];
  /** Every name ever screened: one may leave `screened` only through the policy's `unscreened`. */
  previouslyScreened: string[];
};

/**
 * Names of built-in methods and properties (`str.normalize(...)`, `arr.includes(...)`): a
 * crisis export named like one can't identify crisis wiring either. Read from the
 * built-ins themselves, never from a hand list.
 */
export function builtInNames(): Set<string> {
  const builtIns: object[] = [
    String,
    Array,
    Object,
    Number,
    Promise,
    Map,
    Set,
    Function,
    Date,
    RegExp,
  ];
  const owners = [
    ...builtIns.flatMap((b) => [b, (b as { prototype: object }).prototype]),
    JSON,
    Math,
    Reflect,
  ];
  return new Set([...owners.flatMap((o) => Object.getOwnPropertyNames(o)), ...NEWER_BUILT_INS]);
}

/**
 * Built-in names newer Node versions add (Node 26 over CI's Node 22: RegExp.escape,
 * Math.f16round, Map#getOrInsert*, Date#toTemporalInstant, Promise.try). Listed so the
 * derived symbols are the same whichever Node writes or checks them.
 */
const NEWER_BUILT_INS = [
  'escape',
  'f16round',
  'getOrInsert',
  'getOrInsertComputed',
  'toTemporalInstant',
  'try',
];

/**
 * The names a non-crisis module really declares and exports: not re-exports, and not a
 * name it imports from a crisis module (a wrapper or delegate of the crisis symbol).
 */
export function ownDeclarations(file: string, text: string): string[] {
  const { paths, importFallbackPattern } = rawPolicy().lanes.crisis;
  const fallback = new RegExp(importFallbackPattern, 'i');
  const fromCrisis = (specifier: string) => {
    const targets = importTargets({ file, specifier });
    return targets ? targets.some((t) => inPaths(t, paths)) : fallback.test(specifier);
  };
  const { declared, imports } = moduleExports(file, text);
  const wrapped = new Set(imports.filter((i) => fromCrisis(i.specifier)).map((i) => i.name));
  return declared.filter((n) => !wrapped.has(n));
}

/**
 * Every name the crisis modules export, and the ones a loop PR is screened for. A name is
 * ambiguous when a non-crisis module in src/ really declares and exports it (re-exports,
 * and a module that imports that same name from a crisis module to wrap it, don't count),
 * or when a built-in method has it. `previous` is the last snapshot of screened names.
 */
export function crisisSymbols(root: string, previous: string[] = []): CrisisSymbols {
  const { paths, alwaysScreen } = rawPolicy().lanes.crisis;
  const sources = git(root, ['ls-files', '-z'])
    .split('\0')
    .filter((f) => SOURCE.test(f) && !TEST.test(f));
  const text = (f: string) => readFileSync(join(root, f), 'utf8');
  const crisisFiles = sources.filter((f) => f.startsWith('src/') && inPaths(f, paths));
  const crisis = new Set(crisisFiles.flatMap((f) => moduleExports(f, text(f)).all));
  const elsewhere = new Set(
    sources
      .filter((f) => f.startsWith('src/') && !inPaths(f, paths))
      .flatMap((f) => ownDeclarations(f, text(f)))
  );
  crisis.delete('default');
  const exported = [...crisis].sort();
  const builtIn = builtInNames();
  const ambiguous = (n: string) => elsewhere.has(n) || builtIn.has(n);
  const screened = exported.filter((n) => !ambiguous(n) || alwaysScreen.includes(n));
  const previouslyScreened = [...new Set([...previous, ...screened])].sort();
  return { exported, screened, previouslyScreened };
}

/**
 * Names in the snapshot that left `screened` while still exported, without a reviewed
 * `unscreened` entry in the policy: a crisis symbol can't drop out of the screen silently
 * (a loop PR declaring a namesake elsewhere would otherwise unscreen it).
 */
export function droppedFromScreen(symbols: CrisisSymbols, unscreened: string[]): string[] {
  const screened = new Set(symbols.screened);
  const exported = new Set(symbols.exported);
  return symbols.previouslyScreened.filter(
    (n) => exported.has(n) && !screened.has(n) && !unscreened.includes(n)
  );
}

/** A merge base found in the clone: its commit, and the symbols file as committed there. */
export interface BaseCommit {
  sha: string;
  symbols: CrisisSymbols;
}

/**
 * The symbols file as committed at the merge base with main: `git merge-base HEAD
 * origin/main`, or HEAD^1 on a pull request's merge commit, where CI fetches only that
 * commit and its base. Undefined when neither is in the clone (a depth-1 checkout).
 */
export function baseSymbols(root: string): BaseCommit | undefined {
  const file = symbolsInRepo();
  for (const base of [
    ['merge-base', 'HEAD', 'origin/main'],
    ['rev-parse', 'HEAD^1'],
  ]) {
    try {
      const sha = git(root, base).trim();
      return { sha, symbols: JSON.parse(git(root, ['show', `${sha}:${file}`])) as CrisisSymbols };
    } catch {
      // That ref isn't in this clone: try the next.
    }
  }
  return undefined;
}

/** What a skip leaves unchecked, said on every SKIPPED line. */
const NOT_RUN = 'the crisis-symbols merge-base check did not run';

/** Why a pull request has no merge base to compare with. The test prints it when it goes red. */
const NO_BASE = 'no merge base in this checkout: fetch origin/main or check out depth 2';

/** The merge base's symbols, or why there are none: a failure goes red, a skip stays green. */
export interface BaseRead {
  symbols?: CrisisSymbols;
  failure?: string;
}

type Env = Record<string, string | undefined>;

/** The first line git wrote to stderr, else the error's message. */
const gitError = (e: unknown): string => {
  const err = e as { stderr?: string; message?: string };
  return (err.stderr || err.message || String(e)).trim().split('\n')[0] ?? '';
};

/** The symbols file at the queue's base, fetching that one commit when the clone lacks it. */
function symbolsAt(root: string, sha: string): BaseRead {
  const file = symbolsInRepo();
  const show = (): CrisisSymbols =>
    JSON.parse(git(root, ['show', `${sha}:${file}`])) as CrisisSymbols;
  try {
    return { symbols: show() };
  } catch {
    // Not in this depth-1 clone yet: fetch it.
  }
  try {
    git(root, ['fetch', '--quiet', '--depth=1', 'origin', sha]);
  } catch (e) {
    return {
      failure:
        `merge_group: git fetch --depth=1 origin ${sha} failed (${gitError(e)}); the queue's ` +
        `base commit is not reachable from origin (re-queue the PR, or check the workflow's ` +
        `token and fetch step)`,
    };
  }
  try {
    return { symbols: show() };
  } catch (e) {
    return { failure: `merge_group: no ${file} at merge_group.base_sha ${sha} (${gitError(e)})` };
  }
}

/** The queue's base from the event payload, or why it can't be read. */
function queueBase(root: string, env: Env): BaseRead {
  let sha: unknown;
  try {
    const payload = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH ?? '', 'utf8')) as {
      merge_group?: { base_sha?: unknown };
    };
    sha = payload.merge_group?.base_sha;
  } catch (e) {
    return {
      failure:
        `merge_group: could not read the event payload at GITHUB_EVENT_PATH ` +
        `${env.GITHUB_EVENT_PATH ?? '(unset)'} (${String(e).split('\n')[0]})`,
    };
  }
  if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) {
    return {
      failure:
        `merge_group: the event payload at GITHUB_EVENT_PATH ${env.GITHUB_EVENT_PATH} carries ` +
        `no merge_group.base_sha (got ${JSON.stringify(sha) ?? 'nothing'})`,
    };
  }
  return symbolsAt(root, sha);
}

const headOf = (root: string): string | undefined => {
  try {
    return git(root, ['rev-parse', 'HEAD']).trim();
  } catch {
    return undefined;
  }
};

/**
 * The merge base for this CI event. CI checks out depth 1 on every event but a pull request,
 * so the queue's merge_group reads its base from the event payload (`merge_group.base_sha`)
 * and goes red, naming the cause, when that can't be read: it is the last gate before main.
 * A push or a nightly run is main itself: there origin/main is HEAD, so the "base" would be
 * the file compared with itself. It says loudly that it skipped and stays green.
 */
export function baseForEvent(
  root: string,
  env: Env = process.env,
  local: (root: string) => BaseCommit | undefined = baseSymbols
): BaseRead {
  const event = env.GITHUB_EVENT_NAME;
  if (event === 'merge_group') return queueBase(root, env);
  const base = local(root);
  const itself = base !== undefined && base.sha === headOf(root);
  if (base && !itself) return { symbols: base.symbols };
  if (event === 'pull_request') return { failure: `${NO_BASE} (pull_request)` };
  const why = itself ? ' (origin/main is this commit)' : '';
  if (event) console.log(`SKIPPED: no merge base on ${event}${why}: ${NOT_RUN}`);
  return {};
}

/**
 * Names screened at the merge base that the snapshot no longer lists. The test derives the
 * snapshot from itself, so a merge of the generated file that drops a historical name
 * (one no longer exported) would otherwise pass. `--write` restores them.
 */
export function lostFromHistory(symbols: CrisisSymbols, base: CrisisSymbols): string[] {
  const kept = new Set(symbols.previouslyScreened);
  return base.previouslyScreened.filter((n) => !kept.has(n));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const current = JSON.parse(readFileSync(symbolsPath(), 'utf8')) as Partial<CrisisSymbols>;
  const previous = [
    ...(current.previouslyScreened ?? current.screened ?? []),
    ...(baseForEvent(root).symbols?.previouslyScreened ?? []),
  ];
  const symbols = crisisSymbols(root, previous);
  if (process.argv.includes('--write')) {
    writeFileSync(symbolsPath(), `${JSON.stringify(symbols, null, 2)}\n`);
  }
  console.log(`${symbols.exported.length} exported, ${symbols.screened.length} screened`);
  const dropped = droppedFromScreen(symbols, rawPolicy().lanes.crisis.unscreened);
  if (dropped.length)
    console.log(`dropped from the screen with no policy entry: ${dropped.join(', ')}`);
}
