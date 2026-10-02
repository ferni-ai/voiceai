/**
 * Privacy removal on the Firestore vector store: per-user wipe and by-ID removal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>() }));

vi.mock('@google-cloud/firestore', () => {
  class Query {
    constructor(
      private readonly filters: Array<[string, unknown]> = [],
      private readonly max = Infinity
    ) {}
    where(field: string, _op: string, value: unknown): Query {
      return new Query([...this.filters, [field, value]], this.max);
    }
    limit(n: number): Query {
      return new Query(this.filters, n);
    }
    async get() {
      const matches = [...h.docs.entries()]
        .filter(([, d]) =>
          this.filters.every(
            ([f, v]) => f === 'metadata.userId' && (d.metadata as { userId?: string })?.userId === v
          )
        )
        .slice(0, this.max)
        .map(([id, d]) => ({
          id,
          data: () => d,
          ref: { id, delete: async () => void h.docs.delete(id) },
        }));
      return { empty: matches.length === 0, size: matches.length, docs: matches };
    }
  }
  class Collection extends Query {
    findNearest = () => new Query();
    doc(id: string) {
      return {
        id,
        delete: async () => void h.docs.delete(id),
        get: async () => ({ exists: h.docs.has(id), id, data: () => h.docs.get(id) }),
        set: async (data: Record<string, unknown>) => void h.docs.set(id, data),
      };
    }
  }
  return {
    Firestore: class {
      collection() {
        return new Collection();
      }
      async terminate() {}
    },
    FieldValue: { vector: (v: number[]) => v },
  };
});

import { FirestoreVectorStore } from '../core.js';

beforeEach(() => {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/fake.json';
  h.docs.clear();
  for (let i = 0; i < 650; i++) {
    h.docs.set(`a${i}`, { text: 't', metadata: { userId: 'user-a' } });
  }
  h.docs.set('b1', { text: 't', metadata: { userId: 'user-b' } });
  h.docs.set('no-embedding', { text: 't', embedding: null, metadata: { userId: 'user-a' } });
});

afterEach(() => {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
});

describe('FirestoreVectorStore privacy removal', () => {
  it('removeAllForUser pages until every entry for that user is gone', async () => {
    const store = new FirestoreVectorStore();
    const removed = await store.removeAllForUser('user-a');
    expect(removed).toBe(651);
    expect([...h.docs.keys()]).toEqual(['b1']);
  });

  it('removeDocumentsForUser removes the given ids', async () => {
    const store = new FirestoreVectorStore();
    expect(await store.removeDocumentsForUser('user-a', ['a1', 'a2'])).toBe(2);
    expect(h.docs.has('a1')).toBe(false);
    expect(h.docs.has('a3')).toBe(true);
  });
});
