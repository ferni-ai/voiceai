/**
 * Health memory through the memory-control registry: conversation delete
 * cascades, export contains it, delete-all wipes it, fact deletes cascade,
 * and voice forget finds and removes an item.
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
const domains = await import('../../memory-control/domains.js');
const { registerHealthMemoryDomain } = await import('../../memory-control/builtin-domains.js');

const U = 'user-1';

beforeEach(async () => {
  fake = createFakeFirestore();
  consent.clearConsentCache();
  health.clearMoodBuffers();
  domains.resetMemoryDomains({ loadBuiltIns: false });
  registerHealthMemoryDomain();
  await consent.setCategoryConsent(U, 'health', true, 'page');
  await health.upsertHealthItem(U, {
    kind: 'condition',
    subject: 'asthma',
    text: 'Has asthma',
    confidence: 0.9,
    source: 'explicit',
    conversationId: 'conv-1',
  });
  await health.upsertHealthItem(U, {
    kind: 'medication',
    subject: 'levothyroxine',
    text: 'Takes levothyroxine',
    confidence: 0.7,
    source: 'inferred',
    factId: 'fact-9',
  });
  health.recordMoodSample(U, 'sess-1', { mood: 'calm', intensity: 0.6 });
  await health.flushMoodTimeline(U, 'conv-1');
});

describe('health memory domain', () => {
  it('conversation delete cascades to health items and the mood timeline', async () => {
    const out = await domains.deleteDomainsForConversation(U, ['conv-1', 'sess-1']);
    expect(out.health).toBe(2);
    expect((await health.listHealthItems(U)).map((i) => i.subject)).toEqual(['levothyroxine']);
    expect(await health.listMoodTimeline(U)).toEqual([]);
  });

  it('export contains health items, the mood timeline and the consent record', async () => {
    const exported = (await domains.exportDomains(U)).health as {
      healthItems: unknown[];
      moodTimeline: unknown[];
      consent: { categories: { health: { enabled: boolean } } };
    };
    expect(exported.healthItems).toHaveLength(2);
    expect(exported.moodTimeline).toHaveLength(1);
    expect(exported.consent.categories.health.enabled).toBe(true);
  });

  it('delete-all wipes everything health', async () => {
    const out = await domains.deleteAllDomains(U);
    expect(out.health).toBe(3);
    expect(await health.listHealthItems(U)).toEqual([]);
  });

  it('deleting the source fact removes what was inferred from it', async () => {
    await domains.deleteDomainsForFacts(U, ['fact-9']);
    expect((await health.listHealthItems(U)).map((i) => i.subject)).toEqual(['asthma']);
  });

  it('voice forget finds and removes an item ("forget that I have asthma")', async () => {
    const found = await domains.findInDomains(U, 'asthma');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ domain: 'health', label: 'the health note "Has asthma"' });
    expect(await domains.forgetInDomain(U, 'health', found[0]!.id)).toBe(true);
    expect(fake.store.get(`bogle_users/${U}/memory_tombstones/${found[0]!.id}`)).toMatchObject({
      reason: 'voice_forget',
    });
  });
});
