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
  processFerniPersonality,
  type PersonalityContext,
} from '../turn-personality.js';
import { buildFerniPersonalityContext } from '../../../intelligence/context-builders/personas/ferni-personality.js';
import type { ContextBuilderInput } from '../../../intelligence/context-builders/index.js';

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

function builderInput(userText: string, turnCount: number): ContextBuilderInput {
  return {
    userText,
    analysis: {},
    services: { sessionId: 's' },
    userData: { turnCount },
    userProfile: null,
    persona: { id: 'ferni' },
  } as unknown as ContextBuilderInput;
}

afterEach(() => {
  delete process.env.PERSONALITY_EXPRESSIONS;
});

describe('scripted self-disclosure', () => {
  it('keeps the composed personality expression out of the turn context', async () => {
    const result = await processFerniPersonality(turn('off'));
    expect(result.injectionContent ?? '').not.toContain('PERSONALITY EXPRESSION');
    expect(result.injectionContent ?? '').not.toContain('Weekend evenings feel different');
    // Not delivered, so not learned from as if it had been.
    expect(getPreviousExpression('off')).toBeUndefined();
  });

  it('puts it back with PERSONALITY_EXPRESSIONS=on', async () => {
    process.env.PERSONALITY_EXPRESSIONS = 'on';
    const result = await processFerniPersonality(turn('on'));
    expect(result.injectionContent).toContain('[🎭 PERSONALITY EXPRESSION]');
    expect(result.injectionContent).toContain('Weekend evenings feel different');
  });

  it("drops the ferni-personality builder's volunteered backstory but keeps its responses", async () => {
    // Turn 0 always carries the essence ("40% of interactions should include a LOVABLE MOMENT").
    const first = await buildFerniPersonalityContext(builderInput('hey', 0));
    expect(first.map((i) => i.source)).not.toContain('ferni_essence');
    expect(first.some((i) => i.content.includes('LOVABLE MOMENT'))).toBe(false);
    // Distress still slows him down.
    const heavy = await buildFerniPersonalityContext(builderInput("I'm struggling and anxious", 3));
    expect(heavy.map((i) => i.source)).toContain('ferni_depth_mode');

    process.env.PERSONALITY_EXPRESSIONS = 'on';
    const old = await buildFerniPersonalityContext(builderInput('hey', 0));
    expect(old.map((i) => i.source)).toContain('ferni_essence');
  });
});
