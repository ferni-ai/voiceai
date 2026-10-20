import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = { id: string; exists?: boolean; data: () => Record<string, unknown> | undefined };

const state = vi.hoisted(() => ({
  db: null as unknown,
  queries: [] as string[],
}));

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => state.db }));

import { firestoreCohortStore, firestoreFlagHolders } from '../cohort-firestore.js';

/** A fake Firestore: each collection answers every query with its docs, and records the query. */
function fakeDb(collections: Record<string, Doc[]>): unknown {
  return {
    collection: (name: string) => {
      const docs = collections[name] ?? [];
      const query = {
        where: (field: string, op: string, value: unknown) => {
          state.queries.push(`${name}:${field}${op}${String(value)}`);
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
        doc('beta', { enabled: false, flags: 'bad', percent: 5 }),
      ],
    });
    expect(await firestoreCohortStore.cohortsFor('mom')).toEqual([
      { id: 'family', enabled: true, flags: { SEMANTIC_RECALL: 'on' } },
      { id: 'beta', enabled: false, flags: {}, percent: 5 },
    ]);
    expect(state.queries).toEqual(['feature_cohorts:membersarray-containsmom']);
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
        doc('family', { members: ['mom', 7, 'dad'] }),
        doc('off', { enabled: false, members: ['ghost'] }),
        doc('no-members', {}),
      ],
      feature_flag_overrides: [doc('solo', { flags: { SEMANTIC_RECALL: 'on' } })],
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

  it('lets a Firestore failure reach the caller, which logs it and fails closed', async () => {
    state.db = {
      collection: () => ({ where: () => ({ get: async () => Promise.reject(new Error('down')) }) }),
    };
    await expect(firestoreFlagHolders.candidatesFor('SEMANTIC_RECALL')).rejects.toThrow('down');
  });
});
