/**
 * Every injection that carries crisis or safety guidance is recognised by its
 * category, and the turn's context note says so (safety-note.ts), so
 * PREEMPT_STABLE_CONTEXT never holds it past the reply it belongs to. Each case
 * runs the real builder that writes it; none of these open with [CRITICAL or
 * [SAFETY, which is all a text check saw (review of #2489).
 */
import { llm } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/human-transfer/index.js', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    hadRecentCrisis: async () => ({
      hasCrisis: true,
      lastCrisis: { timestamp: new Date(Date.now() - 2 * 86_400_000), escalationType: 'crisis' },
    }),
  };
});
vi.mock('../../../../intelligence/context-builders/coaching/scientific-coaching.js', async () => {
  const { getWarningContextInjection } =
    await import('../../../../services/wellbeing-tracking/early-warning.js');
  return {
    buildScientificCoachingContext: async () => ({
      injections: [
        {
          id: 'sci_early_warning_1',
          source: 'early_warning',
          content: getWarningContextInjection('u-warn') || '[⚠️ EARLY WARNING ACTIVE]',
          priority: 'critical',
        },
      ],
      detectedDistortions: [],
      warnings: ['isolation_spiral'],
    }),
  };
});

const { carriesSafety, isSafetyCategory, addSafetyNote } = await import('../safety-note.js');
const { injectTurnContext } = await import('../inject-context.js');
const { buildSafetyInjections, buildScientificCoachingInjections } =
  await import('../../injection-builders/safety-coaching-builders.js');
const { buildHumanTransferInjections, buildCrisisHistoryInjection } =
  await import('../../injection-builders/better-than-human-builders.js');

const CRISIS = "I don't want to be here anymore. I want to kill myself tonight.";
const ctx = {
  userText: CRISIS,
  services: { userId: 'u-1', sessionId: 's-1', userProfile: { name: 'Sam' } },
  userData: { turnCount: 4, relationshipStage: 'friend' },
  persona: { id: 'ferni' },
  analysis: {},
  emotionalState: { primary: 'sad', intensity: 0.9, distressLevel: 0.9 },
} as never;

/** The turn's note as the turn handler writes it, then read back the way the pusher reads it. */
function noteFor(injections: Array<{ category: string; content: string; priority: number }>) {
  const chat = llm.ChatContext.empty();
  injectTurnContext(chat, { context: { injections } } as never);
  return chat.items[0] as unknown as { extra?: Record<string, unknown>; textContent?: string };
}

describe('crisis and safety guidance is recognised by its category', () => {
  it('[ESCALATION AWARENESS] and [CRISIS SUPPORT] (safety, crisis_response)', async () => {
    const injections = await buildSafetyInjections(ctx);
    const escalation = injections.find((i) => i.content.includes('[ESCALATION AWARENESS]'));
    const support = injections.find((i) => i.content.includes('[CRISIS SUPPORT]'));
    expect(escalation && isSafetyCategory(escalation.category)).toBe(true);
    expect(support && isSafetyCategory(support.category)).toBe(true);
    expect(carriesSafety(noteFor(injections))).toBe(true);
  });

  it('[TRANSFER AWARENESS] with crisis indicators', async () => {
    const injection = await buildHumanTransferInjections(CRISIS, 'u-1', 's-1');
    expect(injection?.content).toContain('CRISIS INDICATORS DETECTED');
    expect(isSafetyCategory(injection!.category)).toBe(true);
    expect(carriesSafety(noteFor([injection!]))).toBe(true);
  });

  it('[TRANSFER AWARENESS] without a crisis is ordinary context', async () => {
    const injection = await buildHumanTransferInjections(
      "I've been thinking maybe I should see a therapist about my anxiety",
      'u-1',
      's-1'
    );
    if (injection) expect(isSafetyCategory(injection.category)).toBe(false);
  });

  it('[CRISIS FOLLOW-UP] for a caller with a recent crisis', async () => {
    const injection = await buildCrisisHistoryInjection('u-1');
    expect(injection?.content).toContain('[CRISIS FOLLOW-UP');
    expect(isSafetyCategory(injection!.category)).toBe(true);
  });

  it('[⚠️ EARLY WARNING ACTIVE] (scientific_early_warning)', async () => {
    const { injections } = await buildScientificCoachingInjections({
      ...(ctx as object),
      userText: 'Nobody calls anymore and I just stay in bed all day lately.',
    } as never);
    const warning = injections.find((i) => i.category.endsWith('early_warning'));
    expect(warning).toBeDefined();
    expect(isSafetyCategory(warning!.category)).toBe(true);
    expect(carriesSafety(noteFor(injections))).toBe(true);
  });

  it('a note with no safety category is not marked', () => {
    const note = noteFor([{ category: 'memory', content: 'They love hiking.', priority: 50 }]);
    expect(carriesSafety(note)).toBe(false);
  });

  it('the crisis override the turn handler writes directly is marked', () => {
    const chat = llm.ChatContext.empty();
    addSafetyNote(chat, '[CRITICAL SAFETY OVERRIDE]\nREQUIRED RESPONSE: ...');
    expect(carriesSafety(chat.items[0] as never)).toBe(true);
  });
});
