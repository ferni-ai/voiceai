/**
 * Path-based in-memory Firestore for identity merge tests: collections,
 * subcollections, `where ==` (dotted paths), `limit`, `listDocuments`
 * (including phantom parents), batches and transactions with buffered writes.
 *
 * `failAfterCommits(n)` makes the (n+1)-th commit throw, to prove a merge
 * interrupted mid-way resumes without losing or duplicating data.
 */

import type { Firestore } from '@google-cloud/firestore';

type Data = Record<string, unknown>;

interface WriteOp {
  kind: 'set' | 'update' | 'delete';
  path: string;
  data?: Data;
  merge?: boolean;
}

function getPath(data: Data, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Data)[k] : undefined), data);
}

function setPath(data: Data, dotted: string, value: unknown): void {
  const keys = dotted.split('.');
  let cur = data;
  for (const k of keys.slice(0, -1)) {
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k] as Data;
  }
  cur[keys[keys.length - 1]] = value;
}

export class MemoryFirestore {
  readonly docs = new Map<string, Data>();
  private commitsLeft = Infinity;
  commits = 0;

  failAfterCommits(n: number): void {
    this.commitsLeft = n;
  }

  /** Seed / read helpers for tests. */
  put(path: string, data: Data): void {
    this.docs.set(path, structuredClone(data));
  }
  read(path: string): Data | undefined {
    return this.docs.get(path);
  }
  list(collectionPath: string): string[] {
    return [...this.docs.keys()].filter((p) => this.isDirectChild(collectionPath, p)).sort();
  }

  isDirectChild(collectionPath: string, docPath: string): boolean {
    if (!docPath.startsWith(`${collectionPath}/`)) return false;
    return !docPath.slice(collectionPath.length + 1).includes('/');
  }

  apply(ops: WriteOp[]): void {
    if (this.commitsLeft <= 0) throw new Error('injected commit failure');
    this.commitsLeft--;
    this.commits++;
    for (const op of ops) {
      if (op.kind === 'delete') this.docs.delete(op.path);
      else if (op.kind === 'set') {
        const base = op.merge ? (this.docs.get(op.path) ?? {}) : {};
        this.docs.set(op.path, { ...base, ...structuredClone(op.data ?? {}) });
      } else {
        const current = this.docs.get(op.path);
        if (!current) throw new Error(`update on missing doc ${op.path}`);
        const next = structuredClone(current);
        for (const [k, v] of Object.entries(op.data ?? {})) setPath(next, k, v);
        this.docs.set(op.path, next);
      }
    }
  }

  snapshot(path: string) {
    const data = this.docs.get(path);
    return {
      id: path.split('/').pop() as string,
      ref: this.doc(path),
      exists: data !== undefined,
      data: () => (data ? structuredClone(data) : undefined),
    };
  }

  doc(path: string): DocRef {
    return new DocRef(this, path);
  }

  collection(path: string): ColRef {
    return new ColRef(this, path);
  }

  batch() {
    const ops: WriteOp[] = [];
    return {
      set: (ref: DocRef, data: Data, opts?: { merge?: boolean }) =>
        ops.push({ kind: 'set', path: ref.path, data, merge: opts?.merge }),
      update: (ref: DocRef, data: Data) => ops.push({ kind: 'update', path: ref.path, data }),
      delete: (ref: DocRef) => ops.push({ kind: 'delete', path: ref.path }),
      commit: async () => this.apply(ops),
    };
  }

  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const ops: WriteOp[] = [];
    const tx = {
      get: async (ref: DocRef) => this.snapshot(ref.path),
      getAll: async (...refs: DocRef[]) => refs.map((r) => this.snapshot(r.path)),
      set: (ref: DocRef, data: Data, opts?: { merge?: boolean }) =>
        ops.push({ kind: 'set', path: ref.path, data, merge: opts?.merge }),
      update: (ref: DocRef, data: Data) => ops.push({ kind: 'update', path: ref.path, data }),
      delete: (ref: DocRef) => ops.push({ kind: 'delete', path: ref.path }),
    };
    const result = await fn(tx);
    if (ops.length > 0) this.apply(ops);
    return result;
  }

  asFirestore(): Firestore {
    return this as unknown as Firestore;
  }
}

class DocRef {
  constructor(
    private readonly db: MemoryFirestore,
    readonly path: string
  ) {}
  get id(): string {
    return this.path.split('/').pop() as string;
  }
  collection(name: string): ColRef {
    return new ColRef(this.db, `${this.path}/${name}`);
  }
  async get() {
    return this.db.snapshot(this.path);
  }
  async set(data: Data, opts?: { merge?: boolean }) {
    this.db.apply([{ kind: 'set', path: this.path, data, merge: opts?.merge }]);
  }
  async update(data: Data) {
    this.db.apply([{ kind: 'update', path: this.path, data }]);
  }
  async delete() {
    this.db.apply([{ kind: 'delete', path: this.path }]);
  }
}

class ColRef {
  constructor(
    private readonly db: MemoryFirestore,
    readonly path: string,
    private readonly filters: Array<[string, unknown]> = [],
    private readonly max = Infinity
  ) {}
  doc(id: string): DocRef {
    return new DocRef(this.db, `${this.path}/${id}`);
  }
  where(field: string, op: string, value: unknown): ColRef {
    if (op !== '==') throw new Error(`unsupported op ${op}`);
    return new ColRef(this.db, this.path, [...this.filters, [field, value]], this.max);
  }
  limit(n: number): ColRef {
    return new ColRef(this.db, this.path, this.filters, n);
  }
  async get() {
    const docs = this.db
      .list(this.path)
      .filter((p) => this.filters.every(([f, v]) => getPath(this.db.read(p) ?? {}, f) === v))
      .slice(0, this.max)
      .map((p) => this.db.snapshot(p));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
  async listDocuments(): Promise<DocRef[]> {
    const ids = new Set<string>();
    for (const p of this.db.docs.keys()) {
      if (p.startsWith(`${this.path}/`)) ids.add(p.slice(this.path.length + 1).split('/')[0]);
    }
    return [...ids].sort().map((id) => this.doc(id));
  }
}
