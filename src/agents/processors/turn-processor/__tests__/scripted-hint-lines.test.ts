/**
 * Live per-turn hints must not quote ready-made lines for the model to say.
 *
 * These hints run on the cascade path (turn-intelligence -> handleUserTurn
 * -> processTurn -> buildContextInjections) and each once handed the model a
 * canned sentence: a mood aside and a topic-shift bridge. The reply opener and
 * catchphrase hint is gone from the turn entirely.
 */
import { describe, expect, it, vi } from 'vitest';

const TOPIC_BRIDGE = 'Speaking of which...';

vi.mock('../../../../conversation/index.js', () => ({
  getConversationHumanizer: () => ({
    generateContextGuidance: () => [],
    processUserMessage: () => ({
      topicChange: { detected: true, transitionPhrase: TOPIC_BRIDGE },
    }),
  }),
  getEmotionalArcTracker: vi.fn(),
}));

const { formatMoodForPrompt } =
  await import('../../../../intelligence/context-builders/personas/persona-mood.js');
const { buildConversationHumanizingContext } =
  await import('../../../../intelligence/context-builders/humanization/conversation-humanizing.js');

const tiredMood = {
  state: 'tired_but_present',
  energyLevel: 0.4,
  responseLengthBias: 'shorter',
  storyFrequency: 'low',
  humorFrequency: 'low',
  vulnerabilityLevel: 'normal',
  deliveryAdjustments: { speed: 0.9, pauseFrequency: 'more', warmth: 1 },
  moodPhrases: ["Bear with me - I didn't sleep great."],
  shiftTriggers: [],
  typicalDuration: 'session',
} as unknown as Parameters<typeof formatMoodForPrompt>[0];

function humanizingInput() {
  return {
    userText: 'Anyway, what do you think about Donald Trump?',
    analysis: { emotion: { primary: 'neutral', distressLevel: 0, intensity: 0.2 }, topics: {} },
    personaId: 'ferni',
    turnNumber: 9,
  } as unknown as Parameters<typeof buildConversationHumanizingContext>[0];
}

describe('quoted lines in live hints are off', () => {
  it('the mood hint keeps the mood but drops the scripted aside', () => {
    const hint = formatMoodForPrompt(tiredMood);
    expect(hint).toContain('TIRED_BUT_PRESENT');
    expect(hint).not.toContain("I didn't sleep great");
  });

  it('a topic change adds no canned bridge line', () => {
    const injections = buildConversationHumanizingContext(humanizingInput());
    expect(injections.map((i) => i.content).join('\n')).not.toContain(TOPIC_BRIDGE);
  });
});
