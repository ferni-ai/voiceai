/**
 * The turn's moment recorder (crisis-turn-memory.ts momentRecorder) wrapped around the real
 * moment bridge (personality-bridge.ts recordUnifiedMoment), for every moment type there is.
 *
 * On a crisis turn, and on a turn whose crisis read is unknown, nothing happens for any type:
 * no phrase kept in the relationship engine, no personality service record, no data message to
 * the client (the bond signal included). On any other turn each type does all three, as on main.
 *
 * Only the two stores behind the bridge are stubbed. Every line here is fictional.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedMomentType } from '../../../intelligence/relationship/types.js';
import { crisisReadTurn, momentRecorder } from '../crisis-turn-memory.js';

const state = vi.hoisted(() => ({
  phrases: [] as Array<{ type: string; userPhrase?: string }>,
  serviceRecords: [] as string[],
}));

vi.mock('../../../intelligence/relationship/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getRelationshipEngine: () => ({
    recordMoment: (type: string, _summary: string, details?: { userPhrase?: string }) =>
      void state.phrases.push({ type, userPhrase: details?.userPhrase }),
  }),
}));

vi.mock('../../../personality/v2/index.js', () => ({
  createPersonalityService: () => ({
    recordMoment: async (input: { message: string }) => {
      state.serviceRecords.push(input.message);
      return { vulnerabilityDetected: false, isFirstTimeVulnerability: false, domainEvents: [] };
    },
  }),
}));

const { recordUnifiedMoment } = await import('../../../personality/bridge/personality-bridge.js');

/** Every SharedMomentType: the compiler fails this object when a type is added or removed. */
const EVERY_TYPE = {
  breakthrough: true,
  vulnerability: true,
  first_vulnerability: true,
  trust_demonstration: true,
  growth_recognition: true,
  celebration: true,
  crisis_support: true,
  laughter: true,
  deep_conversation: true,
  disagreement_resolved: true,
  callback_resonance: true,
  emotional_mirror: true,
  protective_moment: true,
  silence_held: true,
  pattern_insight: true,
} satisfies Record<SharedMomentType, true>;
const TYPES = Object.keys(EVERY_TYPE) as SharedMomentType[];

const LINE = 'the tomatoes in the garden finally turned red this week';

/** One moment through the recorder the turn handler builds; returns what it stored and sent. */
async function recordOne(type: SharedMomentType, crisisTurn: boolean) {
  const sent: string[] = [];
  const record = momentRecorder(recordUnifiedMoment, crisisTurn);
  await record({
    userId: 'user-moment-recorder',
    personaId: 'ferni',
    type,
    message: LINE,
    emotionalIntensity: 0.9, // over the bond signal's 0.7 threshold
    sendDataMessage: async (channel: string) => void sent.push(channel),
    details: { userPhrase: LINE, significance: 0.9 },
  });
  return { phrases: state.phrases, serviceRecords: state.serviceRecords, sent };
}

beforeEach(() => {
  state.phrases = [];
  state.serviceRecords = [];
});

describe('moment recorder on a crisis turn', () => {
  it.each(TYPES)('a %s moment keeps no phrase, records nothing and sends nothing', async (type) => {
    const turn = await recordOne(type, true);
    expect(turn.phrases).toEqual([]);
    expect(turn.serviceRecords).toEqual([]);
    expect(turn.sent).toEqual([]);
  });

  it.each(TYPES)('a %s moment on a turn with no crisis read is held too', async (type) => {
    const turn = await recordOne(type, crisisReadTurn(undefined));
    expect(turn.phrases).toEqual([]);
    expect(turn.serviceRecords).toEqual([]);
    expect(turn.sent).toEqual([]);
  });
});

describe('moment recorder on any other turn (as on main)', () => {
  it.each(TYPES)('a %s moment keeps its phrase, records and sends the bond signal', async (type) => {
    const turn = await recordOne(type, false);
    expect(turn.phrases).toEqual([{ type, userPhrase: LINE }]);
    expect(turn.serviceRecords).toEqual([LINE]);
    expect(turn.sent).toEqual(['humanization_signal']);
  });
});
