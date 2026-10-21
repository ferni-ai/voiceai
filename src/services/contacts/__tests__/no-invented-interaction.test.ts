/**
 * Relationship Insights never invents a "last time you talked" or a strength score.
 *
 * Before: upsertContact defaulted lastInteraction to now and strengthScore to 50.
 * In prod all 78 contacts read strength 50 with 0 interactions and
 * lastInteraction = createdAt, so a contact added 20 days ago produced
 * "It's been 20 days since you last talked to Mom". These cases run the real
 * service with n = 0, 1 and 3 interactions, including the stored prod shape.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const storedDocs: Array<Record<string, unknown>> = [];

vi.mock('@google-cloud/firestore', () => ({
  // A class, so `new Firestore()` works (an arrow-function mock is not constructible)
  Firestore: class {
    collection = vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockImplementation(async () => ({
        empty: storedDocs.length === 0,
        docs: storedDocs.map((data) => ({ id: String(data.id), data: () => data })),
      })),
    });
  },
}));

const DAY = 24 * 60 * 60 * 1000;

const service = {
  ...(await import('../contact-relationship-service.js')),
  ...(await import('../last-interaction.js')),
};
const { buildRelationshipInsightsView } = await import('../relationship-insights-view.js');

/** A contact exactly as prod stored it before the fix: defaults, not facts. */
function prodShapedDoc(userId: string, name: string, interactionCount: number) {
  const createdAt = new Date(Date.now() - 20 * DAY);
  return {
    id: `contact_${name}`,
    userId,
    contactId: `${name.toLowerCase()}@example.com`,
    name,
    relationship: 'family',
    firstInteraction: createdAt,
    lastInteraction: interactionCount > 0 ? new Date(Date.now() - 40 * DAY) : createdAt,
    interactionCount,
    strengthScore: interactionCount > 0 ? 70 : 50,
    topics: [],
    recentContext: [],
    importantDates: [],
    createdAt,
    updatedAt: createdAt,
  };
}

beforeEach(() => {
  storedDocs.length = 0;
  service.clearCache();
});

describe('interactionFields: stored contact to what we actually know', () => {
  const createdAt = new Date('2026-09-28T12:00:00Z');
  const last = new Date('2026-09-08T12:00:00Z');
  it.each([
    { n: 0, data: { interactionCount: 0, lastInteraction: createdAt, strengthScore: 50 }, known: false },
    { n: 0, data: { lastInteraction: createdAt, strengthScore: 50 }, known: false },
    { n: 1, data: { interactionCount: 1, lastInteraction: last, strengthScore: 57 }, known: true },
    { n: 3, data: { interactionCount: 3, lastInteraction: last, strengthScore: 71 }, known: true },
    { n: 3, data: { interactionCount: 3, lastInteraction: 'not a date', strengthScore: 71 }, known: false },
  ])('n=$n known=$known', ({ data, known }) => {
    const fields = service.interactionFields(data);
    if (known) {
      expect(fields.lastInteraction?.getTime()).toBe(last.getTime());
      expect(fields.strengthScore).toBe(data.strengthScore);
    } else {
      expect(fields.lastInteraction).toBeUndefined();
    }
  });
});

describe('a new contact with no interaction', () => {
  it('has no lastInteraction, no score, and no "days since"', async () => {
    const saved = await service.upsertContact('u-new', { contactId: 'mom@x.com', name: 'Mom' });
    expect(saved.lastInteraction).toBeUndefined();
    expect(saved.strengthScore).toBeUndefined();
    expect(service.daysSinceLastInteraction(saved)).toBeNull();
    expect(service.hasRealInteraction(saved)).toBe(false);
  });

  it('earns its score from the first real interaction, not from 50', async () => {
    await service.upsertContact('u-first', { contactId: 'mom@x.com', name: 'Mom' });
    await service.recordInteraction('u-first', {
      contactId: 'mom@x.com',
      type: 'call',
      date: new Date(),
    } as Parameters<typeof service.recordInteraction>[1]);
    const after = await service.getContact('u-first', 'mom@x.com');
    expect(after?.interactionCount).toBe(1);
    expect(service.daysSinceLastInteraction(after!)).toBe(0);
    // call weight 7, plus the weak-relationship boost of 5
    expect(after?.strengthScore).toBe(12);
  });
});

describe('nudges from the stored prod shape (Firestore load path)', () => {
  it.each([
    { n: 0, expectNudge: false },
    { n: 1, expectNudge: true },
    { n: 3, expectNudge: true },
  ])('n=$n interactions: "days since you talked" nudge = $expectNudge', async ({ n, expectNudge }) => {
    const userId = `u-prod-${n}`;
    storedDocs.push(prodShapedDoc(userId, 'Mom', n));

    const [loaded] = await service.getContacts(userId);
    const insights = await service.getRelationshipInsights(userId);
    const attention = await service.getContactsNeedingAttention(userId);
    const context = await service.getContactContext(userId, 'mom@example.com');

    const daysNudges = insights.filter((i) => i.insightType !== 'follow-up');
    if (expectNudge) {
      expect(loaded?.lastInteraction).toBeInstanceOf(Date);
      expect(daysNudges.length).toBeGreaterThan(0);
      expect(daysNudges[0]?.message).toMatch(/40 days/);
      expect(attention.map((c) => c.name)).toEqual(['Mom']);
      expect(context).toContain('40 days ago');
    } else {
      expect(loaded?.lastInteraction).toBeUndefined();
      expect(loaded?.strengthScore).toBeUndefined();
      expect(daysNudges).toEqual([]);
      expect(attention).toEqual([]);
      expect(context).toContain('none recorded yet');
      expect(context).not.toMatch(/\d+ days ago/);
      expect(context).not.toContain('/100');
    }
  });

  it('loads contacts with no interaction at all (no orderBy on a missing field)', async () => {
    const doc = prodShapedDoc('u-missing', 'Sam', 0) as Record<string, unknown>;
    delete doc.lastInteraction;
    delete doc.strengthScore;
    storedDocs.push(doc);
    const contacts = await service.getContacts('u-missing');
    expect(contacts.map((c) => c.name)).toEqual(['Sam']);
  });
});

describe('Relationship Insights dashboard stats', () => {
  const base = {
    userId: 'u',
    topics: [],
    recentContext: [],
    firstInteraction: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  it.each([
    { n: 0, scores: [], avg: null, bars: 0 },
    { n: 1, scores: [80], avg: 80, bars: 3 },
    { n: 3, scores: [80, 40, 20], avg: 47, bars: 3 },
  ])('n=$n scored people: average $avg', ({ scores, avg, bars }) => {
    const contacts = [
      // An unscored person never drags the average to 0 or counts as "needs work"
      { ...base, id: 'none', contactId: 'none', name: 'None', interactionCount: 0 },
      ...scores.map((s, i) => ({
        ...base,
        id: `c${i}`,
        contactId: `c${i}`,
        name: `C${i}`,
        interactionCount: 2,
        strengthScore: s,
        lastInteraction: new Date(),
      })),
    ];
    const view = buildRelationshipInsightsView(contacts, []);
    expect(view.stats.averageStrength).toBe(avg);
    expect(view.strengthDistribution).toHaveLength(bars);
    if (bars) {
      expect(view.strengthDistribution.reduce((sum, b) => sum + b.value, 0)).toBeGreaterThanOrEqual(99);
    }
    expect(view.recentActivity[0]?.count).toBe(scores.length);
  });
});
