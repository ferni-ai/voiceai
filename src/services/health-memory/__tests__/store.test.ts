/**
 * Health memory store and capture: consent gate, upsert by identity, user
 * edits win, tombstones, conversation/fact cascades, learning from a
 * summarized conversation (fake Firestore).
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

const consent = await import('../../memory-consent/index.js');
const health = await import('../index.js');

const U = 'user-1';
const healthDocs = () => [...fake.store.keys()].filter((k) => k.includes('/health_memory/'));
const moodDocs = () => [...fake.store.keys()].filter((k) => k.includes('/mood_timeline/'));

const asthma = {
  kind: 'condition' as const,
  subject: 'Asthma',
  text: 'Has asthma',
  confidence: 0.8,
  source: 'explicit' as const,
  conversationId: 'c1',
};

beforeEach(() => {
  fake = createFakeFirestore();
  consent.clearConsentCache();
  health.clearMoodBuffers();
});

describe('consent gate', () => {
  it('stores nothing while Health is off', async () => {
    expect((await health.upsertHealthItem(U, asthma)).outcome).toBe('not_consented');
    expect(healthDocs()).toEqual([]);
  });

  it('stops capture the moment Health is switched off', async () => {
    await consent.setCategoryConsent(U, 'health', true, 'page');
    expect((await health.upsertHealthItem(U, asthma)).outcome).toBe('created');
    await consent.setCategoryConsent(U, 'health', false, 'page');
    const r = await health.upsertHealthItem(U, {
      ...asthma,
      subject: 'migraines',
      text: 'Gets migraines',
    });
    expect(r.outcome).toBe('not_consented');
    expect(healthDocs()).toHaveLength(1);
  });
});

describe('store', () => {
  beforeEach(async () => {
    await consent.setCategoryConsent(U, 'health', true, 'page');
  });

  it('re-learning updates one doc and unions provenance', async () => {
    await health.upsertHealthItem(U, asthma);
    const r = await health.upsertHealthItem(U, {
      ...asthma,
      subject: 'asthma ',
      conversationId: 'c2',
    });
    expect(r.outcome).toBe('updated');
    expect(healthDocs()).toHaveLength(1);
    expect(r.item).toMatchObject({ mentions: 2, sourceConversationIds: ['c1', 'c2'] });
    expect(r.item?.id).toBe(health.healthIdFor('condition', 'asthma'));
  });

  it('keeps one item per day for moments (sleep, energy…)', async () => {
    const sleep = {
      kind: 'sleep' as const,
      subject: 'sleep',
      text: 'Slept 4 hours',
      confidence: 0.8,
      source: 'explicit' as const,
    };
    await health.upsertHealthItem(U, { ...sleep, at: new Date('2026-09-30T08:00:00Z') });
    await health.upsertHealthItem(U, { ...sleep, at: new Date('2026-10-01T08:00:00Z') });
    await health.upsertHealthItem(U, {
      ...sleep,
      text: 'Slept badly',
      at: new Date('2026-10-01T22:00:00Z'),
    });
    const items = await health.listHealthItems(U);
    expect(items.map((i) => i.day).sort()).toEqual(['2026-09-30', '2026-10-01']);
  });

  it('never overwrites what the user corrected; only adds provenance', async () => {
    const { item } = await health.upsertHealthItem(U, asthma);
    const edited = await health.editHealthItem(U, item!.id, {
      text: 'Mild asthma, only in winter',
      status: 'past',
    });
    expect(edited.success && edited.data.userEdited).toBe(true);
    const r = await health.upsertHealthItem(U, {
      ...asthma,
      text: 'Has severe asthma',
      confidence: 1,
      conversationId: 'c9',
    });
    expect(r.outcome).toBe('provenance_only');
    const [stored] = await health.listHealthItems(U);
    expect(stored).toMatchObject({
      text: 'Mild asthma, only in winter',
      status: 'past',
      sourceConversationIds: ['c1', 'c9'],
    });
  });

  it('validates edits and ids', async () => {
    const { item } = await health.upsertHealthItem(U, asthma);
    expect((await health.editHealthItem(U, item!.id, {})).success).toBe(false);
    expect((await health.editHealthItem(U, item!.id, { text: ' ' })).success).toBe(false);
    const missing = await health.editHealthItem(U, health.healthIdFor('condition', 'nope'), {
      text: 'x',
    });
    expect(!missing.success && missing.error).toBe('not_found');
    expect(await health.deleteHealthItem(U, '../evil', 'user_deleted')).toBe(false);
  });

  it('deleted stays deleted (tombstone)', async () => {
    const { item } = await health.upsertHealthItem(U, asthma);
    expect(await health.deleteHealthItem(U, item!.id, 'user_deleted')).toBe(true);
    expect(fake.store.get(`bogle_users/${U}/memory_tombstones/${item!.id}`)).toMatchObject({
      reason: 'user_deleted',
      kind: 'health',
    });
    expect((await health.upsertHealthItem(U, asthma)).outcome).toBe('tombstoned');
  });

  it('conversation delete removes what came only from it; user-edited items stay', async () => {
    const a = await health.upsertHealthItem(U, asthma);
    const b = await health.upsertHealthItem(U, {
      ...asthma,
      subject: 'migraines',
      text: 'Gets migraines',
    });
    await health.upsertHealthItem(U, {
      ...asthma,
      subject: 'migraines',
      text: 'Gets migraines',
      conversationId: 'c2',
    });
    const c = await health.upsertHealthItem(U, {
      ...asthma,
      kind: 'medication',
      subject: 'ibuprofen',
      text: 'Takes ibuprofen',
    });
    await health.editHealthItem(U, c.item!.id, { text: 'Takes ibuprofen sometimes' });

    expect(await health.deleteHealthFor(U, 'c1')).toBe(3);
    const left = await health.listHealthItems(U);
    expect(left.map((i) => i.subject).sort()).toEqual(['ibuprofen', 'migraines']);
    expect(left.find((i) => i.subject === 'migraines')?.sourceConversationIds).toEqual(['c2']);
    expect(fake.store.has(`bogle_users/${U}/memory_tombstones/${a.item!.id}`)).toBe(true);
    void b;
  });

  it('fact delete removes items derived only from that fact', async () => {
    await health.upsertHealthItem(U, {
      ...asthma,
      conversationId: undefined,
      factId: 'f1',
      source: 'inferred',
    });
    expect(await health.deleteHealthDerivedFromFacts(U, ['f1'])).toBe(1);
    expect(await health.listHealthItems(U)).toEqual([]);
  });

  it('delete-all wipes every item', async () => {
    await health.upsertHealthItem(U, asthma);
    await health.upsertHealthItem(U, { ...asthma, subject: 'migraines', text: 'Gets migraines' });
    expect(await health.deleteAllHealth(U)).toBe(2);
    expect(healthDocs()).toEqual([]);
  });
});

describe('learning from a summarized conversation', () => {
  const turns = [
    { role: 'user', text: 'I was diagnosed with asthma. I only slept four hours.' },
    { role: 'assistant', text: 'I take metformin 500mg' }, // assistant words are never the user's health
  ];

  it('stores nothing (and no mood) without consent', async () => {
    health.recordMoodSample(U, 'c1', { mood: 'sad', intensity: 0.8 });
    expect(await health.onConversationSummarized(U, 'c1', '', turns)).toEqual({ not_consented: 1 });
    expect(healthDocs()).toEqual([]);
    expect(moodDocs()).toEqual([]);
  });

  it("learns from the user's words and from health facts, with provenance", async () => {
    await consent.setCategoryConsent(U, 'health', true, 'page');
    fake.store.set(`bogle_users/${U}/dynamic_facts/fact-1`, {
      text: 'user: medication is levothyroxine',
      category: 'health',
      factType: 'health',
      entityName: 'user',
      key: 'medication',
      value: 'levothyroxine',
      confidence: 0.7,
      sourceConversationIds: ['c1'],
    });
    fake.store.set(`bogle_users/${U}/dynamic_facts/fact-2`, {
      text: 'mom: condition is diabetes',
      category: 'health',
      entityName: 'mom',
      key: 'condition',
      value: 'diabetes',
      sourceConversationIds: ['c1'],
    });
    health.recordMoodSample(U, 'c1', { mood: 'calm', intensity: 0.6 });
    const counts = await health.onConversationSummarized(U, 'c1', '', turns);
    expect(counts.created).toBe(3);
    expect(counts.moodConversations).toBe(1);
    const items = await health.listHealthItems(U);
    expect(items.map((i) => `${i.kind}:${i.subject}`).sort()).toEqual([
      'condition:asthma',
      'medication:levothyroxine',
      'sleep:sleep',
    ]);
    expect(items.find((i) => i.kind === 'medication')).toMatchObject({
      source: 'inferred',
      sourceFactIds: ['fact-1'],
    });
    expect(items.find((i) => i.kind === 'condition')).toMatchObject({
      source: 'explicit',
      sourceConversationIds: ['c1'],
    });
  });

  it('records logging-tool entries only with consent', async () => {
    const entry = { kind: 'symptom' as const, subject: 'headache', text: 'headache, mild' };
    expect(await health.recordHealthFromTool(U, entry)).toBe('not_consented');
    await consent.setCategoryConsent(U, 'health', true, 'voice');
    expect(await health.recordHealthFromTool(U, entry)).toBe('created');
  });
});
