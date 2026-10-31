/**
 * Where a source file names another module, from the AST, and how a relative name resolves.
 *
 * Shared by the mock-path guard (mock-paths.ts) and the move codemod
 * (scripts/codemods/move-module.ts), so both agree on what a specifier is and where it points.
 *
 * @module quality/module-specifiers
 */
import { dirname, join, posix } from 'path';
import ts from 'typescript';
import { resolveSpec } from './architecture-gate.js';

export type SiteKind =
  'import' | 'export' | 'type' | 'dynamic' | 'require' | 'mock' | 'string' | 'template';

export interface Site {
  kind: SiteKind;
  /** the literal's text, without quotes */
  spec: string;
  /** offsets of the text between the quotes */
  start: number;
  end: number;
  line: number;
}

/** vi.* calls whose first argument is a module path. */
export const MOCK_CALLS = new Set([
  'mock',
  'doMock',
  'unmock',
  'doUnmock',
  'importActual',
  'importMock',
]);
export const CODE_FILE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (/\.(js|mjs|cjs)$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function callKind(call: ts.CallExpression): SiteKind | null {
  const callee = call.expression;
  if (callee.kind === ts.SyntaxKind.ImportKeyword) return 'dynamic';
  if (ts.isIdentifier(callee) && callee.text === 'require') return 'require';
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    const [obj, prop] = [callee.expression.text, callee.name.text];
    if (obj === 'require' && prop === 'resolve') return 'require';
    if ((obj === 'vi' || obj === 'vitest') && MOCK_CALLS.has(prop)) return 'mock';
  }
  return null;
}

/**
 * Every module specifier in `text`: imports, exports (type-only too), `import()`, `require()`,
 * `typeof import()` and vi.mock-family strings. With `allStrings`, every other string
 * literal too (kind 'string'), so a caller can find path lists such as CALL_PATH, and the
 * fixed head of each template literal (kind 'template', `spec` is the text before `${`).
 */
export function findSites(file: string, text: string, allStrings = false): Site[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const sites: Site[] = [];
  const claimed = new Set<ts.Node>();
  const add = (node: ts.Node | undefined, kind: SiteKind): void => {
    if (!node || !(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return;
    claimed.add(node);
    const start = node.getStart(sf) + 1;
    sites.push({
      kind,
      spec: node.text,
      start,
      end: node.getEnd() - 1,
      line: sf.getLineAndCharacterOfPosition(start).line + 1,
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node))
      add(node.moduleSpecifier, node.importClause?.isTypeOnly ? 'type' : 'import');
    else if (ts.isExportDeclaration(node))
      add(node.moduleSpecifier, node.isTypeOnly ? 'type' : 'export');
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression, 'require');
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      add(node.argument.literal, 'type');
    else if (ts.isCallExpression(node)) {
      const kind = callKind(node);
      if (kind) add(node.arguments[0], kind);
    } else if (
      allStrings &&
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !claimed.has(node)
    ) {
      add(node, 'string');
    } else if (allStrings && ts.isTemplateExpression(node)) {
      const start = node.head.getStart(sf) + 1;
      sites.push({
        kind: 'template',
        spec: node.head.text,
        start,
        end: start,
        line: sf.getLineAndCharacterOfPosition(start).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

/**
 * The file a relative specifier names, or null. Resolves like the architecture gate
 * (.js → .ts/.tsx, folder → index), then real .js/.mjs/.cjs/.json files.
 */
export function resolveModule(
  from: string,
  spec: string,
  isFile: (file: string) => boolean
): string | null {
  if (!spec.startsWith('./') && !spec.startsWith('../') && spec !== '.' && spec !== '..')
    return null;
  const hit = resolveSpec('.', from, spec, isFile);
  if (hit) return hit;
  const path = specPath(from, spec);
  return (
    [path, `${path}.js`, `${path}.mjs`, `${path}.cjs`, `${path}.json`, `${path}/index.js`].find(
      isFile
    ) ?? null
  );
}

/** The repo path a relative specifier spells, before extension or index lookup. */
export function specPath(from: string, spec: string): string {
  return posix.normalize(join(dirname(from), spec).split('\\').join('/'));
}

/** The relative specifier from file `from` to repo path `to` (always starts with ./ or ../). */
export function relativeSpec(from: string, to: string): string {
  const rel = posix.relative(posix.dirname(from), to) || '.';
  return rel === '.' || rel.startsWith('./') || rel.startsWith('../') ? rel : `./${rel}`;
}
