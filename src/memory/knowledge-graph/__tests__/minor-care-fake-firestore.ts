/**
 * A fake Firestore for the MINOR_CARE background-job tests: docs by path, every read and write
 * recorded by path. Queries ignore their filters and return a collection's direct children. A
 * query without select() reads each whole doc it returns, so each is recorded; with select(), only
 * the collection is, and the docs carry only the selected fields.
 * `failHolds` makes every read of a hold doc (minor_care_holds/*) reject; `hangHolds`, never
 * answer. Synthetic data only.
 */
type Data = Record<string, unknown>;
interface Ref {
  path: string;
}

export function fakeFirestore() {
  const docs = new Map<string, Data>();
  const writes: string[] = [];
  const reads: string[] = [];
  const selects: string[] = []; // `collection.field` for every field a query selected
  const failHolds = { on: false };
  const hangHolds = { on: false };
  const snap = (path: string) => ({
    id: path.slice(path.lastIndexOf('/') + 1),
    ref: docRef(path),
    exists: docs.has(path),
    data: () => docs.get(path),
    get: (field: string) => docs.get(path)?.[field],
  });
  const docRef = (path: string) => ({
    path,
    collection: (c: string) => coll(`${path}/${c}`),
    get: async () => {
      reads.push(path);
      if (path.startsWith('minor_care_holds/')) {
        if (failHolds.on) throw new Error('fake outage');
        if (hangHolds.on)
          await new Promise<never>(() => {
            // never answers
          });
      }
      return snap(path);
    },
    update: async () => void writes.push(`update ${path}`),
    set: async () => void writes.push(`set ${path}`),
    delete: async () => void writes.push(`delete ${path}`),
  });
  const projected = (path: string, fields: string[]) => {
    const pick = () => Object.fromEntries(fields.map((f) => [f, docs.get(path)?.[f]]));
    return { ...snap(path), data: pick, get: (f: string) => pick()[f] };
  };
  const coll = (path: string) => {
    let fields: string[] | null = null;
    const query = {
      where: () => query,
      orderBy: () => query,
      startAfter: () => query,
      limit: () => query,
      select: (...f: string[]) => {
        selects.push(...f.map((x) => `${path}.${x}`));
        fields = f;
        return query;
      },
      get: async () => {
        reads.push(path);
        const rows = [...docs.keys()].filter(
          (p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/')
        );
        const only = fields;
        if (only) return { docs: rows.map((p) => projected(p, only)) };
        reads.push(...rows);
        return { docs: rows.map(snap) };
      },
    };
    return {
      ...query,
      doc: (id: string) => docRef(`${path}/${id}`),
      add: async () => void writes.push(`add ${path}`),
    };
  };
  const db = {
    collection: (c: string) => coll(c),
    batch: () => ({
      update: (ref: Ref) => void writes.push(`update ${ref.path}`),
      delete: (ref: Ref) => void writes.push(`delete ${ref.path}`),
      commit: async () => undefined,
    }),
  };
  const reset = () => {
    docs.clear();
    writes.length = 0;
    reads.length = 0;
    selects.length = 0;
    failHolds.on = false;
    hangHolds.on = false;
  };
  /** Every read or write of the user's knowledge graph. */
  const graphTouched = (u: string) =>
    [...reads, ...writes].filter((p) => p.includes(`knowledge_graph/${u}`));
  return { docs, writes, reads, selects, failHolds, hangHolds, db, reset, graphTouched };
}

const DAY = 24 * 60 * 60 * 1000;

/** A graph the engine rewrites: an entity that decays and an old weak relationship it deletes. */
export function seedGraph(docs: Map<string, Data>, u: string): void {
  const now = Date.now();
  docs.set(`knowledge_graph/${u}/entities/e1`, {
    canonicalName: 'Garden club',
    aliases: [],
    importance: 0.5,
    emotionalSalience: 0,
    lastMentioned: new Date(now - 30 * DAY),
  });
  docs.set(`knowledge_graph/${u}/relationships/r1`, {
    strength: 0.1,
    reinforcementCount: 0,
    lastReinforced: new Date(now - 90 * DAY),
  });
}

const HOUR = 60 * 60 * 1000;

/**
 * A hold record whose 6 h shared hold ran out, with the held call's window stored and not yet
 * purged (unscrubbed windows are kept until they are): the caller is still held.
 */
export function lapsedWithOpenWindow(now: number): Data {
  return {
    heldUntil: now - HOUR,
    v: 1,
    windows: [{ start: now - 8 * HOUR, end: now - 7 * HOUR, scrubbed: false }],
  };
}
