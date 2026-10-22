/**
 * Which Firestore queries in src need a composite index, and does
 * firestore.indexes.json declare it?
 *
 * Prod went weeks without the deferred_calls (status, scheduledFor) index: the
 * deferred-call job threw FAILED_PRECONDITION every minute and no check could
 * have noticed. This reads the source with the TypeScript parser and finds:
 *
 * - `x.collectionGroup('name').where(...).orderBy(...)` chains (COLLECTION_GROUP
 *   scope),
 * - `x.collection('name').where(...).orderBy(...)` chains, including
 *   `db.collection('a').doc(id).collection('b')...` (COLLECTION scope), and
 * - `claimDueItems(db, { collection, dueField })` calls, whose shared query is
 *   (status == 'pending', dueField <= now, orderBy dueField).
 *
 * A query needs a composite index when it touches two or more fields and has a
 * range/inequality filter or an orderBy. Equality-only filters on several
 * fields are served by merging single-field indexes, so they are left out.
 *
 * Pure: takes file text and the parsed index file. Used by the coverage test
 * (scripts/firestore/__tests__/index-coverage.test.ts). `diffIndexes` below is
 * the declared-vs-prod comparison behind scripts/firestore/check-indexes.ts.
 *
 * Out of scope: queries assembled across statements (`let q = ...; q = q.where()`),
 * a collection named by a parameter (unresolved, see the coverage test), and the
 * single-field indexes an equality-only query needs (fieldOverrides).
 */
import ts from 'typescript';

export type Direction = 'ASCENDING' | 'DESCENDING';

export interface IndexField {
  fieldPath: string;
  order?: Direction;
  arrayConfig?: string;
}

export interface DeclaredIndex {
  collectionGroup: string;
  queryScope: 'COLLECTION' | 'COLLECTION_GROUP';
  fields: IndexField[];
}

export interface IndexFile {
  indexes: DeclaredIndex[];
}

/** One query's index requirement. `null` fields mean the scan could not resolve them. */
export interface IndexNeed {
  file: string;
  line: number;
  collection: string | null;
  /** Equality fields: any order in the index. */
  equality: Array<string | null>;
  /** Ordered tail of the index: the range field first, then the orderBy fields. */
  ordered: Array<{ field: string | null; order: Direction }>;
  via: 'collectionGroup' | 'claimDueItems' | 'collection';
  /** Which index scope serves it: a collection query needs a COLLECTION index. */
  scope: 'COLLECTION' | 'COLLECTION_GROUP';
}

const EQUALITY_OPS = new Set(['==', 'in', 'array-contains', 'array-contains-any']);
const RANGE_OPS = new Set(['<', '<=', '>', '>=', '!=', 'not-in']);
const PATH_METHODS = new Set(['doc', 'collection', 'collectionGroup']);

/** `const NAME = 'literal'` declarations anywhere in the file. */
function stringConsts(sf: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      out.set(node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function resolve(node: ts.Node | undefined, consts: Map<string, string>): string | null {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isIdentifier(node)) return consts.get(node.text) ?? null;
  return null;
}

interface ChainCall {
  method: string;
  args: readonly ts.Expression[];
}

/** The method calls chained after `start`: `.where(..).orderBy(..).limit(..)`. */
function chainAfter(start: ts.CallExpression): ChainCall[] {
  const calls: ChainCall[] = [];
  let node: ts.Node = start;
  while (
    ts.isPropertyAccessExpression(node.parent) &&
    node.parent.expression === node &&
    ts.isCallExpression(node.parent.parent) &&
    node.parent.parent.expression === node.parent
  ) {
    calls.push({ method: node.parent.name.text, args: node.parent.parent.arguments });
    node = node.parent.parent;
  }
  return calls;
}

function needFromChain(
  file: string,
  line: number,
  collection: string | null,
  chain: ChainCall[],
  consts: Map<string, string>,
  via: 'collectionGroup' | 'collection' = 'collectionGroup'
): IndexNeed | null {
  // `.doc()` / `.collection()` start a new path; what follows is another query's.
  const end = chain.findIndex((c) => PATH_METHODS.has(c.method));
  const calls = end >= 0 ? chain.slice(0, end) : chain;
  const equality: Array<string | null> = [];
  const ranges: Array<string | null> = [];
  const orderBys: Array<{ field: string | null; order: Direction }> = [];
  for (const call of calls) {
    if (call.method === 'where') {
      const field = resolve(call.args[0], consts);
      const op = resolve(call.args[1], consts);
      if (op !== null && EQUALITY_OPS.has(op)) equality.push(field);
      else ranges.push(field); // an unknown operator is treated as the stricter case
    } else if (call.method === 'orderBy') {
      const field = resolve(call.args[0], consts);
      if (field === '__name__') continue;
      const dir = resolve(call.args[1], consts);
      orderBys.push({ field, order: dir === 'desc' ? 'DESCENDING' : 'ASCENDING' });
    }
  }
  const fields = new Set([...equality, ...ranges, ...orderBys.map((o) => o.field)]);
  if (fields.size < 2) return null;
  if (ranges.length === 0 && orderBys.length === 0) return null; // equality-only: index merge
  // The range field leads the ordered tail unless an orderBy already names it first.
  const ordered = [...orderBys];
  for (const r of ranges) {
    if (!ordered.some((o) => o.field === r)) ordered.unshift({ field: r, order: 'ASCENDING' });
  }
  const scope = via === 'collection' ? 'COLLECTION' : 'COLLECTION_GROUP';
  return { file, line, collection, equality, ordered, via, scope };
}

function objectProp(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name) {
      return p.initializer;
    }
  }
  return undefined;
}

function calleeName(call: ts.CallExpression): string | null {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

/** Every composite-index requirement in one source file. */
export function indexNeedsInSource(file: string, text: string): IndexNeed[] {
  if (!text.includes('collection') && !text.includes('claimDueItems(')) return [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const consts = stringConsts(sf);
  const needs: IndexNeed[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      if (
        (name === 'collectionGroup' || name === 'collection') &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const need = needFromChain(
          file,
          line,
          resolve(node.arguments[0], consts),
          chainAfter(node),
          consts,
          name
        );
        if (need) needs.push(need);
      } else if (name === 'claimDueItems' && node.arguments.length >= 2) {
        const opts = node.arguments[1];
        if (ts.isObjectLiteralExpression(opts)) {
          needs.push({
            file,
            line,
            collection: resolve(objectProp(opts, 'collection'), consts),
            equality: ['status'],
            ordered: [{ field: resolve(objectProp(opts, 'dueField'), consts), order: 'ASCENDING' }],
            via: 'claimDueItems',
            scope: 'COLLECTION_GROUP',
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return needs;
}

export const isResolved = (n: IndexNeed): boolean =>
  n.collection !== null &&
  n.equality.every((f) => f !== null) &&
  n.ordered.every((o) => o.field !== null);

/**
 * Does a declared index of the need's scope serve it? Equality fields form
 * the prefix in any order; the ordered tail must match field and direction.
 */
export function serves(index: DeclaredIndex, need: IndexNeed): boolean {
  if (index.queryScope !== need.scope || index.collectionGroup !== need.collection) {
    return false;
  }
  const fields = index.fields.filter((f) => f.fieldPath !== '__name__');
  const eq = new Set(need.equality);
  if (fields.length !== eq.size + need.ordered.length) return false;
  const prefix = fields.slice(0, eq.size);
  const tail = fields.slice(eq.size);
  return (
    prefix.every((f) => eq.has(f.fieldPath)) &&
    tail.every(
      (f, i) =>
        f.fieldPath === need.ordered[i].field && (f.order ?? 'ASCENDING') === need.ordered[i].order
    )
  );
}

/** The index the need asks for, in firestore.indexes.json shape. */
export function indexFor(need: IndexNeed): DeclaredIndex {
  return {
    collectionGroup: need.collection ?? '?',
    queryScope: need.scope,
    fields: [
      ...[...new Set(need.equality)].map((f) => ({
        fieldPath: f ?? '?',
        order: 'ASCENDING' as const,
      })),
      ...need.ordered.map((o) => ({ fieldPath: o.field ?? '?', order: o.order })),
    ],
  };
}

export const describeNeed = (n: IndexNeed): string =>
  `${n.file}:${n.line} ${n.collection ?? '?'} (${indexFor(n)
    .fields.map((f) => `${f.fieldPath} ${f.order === 'DESCENDING' ? 'desc' : 'asc'}`)
    .join(', ')})`;

/** A listed index: firestore.indexes.json entry, or one row of `gcloud firestore indexes composite list`. */
export interface ListedIndex {
  collectionGroup?: string;
  /** gcloud: projects/<p>/databases/<db>/collectionGroups/<cg>/indexes/<id>, db '(default)' or 'ferni-dev' */
  name?: string;
  queryScope: string;
  fields: Array<IndexField & { vectorConfig?: unknown }>;
  state?: string;
}

const groupOf = (i: ListedIndex): string =>
  i.collectionGroup ?? /collectionGroups\/([^/]+)\//.exec(i.name ?? '')?.[1] ?? '?';

/** The database a gcloud row lives in; undefined for a firestore.indexes.json entry. */
export const databaseOf = (i: ListedIndex): string | undefined =>
  /\/databases\/([^/]+)\//.exec(i.name ?? '')?.[1];

/** Identity of an index; Firestore appends `__name__`, so it is left out. */
export function indexKey(i: ListedIndex): string {
  const fields = i.fields
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig ?? (f.vectorConfig ? 'VECTOR' : '?')}`);
  return `${groupOf(i)} ${i.queryScope} (${fields.join(', ')})`;
}

export interface IndexDiff {
  /** Declared in the repo, absent in prod: a query that needs it throws FAILED_PRECONDITION. */
  missing: string[];
  /** Present in prod but not READY (still building, or failed). */
  notReady: string[];
  /** In prod, not declared. Informational: a later `firebase deploy` may offer to delete it. */
  undeclared: string[];
}

export function diffIndexes(declaredIdx: ListedIndex[], prod: ListedIndex[]): IndexDiff {
  const prodByKey = new Map(prod.map((i) => [indexKey(i), i]));
  const declaredKeys = new Set(declaredIdx.map(indexKey));
  const missing: string[] = [];
  const notReady: string[] = [];
  for (const key of declaredKeys) {
    const p = prodByKey.get(key);
    if (!p) missing.push(key);
    else if (p.state && p.state !== 'READY') notReady.push(`${key} [${p.state}]`);
  }
  const undeclared = [...prodByKey.keys()].filter((k) => !declaredKeys.has(k));
  return { missing: missing.sort(), notReady: notReady.sort(), undeclared: undeclared.sort() };
}
