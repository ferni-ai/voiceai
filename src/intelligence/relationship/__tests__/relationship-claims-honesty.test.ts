/**
 * Two things the relationship engine told the agent without the data for it.
 *
 * 1. "They've been trending more positive lately" after exactly 3 sessions: the
 *    "older" window was empty and averaged to 0, so any 3 sessions looked like
 *    an improvement. A trend now needs 3 recent and 3 older sessions.
 * 2. "This is your 10th conversation!" every turn: acknowledgeMilestone had no
 *    caller. The relationship-stage builder now acknowledges it once surfaced.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionMood } from '../types.js';

vi.mock('../persistence.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadRelationshipMemory: vi.fn().mockResolvedValue(null),
  saveRelationshipMemory: vi.fn().mockResolvedValue(undefined),
}));

const { initializeRelationship, clearAllRelationshipEngines } = await import('../engine.js');
const { buildRelationshipStageContext } =
  await import('../../context-builders/relationship/relationship-stage.js');

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

describe('a session milestone is surfaced once', () => {
  it('"10th conversation" reaches the prompt on one turn, not every turn', async () => {
    const userId = 'milestone-user';
    const { createDefaultMemory, loadRelationshipMemory } = await import('../persistence.js');
    const memory = createDefaultMemory(userId, 'ferni');
    memory.totalSessions = 9;
    vi.mocked(loadRelationshipMemory).mockResolvedValueOnce(memory);
    const engine = await initializeRelationship(userId, 'ferni');
    engine.startSession(); // the 10th
    const input = { services: { userId }, persona: { id: 'ferni' } } as unknown as Parameters<
      typeof buildRelationshipStageContext
    >[0];

    const turn1 = await buildRelationshipStageContext(input);
    const turn2 = await buildRelationshipStageContext(input);

    const said = (injections: Awaited<ReturnType<typeof buildRelationshipStageContext>>) =>
      injections.some((i) => JSON.stringify(i).includes('10th conversation'));
    expect(said(turn1)).toBe(true);
    expect(said(turn2)).toBe(false);
  });
});
