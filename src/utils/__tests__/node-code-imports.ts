/**
 * The import scan behind node-code-no-firebase-client.test.ts.
 *
 * The test imports `scan` for its fixtures and runs this file as a script over the whole
 * repo: `node --import tsx node-code-imports.ts <repo root>`, with a JSON array of repo
 * paths on stdin, prints each file's scan as JSON. Inside a vitest worker under
 * `--coverage`, V8 block coverage makes the TypeScript parser several times slower, and
 * parsing every file there dominated the test's load time; a plain Node process pays none
 * of that.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export interface Scan {
  /** Static imports, export-from and require() specifiers. */
  specs: string[];
  /** `import()` specifiers. */
  dynamic: string[];
  /** `vi.mock` targets whose factory never loads the original. */
  mocks: string[];
}

const isViMock = (e: ts.Expression): boolean =>
  ts.isPropertyAccessExpression(e) &&
  ts.isIdentifier(e.expression) &&
  e.expression.text === 'vi' &&
  e.name.text === 'mock';

/** A factory with no parameters that never calls the original replaces the module outright. */
const replacesModule = (factory: ts.Expression, text: string): boolean =>
  (ts.isArrowFunction(factory) || ts.isFunctionExpression(factory)) &&
  factory.parameters.length === 0 &&
  !/importActual|importOriginal/.test(text.slice(factory.pos, factory.end));

/** Records the specifier of a value `import`/`export ... from` (type-only ones carry no code). */
function scanDeclaration(node: ts.ImportDeclaration | ts.ExportDeclaration, out: Scan): void {
  const typeOnly = ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly;
  const spec = node.moduleSpecifier;
  if (typeOnly !== true && spec !== undefined && ts.isStringLiteral(spec))
    out.specs.push(spec.text);
}

/** Records `import('x')`, `require('x')` and a module-replacing `vi.mock('x', () => ...)`. */
function scanCall(node: ts.CallExpression, text: string, out: Scan): void {
  const first: ts.Expression | undefined = node.arguments[0];
  const factory: ts.Expression | undefined = node.arguments[1];
  if (first === undefined || !ts.isStringLiteralLike(first)) return;
  const callee = node.expression;
  if (callee.kind === ts.SyntaxKind.ImportKeyword) {
    out.dynamic.push(first.text);
  } else if (ts.isIdentifier(callee) && callee.text === 'require') {
    out.specs.push(first.text);
  } else if (isViMock(callee) && factory !== undefined && replacesModule(factory, text)) {
    out.mocks.push(first.text);
  }
}

/** Value imports of one file, plus `vi.mock` targets whose factory never loads the original. */
export function scan(file: string, text: string): Scan {
  const out: Scan = { specs: [], dynamic: [], mocks: [] };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) scanDeclaration(node, out);
    else if (ts.isCallExpression(node)) scanCall(node, text, out);
    ts.forEachChild(node, visit);
  };
  if (/\b(import|require|from)\b/.test(text))
    visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? process.cwd();
  const files = JSON.parse(readFileSync(0, 'utf8')) as string[];
  const out: Record<string, Scan> = {};
  for (const file of files) out[file] = scan(file, readFileSync(join(root, file), 'utf8'));
  process.stdout.write(JSON.stringify(out));
}
