import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = { id: string; exists?: boolean; data: () => Record<string, unknown> | undefined };

const state = vi.hoisted(() => ({
  db: null as unknown,
  queries: [] as string[],
}));

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => state.db }));

import { firestoreCohortStore, firestoreFlagHolders } from '../cohort-firestore.js';

/** Reads a dotted field path ("flags.SEMANTIC_RECALL") from a document. */
function fieldOf(data: Record<string, unknown> | undefined, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (at, key) =>
        at && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined,
      data
    );
}

/** Whether a value passes one of the where() operators these adapters use. */
function passes(value: unknown, op: string, want: unknown): boolean {
  if (op === '==') return value === want;
  if (op === '>=') return typeof value === 'number' && typeof want === 'number' && value >= want;
  if (op === 'array-contains') return Array.isArray(value) && value.includes(want);
  throw new Error(`fake Firestore: unsupported operator ${op}`);
}

/** A fake Firestore that filters each collection by its where() clauses and records the queries. */
function fakeDb(collections: Record<string, Doc[]>): unknown {
  return {
    collection: (name: string) => {
      let docs = collections[name] ?? [];
      const query = {
        where: (field: string, op: string, value: unknown) => {
          state.queries.push(`${name}:${field}${op}${String(value)}`);
          docs = docs.filter((d) => passes(fieldOf(d.data(), field), op, value));
          return query;
        },
        get: async () => ({ docs }),
        doc: (id: string) => ({
          get: async () =>
            docs.find((d) => d.id === id) ?? { id, exists: false, data: () => undefined },
        }),
      };
      return query;
    },
  };
}

const doc = (id: string, data: Record<string, unknown>): Doc => ({
  id,
  exists: true,
  data: () => data,
});

beforeEach(() => {
  state.db = null;
  state.queries = [];
});

describe('firestoreCohortStore', () => {
  it('reads nothing when Firestore is not configured', async () => {
    expect(await firestoreCohortStore.cohortsFor('mom')).toEqual([]);
    expect(await firestoreCohortStore.overridesFor('mom')).toEqual({});
    expect(await firestoreCohortStore.sampledCohorts?.()).toEqual([]);
  });

  it("maps a caller's cohorts, enabled unless set false, with flags and percent", async () => {
    state.db = fakeDb({
      feature_cohorts: [
        doc('family', { flags: { SEMANTIC_RECALL: 'on' }, members: ['mom'] }),
        doc('beta', { enabled: false, flags: 'bad', percent: 5, members: ['mom'] }),
        doc('others', { flags: { SEMANTIC_RECALL: 'on' }, members: ['dad'] }),
      ],
    });
    expect(await firestoreCohortStore.cohortsFor('mom')).toEqual([
      { id: 'family', enabled: true, flags: { SEMANTIC_RECALL: 'on' } },
      { id: 'beta', enabled: false, flags: {}, percent: 5 },
    ]);
    expect(state.queries).toEqual(['feature_cohorts:membersarray-containsmom']);
  });

  it('lists only cohorts that sample a percent of callers', async () => {
    state.db = fakeDb({
      feature_cohorts: [doc('five', { flags: {}, percent: 5 }), doc('named', { flags: {} })],
    });
    expect(await firestoreCohortStore.sampledCohorts?.()).toEqual([
      { id: 'five', enabled: true, flags: {}, percent: 5 },
    ]);
  });

  it("returns the caller's overrides, or none when the doc is missing or malformed", async () => {
    state.db = fakeDb({
      feature_flag_overrides: [
        doc('mom', { flags: { RECALL_PEOPLE: 'off' } }),
        doc('dad', { flags: 'on' }),
      ],
    });
    expect(await firestoreCohortStore.overridesFor('mom')).toEqual({ RECALL_PEOPLE: 'off' });
    expect(await firestoreCohortStore.overridesFor('dad')).toEqual({});
    expect(await firestoreCohortStore.overridesFor('solo')).toEqual({});
  });
});

describe('firestoreFlagHolders', () => {
  it('lists members of enabled cohorts and override holders, dropping bad members', async () => {
    state.db = fakeDb({
      feature_cohorts: [
        doc('family', { flags: { SEMANTIC_RECALL: 'on' }, members: ['mom', 7, 'dad'] }),
        doc('off', { enabled: false, flags: { SEMANTIC_RECALL: 'on' }, members: ['ghost'] }),
        doc('no-members', { flags: { SEMANTIC_RECALL: 'on' } }),
        doc('other-flag', { flags: { RECALL_PEOPLE: 'on' }, members: ['aunt'] }),
      ],
      feature_flag_overrides: [
        doc('solo', { flags: { SEMANTIC_RECALL: 'on' } }),
        doc('opted-out', { flags: { SEMANTIC_RECALL: 'off' } }),
      ],
    });
    expect(await firestoreFlagHolders.candidatesFor('SEMANTIC_RECALL')).toEqual([
      'mom',
      'dad',
      'solo',
    ]);
    expect(state.queries).toEqual([
      'feature_cohorts:flags.SEMANTIC_RECALL==on',
      'feature_flag_overrides:flags.SEMANTIC_RECALL==on',
    ]);
  });

  it('reads nothing for a name that is not a flag, so it cannot change the field path', async () => {
    state.db = fakeDb({ feature_cohorts: [], feature_flag_overrides: [] });
    expect(await firestoreFlagHolders.candidatesFor('flags.x')).toEqual([]);
    expect(await firestoreFlagHolders.candidatesFor('SEMANTIC_RECALL`')).toEqual([]);
    expect(state.queries).toEqual([]);
  });

  it('lets a Firestore failure reach the caller, which logs it and fails closed', async () => {
    state.db = {
      collection: () => ({ where: () => ({ get: async () => Promise.reject(new Error('down')) }) }),
    };
    await expect(firestoreFlagHolders.candidatesFor('SEMANTIC_RECALL')).rejects.toThrow('down');
  });
});
