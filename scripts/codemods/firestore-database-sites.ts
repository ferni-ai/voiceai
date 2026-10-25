/**
 * Finds every server-side Firestore client that picks its own database, for the
 * firestore-database codemod (scripts/codemods/firestore-database.ts) and the
 * ratchet that keeps new ones out (scripts/ci/firestore-database-ratchet.ts).
 *
 * Dev binds to a second Firestore database (FIRESTORE_DATABASE=ferni-dev) while
 * prod stays on '(default)'. A client that doesn't ask getFirestoreDatabase()
 * which database to use silently writes to prod from dev. Three shapes can't:
 *
 * - `new Firestore(...)` with no `databaseId` option;
 * - `admin.firestore()` on the firebase-admin namespace (it takes no database id);
 * - firebase-admin's `getFirestore()` / `getFirestore(app)` without a database id.
 *
 * A fourth shape is correct but duplicated: `databaseId: process.env.FIRESTORE_DATABASE
 * || '(default)'` inline. It is reported (the codemod moves it onto
 * getFirestoreDatabase()) but is not a violation.
 *
 * Uses the TypeScript parser, not text search: about 76 files define a local
 * `getFirestore()` wrapper of their own, and only calls bound to firebase-admin's
 * export count.
 *
 * @module scripts/codemods/firestore-database-sites
 */
import ts from 'typescript';

export type SiteKind =
  /** `new Firestore(...)` with no databaseId option. */
  | 'new-firestore'
  /** `admin.firestore()` / `admin.default.firestore()` on the firebase-admin namespace. */
  | 'admin-namespace'
  /** firebase-admin/firestore `getFirestore()` or `getFirestore(app)` with no database id. */
  | 'admin-get-firestore'
  /** `databaseId: process.env.FIRESTORE_DATABASE || '(default)'`: right database, second copy of the rule. */
  | 'inline-env';

/** The kinds the ratchet bans. inline-env binds the right database, so it is only reported. */
export const VIOLATION_KINDS: readonly SiteKind[] = [
  'new-firestore',
  'admin-namespace',
  'admin-get-firestore',
];

/** The two helpers are where clients are allowed to be built. */
export const HELPER_FILES: readonly string[] = [
  'src/utils/firestore-utils.ts',
  'src/utils/firebase-admin-app.ts',
];

/** Server-side trees: the app, ops scripts and the CLI. apps/web is the browser SDK. */
export const SCAN_ROOTS: readonly string[] = ['src', 'scripts', 'apps/cli/src'];

/** Tests build fakes and assert on constructor options; they are not clients. */
export const TEST_FILE = /(__tests__|__mocks__|\.(test|spec)\.tsx?$|(^|\/)src\/tests\/)/;

export interface Site {
  kind: SiteKind;
  /** 1-based */
  line: number;
  /** Source text of the expression, trimmed to one line. */
  text: string;
  node: ts.Node;
}

const ADMIN = 'firebase-admin';
const ADMIN_FIRESTORE = 'firebase-admin/firestore';
/** `process.env.FIRESTORE_DATABASE || '(default)'`, alone or as the fallback of a longer `||` chain. */
const INLINE_ENV =
  /(^|\|\|\s*)process\.env(\.FIRESTORE_DATABASE|\[['"]FIRESTORE_DATABASE['"]\])\s*(\|\||\?\?)\s*['"]\(default\)['"]$/;

interface Bindings {
  /** Local names bound to the firebase-admin namespace (default, `* as`, or a dynamic import). */
  admin: Set<string>;
  /** Local names bound to firebase-admin/firestore's getFirestore. */
  getFirestore: Set<string>;
  /** Local names bound to the whole firebase-admin/firestore module (`* as`, dynamic import). */
  adminFirestoreModule: Set<string>;
  /** Local names bound to the Firestore class, aliases included (`{ Firestore as Fz }`). */
  firestoreClass: Set<string>;
}

/** Modules that export the Firestore client class. */
const FIRESTORE_CLASS_MODULES = ['@google-cloud/firestore', ADMIN_FIRESTORE];

/** `x` in `await x`, `(x)`, `x.default`, `x!`. */
function unwrap(node: ts.Expression): ts.Expression {
  let expr = node;
  for (;;) {
    if (
      ts.isAwaitExpression(expr) ||
      ts.isParenthesizedExpression(expr) ||
      ts.isNonNullExpression(expr)
    )
      expr = expr.expression;
    else if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'default')
      expr = expr.expression;
    else return expr;
  }
}

function moduleOf(node: ts.Expression | undefined): string | undefined {
  // import('x'), await import('x'), require('x'), (await import('x')).default,
  // import('x').then((m) => m.default)
  let expr = node && unwrap(node);
  while (
    expr &&
    ts.isCallExpression(expr) &&
    ts.isPropertyAccessExpression(expr.expression) &&
    expr.expression.name.text === 'then'
  ) {
    expr = unwrap(expr.expression.expression);
  }
  if (expr && ts.isCallExpression(expr)) {
    const isImport = expr.expression.kind === ts.SyntaxKind.ImportKeyword;
    const isRequire = ts.isIdentifier(expr.expression) && expr.expression.text === 'require';
    const arg = expr.arguments[0];
    if ((isImport || isRequire) && arg && ts.isStringLiteral(arg)) return arg.text;
  }
  return undefined;
}

function collectBindings(sf: ts.SourceFile): Bindings {
  const b: Bindings = {
    admin: new Set(),
    getFirestore: new Set(),
    adminFirestoreModule: new Set(),
    firestoreClass: new Set(['Firestore']),
  };
  /** Names a declaration binds from `init`: `const x = init`, `const { a: x } = init`. */
  const bindDeclared = (name: ts.BindingName, init: ts.Expression): void => {
    const from = moduleOf(init);
    if (from === ADMIN && ts.isIdentifier(name)) b.admin.add(name.text);
    if (from === ADMIN && ts.isObjectBindingPattern(name)) {
      for (const el of name.elements) {
        const prop =
          el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : undefined;
        if (prop === 'default' && ts.isIdentifier(el.name)) b.admin.add(el.name.text);
      }
    }
    if (from && FIRESTORE_CLASS_MODULES.includes(from) && ts.isObjectBindingPattern(name)) {
      for (const el of name.elements) {
        const prop =
          el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : undefined;
        if (ts.isIdentifier(el.name) && (prop ?? el.name.text) === 'Firestore') {
          b.firestoreClass.add(el.name.text);
        }
      }
    }
    // const Fz = (await import('@google-cloud/firestore')).Firestore
    if (
      ts.isIdentifier(name) &&
      ts.isPropertyAccessExpression(init) &&
      init.name.text === 'Firestore' &&
      FIRESTORE_CLASS_MODULES.includes(moduleOf(init.expression) ?? '')
    ) {
      b.firestoreClass.add(name.text);
    }
    if (from === ADMIN_FIRESTORE && ts.isIdentifier(name)) b.adminFirestoreModule.add(name.text);
    if (from === ADMIN_FIRESTORE && ts.isObjectBindingPattern(name)) {
      for (const el of name.elements) {
        const prop =
          el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : undefined;
        if (
          (prop ?? (ts.isIdentifier(el.name) ? el.name.text : '')) === 'getFirestore' &&
          ts.isIdentifier(el.name)
        ) {
          b.getFirestore.add(el.name.text);
        }
      }
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const from = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (clause && from === ADMIN) {
        if (clause.name) b.admin.add(clause.name.text);
        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          b.admin.add(clause.namedBindings.name.text);
        }
      }
      if (
        clause?.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        FIRESTORE_CLASS_MODULES.includes(from)
      ) {
        for (const el of clause.namedBindings.elements) {
          if ((el.propertyName ?? el.name).text === 'Firestore') b.firestoreClass.add(el.name.text);
        }
      }
      if (clause && from === ADMIN_FIRESTORE && clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings))
          b.adminFirestoreModule.add(clause.namedBindings.name.text);
        else
          for (const el of clause.namedBindings.elements) {
            if ((el.propertyName ?? el.name).text === 'getFirestore')
              b.getFirestore.add(el.name.text);
          }
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      bindDeclared(node.name, node.initializer);
      // const [app, { getFirestore }] = await Promise.all([import('x'), import('y')])
      if (ts.isArrayBindingPattern(node.name)) {
        const items = promiseAllItems(node.initializer);
        node.name.elements.forEach((el, i) => {
          const item = items?.[i];
          if (ts.isBindingElement(el) && item) bindDeclared(el.name, item);
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  followAdmin(sf, b.admin);
  return b;
}

/** The awaited expressions of `await Promise.all([a, b])`, by position. */
function promiseAllItems(
  init: ts.Expression | undefined
): (ts.Expression | undefined)[] | undefined {
  const all = init && unwrap(init);
  if (
    !all ||
    !ts.isCallExpression(all) ||
    !ts.isPropertyAccessExpression(all.expression) ||
    all.expression.name.text !== 'all'
  )
    return undefined;
  const list = all.arguments[0];
  if (!list || !ts.isArrayLiteralExpression(list)) return undefined;
  return list.elements.map((e) => (ts.isSpreadElement(e) ? undefined : e));
}

/** An expression that evaluates to the firebase-admin namespace, given the names already bound to it. */
function isAdminValue(expr: ts.Expression, admin: Set<string>): boolean {
  if (moduleOf(expr) === ADMIN) return true;
  const inner = unwrap(expr);
  const id = ts.isCallExpression(inner) ? unwrap(inner.expression) : inner;
  return ts.isIdentifier(id) && admin.has(id.text);
}

/** The expressions a function returns, nested functions excluded. */
function returnedBy(fn: ts.FunctionLikeDeclaration): ts.Expression[] {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const out: ts.Expression[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
    else if (!ts.isFunctionLike(n)) ts.forEachChild(n, visit);
  };
  ts.forEachChild(fn.body, visit);
  return out;
}

/**
 * Adds the names the namespace reaches after the import: a variable or assignment
 * that holds it or its pending import (`p ??= import('firebase-admin').then(...)`,
 * `const admin = await p`), and a function that returns it (`await loadAdmin()`).
 * Repeats until nothing new turns up, since a use can come before its source.
 */
function followAdmin(sf: ts.SourceFile, admin: Set<string>): void {
  for (let size = -1; size !== admin.size;) {
    size = admin.size;
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const init = node.initializer;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          if (returnedBy(init).some((e) => isAdminValue(e, admin))) admin.add(node.name.text);
        } else if (isAdminValue(init, admin)) admin.add(node.name.text);
      }
      if (
        ts.isBinaryExpression(node) &&
        ts.isIdentifier(node.left) &&
        [
          ts.SyntaxKind.EqualsToken,
          ts.SyntaxKind.QuestionQuestionEqualsToken,
          ts.SyntaxKind.BarBarEqualsToken,
        ].includes(node.operatorToken.kind) &&
        isAdminValue(node.right, admin)
      ) {
        admin.add(node.left.text);
      }
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        returnedBy(node).some((e) => isAdminValue(e, admin))
      ) {
        admin.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

/** The identifier an expression chain hangs off: `admin` in `admin.default.app()`. */
export function rootIdentifier(expr: ts.Expression): ts.Identifier | undefined {
  let e: ts.Expression = expr;
  for (;;) {
    if (ts.isIdentifier(e)) return e;
    if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) e = e.expression;
    else if (ts.isCallExpression(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e))
      e = e.expression;
    else if (ts.isAwaitExpression(e)) e = e.expression;
    else return undefined;
  }
}

function isAdminNamespace(expr: ts.Expression, b: Bindings): boolean {
  if (moduleOf(expr) === ADMIN) return true; // (await import('firebase-admin')).firestore()
  const root = rootIdentifier(expr);
  return !!root && b.admin.has(root.text);
}

/** A first argument that is a database id rather than an app. */
function isDatabaseIdArg(arg: ts.Expression): boolean {
  if (ts.isStringLiteralLike(arg)) return true;
  if (
    ts.isCallExpression(arg) &&
    ts.isIdentifier(arg.expression) &&
    arg.expression.text === 'getFirestoreDatabase'
  ) {
    return true;
  }
  return isInlineEnv(arg);
}

export function isInlineEnv(expr: ts.Expression): boolean {
  return INLINE_ENV.test(expr.getText().replace(/\s+/g, ' ').trim());
}

/** The `databaseId` property of an options literal, if it has one. */
export function databaseIdProperty(
  obj: ts.ObjectLiteralExpression
): ts.ObjectLiteralElementLike | undefined {
  return obj.properties.find(
    (p) =>
      (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
      p.name !== undefined &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === 'databaseId'
  );
}

/**
 * True when the nearest declaration of `id` is a local function, parameter or variable
 * not bound to firebase-admin/firestore, e.g. a file's own `getFirestore()` wrapper.
 */
function shadowed(id: ts.Identifier): boolean {
  const name = id.text;
  const names = (n: ts.BindingName): string[] =>
    ts.isIdentifier(n)
      ? [n.text]
      : n.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : names(e.name)));
  for (let n: ts.Node | undefined = id.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n) && n.parameters.some((p) => names(p.name).includes(name))) return true;
    if (!ts.isBlock(n) && !ts.isSourceFile(n)) continue;
    for (const st of n.statements) {
      if (ts.isFunctionDeclaration(st) && st.name?.text === name) return true;
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (!names(d.name).includes(name)) continue;
        // const [, { getFirestore }] = await Promise.all([..., import('firebase-admin/firestore')])
        const at = ts.isArrayBindingPattern(d.name)
          ? d.name.elements.findIndex(
              (e) => !ts.isOmittedExpression(e) && names(e.name).includes(name)
            )
          : -1;
        const source = at >= 0 ? promiseAllItems(d.initializer)?.[at] : d.initializer;
        return moduleOf(source) !== ADMIN_FIRESTORE;
      }
    }
  }
  return false;
}

/** `const config = { ... }` in an enclosing block, for `new Firestore(config)`. */
function localObject(id: ts.Identifier): ts.Expression | undefined {
  for (let n: ts.Node | undefined = id.parent; n; n = n.parent) {
    if (!ts.isBlock(n) && !ts.isSourceFile(n)) continue;
    for (const st of n.statements) {
      if (!ts.isVariableStatement(st) || !(st.declarationList.flags & ts.NodeFlags.Const)) continue;
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === id.text) return d.initializer;
      }
    }
  }
  return undefined;
}

function oneLine(node: ts.Node): string {
  const t = node.getText().replace(/\s+/g, ' ').trim();
  return t.length > 100 ? `${t.slice(0, 97)}...` : t;
}

export function parse(file: string, text: string): ts.SourceFile {
  const kind = file.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : file.endsWith('.ts')
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

/** Every Firestore client site in one file, in source order. */
export function findSites(sf: ts.SourceFile): Site[] {
  const b = collectBindings(sf);
  const sites: Site[] = [];
  const add = (kind: SiteKind, node: ts.Node): void => {
    sites.push({
      kind,
      node,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      text: oneLine(node),
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node)) {
      const callee = node.expression;
      const named =
        (ts.isIdentifier(callee) && b.firestoreClass.has(callee.text)) ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === 'Firestore');
      if (named) {
        const arg = node.arguments?.[0];
        const opts = arg && ts.isIdentifier(arg) ? localObject(arg) : arg;
        if (!opts || !ts.isObjectLiteralExpression(opts) || !databaseIdProperty(opts))
          add('new-firestore', node);
      }
    }
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === 'databaseId' &&
      isInlineEnv(node.initializer)
    ) {
      add('inline-env', node.initializer);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'firestore' &&
        isAdminNamespace(callee.expression, b)
      ) {
        add('admin-namespace', node);
      }
      const getFs =
        (ts.isIdentifier(callee) && b.getFirestore.has(callee.text) && !shadowed(callee)) ||
        (ts.isPropertyAccessExpression(callee) &&
          callee.name.text === 'getFirestore' &&
          ((ts.isIdentifier(callee.expression) &&
            b.adminFirestoreModule.has(callee.expression.text)) ||
            moduleOf(callee.expression) === ADMIN_FIRESTORE));
      if (getFs) {
        const [first, second] = node.arguments;
        const hasDb = second !== undefined || (first !== undefined && isDatabaseIdArg(first));
        if (!hasDb) add('admin-get-firestore', node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

export function isScanned(relPath: string): boolean {
  return (
    /\.(ts|tsx|mts|mjs|js)$/.test(relPath) &&
    !relPath.endsWith('.d.ts') &&
    !TEST_FILE.test(relPath) &&
    !HELPER_FILES.includes(relPath) &&
    SCAN_ROOTS.some((root) => relPath === root || relPath.startsWith(`${root}/`))
  );
}
