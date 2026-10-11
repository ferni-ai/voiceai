/**
 * In-process WorldFactStore for tests: the same contract as the Firestore one.
 */

import { MAX_OPEN_FACTS, type WorldFactStore } from '../store.js';
import type { TemporalFact } from '../types.js';

export function createMemoryWorldFactStore(): WorldFactStore & {
  all(userId: string): TemporalFact[];
} {
  const byUser = new Map<string, Map<string, TemporalFact>>();
  const docs = (userId: string) => {
    let m = byUser.get(userId);
    if (!m) byUser.set(userId, (m = new Map()));
    return m;
  };
  return {
    async listOpen(userId) {
      return [...docs(userId).values()]
        .filter((f) => f.validTo === null)
        .slice(0, MAX_OPEN_FACTS)
        .map((f) => ({ ...f }));
    },
    async apply(userId, plan) {
      const m = docs(userId);
      for (const fact of plan.create) m.set(fact.id, { ...fact });
      for (const { id, validTo, supersededBy } of plan.close) {
        const old = m.get(id);
        if (old) m.set(id, { ...old, validTo, supersededBy });
      }
      for (const { id, observedAt, confidence } of plan.refresh) {
        const old = m.get(id);
        if (old) m.set(id, { ...old, observedAt, confidence });
      }
    },
    all(userId) {
      return [...docs(userId).values()].map((f) => ({ ...f }));
    },
  };
}
