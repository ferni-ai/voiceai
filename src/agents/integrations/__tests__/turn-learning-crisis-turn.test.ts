/**
 * processTurnLearning hands the turn's crisis read to semantic intelligence unchanged, so the
 * crisis-turn gate there (semantic-intelligence/integration.ts) sees the real read and not a
 * missing or made-up one. Only the semantic intelligence entry point is stubbed. Fictional lines.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ reads: [] as Array<boolean | undefined> }));

vi.mock('../../../services/superhuman/semantic-intelligence/integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processSemanticIntelligence: vi.fn(async (data: { crisisTurn?: boolean }) => {
    seen.reads.push(data.crisisTurn);
  }),
}));

const { processTurnLearning } = await import('../unified-intelligence-integration.js');

const turn = (crisisTurn: boolean) =>
  processTurnLearning({
    userId: 'user-turn-learning-crisis',
    sessionId: 'turn-learning-crisis',
    turnNumber: 4,
    transcript: 'the garden finally has tomatoes this week',
    crisisTurn,
  });

beforeEach(() => {
  seen.reads = [];
});

describe('processTurnLearning: the crisis read reaches semantic intelligence', () => {
  it('passes a crisis turn on as a crisis turn', () => {
    turn(true);
    expect(seen.reads).toEqual([true]);
  });

  it('passes an ordinary turn on as an ordinary turn', () => {
    turn(false);
    expect(seen.reads).toEqual([false]);
  });
});
