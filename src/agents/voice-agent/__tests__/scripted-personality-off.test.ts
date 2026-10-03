/**
 * The personality system's pre-written lines must not reach a live call.
 *
 * Evidence: on the 2026-10-03 dev call Ferni said "That golden hour light,
 * weekend evenings feel different, don't they?" and "The transition into
 * evening, weekend evenings feel different, don't they?" word for word, plus
 * "Just poured myself a cup" and "Just spent an hour trying to decipher
 * hieroglyphs". Each followed a "🎭 Better Than Human personality injection"
 * that quoted the line and told the model to say it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SCRIPTED_LINE =
  'That golden hour light. <break time="100ms"/>Weekend evenings feel different, don\'t they?';

const processTurn = vi.fn();
const prewarmPersonalitySession = vi.fn();

vi.mock('../../../personas/bundles/ferni/personality-integration.js', () => ({
  ferniPersonality: { processTurn, cleanup: vi.fn() },
  prewarmPersonalitySession,
}));
vi.mock('../../../conversation/unified-integration.js', () => ({
  createConversationSession: vi.fn(() => ({ id: 'session' })),
  endConversationSession: vi.fn(),
  getConversationSession: vi.fn(),
}));

const { processPersonality } = await import('../turn-personality.js');
const { initConversationSession } =
  await import('../../integrations/conversation-session-integration.js');

function ferniTurn() {
  return {
    sessionId: 'session-1',
    userId: 'user-1',
    personaId: 'ferni',
    turnCount: 3,
    userText: 'When you go to sleep, what do you dream of?',
    userData: {},
    emotionalResult: { primary: 'neutral', intensity: 0.2, distressLevel: 0 },
    injections: [],
  };
}

beforeEach(() => {
  processTurn.mockReset();
  prewarmPersonalitySession.mockReset();
  processTurn.mockResolvedValue({
    expression: {
      content: SCRIPTED_LINE,
      theme: 'sensory_moment',
      intimacyLevel: 0.3,
      compositionReason: 'Weekend evening presence',
      shouldBeSubtle: true,
      timing: 'at_end',
      personaId: 'ferni',
    },
    noticing: null,
    context: {},
    shouldInject: true,
    injectionPoint: 'after_response',
    behaviorEvent: null,
  });
});

afterEach(() => {
  delete process.env.FERNI_SCRIPTED_PERSONALITY;
});

describe('scripted personality lines on a live call', () => {
  it('injects nothing and never asks the personality system for a line', async () => {
    const result = await processPersonality(ferniTurn());

    expect(result.shouldInject).toBe(false);
    expect(result.injectionContent).toBeUndefined();
    expect(processTurn).not.toHaveBeenCalled();
  });

  it('FERNI_SCRIPTED_PERSONALITY=on restores the quoted line', async () => {
    process.env.FERNI_SCRIPTED_PERSONALITY = 'on';
    const result = await processPersonality(ferniTurn());

    expect(processTurn).toHaveBeenCalledTimes(1);
    expect(result.injectionContent).toContain(SCRIPTED_LINE);
  });

  it('does not pre-generate "what I am doing right now" asides at session start', async () => {
    await initConversationSession({ sessionId: 's', userId: 'u', personaId: 'ferni' });
    expect(prewarmPersonalitySession).not.toHaveBeenCalled();

    process.env.FERNI_SCRIPTED_PERSONALITY = 'on';
    await initConversationSession({ sessionId: 's2', userId: 'u', personaId: 'ferni' });
    expect(prewarmPersonalitySession).toHaveBeenCalledTimes(1);
  });
});
