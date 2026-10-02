/**
 * In-memory Firestore double for memory tests: collections, subcollections,
 * collection groups, where/orderBy/limit queries and transactions.
 * Documents are keyed by full path.
 */

import {
  toMillis,
  type CollectionRefLike,
  type DocData,
  type DocRefLike,
  type DocSnapLike,
  type FirestoreLike,
  type QueryLike,
  type QuerySnapLike,
  type TransactionLike,
  type WhereOp,
} from '../../firestore-shapes.js';

type Filter = { field: string; op: WhereOp; value: unknown };
type Order = { field: string; dir: 'asc' | 'desc' };

function comparable(v: unknown): number | string | boolean | null {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'object' && v && ('toMillis' in v || 'toDate' in v)) return toMillis(v);
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  return JSON.stringify(v);
}

function matches(data: DocData, f: Filter): boolean {
  const a = comparable(data[f.field]);
  const b = comparable(f.value);
  switch (f.op) {
    case '==':
      return a === b;
    case '!=':
      return a !== null && a !== b;
    case '<':
      return a !== null && b !== null && a < b;
    case '<=':
      return a !== null && b !== null && a <= b;
    case '>':
      return a !== null && b !== null && a > b;
    case '>=':
      return a !== null && b !== null && a >= b;
    case 'in':
      return Array.isArray(f.value) && f.value.map(comparable).includes(a);
    case 'array-contains':
      return Array.isArray(data[f.field]) && (data[f.field] as unknown[]).includes(f.value);
    default:
      return false;
  }
}

export class FakeFirestore implements FirestoreLike {
  readonly docs = new Map<string, DocData>();
  /** Set to make every write throw (simulates an outage). */
  failWrites = false;
  writes = 0;

  collection(name: string): CollectionRefLike {
    return new FakeCollection(this, name);
  }

  collectionGroup(name: string): QueryLike {
    return new FakeQuery(this, (path) => {
      const parts = path.split('/');
      return parts.length >= 2 && parts.length % 2 === 0 && parts[parts.length - 2] === name;
    });
  }

  async runTransaction<T>(fn: (tx: TransactionLike) => Promise<T>): Promise<T> {
    const pending: Array<() => void> = [];
    const tx: TransactionLike = {
      get: (ref) => ref.get(),
      set: (ref, data, options) => {
        pending.push(() => this.write(ref.path, data, options?.merge ?? false));
        return tx;
      },
      update: (ref, data) => {
        pending.push(() => this.write(ref.path, data, true, true));
        return tx;
      },
      delete: (ref) => {
        pending.push(() => this.docs.delete(ref.path));
        return tx;
      },
    };
    const result = await fn(tx);
    for (const apply of pending) apply();
    return result;
  }

  write(path: string, data: DocData, merge: boolean, mustExist = false): void {
    if (this.failWrites) throw new Error('UNAVAILABLE: fake outage');
    const existing = this.docs.get(path);
    if (mustExist && !existing) throw new Error(`NOT_FOUND: ${path}`);
    this.writes++;
    this.docs.set(path, merge && existing ? { ...existing, ...data } : { ...data });
  }

  doc(path: string): DocRefLike {
    return new FakeDoc(this, path);
  }

  /** Data at `path` (test helper). */
  get(path: string): DocData | undefined {
    return this.docs.get(path);
  }

  /** Docs directly under a collection path (test helper). */
  list(collectionPath: string): Array<{ id: string; data: DocData }> {
    const depth = collectionPath.split('/').length + 1;
    return [...this.docs.entries()]
      .filter(([p]) => p.startsWith(`${collectionPath}/`) && p.split('/').length === depth)
      .map(([p, data]) => ({ id: p.split('/').pop() ?? '', data }));
  }
}

let autoId = 0;

class FakeDoc implements DocRefLike {
  readonly id: string;
  constructor(
    private readonly db: FakeFirestore,
    readonly path: string
  ) {
    this.id = path.split('/').pop() ?? '';
  }
  get parent(): { parent: DocRefLike | null; id: string } {
    const parts = this.path.split('/');
    const collId = parts[parts.length - 2];
    const parentDocPath = parts.slice(0, -2).join('/');
    return { id: collId, parent: parentDocPath ? new FakeDoc(this.db, parentDocPath) : null };
  }
  collection(name: string): CollectionRefLike {
    return new FakeCollection(this.db, `${this.path}/${name}`);
  }
  async get(): Promise<DocSnapLike> {
    const data = this.db.docs.get(this.path);
    return {
      id: this.id,
      exists: data !== undefined,
      ref: this,
      data: () => (data ? { ...data } : undefined),
    };
  }
  async set(data: DocData, options?: { merge?: boolean }): Promise<unknown> {
    this.db.write(this.path, data, options?.merge ?? false);
    return undefined;
  }
  async update(data: DocData): Promise<unknown> {
    this.db.write(this.path, data, true, true);
    return undefined;
  }
  async delete(): Promise<unknown> {
    if (this.db.failWrites) throw new Error('UNAVAILABLE: fake outage');
    this.db.docs.delete(this.path);
    return undefined;
  }
}

class FakeQuery implements QueryLike {
  constructor(
    protected readonly db: FakeFirestore,
    private readonly pathMatch: (path: string) => boolean,
    private readonly filters: Filter[] = [],
    private readonly orders: Order[] = [],
    private readonly max?: number
  ) {}
  where(field: string, op: WhereOp, value: unknown): QueryLike {
    return new FakeQuery(
      this.db,
      this.pathMatch,
      [...this.filters, { field, op, value }],
      this.orders,
      this.max
    );
  }
  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): QueryLike {
    return new FakeQuery(
      this.db,
      this.pathMatch,
      this.filters,
      [...this.orders, { field, dir }],
      this.max
    );
  }
  limit(n: number): QueryLike {
    return new FakeQuery(this.db, this.pathMatch, this.filters, this.orders, n);
  }
  async get(): Promise<QuerySnapLike> {
    let rows = [...this.db.docs.entries()].filter(
      ([p, d]) => this.pathMatch(p) && this.filters.every((f) => matches(d, f))
    );
    // Like Firestore: ordering by a field excludes docs without it.
    for (const o of this.orders)
      rows = rows.filter(([, d]) => d[o.field] !== undefined && d[o.field] !== null);
    rows.sort(([, a], [, b]) => {
      for (const o of this.orders) {
        const x = comparable(a[o.field]);
        const y = comparable(b[o.field]);
        if (x === y) continue;
        const cmp = (x ?? 0) < (y ?? 0) ? -1 : 1;
        return o.dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
    if (this.max !== undefined) rows = rows.slice(0, this.max);
    const docs = rows.map(([p, d]) => {
      const ref = new FakeDoc(this.db, p);
      return { id: ref.id, exists: true, ref, data: () => ({ ...d }) } as DocSnapLike;
    });
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeCollection extends FakeQuery implements CollectionRefLike {
  constructor(
    db: FakeFirestore,
    private readonly collPath: string
  ) {
    const depth = collPath.split('/').length + 1;
    super(db, (p) => p.startsWith(`${collPath}/`) && p.split('/').length === depth);
  }
  doc(id?: string): DocRefLike {
    return new FakeDoc(this.db, `${this.collPath}/${id ?? `auto_${++autoId}`}`);
  }
}
