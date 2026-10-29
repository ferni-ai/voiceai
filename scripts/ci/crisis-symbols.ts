#!/usr/bin/env node
/**
 * Every name exported by a module under the crisis paths of autonomy-policy.json. A loop
 * PR whose changed line mentions one (a call site disabled, a barrel import dropped) is in
 * the crisis lane, so the list (the policy's `symbolsFile`) has to stay complete: the unit
 * test scripts/ci/__tests__/crisis-symbols.test.ts fails when it differs from the source.
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

/** The sorted, distinct names the crisis modules export, read from the working tree at `root`. */
export function crisisExports(root: string): string[] {
  const { paths } = rawPolicy().lanes.crisis;
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((f) => SOURCE.test(f) && !TEST.test(f) && inPaths(f, paths));
  const names = files.flatMap((f) => exportedNames(f, readFileSync(join(root, f), 'utf8')));
  return [...new Set(names)].filter((n) => n !== 'default').sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const names = crisisExports(root);
  if (process.argv.includes('--write')) {
    writeFileSync(symbolsPath(), `${JSON.stringify(names, null, 2)}\n`);
  }
  console.log(`${names.length} crisis symbols`);
}
