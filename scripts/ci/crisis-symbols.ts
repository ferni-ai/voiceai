#!/usr/bin/env node
/**
 * The names exported by modules under the crisis paths of autonomy-policy.json, written to
 * the policy's `symbolsFile` as `exported` (all of them) and `screened`. A loop PR whose
 * changed line mentions a screened name (a call site disabled, a barrel import dropped) is
 * in the crisis lane. A name some non-crisis module in src/ also exports (`domain`,
 * `normalize`) can't identify crisis wiring, so only crisis-only names are screened, plus
 * the policy's reviewed `alwaysScreen` list. The unit test
 * scripts/ci/__tests__/crisis-symbols.test.ts fails when the file differs from the source,
 * so a new export can't be missed.
 *
 *   node --experimental-strip-types scripts/ci/crisis-symbols.ts --write
 *
 * Exports are read syntactically: declarations, `export { a as b }` and `export * as ns`.
 * `export *` re-exports add nothing (their names are counted where they are declared, when
 * that module is itself under a crisis path), and a default export (`export default`,
 * `export { x as default }`) has no name a caller writes.
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import ts from 'typescript';
import { inPaths, POLICY_PATH, type Policy } from './autonomy-lanes.ts';

/** The policy as written (without the symbols it points at, which this file generates). */
const rawPolicy = (): Policy => JSON.parse(readFileSync(POLICY_PATH, 'utf8')) as Policy;
export const symbolsPath = (): string =>
  join(dirname(POLICY_PATH), rawPolicy().lanes.crisis.symbolsFile);
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const TEST = /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

function exportedNames(path: string, text: string): string[] {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false);
  const names: string[] = [];
  const bound = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) names.push(name.text);
    else name.elements.forEach((e) => ts.isBindingElement(e) && bound(e.name));
  };
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      const clause = st.exportClause;
      if (clause && ts.isNamedExports(clause))
        clause.elements.forEach((e) => names.push(e.name.text));
      else if (clause && ts.isNamespaceExport(clause)) names.push(clause.name.text);
      continue;
    }
    const mods = ts.canHaveModifiers(st) ? (ts.getModifiers(st) ?? []) : [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) continue;
    if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => bound(d.name));
    else if ('name' in st && st.name && ts.isIdentifier(st.name as ts.Node)) {
      names.push((st.name as ts.Identifier).text);
    }
  }
  return names;
}

export type CrisisSymbols = { exported: string[]; screened: string[] };

/** Every name the crisis modules export, and the ones a loop PR is screened for. */
export function crisisSymbols(root: string): CrisisSymbols {
  const { paths, alwaysScreen } = rawPolicy().lanes.crisis;
  const sources = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((f) => SOURCE.test(f) && !TEST.test(f));
  const namesIn = (files: string[]) =>
    new Set(files.flatMap((f) => exportedNames(f, readFileSync(join(root, f), 'utf8'))));
  const crisis = namesIn(sources.filter((f) => inPaths(f, paths)));
  const elsewhere = namesIn(sources.filter((f) => f.startsWith('src/') && !inPaths(f, paths)));
  crisis.delete('default');
  const exported = [...crisis].sort();
  const screened = exported.filter((n) => !elsewhere.has(n) || alwaysScreen.includes(n));
  return { exported, screened };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const symbols = crisisSymbols(root);
  if (process.argv.includes('--write')) {
    writeFileSync(symbolsPath(), `${JSON.stringify(symbols, null, 2)}\n`);
  }
  console.log(`${symbols.exported.length} exported, ${symbols.screened.length} screened`);
}
