/**
 * Personal insights and preferences are wired into memory control: fact
 * edits/deletes cascade into what was derived from them, export and voice
 * forget reach preferences, and the memory page's people carry profile details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFirestore } from './fake-firestore.js';
import { FakeVectorStore } from './fake-vector-store.js';
import { seedUser, UID } from './seed.js';

const h = vi.hoisted(() => ({
  db: null as unknown,
  vectors: null as unknown,
  insights: {
    getPeopleForApi: vi.fn(),
    getLifeThreads: vi.fn(),
    deleteDerivedFor: vi.fn(),
    deleteAllDerived: vi.fn(),
    deleteDerivedForFact: vi.fn(),
  },
  prefs: {
    exportPreferences: vi.fn(),
    deletePreferencesFor: vi.fn(),
    deleteAllPreferences: vi.fn(),
    deletePreferencesDerivedFromFact: vi.fn(),
    listPreferences: vi.fn(),
    deletePreference: vi.fn(),
  },
}));

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => h.db }));
vi.mock('../../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => h.vectors,
}));
vi.mock('../../personal-insights/index.js', () => h.insights);
vi.mock('../../user-preferences/index.js', () => h.prefs);

import { deleteConversation, deleteFact, deletePerson, editFact, listMemories } from '../index.js';
import {
  registerPersonalInsightsDomain,
  registerUserPreferencesDomain,
} from '../builtin-domains.js';
import { exportDomains, findInDomains, forgetInDomain, resetMemoryDomains } from '../domains.js';

beforeEach(() => {
  vi.clearAllMocks();
  resetMemoryDomains({ loadBuiltIns: false });
  registerPersonalInsightsDomain();
  registerUserPreferencesDomain();
  const db = new FakeFirestore();
  const vectors = new FakeVectorStore();
  h.db = db;
  h.vectors = vectors;
  seedUser(db, vectors, UID);

  h.insights.getPeopleForApi.mockResolvedValue([]);
  h.insights.getLifeThreads.mockResolvedValue([]);
  h.insights.deleteDerivedFor.mockResolvedValue({ people_profiles: 1, life_threads: 2 });
  h.insights.deleteDerivedForFact.mockResolvedValue(undefined);
  h.prefs.deletePreferencesFor.mockResolvedValue(1);
  h.prefs.deletePreferencesDerivedFromFact.mockResolvedValue(1);
});

describe('fact cascade', () => {
  it('deleting a fact drops preferences derived from it and rebuilds insights', async () => {
    expect((await deleteFact(UID, 'f-legacy')).ok).toBe(true);
    expect(h.prefs.deletePreferencesDerivedFromFact).toHaveBeenCalledWith(UID, 'f-legacy');
    expect(h.insights.deleteDerivedForFact).toHaveBeenCalledTimes(1);
  });

  it('correcting a fact drops what was inferred from the wrong version', async () => {
    expect((await editFact(UID, 'f-legacy', { text: 'Sarah is a doctor' })).ok).toBe(true);
    expect(h.prefs.deletePreferencesDerivedFromFact).toHaveBeenCalledWith(UID, 'f-legacy');
    expect(h.insights.deleteDerivedForFact).toHaveBeenCalledTimes(1);
  });

  it('forgetting a person cascades every fact about them, recomputing insights once', async () => {
    expect((await deletePerson(UID, 'p1')).ok).toBe(true);
    expect(h.prefs.deletePreferencesDerivedFromFact).toHaveBeenCalledWith(UID, 'f-legacy');
    expect(h.insights.deleteDerivedForFact).toHaveBeenCalledTimes(1);
  });
});

describe('conversation delete, export, voice forget', () => {
  it('deleting a conversation reaches both domains', async () => {
    const result = await deleteConversation(UID, 'c1');
    expect(result.ok).toBe(true);
    expect(h.insights.deleteDerivedFor).toHaveBeenCalledWith(UID, 'c1');
    expect(h.prefs.deletePreferencesFor).toHaveBeenCalledWith(UID, 'c1');
  });

  it('exports people, life threads and preferences', async () => {
    h.insights.getPeopleForApi.mockResolvedValue([{ id: 'x', name: 'Biscuit', kind: 'pet' }]);
    h.prefs.exportPreferences.mockResolvedValue({ preferences: [{ id: 'p' }], exportedAt: 'now' });
    const out = await exportDomains(UID);
    expect(out.personalInsights).toEqual({
      people: [{ id: 'x', name: 'Biscuit', kind: 'pet' }],
      lifeThreads: [],
    });
    expect(out.preferences).toMatchObject({ preferences: [{ id: 'p' }] });
  });

  it('finds and forgets a preference by voice', async () => {
    h.prefs.listPreferences.mockResolvedValue([
      { id: 'likes:jazz', domain: 'likes', key: 'jazz', value: 'jazz', sentiment: 'like' },
      {
        id: 'food:cilantro',
        domain: 'food',
        key: 'cilantro',
        value: 'cilantro',
        sentiment: 'dislike',
      },
    ]);
    h.prefs.deletePreference.mockResolvedValue(true);
    const found = await findInDomains(UID, 'cilantro');
    expect(found).toEqual([
      expect.objectContaining({
        domain: 'preferences',
        id: 'food:cilantro',
        label: "that you don't like cilantro",
      }),
    ]);
    expect(await forgetInDomain(UID, 'preferences', 'food:cilantro')).toBe(true);
    expect(h.prefs.deletePreference).toHaveBeenCalledWith(UID, 'food:cilantro', 'voice_forget');
  });
});

describe('memory page people', () => {
  it('adds profile details by name and keeps the deletable entity id', async () => {
    h.insights.getPeopleForApi.mockResolvedValue([
      { id: 'prof-1', name: 'sarah', kind: 'person', memorial: true, notes: 'Loves gardening' },
    ]);
    const result = await listMemories(UID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sarah = result.value.people.find((p) => p.name === 'Sarah');
    expect(sarah).toMatchObject({ kind: 'person', memorial: true, notes: 'Loves gardening' });
    expect(sarah?.id).not.toBe('prof-1');
  });

  it('still lists people when insights are unavailable', async () => {
    h.insights.getPeopleForApi.mockRejectedValue(new Error('down'));
    const result = await listMemories(UID);
    expect(result.ok && result.value.people.some((p) => p.name === 'Sarah')).toBe(true);
  });
});
