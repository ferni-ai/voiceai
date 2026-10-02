/**
 * Turning a category off: capture stops, the user is told what's stored and
 * offered deletion; deletion covers every registered store and keeps allergies.
 * Also the voice switch ("stop remembering my health stuff").
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  type FakeFirestore,
} from '../../user-preferences/__tests__/fake-firestore.js';

let fake: FakeFirestore;
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fake,
}));

// Facts live behind memory control (its queries need a real Firestore); mock that boundary.
const facts = vi.hoisted(() => ({
  list: [] as Array<{ id: string; text: string; category: string }>,
  deleted: [] as string[],
}));
vi.mock('../../memory-control/index.js', () => ({
  listMemories: async () => ({ ok: true, value: { facts: facts.list, people: [] } }),
  deleteFact: async (_uid: string, id: string) => {
    facts.deleted.push(id);
    facts.list = facts.list.filter((f) => f.id !== id);
    return { ok: true, value: { deleted: true } };
  },
}));

const consent = await import('../index.js');
const health = await import('../../health-memory/index.js');
const prefs = await import('../../user-preferences/index.js');

const U = 'user-1';

beforeEach(async () => {
  fake = createFakeFirestore();
  consent.clearConsentCache();
  prefs.clearPreferenceCache();
  health.clearMoodBuffers();
  consent.resetCategoryStores();
  facts.list = [
    { id: 'f-asthma', text: 'user has asthma', category: 'health' },
    { id: 'f-meds', text: 'user takes metformin 500mg', category: 'personal' },
    { id: 'f-debt', text: 'user has credit card debt', category: 'personal' },
    { id: 'f-hike', text: 'user loves hiking', category: 'preference' },
  ];
  facts.deleted = [];
  await consent.setCategoryConsent(U, 'health', true, 'page');
  await health.upsertHealthItem(U, {
    kind: 'condition',
    subject: 'asthma',
    text: 'Has asthma',
    confidence: 0.9,
    source: 'explicit',
    conversationId: 'c1',
  });
  health.recordMoodSample(U, 'c1', { mood: 'happy', intensity: 0.7 });
  await health.flushMoodTimeline(U, 'c1');
  await prefs.upsertPreference(U, {
    domain: 'food',
    key: 'allergy:peanuts',
    value: 'peanuts',
    source: 'explicit',
    confidence: 1,
  });
  await prefs.upsertPreference(U, {
    domain: 'food',
    key: 'medical:salt',
    value: 'salt',
    source: 'explicit',
    confidence: 1,
  });
});

describe('category data', () => {
  it('counts what is stored per category', async () => {
    const h = await consent.summarizeCategoryData(U, 'health');
    expect(h.byStore).toMatchObject({
      facts: 2,
      healthMemory: 1,
      moodTimeline: 1,
      medicalFoodRestrictions: 1,
    });
    expect(h.total).toBe(5);
    expect((await consent.summarizeCategoryData(U, 'finances')).byStore).toMatchObject({
      facts: 1,
    });
  });

  it('deletes every health store but keeps allergies (safety exception)', async () => {
    const r = await consent.deleteCategoryData(U, 'health');
    expect(r.total).toBe(5);
    expect(facts.deleted.sort()).toEqual(['f-asthma', 'f-meds']);
    expect(await health.listHealthItems(U)).toEqual([]);
    expect(await health.listMoodTimeline(U)).toEqual([]);
    const left = (await prefs.listPreferences(U, { fresh: true })).map((p) => p.key);
    expect(left.some((k) => k.startsWith('allergy:peanut'))).toBe(true);
    expect(left).not.toContain('medical:salt');
    expect(facts.list.map((f) => f.id)).toEqual(['f-debt', 'f-hike']);
  });

  it('isolates a failing store', async () => {
    consent.registerCategoryStore({
      category: 'health',
      name: 'broken',
      count: async () => {
        throw new Error('boom');
      },
      deleteAll: async () => 0,
    });
    const r = await consent.summarizeCategoryData(U, 'health');
    expect(r.byStore.broken).toBe('failed');
    expect(r.total).toBe(5);
  });
});

describe('voice switch', () => {
  it('"stop remembering my health stuff" stops capture and offers deletion', async () => {
    const reply = await consent.handleConsentVoice(U, { category: 'health', enabled: false });
    expect(reply).toContain('stopped remembering your health stuff');
    expect(reply).toContain('allergies');
    expect(reply).toContain('I still have 5 things from before');
    expect(await consent.isCategoryEnabled(U, 'health')).toBe(false);
    // Offered, not forced
    expect(await health.listHealthItems(U)).toHaveLength(1);
    // Capture is off now
    const r = await health.upsertHealthItem(U, {
      kind: 'condition',
      subject: 'migraines',
      text: 'Gets migraines',
      confidence: 0.9,
      source: 'explicit',
    });
    expect(r.outcome).toBe('not_consented');
  });

  it('deletes only after the user says yes', async () => {
    const reply = await consent.handleConsentVoice(U, {
      category: 'health',
      enabled: false,
      deleteExisting: true,
    });
    expect(reply).toContain('deleted the 5 things');
    expect(await health.listHealthItems(U)).toEqual([]);
  });

  it('turning on thanks the user; "all" covers every category; unknown asks', async () => {
    expect(await consent.handleConsentVoice(U, { category: 'money', enabled: true })).toContain(
      'money things'
    );
    expect(await consent.isCategoryEnabled(U, 'finances')).toBe(true);
    await consent.handleConsentVoice(U, { category: 'all', enabled: false });
    expect(await consent.isCategoryEnabled(U, 'beliefs')).toBe(false);
    expect(await consent.handleConsentVoice(U, { category: 'weather' })).toContain('health, money');
    expect(await consent.handleConsentVoice(undefined, { category: 'health' })).toContain(
      "can't change"
    );
  });
});
