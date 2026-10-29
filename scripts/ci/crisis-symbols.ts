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
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import ts from 'typescript';
import { importTargets, inPaths, POLICY_PATH, type Policy } from './autonomy-lanes.ts';

/** The policy as written (without the symbols it points at, which this file generates). */
const rawPolicy = (): Policy => JSON.parse(readFileSync(POLICY_PATH, 'utf8')) as Policy;
export const symbolsPath = (): string =>
  join(dirname(POLICY_PATH), rawPolicy().lanes.crisis.symbolsFile);
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
  return new Set(owners.flatMap((o) => Object.getOwnPropertyNames(o)));
}

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
  const sources = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const current = JSON.parse(readFileSync(symbolsPath(), 'utf8')) as Partial<CrisisSymbols>;
  const previous = current.previouslyScreened ?? current.screened ?? [];
  const symbols = crisisSymbols(root, previous);
  if (process.argv.includes('--write')) {
    writeFileSync(symbolsPath(), `${JSON.stringify(symbols, null, 2)}\n`);
  }
  console.log(`${symbols.exported.length} exported, ${symbols.screened.length} screened`);
  const dropped = droppedFromScreen(symbols, rawPolicy().lanes.crisis.unscreened);
  if (dropped.length)
    console.log(`dropped from the screen with no policy entry: ${dropped.join(', ')}`);
}
