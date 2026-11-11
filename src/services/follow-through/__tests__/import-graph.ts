/**
 * Every src module a file can load: static imports, re-exports, `import()` and
 * `require()`, following relative specifiers only (packages are not walked).
 * Type-only imports are skipped: they are erased and load nothing.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import ts from 'typescript';

export const ROOT = join(__dirname, '..', '..', '..', '..');

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = join(dirname(from), spec).replace(/\.js$/, '');
  for (const f of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')])
    if (existsSync(f)) return f;
  return null;
}

const TYPE_ONLY = /^\s*(?:import|export)\s+type\s/;

function specifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (!TYPE_ONLY.test(node.getText(sf)) && ts.isStringLiteral(node.moduleSpecifier))
        out.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const [arg] = node.arguments;
      const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const req = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((dynamic || req) && arg !== undefined && ts.isStringLiteral(arg)) out.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Repo-relative paths of every module `entry` (repo-relative) can load, itself included. */
export function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [join(ROOT, entry)];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    const rel = relative(ROOT, file);
    if (seen.has(rel)) continue;
    seen.add(rel);
    for (const spec of specifiers(file)) {
      const next = resolve(file, spec);
      if (next) queue.push(next);
    }
  }
  return seen;
}
