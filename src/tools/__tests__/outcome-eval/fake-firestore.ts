/**
 * An in-memory Firestore for the tool outcome evals, with fault injection.
 *
 * Covers the calls the evaluated stores make: collection/doc paths (any depth), doc
 * get/set (merge)/update/delete, collection get/add, and where('field', '==', v). A fault
 * makes every read or every write throw, the way a Firestore outage does, so an eval can
 * check what the store kept and what the tool said.
 */

export type Fault = 'none' | 'read' | 'write';

type Data = Record<string, unknown>;

export class FakeFirestore {
  readonly docs = new Map<string, Data>();
  fault: Fault = 'none';
  /** Calls the fault made throw: a faulted run with none never exercised the fault. */
  thrown = 0;

  private check(kind: 'read' | 'write'): void {
    if (this.fault !== kind) return;
    this.thrown += 1;
    throw new Error(`fake firestore: ${kind} unavailable`);
  }

  /** The documents directly under a collection path, by id. */
  list(collection: string): Map<string, Data> {
    const out = new Map<string, Data>();
    for (const [path, data] of this.docs) {
      const cut = path.lastIndexOf('/');
      if (path.slice(0, cut) === collection) out.set(path.slice(cut + 1), data);
    }
    return out;
  }

  collection(path: string): FakeCollection {
    return new FakeCollection(this, path);
  }

  doc(path: string): FakeDoc {
    return new FakeDoc(this, path);
  }

  reset(): void {
    this.docs.clear();
    this.fault = 'none';
    this.thrown = 0;
  }

  /** @internal */ guard(kind: 'read' | 'write'): void {
    this.check(kind);
  }
}

const snapshot = (id: string, data: Data | undefined) => ({
  id,
  exists: data !== undefined,
  data: () => (data === undefined ? undefined : structuredClone(data)),
});

class FakeDoc {
  constructor(
    private readonly db: FakeFirestore,
    readonly path: string
  ) {}

  get id(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }

  collection(name: string): FakeCollection {
    return new FakeCollection(this.db, `${this.path}/${name}`);
  }

  async get() {
    this.db.guard('read');
    return snapshot(this.id, this.db.docs.get(this.path));
  }

  async set(data: Data, options?: { merge?: boolean }): Promise<void> {
    this.db.guard('write');
    const prior = options?.merge ? (this.db.docs.get(this.path) ?? {}) : {};
    this.db.docs.set(this.path, { ...prior, ...structuredClone(data) });
  }

  async update(data: Data): Promise<void> {
    this.db.guard('write');
    const prior = this.db.docs.get(this.path);
    if (!prior) throw new Error(`fake firestore: no document ${this.path}`);
    this.db.docs.set(this.path, { ...prior, ...structuredClone(data) });
  }

  async delete(): Promise<void> {
    this.db.guard('write');
    this.db.docs.delete(this.path);
  }
}

class FakeCollection {
  constructor(
    private readonly db: FakeFirestore,
    readonly path: string,
    private readonly filters: Array<[string, unknown]> = []
  ) {}

  doc(id = `doc_${Math.random().toString(36).slice(2, 10)}`): FakeDoc {
    return new FakeDoc(this.db, `${this.path}/${id}`);
  }

  where(field: string, op: string, value: unknown): FakeCollection {
    if (op !== '==') throw new Error(`fake firestore: where op ${op} not supported`);
    return new FakeCollection(this.db, this.path, [...this.filters, [field, value]]);
  }

  orderBy(): FakeCollection {
    return this;
  }

  limit(): FakeCollection {
    return this;
  }

  async add(data: Data): Promise<FakeDoc> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }

  async get() {
    this.db.guard('read');
    const docs = [...this.db.list(this.path)]
      .filter(([, data]) => this.filters.every(([f, v]) => data[f] === v))
      .map(([id, data]) => snapshot(id, data));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}
