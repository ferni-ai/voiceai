/**
 * Small in-memory Firestore double for memory-control tests.
 *
 * Supports what the service uses: collection/doc refs, get/set/update/delete,
 * where (==, <, array-contains), orderBy, limit, startAfter, listCollections,
 * collectionGroup, batch and recursiveDelete. Like Firestore, `<` never
 * matches across types (a Date never compares with a string).
 */

type Data = Record<string, unknown>;

function getField(data: Data, field: string): unknown {
  return field
    .split('.')
    .reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Data)[k] : undefined), data);
}

function comparable(a: unknown, b: unknown): [number, number] | [string, string] | null {
  if (a instanceof Date && b instanceof Date) return [a.getTime(), b.getTime()];
  if (typeof a === 'number' && typeof b === 'number') return [a, b];
  if (typeof a === 'string' && typeof b === 'string') return [a, b];
  return null;
}

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    const out: Data = {};
    for (const [k, v] of Object.entries(value as Data)) out[k] = clone(v);
    return out as T;
  }
  return value;
}

interface Filter {
  field: string;
  op: string;
  value: unknown;
}

export class FakeFirestore {
  readonly store = new Map<string, Data>();
  readonly writes: string[] = [];

  collection(path: string): FakeQuery {
    return new FakeQuery(this, path);
  }

  doc(path: string): FakeDocRef {
    return new FakeDocRef(this, path);
  }

  collectionGroup(name: string): FakeQuery {
    return new FakeQuery(this, name, true);
  }

  batch(): {
    set: (r: FakeDocRef, d: Data) => void;
    update: (r: FakeDocRef, d: Data) => void;
    delete: (r: FakeDocRef) => void;
    commit: () => Promise<void>;
  } {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (r, d) => void ops.push(() => r.set(d)),
      update: (r, d) => void ops.push(() => r.update(d)),
      delete: (r) => void ops.push(() => r.delete()),
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  }

  async recursiveDelete(ref: FakeDocRef | FakeQuery): Promise<void> {
    const prefix = `${ref.path}/`;
    for (const key of [...this.store.keys()]) {
      if (key === ref.path || key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Seed a document (test helper). */
  seed(path: string, data: Data): void {
    this.store.set(path, clone(data));
  }

  get(path: string): Data | undefined {
    return this.store.get(path);
  }

  paths(prefix: string): string[] {
    return [...this.store.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}

export class FakeDocSnap {
  constructor(
    readonly ref: FakeDocRef,
    private readonly value: Data | undefined
  ) {}
  get id(): string {
    return this.ref.id;
  }
  get exists(): boolean {
    return this.value !== undefined;
  }
  data(): Data | undefined {
    return this.value === undefined ? undefined : clone(this.value);
  }
}

export class FakeDocRef {
  constructor(
    private readonly db: FakeFirestore,
    readonly path: string
  ) {}
  get id(): string {
    return this.path.split('/').pop() ?? '';
  }
  get parent(): FakeQuery {
    return new FakeQuery(this.db, this.path.split('/').slice(0, -1).join('/'));
  }
  collection(name: string): FakeQuery {
    return new FakeQuery(this.db, `${this.path}/${name}`);
  }
  async get(): Promise<FakeDocSnap> {
    return new FakeDocSnap(this, this.db.store.get(this.path));
  }
  async set(data: Data, options?: { merge?: boolean }): Promise<void> {
    const base = options?.merge ? (this.db.store.get(this.path) ?? {}) : {};
    this.db.store.set(this.path, { ...base, ...clone(data) });
    this.db.writes.push(`set ${this.path}`);
  }
  async update(data: Data): Promise<void> {
    const current = this.db.store.get(this.path);
    if (!current) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
    this.db.store.set(this.path, { ...current, ...clone(data) });
    this.db.writes.push(`update ${this.path}`);
  }
  async delete(): Promise<void> {
    this.db.store.delete(this.path);
    this.db.writes.push(`delete ${this.path}`);
  }
  async listCollections(): Promise<FakeQuery[]> {
    const names = new Set<string>();
    const depth = this.path.split('/').length;
    for (const key of this.db.store.keys()) {
      if (!key.startsWith(`${this.path}/`)) continue;
      names.add(key.split('/')[depth]);
    }
    return [...names].map((n) => this.collection(n));
  }
}

export class FakeQuery {
  constructor(
    private readonly db: FakeFirestore,
    readonly path: string,
    private readonly group = false,
    private readonly filters: Filter[] = [],
    private readonly order: { field: string; dir: 'asc' | 'desc' } | null = null,
    private readonly max: number | null = null,
    private readonly after: string | null = null
  ) {}

  get id(): string {
    return this.path.split('/').pop() ?? '';
  }
  get parent(): FakeDocRef | null {
    const parts = this.path.split('/');
    return parts.length > 1 ? new FakeDocRef(this.db, parts.slice(0, -1).join('/')) : null;
  }

  private with(
    changes: Partial<{
      filters: Filter[];
      order: FakeQuery['order'];
      max: number | null;
      after: string | null;
    }>
  ): FakeQuery {
    return new FakeQuery(
      this.db,
      this.path,
      this.group,
      changes.filters ?? this.filters,
      changes.order !== undefined ? changes.order : this.order,
      changes.max !== undefined ? changes.max : this.max,
      changes.after !== undefined ? changes.after : this.after
    );
  }

  doc(id: string): FakeDocRef {
    return new FakeDocRef(this.db, `${this.path}/${id}`);
  }
  where(field: string, op: string, value: unknown): FakeQuery {
    return this.with({ filters: [...this.filters, { field, op, value }] });
  }
  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): FakeQuery {
    return this.with({ order: { field, dir } });
  }
  limit(n: number): FakeQuery {
    return this.with({ max: n });
  }
  startAfter(snap: FakeDocSnap): FakeQuery {
    return this.with({ after: snap.ref.path });
  }

  private matches(path: string, data: Data): boolean {
    const parts = path.split('/');
    if (this.group) {
      if (parts.length < 2 || parts[parts.length - 2] !== this.path) return false;
    } else if (parts.slice(0, -1).join('/') !== this.path) return false;
    return this.filters.every(({ field, op, value }) => {
      const actual = getField(data, field);
      if (op === '==') {
        if (actual instanceof Date && value instanceof Date)
          return actual.getTime() === value.getTime();
        return actual === value;
      }
      if (op === 'array-contains') return Array.isArray(actual) && actual.includes(value);
      if (op === '<' || op === '>=') {
        const pair = comparable(actual, value);
        if (pair === null) return false;
        return op === '<' ? pair[0] < pair[1] : pair[0] >= pair[1];
      }
      throw new Error(`FakeFirestore: unsupported op ${op}`);
    });
  }

  async get(): Promise<{ docs: FakeDocSnap[]; empty: boolean; size: number }> {
    let entries = [...this.db.store.entries()].filter(([p, d]) => this.matches(p, d));
    if (this.order) {
      const { field, dir } = this.order;
      entries = entries.filter(([, d]) => getField(d, field) !== undefined);
      entries.sort(([, a], [, b]) => {
        const pair = comparable(getField(a, field), getField(b, field));
        const cmp = pair ? (pair[0] < pair[1] ? -1 : pair[0] > pair[1] ? 1 : 0) : 0;
        return dir === 'desc' ? -cmp : cmp;
      });
    } else {
      entries.sort(([a], [b]) => a.localeCompare(b));
    }
    if (this.after) {
      const index = entries.findIndex(([p]) => p === this.after);
      entries = entries.slice(index + 1);
    }
    if (this.max !== null) entries = entries.slice(0, this.max);
    const docs = entries.map(([p, d]) => new FakeDocSnap(new FakeDocRef(this.db, p), d));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}
