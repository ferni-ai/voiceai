/**
 * Ferni's life stays out of the turn context unless asked for. On the
 * 2026-10-03 dev call every one of 22 turns carried a "[PERSONALITY
 * EXPRESSION] ... Share naturally" line, and Ferni said them: "Just poured
 * myself a cup", hieroglyphs, "Weekend evenings feel different, don't they?"
 * three times.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../personas/bundles/ferni/personality-integration.js', () => ({
  ferniPersonality: {
    cleanup: vi.fn(),
    processTurn: vi.fn(async () => ({
      noticing: null,
      expression: {
        content: "The transition into evening. Weekend evenings feel different, don't they?",
        theme: 'sensory_moment',
        intimacyLevel: 0.3,
        compositionReason: 'Weekend evening presence',
        shouldBeSubtle: true,
        timing: 'at_end',
        personaId: 'ferni',
      },
      shouldInject: true,
      injectionPoint: 'after_response',
    })),
  },
}));

import {
  getPreviousExpression,
  processPersonality,
  type PersonalityContext,
} from '../turn-personality.js';

function turn(sessionId: string): PersonalityContext {
  return {
    sessionId,
    userId: null,
    personaId: 'ferni',
    turnCount: 3,
    userText: "It's hard to say.",
    userData: {},
    emotionalResult: { primary: 'neutral', intensity: 0.2, distressLevel: 0 },
    injections: [],
  };
}

afterEach(() => {
  delete process.env.PERSONALITY_EXPRESSIONS;
});

describe('scripted self-disclosure', () => {
  it('keeps the composed personality expression out of the turn context', async () => {
    // processPersonality is the live entry (turn-handler); off means no injection at all.
    const result = await processPersonality(turn('off'));
    expect(result.shouldInject).toBe(false);
    expect(result.injectionContent ?? '').not.toContain('PERSONALITY EXPRESSION');
    expect(result.injectionContent ?? '').not.toContain('Weekend evenings feel different');
    // Not delivered, so not learned from as if it had been.
    expect(getPreviousExpression('off')).toBeUndefined();
  });

  it('stays off even if PERSONALITY_EXPRESSIONS=on', async () => {
    process.env.PERSONALITY_EXPRESSIONS = 'on';
    const result = await processPersonality(turn('on'));
    expect(result.shouldInject).toBe(false);
    expect(result.injectionContent ?? '').not.toContain('PERSONALITY EXPRESSION');
  });
});
