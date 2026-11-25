/**
 * Bond signals reach every participant in the room, so they carry the moment's type label,
 * never message text, and the dispatcher logs record lengths only.
 *
 * Every line here is fictional, written for this test.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SharedMomentType } from '../../../intelligence/relationship/types.js';
import type { SendDataMessageFn } from '../signal-dispatchers.js';

const { logged } = vi.hoisted(() => ({ logged: [] as unknown[][] }));

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const recorder: Record<string, unknown> = {};
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
    recorder[level] = (...args: unknown[]) => void logged.push(args);
  }
  recorder.child = () => recorder;
  return { ...actual, createLogger: () => recorder };
});

vi.mock('../../../intelligence/relationship/index.js', () => ({
  getRelationshipEngine: vi.fn(() => ({ recordMoment: vi.fn() })),
}));

vi.mock('../../v2/index.js', () => ({
  createPersonalityService: vi.fn(() => ({
    recordMoment: vi.fn(async () => ({
      vulnerabilityDetected: false,
      isFirstTimeVulnerability: false,
      domainEvents: [],
    })),
  })),
}));

const { recordUnifiedMoment } = await import('../personality-bridge.js');
const {
  dispatchEmotionalBondDeepen,
  dispatchSpontaneousDelight,
  dispatchInsideJokeCallback,
  dispatchTemporalInsight,
} = await import('../../../agents/realtime/emotion-event-dispatcher.js');

const LINE = 'zephyr quokka marmalade lighthouse tangerine';
const WORDS = LINE.split(' ');

const MOMENT_TYPES: SharedMomentType[] = [
  'crisis_support',
  'vulnerability',
  'first_vulnerability',
  'breakthrough',
  'trust_demonstration',
  'growth_recognition',
  'celebration',
  'laughter',
  'deep_conversation',
  'disagreement_resolved',
  'callback_resonance',
  'emotional_mirror',
  'protective_moment',
  'silence_held',
  'pattern_insight',
];

function sender(): {
  send: SendDataMessageFn;
  sent: Array<{ type: string; payload: Record<string, unknown> }>;
} {
  const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const send = vi.fn(async (type: string, payload: Record<string, unknown>) => {
    sent.push({ type, payload });
  }) as unknown as SendDataMessageFn;
  return { send, sent };
}

function expectNoWords(value: unknown): void {
  const text = JSON.stringify(value);
  for (const word of WORDS) expect(text, word).not.toContain(word);
}

afterEach(() => {
  logged.length = 0;
});

describe('the bond signal carries a label, not message text', () => {
  it.each(MOMENT_TYPES)('a %s moment sends its type label only', async (type) => {
    const { send, sent } = sender();

    await recordUnifiedMoment({
      userId: 'user-bond-1',
      personaId: 'ferni',
      type,
      message: LINE,
      emotionalIntensity: 0.9,
      sendDataMessage: send,
    });

    const bond = sent.filter((m) => m.payload.signalType === 'emotional_bond_deepen');
    expect(bond).toHaveLength(1);
    const [{ type: channel, payload }] = bond;
    expect(channel).toBe('humanization_signal');
    expect(Object.keys(payload).sort()).toEqual([
      'intensity',
      'relationshipContext',
      'signalType',
      'timestamp',
    ]);
    expect(payload.relationshipContext).toBe(type);
    expect(payload.intensity).toBe(0.9);
    expectNoWords(sent);
    expectNoWords(logged);
  });

  it('a moment at or under the 0.7 threshold sends no bond signal', async () => {
    const { send, sent } = sender();

    await recordUnifiedMoment({
      userId: 'user-bond-1',
      personaId: 'ferni',
      type: 'crisis_support',
      message: LINE,
      emotionalIntensity: 0.7,
      sendDataMessage: send,
    });

    expect(sent.filter((m) => m.payload.signalType === 'emotional_bond_deepen')).toEqual([]);
  });
});

describe('the dispatcher logs record lengths only', () => {
  it('bond deepen logs the trigger length, not the trigger', async () => {
    const { send } = sender();
    await dispatchEmotionalBondDeepen(send, {
      trigger: LINE,
      intensity: 0.8,
      relationshipContext: 'crisis_support',
    });
    expect(logged.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged)).toContain(`"triggerLength":${LINE.length}`);
    expectNoWords(logged);
  });

  it('spontaneous delight logs the trigger length, not the trigger', async () => {
    const { send } = sender();
    await dispatchSpontaneousDelight(send, { trigger: LINE, intensity: 0.8 });
    expect(JSON.stringify(logged)).toContain(`"triggerLength":${LINE.length}`);
    expectNoWords(logged);
  });

  it.each([
    ['inside joke', dispatchInsideJokeCallback],
    ['temporal insight', dispatchTemporalInsight],
  ] as const)('%s logs the memory reference length, not the reference', async (_name, dispatch) => {
    const { send } = sender();
    await dispatch(send, { memoryReference: LINE, intensity: 0.8 });
    expect(JSON.stringify(logged)).toContain(`"memoryReferenceLength":${LINE.length}`);
    expectNoWords(logged);
  });
});
