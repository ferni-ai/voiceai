/**
 * Something the relationship engine told the agent without the data for it:
 *
 * "They've been trending more positive lately" after exactly 3 sessions: the
 *    "older" window was empty and averaged to 0, so any 3 sessions looked like
 *    an improvement. A trend now needs 3 recent and 3 older sessions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionMood } from '../types.js';

vi.mock('../persistence.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadRelationshipMemory: vi.fn().mockResolvedValue(null),
  saveRelationshipMemory: vi.fn().mockResolvedValue(undefined),
}));

const { initializeRelationship, clearAllRelationshipEngines } = await import('../engine.js');

async function engineWith(moods: SessionMood[], userId = `u-${Math.random()}`) {
  const engine = await initializeRelationship(userId, 'ferni');
  for (const mood of moods) {
    engine.startSession();
    await engine.endSession(mood, []);
  }
  return engine;
}

beforeEach(() => clearAllRelationshipEngines());

describe('trend direction needs two full windows', () => {
  it.each([
    { name: 'n=0', moods: [] as SessionMood[], trend: 'stable' },
    { name: 'n=1 positive', moods: ['positive'] as SessionMood[], trend: 'stable' },
    {
      name: 'n=3 positive',
      moods: ['positive', 'positive', 'positive'] as SessionMood[],
      trend: 'stable',
    },
    {
      name: 'n=5, older window short',
      moods: ['struggling', 'struggling', 'positive', 'positive', 'positive'] as SessionMood[],
      trend: 'stable',
    },
    {
      name: 'n=6, struggling then positive',
      moods: [
        'struggling',
        'struggling',
        'struggling',
        'positive',
        'positive',
        'positive',
      ] as SessionMood[],
      trend: 'improving',
    },
    {
      name: 'n=6, positive then struggling',
      moods: [
        'positive',
        'positive',
        'positive',
        'struggling',
        'struggling',
        'struggling',
      ] as SessionMood[],
      trend: 'declining',
    },
  ])('$name: $trend', async ({ moods, trend }) => {
    const engine = await engineWith(moods);
    expect(engine.buildRelationshipContext().trajectoryDirection).toBe(trend);
  });
});
