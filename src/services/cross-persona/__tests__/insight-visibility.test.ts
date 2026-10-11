/**
 * Acknowledging a team insight in the app hides it there and keeps it.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ exists: false, data: () => null })),
        set: vi.fn(() => Promise.resolve()),
      })),
    })),
  })),
  FieldValue: { serverTimestamp: vi.fn(() => new Date()) },
  Timestamp: { now: vi.fn(() => ({ toDate: () => new Date() })) },
}));

import {
  acknowledgeInsight,
  addCrossPersonaInsight,
  getInsightsForPersona,
  type CrossPersonaInsight,
} from '../cross-persona-insights.js';
import { hideFromUser, isHiddenFromUser } from '../insight-visibility.js';

function insight(id: string, metadata?: Record<string, unknown>): CrossPersonaInsight {
  return {
    id,
    source: 'maya',
    target: 'ferni',
    priority: 'high',
    content: 'Missed the morning walk three days running',
    category: 'habits',
    createdAt: 1,
    expiresAt: Number.MAX_SAFE_INTEGER,
    proactive: true,
    oneTime: true,
    metadata,
  };
}

describe('insight visibility', () => {
  it('hides only the acknowledged insight and keeps its other metadata', () => {
    const insights = [insight('a', { streak: 3 }), insight('b')];

    expect(hideFromUser(insights, 'a', 1000)).toBe(true);

    expect(isHiddenFromUser(insights[0])).toBe(true);
    expect(insights[0].metadata).toEqual({ streak: 3, hiddenFromUserAt: 1000 });
    expect(isHiddenFromUser(insights[1])).toBe(false);
    expect(insights).toHaveLength(2);
  });

  it('keeps the first hide time when acknowledged twice', () => {
    const insights = [insight('a')];
    hideFromUser(insights, 'a', 1000);
    hideFromUser(insights, 'a', 2000);
    expect(insights[0].metadata).toEqual({ hiddenFromUserAt: 1000 });
  });

  it('reports an unknown insight', () => {
    expect(hideFromUser([insight('a')], 'missing')).toBe(false);
  });

  it('keeps a one-time insight for the team after the user acknowledges it', async () => {
    const userId = 'visibility-test-user';
    const added = addCrossPersonaInsight(userId, {
      source: 'maya',
      target: 'ferni',
      priority: 'high',
      content: 'Missed the morning walk three days running',
      category: 'habits',
      proactive: true,
      oneTime: true,
    });

    await acknowledgeInsight(userId, added.id);

    const ids = getInsightsForPersona(userId, 'ferni').map((item) => item.insight.id);
    expect(ids).toContain(added.id);
    expect(isHiddenFromUser(added)).toBe(true);
  });
});
