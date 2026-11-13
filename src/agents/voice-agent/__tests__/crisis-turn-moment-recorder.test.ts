/**
 * The turn's moment recorder (crisis-turn-memory.ts momentRecorder) wrapped around the real
 * moment bridge (personality-bridge.ts recordUnifiedMoment), for every moment type there is.
 *
 * On a crisis turn, and on a turn whose crisis read is unknown, nothing happens for any type:
 * no phrase kept in the relationship engine, no personality service record, no data message to
 * the client (the bond signal included). On any other turn each type does all three, as on main.
 *
 * Only the two stores behind the bridge are stubbed, and both stubs are complete: neither
 * spreads the real module (`importOriginal`). In a full unit shard the relationship barrel's
 * original came back empty, the bridge's call to `isWordlessMoment` threw inside its own catch,
 * and the ordinary rows silently lost their service record. `isWordlessMoment` now comes from
 * its own unmocked module, imported here, and every ordinary row also checks the bridge's
 * result, which carries a marker only this file's service stub returns. Every line is fictional.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isWordlessMoment } from '../../../intelligence/relationship/wordless-moments.js';
import type { SharedMomentType } from '../../../intelligence/relationship/types.js';
import { crisisReadTurn, momentRecorder } from '../crisis-turn-memory.js';

const state = vi.hoisted(() => ({
  phrases: [] as Array<{ type: string; userPhrase?: string }>,
  serviceRecords: [] as string[],
  /** Milliseconds the service stub waits before it records (0 = none). */
  delayMs: 0,
}));

vi.mock('../../../intelligence/relationship/index.js', () => ({
  getRelationshipEngine: () => ({
    recordMoment: (type: string, _summary: string, details?: { userPhrase?: string }) =>
      void state.phrases.push({ type, userPhrase: details?.userPhrase }),
  }),
  isWordlessMoment: (type: SharedMomentType) => isWordlessMoment(type),
}));

vi.mock('../../../personality/v2/index.js', () => ({
  createPersonalityService: () => ({
    recordMoment: async (input: { message: string }) => {
      if (state.delayMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, state.delayMs);
        });
      }
      state.serviceRecords.push(input.message);
      // The marker: only this stub reports a vulnerability, so the bridge's result proves it ran
      return { vulnerabilityDetected: true, isFirstTimeVulnerability: false, domainEvents: [] };
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
  state.phrases = [];
  state.serviceRecords = [];
  const sent: string[] = [];
  const results: Array<Awaited<ReturnType<typeof recordUnifiedMoment>>> = [];
  const record = momentRecorder(
    async (moment: Parameters<typeof recordUnifiedMoment>[0]) =>
      void results.push(await recordUnifiedMoment(moment)),
    crisisTurn
  );
  await record({
    userId: 'user-moment-recorder',
    personaId: 'ferni',
    type,
    message: LINE,
    emotionalIntensity: 0.9, // over the bond signal's 0.7 threshold
    sendDataMessage: async (channel: string) => void sent.push(channel),
    details: { userPhrase: LINE, significance: 0.9 },
  });
  return {
    phrases: state.phrases,
    serviceRecords: state.serviceRecords,
    sent,
    bridgeRan: results.length,
    serviceReached: results.map((r) => r.vulnerabilityDetected),
  };
}

const NOTHING = { phrases: [], serviceRecords: [], sent: [], bridgeRan: 0, serviceReached: [] };

function recordedAll(type: SharedMomentType) {
  return {
    phrases: [{ type, userPhrase: LINE }],
    serviceRecords: [LINE],
    sent: ['humanization_signal'],
    bridgeRan: 1,
    serviceReached: [true],
  };
}

beforeEach(() => {
  state.delayMs = 0;
});

describe('moment recorder on a crisis turn', () => {
  it('the bridge reads wordless moments from the real module, not an empty stub', () => {
    expect(typeof isWordlessMoment).toBe('function');
  });

  it.each(TYPES)('a %s moment keeps no phrase, records nothing and sends nothing', async (type) => {
    expect(await recordOne(type, true)).toEqual(NOTHING);
  });

  it.each(TYPES)('a %s moment on a turn with no crisis read is held too', async (type) => {
    expect(await recordOne(type, crisisReadTurn(undefined))).toEqual(NOTHING);
  });
});

describe('moment recorder on any other turn (as on main)', () => {
  it.each(TYPES)(
    'a %s moment keeps its phrase, records and sends the bond signal',
    async (type) => {
      expect(await recordOne(type, false)).toEqual(recordedAll(type));
    }
  );
});

describe('one recorder, the same stubs: a crisis turn, then an ordinary one', () => {
  it.each([0, 50])(
    'the crisis turn leaves nothing and the next turn records (stub delay %i ms)',
    async (delayMs) => {
      state.delayMs = delayMs;
      for (const type of TYPES) {
        expect(await recordOne(type, true), `${type} crisis`).toEqual(NOTHING);
        expect(await recordOne(type, false), `${type} ordinary`).toEqual(recordedAll(type));
      }
    }
  );
});
