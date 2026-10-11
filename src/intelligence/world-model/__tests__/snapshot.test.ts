/**
 * World-model snapshot builder — empty store, malformed entities, crisis excluded.
 */

import { describe, expect, it } from 'vitest';
import { buildWorldModelSnapshot } from '../snapshot.js';
import { isEmptySnapshot } from '../types.js';
import type { WorldModelSources } from '../sources.js';

function sources(overrides: Partial<WorldModelSources> = {}): WorldModelSources {
  return {
    listEntities: async () => [],
    listRelationships: async () => [],
    getHumanSignals: async () => null,
    getUserModel: async () => null,
    getSessionTopics: () => [],
    ...overrides,
  };
}

describe('buildWorldModelSnapshot', () => {
  it('returns an empty snapshot when stores are empty', async () => {
    const snapshot = await buildWorldModelSnapshot({
      userId: 'user-1',
      sources: sources(),
    });

    expect(isEmptySnapshot(snapshot)).toBe(true);
    expect(snapshot.people).toEqual([]);
    expect(snapshot.relations).toEqual([]);
    expect(snapshot.negatives).toEqual([]);
  });

  it('skips malformed entities without throwing', async () => {
    const snapshot = await buildWorldModelSnapshot({
      userId: 'user-1',
      sources: sources({
        listEntities: async () =>
          [
            null,
            { id: 12, canonicalName: '', type: 'person' },
            { attributes: 'not-an-object', type: 'person' },
            { canonicalName: 'Sarah', type: 'person', relationship: 'sister' },
            undefined,
          ] as never,
      }),
    });

    expect(snapshot.people).toHaveLength(1);
    expect(snapshot.people[0].name).toBe('Sarah');
    expect(snapshot.relations).toEqual([
      { source: 'User', relation: 'sister', target: 'Sarah' },
    ]);
  });

  it('excludes crisis-marked people, facts, and avoidances', async () => {
    const snapshot = await buildWorldModelSnapshot({
      userId: 'user-1',
      sources: sources({
        listEntities: async () => [
          {
            id: 'e-crisis',
            canonicalName: 'crisis episode notes',
            type: 'person',
            relationship: 'friend',
          },
          {
            id: 'e-ok',
            canonicalName: 'Sam',
            type: 'person',
            relationship: 'colleague',
            attributes: { lastKnownStatus: 'want to die last week' },
          },
          {
            id: 'e-goal',
            canonicalName: 'finish the deck',
            type: 'goal',
            attributes: { _type: 'goal', status: 'active' },
          },
        ],
        getHumanSignals: async () => ({
          avoidances: [
            { topic: 'self-harm details', approach: 'never_raise' },
            { topic: 'ex-partner', approach: 'never_raise', possibleReason: 'asked not to' },
          ],
        }),
      }),
    });

    expect(snapshot.people.map((p) => p.name)).toEqual(['Sam']);
    expect(snapshot.facts.every((f) => !/die|crisis|harm/i.test(f.value))).toBe(true);
    expect(snapshot.negatives).toHaveLength(1);
    expect(snapshot.negatives[0].text).toBe('ex-partner');
    expect(snapshot.goals.map((g) => g.text)).toEqual(['finish the deck']);
  });
});
