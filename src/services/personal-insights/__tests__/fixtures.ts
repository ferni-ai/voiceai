/**
 * Test fixtures: source builders, an in-memory InsightsStore and a tiny
 * path-keyed Firestore double. No network, no emulator.
 */

import type { InsightsStore } from '../firestore-store.js';
import type {
  InsightBundle,
  LifeThread,
  PersonProfile,
  PredictionOutcome,
  SourceEntity,
  SourceFact,
  SourceRelationship,
  SourceSummary,
  UserMemorySources,
} from '../types.js';

export const DAY = 24 * 60 * 60 * 1000;
/** Friday 2026-10-02 15:00 UTC */
export const NOW = Date.UTC(2026, 9, 2, 15, 0, 0);

let n = 0;
export function fact(
  subject: string,
  predicate: string,
  value: string,
  extra: Partial<SourceFact> = {}
): SourceFact {
  n++;
  return {
    id: extra.id ?? `f${n}`,
    subject,
    predicate,
    value,
    text: extra.text ?? `${subject} ${predicate.replace(/_/g, ' ')} ${value}`,
    confidence: 0.9,
    conversationIds: ['c1'],
    at: NOW - DAY,
    ...extra,
  };
}

export function entity(
  name: string,
  type = 'person',
  attributes: Record<string, string> = {},
  extra: Partial<SourceEntity> = {}
): SourceEntity {
  n++;
  return { id: `e${n}`, name, type, attributes, conversationIds: ['c1'], at: NOW - DAY, ...extra };
}

export function rel(
  source: string,
  target: string,
  type: string,
  extra: Partial<SourceRelationship> = {}
): SourceRelationship {
  n++;
  return { id: `r${n}`, source, target, type, conversationIds: ['c1'], at: NOW - DAY, ...extra };
}

export function summary(
  conversationId: string,
  daysAgo: number,
  parts: Partial<SourceSummary> = {}
): SourceSummary {
  return {
    id: `s_${conversationId}`,
    conversationId,
    at: NOW - daysAgo * DAY,
    mainTopics: [],
    keyPoints: [],
    followUps: [],
    ...parts,
  };
}

export function sources(parts: Partial<UserMemorySources> = {}): UserMemorySources {
  return { facts: [], entities: [], relationships: [], summaries: [], conversations: [], ...parts };
}

/** In-memory store with the same semantics as the Firestore one. */
export class MemoryStore implements InsightsStore {
  people = new Map<string, PersonProfile>();
  threads = new Map<string, LifeThread>();
  outcomes = new Map<string, PredictionOutcome>();
  bundle: InsightBundle | null = null;
  tombstones = new Set<string>();
  constructor(public src: UserMemorySources) {}

  async loadSources() {
    return this.src;
  }
  async loadTombstoneIds() {
    return new Set(this.tombstones);
  }
  async writeTombstone(_u: string, id: string) {
    this.tombstones.add(id);
  }
  async loadPeople() {
    return [...this.people.values()];
  }
  async loadThreads() {
    return [...this.threads.values()];
  }
  async loadBundle() {
    return this.bundle;
  }
  async loadOutcomes() {
    return [...this.outcomes.values()];
  }
  async saveOutcome(_u: string, o: PredictionOutcome) {
    this.outcomes.set(o.conversationId, o);
  }
  async saveDerived(
    _u: string,
    d: { people: readonly PersonProfile[]; threads: readonly LifeThread[]; bundle: InsightBundle }
  ) {
    this.people = new Map(d.people.map((p) => [p.id, p]));
    this.threads = new Map(d.threads.map((t) => [t.id, t]));
    this.bundle = d.bundle;
  }
  async deletePerson(_u: string, id: string) {
    const p = this.people.get(id) ?? null;
    this.people.delete(id);
    return p;
  }
  async deleteDerivedFor(_u: string, conv: string) {
    const drop = <T extends { sourceConversationIds: readonly string[] }>(m: Map<string, T>) => {
      let k = 0;
      for (const [id, v] of m) {
        if (!v.sourceConversationIds.includes(conv)) continue;
        m.delete(id);
        k++;
      }
      return k;
    };
    const counts = {
      people_profiles: drop(this.people),
      life_threads: drop(this.threads),
      prediction_outcomes: drop(this.outcomes),
      personal_insights: 0,
    };
    if (this.bundle?.sourceConversationIds.includes(conv)) {
      this.bundle = null;
      counts.personal_insights = 1;
    }
    return counts;
  }
  async deleteAllDerived() {
    const counts = {
      people_profiles: this.people.size,
      life_threads: this.threads.size,
      prediction_outcomes: this.outcomes.size,
      personal_insights: this.bundle ? 1 : 0,
    };
    this.people.clear();
    this.threads.clear();
    this.outcomes.clear();
    this.bundle = null;
    return counts;
  }
}

// ============================================================================
// Path-keyed Firestore double
// ============================================================================

type Data = Record<string, unknown>;

export class FakeFirestore {
  docs = new Map<string, Data>();
  collection(name: string) {
    return this.coll(name);
  }
  seed(path: string, data: Data): void {
    this.docs.set(path, data);
  }
  private coll(
    path: string,
    filters: Array<[string, string, unknown]> = [],
    order?: [string, string],
    lim = Infinity
  ) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const db = this;
    const query = {
      where: (f: string, op: string, v: unknown) =>
        db.coll(path, [...filters, [f, op, v]], order, lim),
      orderBy: (f: string, dir = 'asc') => db.coll(path, filters, [f, dir], lim),
      limit: (k: number) => db.coll(path, filters, order, k),
      doc: (id: string) => db.ref(`${path}/${id}`),
      get: async () => {
        let rows = [...db.docs.entries()].filter(([p]) => p.slice(0, p.lastIndexOf('/')) === path);
        rows = rows.filter(([, d]) =>
          filters.every(([f, op, v]) =>
            op === 'array-contains'
              ? Array.isArray(d[f]) && (d[f] as unknown[]).includes(v)
              : d[f] === v
          )
        );
        if (order) {
          const [f, dir] = order;
          rows.sort(
            (a, b) => (Number(a[1][f] ?? 0) - Number(b[1][f] ?? 0)) * (dir === 'desc' ? -1 : 1)
          );
        }
        return { docs: rows.slice(0, lim).map(([p]) => db.snap(p)) };
      },
    };
    return query;
  }
  private snap(path: string) {
    const data = this.docs.get(path);
    return {
      id: path.slice(path.lastIndexOf('/') + 1),
      exists: data !== undefined,
      data: () => data,
      ref: this.ref(path),
    };
  }
  ref(path: string): {
    id: string;
    get: () => Promise<ReturnType<FakeFirestore['snap']>>;
    set: (d: Data) => Promise<void>;
    delete: () => Promise<void>;
    collection: (name: string) => ReturnType<FakeFirestore['coll']>;
  } {
    return {
      id: path.slice(path.lastIndexOf('/') + 1),
      get: async () => this.snap(path),
      set: async (d: Data) => void this.docs.set(path, { ...d }),
      delete: async () => void this.docs.delete(path),
      collection: (name: string) => this.coll(`${path}/${name}`),
    };
  }
}
