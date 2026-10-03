/**
 * With the personality expression kept out of the turn context
 * (PERSONALITY_EXPRESSIONS off), the per-turn background LLM calls that
 * generate more expressions are wasted. The 2026-10-03 call logged
 * "LLM expressions generated" 42 times.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const requestEmotionalExpressions = vi.fn();

vi.mock('../llm-expression-generator.js', () => ({
  getBestExpression: vi.fn(() => null),
  prewarmCache: vi.fn(),
  requestEmotionalExpressions,
  requestExpression: vi.fn(),
  getStats: vi.fn(() => ({})),
  markExpressionEngagement: vi.fn(),
  loadPersistedExpressions: vi.fn(async () => []),
  clearCache: vi.fn(),
}));

const { ferniPersonality } = await import('../personality-integration.js');

function turn(sessionId: string) {
  return {
    sessionId,
    turnCount: 5,
    userTranscript: 'Tell me a story about a life experience.',
    textEmotion: { primary: 'curious', intensity: 0.3, distressLevel: 0 },
    momentum: 'cruising' as const,
    relationshipStage: 'acquaintance' as const,
  };
}

afterEach(() => {
  delete process.env.PERSONALITY_EXPRESSIONS;
  requestEmotionalExpressions.mockReset();
});

describe('background expression generation', () => {
  it('makes no expression LLM requests while expressions are off', async () => {
    await ferniPersonality.processTurn(turn('off'));
    expect(requestEmotionalExpressions).not.toHaveBeenCalled();
  });

  it('PERSONALITY_EXPRESSIONS=on requests them again', async () => {
    process.env.PERSONALITY_EXPRESSIONS = 'on';
    await ferniPersonality.processTurn(turn('on'));
    expect(requestEmotionalExpressions).toHaveBeenCalledWith('curious', expect.anything());
  });
});
