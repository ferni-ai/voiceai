#!/usr/bin/env npx tsx
/**
 * Codemod: bind every server-side Firestore client to getFirestoreDatabase().
 *
 * Dev runs on a second database (FIRESTORE_DATABASE=ferni-dev) while prod stays on
 * '(default)'. Clients that pick their own database split dev between the two, so this
 * moves them onto the one rule (sites found by ./firestore-database-sites.ts):
 *
 *   new Firestore({ projectId })            → new Firestore({ projectId, databaseId: getFirestoreDatabase() })
 *   admin.firestore(), admin.default.firestore()  → getAdminFirestore()
 *   getFirestore() from firebase-admin/firestore  → getAdminFirestore()
 *   databaseId: process.env.FIRESTORE_DATABASE || '(default)' → databaseId: getFirestoreDatabase()
 *
 * With FIRESTORE_DATABASE unset every rewritten site still binds '(default)'. A module
 * that imported firebase-admin lazily (`await import(...)`) loads the helper lazily too.
 * Anything it can't rewrite safely is skipped with the reason, and stays on the
 * ratchet's allowlist (scripts/ci/firestore-database-ratchet.ts) for a person.
 *
 * Idempotent: a second run finds nothing to change.
 *
 * usage:
 *   npx tsx scripts/codemods/firestore-database.ts [--write] [path-prefix ...]
 *   (dry run by default; prefixes like src/services limit the scope)
 *
 * @module scripts/codemods/firestore-database
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import prettier from 'prettier';
import ts from 'typescript';
import { measure } from '../ci/firestore-database-ratchet.js';
import {
  findSites,
  isScanned,
  parse,
  rootIdentifier,
  type Site,
} from './firestore-database-sites.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADMIN_APP = 'src/utils/firebase-admin-app.ts';
const ENVIRONMENT = 'src/config/environment.ts';
const MAX_LINES = 500; // apps/cli/src/commands/quality/ratchet.ts: files over this may not grow

/** Files other in-flight PRs own; rewriting them here would conflict. */
export const SKIP_FILES: Record<string, string> = {
  'src/config/environment.ts': 'owned by the database-resolver PR (01)',
  'src/config/refuse-production-data.ts': 'owned by the database-resolver PR (01)',
  'src/config/production-data-guard.ts': 'owned by the synthetic-guard PR (02)',
  'src/utils/synthetic-write-guard.ts': 'owned by the synthetic-guard PR (02)',
  'src/utils/synthetic-user.ts': 'owned by the synthetic-guard PR (02)',
  'src/services/pubsub/pubsub-client.ts': 'Pub/Sub choke point, owned by PR 08',
  'src/services/communication/intelligence-publisher.ts': 'Pub/Sub choke point, owned by PR 08',
  'src/workers/base-worker.ts': 'Pub/Sub choke point, owned by PR 08',
};
const SKIP_PREFIXES: Array<[string, string]> = [
  ['src/memory/spanner-graph/', 'Spanner choke point, owned by PR 08'],
];

interface Edit {
  start: number;
  end: number;
  text: string;
}

export interface Outcome {
  file: string;
  line: number;
  kind: Site['kind'];
  before: string;
  after?: string;
  skipped?: string;
}

interface Binding {
  kind: 'static' | 'dynamic';
  /** import declaration (static) or variable declaration (dynamic) */
  decl: ts.ImportDeclaration | ts.VariableDeclaration;
  /** the local name the site calls through */
  name: string;
}

function importPath(fromFile: string, target: string): string {
  let rel = relative(dirname(fromFile), target).split(sep).join('/').replace(/\.ts$/, '.js');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function declaredNames(node: ts.BindingName): string[] {
  if (ts.isIdentifier(node)) return [node.text];
  return node.elements.flatMap((el) => (ts.isOmittedExpression(el) ? [] : declaredNames(el.name)));
}

/** The import or variable declaration `name` resolves to from `at`, if it is one of those. */
function resolveBinding(at: ts.Node, name: string): Binding | undefined {
  for (let n: ts.Node | undefined = at.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n) && n.parameters.some((p) => declaredNames(p.name).includes(name)))
      return undefined;
    const statements =
      ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n) ? n.statements : undefined;
    if (!statements) continue;
    for (const st of statements) {
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          if (declaredNames(d.name).includes(name)) return { kind: 'dynamic', decl: d, name };
        }
      }
      if (ts.isImportDeclaration(st) && st.importClause) {
        const c = st.importClause;
        const names = [
          ...(c.name ? [c.name.text] : []),
          ...(c.namedBindings
            ? ts.isNamespaceImport(c.namedBindings)
              ? [c.namedBindings.name.text]
              : c.namedBindings.elements.map((e) => e.name.text)
            : []),
        ];
        if (names.includes(name)) return { kind: 'static', decl: st, name };
      }
    }
  }
  return undefined;
}

/** References to `name` in `scope`, minus declarations and anything inside `excluded` ranges. */
function references(scope: ts.Node, name: string, excluded: Array<[number, number]>): number {
  let count = 0;
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && n.text === name) {
      const p = n.parent;
      const isPropName =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isPropertyAssignment(p) && p.name === n);
      const isDecl =
        ts.isImportClause(p) ||
        ts.isNamespaceImport(p) ||
        ts.isImportSpecifier(p) ||
        (ts.isBindingElement(p) && (p.name === n || p.propertyName === n)) ||
        (ts.isVariableDeclaration(p) && p.name === n);
      const inside = excluded.some(([s, e]) => n.getStart() >= s && n.end <= e);
      if (!isPropName && !isDecl && !inside) count++;
    }
    ts.forEachChild(n, visit);
  };
  visit(scope);
  return count;
}

/** Type names `<name>.firestore.X` (the firebase-admin namespace's re-export of the Firestore types). */
function firestoreTypeRefs(sf: ts.SourceFile, name: string): ts.EntityName[] {
  const out: ts.EntityName[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isTypeReferenceNode(n) &&
      new RegExp(`^${name}\\.firestore\\.\\w+$`).test(n.typeName.getText())
    )
      out.push(n.typeName);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function moduleOfInit(init: ts.Expression | undefined): string | undefined {
  let e = init;
  while (
    e &&
    (ts.isAwaitExpression(e) ||
      ts.isParenthesizedExpression(e) ||
      (ts.isPropertyAccessExpression(e) && e.name.text === 'default'))
  ) {
    e = e.expression;
  }
  if (e && ts.isCallExpression(e) && e.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const a = e.arguments[0];
    if (a && ts.isStringLiteral(a)) return a.text;
  }
  return undefined;
}

function lineIndent(text: string, pos: number): string {
  const start = text.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*/.exec(text.slice(start))![0];
}

/** Removes one element from `{ a, b }` (import specifiers or a binding pattern). */
function removeElement(text: string, list: ts.NodeArray<ts.Node>, el: ts.Node): Edit {
  const i = list.indexOf(el);
  if (list.length === 1) return { start: el.getStart(), end: el.end, text: '' };
  if (i < list.length - 1) return { start: el.getStart(), end: list[i + 1]!.getStart(), text: '' };
  return { start: list[i - 1]!.end, end: el.end, text: '' };
}

function isInAsyncFunction(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n)) {
      return !!ts
        .getModifiers(n as ts.FunctionLikeDeclaration)
        ?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    }
  }
  return false;
}

const LAZY_ENV = "process.env.FIRESTORE_DATABASE || '(default)'";

const INIT_CONDITION =
  /^(!\s*\w+\.apps\.length|\w+\.apps\.length\s*===?\s*0|!\s*getApps\(\)\.length|getApps\(\)\.length\s*===?\s*0)$/;

/**
 * The `if (admin.apps.length === 0) { ... initializeApp({ projectId }) ... }` statement
 * directly before the statement holding `node`, when it does nothing but initialize the
 * default app (with no options or just a projectId) and log.
 */
export function initBlockBefore(node: ts.Node): ts.IfStatement | undefined {
  let st: ts.Node = node;
  while (st.parent && !ts.isBlock(st.parent) && !ts.isSourceFile(st.parent)) st = st.parent;
  const block = st.parent as ts.Block | undefined;
  if (!block) return undefined;
  const prev = block.statements[block.statements.indexOf(st as ts.Statement) - 1];
  if (!prev || !ts.isIfStatement(prev) || prev.elseStatement) return undefined;
  if (!INIT_CONDITION.test(prev.expression.getText().replace(/\s+/g, ' ').trim())) return undefined;
  let ok = true;
  let inits = 0;
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText();
      if (/(^|\.)initializeApp$/.test(callee)) {
        inits++;
        const [opts] = n.arguments;
        const plain =
          n.arguments.length === 0 ||
          (n.arguments.length === 1 &&
            opts !== undefined &&
            ts.isObjectLiteralExpression(opts) &&
            opts.properties.every((p) => p.name?.getText() === 'projectId'));
        if (!plain) ok = false;
        return;
      }
      if (!/^(log|logger)\.\w+$|^getGCPProjectId$/.test(callee)) ok = false;
    }
    ts.forEachChild(n, visit);
  };
  visit(prev.thenStatement);
  return ok && inits > 0 ? prev : undefined;
}

/** Removes `node` with the lines it sits on (and one blank line after it). */
function wholeLines(text: string, node: ts.Node): Edit {
  const start = text.lastIndexOf('\n', node.getStart() - 1) + 1;
  let end = text.indexOf('\n', node.end) + 1 || text.length;
  const blank = /^[ \t]*\n/.exec(text.slice(end));
  if (blank) end += blank[0].length;
  return { start, end, text: '' };
}

/**
 * Rewrites one file. `tight` is for files over the quality ratchet's 500-line limit,
 * which may not grow: no new import lines (only an existing import extended, or one
 * freed by the rewrite reused), lazy imports inline, and a multi-line options object
 * collapsed onto one line when it fits.
 */
export async function transformFile(
  file: string,
  text: string,
  tight = false
): Promise<{ text: string; outcomes: Outcome[] }> {
  const sf = parse(file, text);
  const sites = findSites(sf);
  const outcomes: Outcome[] = [];
  const edits: Edit[] = [];
  const out = (site: Site, after?: string, skipped?: string): void => {
    outcomes.push({ file, line: site.line, kind: site.kind, before: site.text, after, skipped });
  };
  const prefixSkip = SKIP_PREFIXES.find(([p]) => file.startsWith(p));
  const fileSkip =
    SKIP_FILES[file] ??
    prefixSkip?.[1] ??
    (/\.(mjs|js)$/.test(file)
      ? 'plain JavaScript; it cannot import the TypeScript helpers'
      : undefined);
  if (fileSkip) {
    sites.forEach((s) => out(s, undefined, fileSkip));
    return { text, outcomes };
  }
  const adminApp = importPath(file, ADMIN_APP);
  const environment = importPath(file, ENVIRONMENT);
  const lazy = `await import('${adminApp}')`;

  const ownDeclaration = (name: string): boolean => {
    let found = false;
    const visit = (n: ts.Node): void => {
      const named =
        ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n) || ts.isImportSpecifier(n);
      if (named && n.name && ts.isIdentifier(n.name) && n.name.text === name) {
        const decl = ts.isImportSpecifier(n) ? n.parent.parent.parent : undefined;
        const fromHelper =
          decl &&
          ts.isStringLiteral(decl.moduleSpecifier) &&
          /firebase-admin-app\.js$|config\/(environment|index)\.js$/.test(
            decl.moduleSpecifier.text
          );
        if (!fromHelper) found = true;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return found;
  };
  if (ownDeclaration('getAdminFirestore') || ownDeclaration('getFirestoreDatabase')) {
    sites.forEach((s) =>
      out(s, undefined, 'the file declares its own getAdminFirestore/getFirestoreDatabase')
    );
    return { text, outcomes };
  }

  // Which call goes through which import, before deciding anything.
  type Resolved = { site: Site; binding?: Binding; skip?: string };
  const calls: Resolved[] = [];
  for (const site of sites) {
    if (site.kind !== 'admin-namespace' && site.kind !== 'admin-get-firestore') continue;
    const call = site.node as ts.CallExpression;
    let local: string | undefined;
    if (site.kind === 'admin-namespace') {
      const obj = (call.expression as ts.PropertyAccessExpression).expression;
      const plain =
        ts.isIdentifier(obj) ||
        (ts.isPropertyAccessExpression(obj) &&
          obj.name.text === 'default' &&
          ts.isIdentifier(obj.expression));
      if (call.arguments.length > 0 || !plain) {
        calls.push({ site, skip: 'a named app or an app() chain; pick the database by hand' });
        continue;
      }
      local = rootIdentifier(obj)?.text;
    } else {
      const [first] = call.arguments;
      const onAdminApp =
        first &&
        ts.isCallExpression(first) &&
        ts.isIdentifier(first.expression) &&
        first.expression.text === 'getAdminApp' &&
        first.arguments.length === 0;
      if (call.arguments.length > 1 || (first && !onAdminApp)) {
        const why = `Firestore on a named app (${first?.getText()}); decide whether that app should follow FIRESTORE_DATABASE`;
        calls.push({ site, skip: why });
        continue;
      }
      local = ts.isIdentifier(call.expression)
        ? call.expression.text
        : rootIdentifier(call.expression)?.text;
    }
    const binding = local ? resolveBinding(call, local) : undefined;
    if (!binding)
      calls.push({ site, skip: 'could not resolve which import the call goes through' });
    else if (
      binding.kind === 'dynamic' &&
      !moduleOfInit((binding.decl as ts.VariableDeclaration).initializer)?.startsWith(
        'firebase-admin'
      )
    ) {
      calls.push({ site, skip: `\`${local}\` is not bound to a firebase-admin import` });
    } else calls.push({ site, binding });
  }

  // Static imports the rewrite leaves unused come out; their lines can hold the helper imports.
  const staticCalls = new Map<
    ts.ImportDeclaration,
    { name: string; ranges: Array<[number, number]> }
  >();
  for (const c of calls) {
    if (c.binding?.kind !== 'static') continue;
    const d = c.binding.decl as ts.ImportDeclaration;
    const entry = staticCalls.get(d) ?? { name: c.binding.name, ranges: [] };
    entry.ranges.push([c.site.node.getStart(), c.site.node.end]);
    staticCalls.set(d, entry);
  }
  const freed: ts.ImportDeclaration[] = [];
  const trimmed: Array<{ decl: ts.ImportDeclaration; name: string }> = [];
  for (const [d, { name, ranges }] of staticCalls) {
    // `admin.firestore.Firestore` in a type is `FirebaseFirestore.Firestore`; rewriting those
    // lets the namespace import go when the call was its only runtime use.
    const typeRefs = firestoreTypeRefs(sf, name);
    const spans = typeRefs.map((r): [number, number] => [r.getStart(), r.end]);
    if (references(sf, name, [...ranges, ...spans]) > 0) continue;
    for (const r of typeRefs)
      edits.push({
        start: r.getStart(),
        end: r.end,
        text: r.getText().replace(/^\w+\.firestore\./, 'FirebaseFirestore.'),
      });
    const c = d.importClause!;
    const named =
      c.namedBindings && ts.isNamedImports(c.namedBindings) ? c.namedBindings : undefined;
    const ns =
      c.namedBindings && ts.isNamespaceImport(c.namedBindings) ? c.namedBindings : undefined;
    const others =
      (c.name && c.name.text !== name ? 1 : 0) +
      (named ? named.elements.filter((e) => e.name.text !== name).length : 0) +
      (ns && ns.name.text !== name ? 1 : 0);
    if (others === 0) freed.push(d);
    else if (named) trimmed.push({ decl: d, name });
  }

  const imports = sf.statements.filter(ts.isImportDeclaration);
  const existingImport = (path: string, alt?: string): ts.ImportDeclaration | undefined =>
    imports.find(
      (i) =>
        ts.isStringLiteral(i.moduleSpecifier) &&
        (i.moduleSpecifier.text === path || i.moduleSpecifier.text === alt) &&
        !i.importClause?.isTypeOnly &&
        !!i.importClause?.namedBindings &&
        ts.isNamedImports(i.importClause.namedBindings)
    );
  const adminImport = existingImport(adminApp);
  const envImport = existingImport(
    environment,
    environment.replace(/environment\.js$/, 'index.js')
  );
  const wantsStatic = calls.some((c) => c.binding?.kind === 'static');
  const wantsEnv = sites.some((s) => s.kind === 'inline-env' || s.kind === 'new-firestore');
  let slots = freed.length;
  // tight: an import line may only be an existing one extended or a freed one reused
  const adminFits = !tight || !!adminImport || (wantsStatic && slots-- > 0);
  const envFits = !tight || !!envImport || (wantsEnv && slots-- > 0);
  let needAdmin = false;
  let needEnv = false;

  for (const site of sites) {
    if (site.kind === 'inline-env') {
      if (!envFits) {
        out(
          site,
          undefined,
          'left inline: the file is over the 500-line ratchet and has no import to extend (it already binds the same database)'
        );
        continue;
      }
      const expr = site.node as ts.Expression;
      const replaced = expr
        .getText()
        .replace(
          /process\.env(\.FIRESTORE_DATABASE|\[['"]FIRESTORE_DATABASE['"]\])\s*(\|\||\?\?)\s*['"]\(default\)['"]\s*$/,
          'getFirestoreDatabase()'
        );
      edits.push({ start: expr.getStart(), end: expr.end, text: replaced });
      needEnv = true;
      out(site, replaced);
      continue;
    }
    if (site.kind !== 'new-firestore') continue;
    const nx = site.node as ts.NewExpression;
    const opts = nx.arguments?.[0];
    const value = envFits ? 'getFirestoreDatabase()' : LAZY_ENV;
    const prop = `databaseId: ${value}`;
    if (!nx.arguments) {
      out(site, undefined, '`new Firestore` without parentheses');
      continue;
    }
    if (!opts) {
      edits.push({ start: nx.arguments.pos, end: nx.arguments.end, text: `{ ${prop} }` });
    } else if (!ts.isObjectLiteralExpression(opts)) {
      out(
        site,
        undefined,
        `options built elsewhere (${opts.getText()}); add databaseId where they are built`
      );
      continue;
    } else if (opts.properties.some((p) => ts.isSpreadAssignment(p))) {
      out(site, undefined, 'options spread from another object, which may already set databaseId');
      continue;
    } else if (opts.properties.length === 0) {
      edits.push({ start: opts.getStart(), end: opts.end, text: `{ ${prop} }` });
    } else if (!opts.getText().includes('\n')) {
      edits.push({
        start: opts.properties[opts.properties.length - 1]!.end,
        end: opts.properties[opts.properties.length - 1]!.end,
        text: `, ${prop}`,
      });
    } else if (tight) {
      // One line instead of one more line, when it fits and there are no comments to lose.
      const props = opts.properties.map((p) => p.getText());
      const oneLine = `{ ${[...props, prop].join(', ')} }`;
      const lineStart = text.lastIndexOf('\n', opts.getStart() - 1) + 1;
      const prefix = text.slice(lineStart, opts.getStart());
      const closeEnd = text.indexOf('\n', opts.end);
      const suffix = text.slice(opts.end, closeEnd === -1 ? undefined : closeEnd);
      const hasComment = /\/\/|\/\*/.test(opts.getText());
      if (
        hasComment ||
        props.some((p) => p.includes('\n')) ||
        prefix.length + oneLine.length + suffix.length > 100
      ) {
        out(
          site,
          undefined,
          'multi-line options in a file over the 500-line ratchet; adding a line would grow it'
        );
        continue;
      }
      edits.push({ start: opts.getStart(), end: opts.end, text: oneLine });
    } else {
      const last = opts.properties[opts.properties.length - 1]!;
      const comma = opts.properties.hasTrailingComma ? text.indexOf(',', last.end) + 1 : last.end;
      const indent = lineIndent(text, last.getStart());
      edits.push({
        start: comma,
        end: comma,
        text: `${opts.properties.hasTrailingComma ? '' : ','}\n${indent}${prop},`,
      });
    }
    if (envFits) needEnv = true;
    out(site, `${prop} added`);
  }

  // Static bindings: getAdminFirestore() through a static import (or lazily, in a full file).
  for (const c of calls) {
    if (c.skip) out(c.site, undefined, c.skip);
    if (c.binding?.kind !== 'static') continue;
    const node = c.site.node;
    if (adminFits) {
      edits.push({ start: node.getStart(), end: node.end, text: 'getAdminFirestore()' });
      needAdmin = true;
      out(c.site, 'getAdminFirestore()');
    } else if (isInAsyncFunction(node)) {
      edits.push({ start: node.getStart(), end: node.end, text: `(${lazy}).getAdminFirestore()` });
      out(c.site, `(${lazy}).getAdminFirestore()`);
    } else if (initBlockBefore(node)) {
      // The `if (admin.apps.length === 0) initializeApp(...)` right before the call is what
      // getAdminApp() does; dropping it makes room for the import.
      const block = initBlockBefore(node)!;
      edits.push(wholeLines(text, block));
      edits.push({ start: node.getStart(), end: node.end, text: 'getAdminFirestore()' });
      needAdmin = true;
      out(c.site, 'getAdminFirestore() (local initializeApp block removed: getAdminApp() does it)');
    } else if (c.site.kind === 'admin-get-firestore') {
      const callee = (node as ts.CallExpression).expression.getText();
      edits.push({ start: node.getStart(), end: node.end, text: `${callee}(${LAZY_ENV})` });
      out(c.site, `${callee}(${LAZY_ENV}) (file over the 500-line ratchet, no room for an import)`);
      const entry = staticCalls.get(c.binding.decl as ts.ImportDeclaration);
      if (entry) entry.ranges.length = 0; // the import stays in use
    } else {
      out(
        c.site,
        undefined,
        'synchronous call in a file over the 500-line ratchet with no import line to reuse'
      );
      const entry = staticCalls.get(c.binding.decl as ts.ImportDeclaration);
      if (entry) entry.ranges.length = 0; // the import stays in use
    }
  }

  // Lazy (await import) bindings stay lazy.
  const dynamicCalls = new Map<ts.VariableDeclaration, { name: string; sites: Site[] }>();
  for (const c of calls) {
    if (c.binding?.kind !== 'dynamic') continue;
    const d = c.binding.decl as ts.VariableDeclaration;
    const entry = dynamicCalls.get(d) ?? { name: c.binding.name, sites: [] };
    entry.sites.push(c.site);
    dynamicCalls.set(d, entry);
  }
  for (const [decl, { name, sites: bound }] of dynamicCalls) {
    const stmt = decl.parent.parent as ts.VariableStatement;
    const ranges = bound.map((s): [number, number] => [s.node.getStart(), s.node.end]);
    const left = references(stmt.parent, name, ranges);
    const pattern = ts.isObjectBindingPattern(decl.name) ? decl.name : undefined;
    const element = pattern?.elements.find((e) => ts.isIdentifier(e.name) && e.name.text === name);
    if (left > 0 && pattern) {
      bound.forEach((s) =>
        out(s, undefined, `\`${name}\` is also used for something other than a plain call`)
      );
      continue;
    }
    const only =
      left === 0 &&
      stmt.declarationList.declarations.length === 1 &&
      (!pattern || pattern.elements.length === 1);
    if (only) {
      edits.push({
        start: decl.getStart(),
        end: decl.end,
        text: `{ getAdminFirestore } = ${lazy}`,
      });
    } else if (tight) {
      if (element) edits.push(removeElement(text, pattern!.elements, element));
      for (const s of bound) {
        edits.push({
          start: s.node.getStart(),
          end: s.node.end,
          text: `(${lazy}).getAdminFirestore()`,
        });
        out(s, `(${lazy}).getAdminFirestore()`);
      }
      continue;
    } else {
      if (element) edits.push(removeElement(text, pattern!.elements, element));
      const indent = lineIndent(text, stmt.getStart());
      edits.push({
        start: stmt.end,
        end: stmt.end,
        text: `\n${indent}const { getAdminFirestore } = ${lazy};`,
      });
    }
    for (const s of bound) {
      edits.push({ start: s.node.getStart(), end: s.node.end, text: 'getAdminFirestore()' });
      out(s, `getAdminFirestore() via ${lazy}`);
    }
  }

  // Imports: drop what the rewrite left unused, extend or add the helper imports.
  for (const { decl, name } of trimmed) {
    const entry = staticCalls.get(decl)!;
    if (entry.ranges.length === 0) continue;
    const named = decl.importClause!.namedBindings as ts.NamedImports;
    edits.push(
      removeElement(
        text,
        named.elements,
        named.elements.find((e) => e.name.text === name)!
      )
    );
  }
  const want: Array<[ts.ImportDeclaration | undefined, string, string]> = [];
  if (needAdmin) want.push([adminImport, adminApp, 'getAdminFirestore']);
  if (needEnv) want.push([envImport, environment, 'getFirestoreDatabase']);
  const newLines: string[] = [];
  for (const [existing, path, name] of want) {
    if (!existing) {
      newLines.push(`import { ${name} } from '${path}';`);
      continue;
    }
    const els = (existing.importClause!.namedBindings as ts.NamedImports).elements;
    if (els.some((e) => e.name.text === name)) continue;
    const last = els[els.length - 1];
    const at = last ? last.end : existing.importClause!.namedBindings!.getStart() + 1;
    edits.push({ start: at, end: at, text: last ? `, ${name}` : ` ${name} ` });
  }
  for (const d of freed) {
    if (staticCalls.get(d)!.ranges.length === 0) continue; // still in use after all
    const replacement = newLines.shift();
    if (replacement) edits.push({ start: d.getStart(), end: d.end, text: replacement });
    else {
      const lineEnd = text.indexOf('\n', d.end);
      edits.push({ start: d.getStart(), end: lineEnd === -1 ? d.end : lineEnd + 1, text: '' });
    }
  }
  if (newLines.length > 0) {
    const after = imports[imports.length - 1];
    if (after)
      edits.push({
        start: after.end,
        end: after.end,
        text: newLines.map((l) => `\n${l}`).join(''),
      });
    else {
      const first = sf.statements[0];
      const at = first ? first.getStart() : 0;
      edits.push({ start: at, end: at, text: `${newLines.join('\n')}\n\n` });
    }
  }

  if (edits.length === 0) return { text, outcomes };
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let next = text;
  let floor = Infinity;
  for (const e of edits) {
    if (e.end > floor) throw new Error(`${file}: overlapping edits at ${e.start}`);
    next = next.slice(0, e.start) + e.text + next.slice(e.end);
    floor = e.start;
  }
  // Keep a file prettier-clean if it was; leave hand-formatted files as they were.
  const options = {
    ...(await prettier.resolveConfig(join(REPO, file))),
    filepath: join(REPO, file),
  };
  if (await prettier.check(text, options).catch(() => false))
    next = await prettier.format(next, options);
  return { text: next, outcomes };
}

const lines = (t: string): number => t.split('\n').length - 1;

/** transformFile, retried line-neutrally when the plain rewrite would grow a file over the limit. */
export async function rewrite(
  file: string,
  text: string
): Promise<{ text: string; outcomes: Outcome[] }> {
  const grows = (t: string): boolean => lines(t) > lines(text) && lines(t) > MAX_LINES;
  const plain = await transformFile(file, text);
  if (!grows(plain.text)) return plain;
  const tight = await transformFile(file, text, true);
  if (!grows(tight.text)) return tight;
  const why = `would grow a file over the 500-line ratchet (${lines(text)} → ${lines(tight.text)} lines)`;
  return {
    text,
    outcomes: tight.outcomes.map((o) => ({ ...o, after: undefined, skipped: o.skipped ?? why })),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const prefixes = args.filter((a) => !a.startsWith('--'));
  const inScope = (f: string): boolean =>
    prefixes.length === 0 ||
    prefixes.some((p) => f === p || f.startsWith(p.endsWith('/') ? p : `${p}/`));

  // Files with a banned site (the ratchet's walk), plus files with only the inline env copy.
  const files = new Set(measure().map((v) => v.file));
  const { execFileSync } = await import('child_process');
  const grep = execFileSync(
    'git',
    ['grep', '-l', 'FIRESTORE_DATABASE', '--', 'src', 'scripts', 'apps/cli/src'],
    { cwd: REPO, encoding: 'utf8' }
  );
  for (const f of grep.split('\n')) if (f && isScanned(f)) files.add(f);

  const all: Outcome[] = [];
  for (const file of [...files].filter(inScope).sort()) {
    const text = readFileSync(join(REPO, file), 'utf8');
    const result = await rewrite(file, text);
    all.push(...result.outcomes);
    if (result.text !== text && write) writeFileSync(join(REPO, file), result.text);
  }
  for (const o of all.filter((x) => !x.skipped))
    console.log(`CHANGED ${o.file}:${o.line} [${o.kind}] ${o.before}  →  ${o.after}`);
  for (const o of all.filter((x) => x.skipped))
    console.log(`SKIPPED ${o.file}:${o.line} [${o.kind}] ${o.before}  —  ${o.skipped}`);
  const changed = all.filter((x) => !x.skipped);
  console.log(
    `\n${write ? 'Rewrote' : 'Would rewrite'} ${changed.length} site(s) in ${new Set(changed.map((o) => o.file)).size} file(s); skipped ${all.length - changed.length}.` +
      (write ? '' : ' Dry run: pass --write to apply.')
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
