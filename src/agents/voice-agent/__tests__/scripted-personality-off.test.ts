/**
 * What the personality system still scripted after the self-disclosure gate
 * (scripted-self-disclosure.test.ts covers the expression itself):
 * - the "noticing" opener, 'START YOUR RESPONSE WITH: "You took a moment
 *   there. Is everything okay?"' (realtime-noticing.ts);
 * - the session-start LLM prewarm of "what I'm doing right now" asides
 *   ("Just poured myself a cup" on the 2026-10-03 call). It only feeds the
 *   expression, which is now dropped, so it was LLM calls for nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOTICING_LINE = "You took a moment there. <break time='250ms'/>Is everything okay?";

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
    userText: "It's hard to say.",
    userData: { pauseBeforeMs: 4200 },
    emotionalResult: { primary: 'neutral', intensity: 0.2, distressLevel: 0 },
    injections: [],
  };
}

beforeEach(() => {
  processTurn.mockReset();
  prewarmPersonalitySession.mockReset();
  processTurn.mockResolvedValue({
    expression: null,
    noticing: {
      type: 'long_pause',
      observation: 'Paused 4.2s before speaking',
      acknowledgment: NOTICING_LINE,
      shouldAcknowledge: true,
      timing: 'immediate',
      subtlety: 'gentle',
    },
    context: {},
    shouldInject: true,
    injectionPoint: 'as_acknowledgment',
    behaviorEvent: null,
  });
});

afterEach(() => {
  delete process.env.PERSONALITY_NOTICING;
  delete process.env.PERSONALITY_EXPRESSIONS;
});

describe('scripted personality lines left after the self-disclosure gate', () => {
  it('does not hand the model a canned noticing opener', async () => {
    const result = await processPersonality(ferniTurn());

    expect(result.injectionContent ?? '').not.toContain('START YOUR RESPONSE WITH');
    expect(result.injectionContent ?? '').not.toContain('You took a moment there');
  });

  it('PERSONALITY_NOTICING=on restores the opener', async () => {
    process.env.PERSONALITY_NOTICING = 'on';
    const result = await processPersonality(ferniTurn());

    expect(result.injectionContent).toContain('START YOUR RESPONSE WITH');
    expect(result.injectionContent).toContain(NOTICING_LINE);
  });

  it('does not prewarm expression asides at session start unless expressions are on', async () => {
    await initConversationSession({ sessionId: 's', userId: 'u', personaId: 'ferni' });
    expect(prewarmPersonalitySession).not.toHaveBeenCalled();

    process.env.PERSONALITY_EXPRESSIONS = 'on';
    await initConversationSession({ sessionId: 's2', userId: 'u', personaId: 'ferni' });
    expect(prewarmPersonalitySession).toHaveBeenCalledTimes(1);
  });
});
