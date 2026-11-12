/**
 * The task-help cap (HUMANIZE_DISTRESS_CORROBORATION) through the real processTurn.
 *
 * An everyday ask ("can you help me plan dinner for Sam") is capped before the classifier
 * has answered. When the turn's final crisis summary then carries a signal, processTurn must
 * take the cap off everything it shaped: the concern level and heavy topic the client is sent,
 * and the persona mood the turn leaves for the next one. The turn runs context-only (no tool
 * routing, no LLM) against a write-recording Firestore; the final summary is the only
 * stubbed crisis piece, and the mood policy is stubbed so a heavy-topic shift is visible.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = await vi.hoisted(async () => {
  const { createWriteRecorder } = await import('../../../../tests/helpers/write-recorder.js');
  return { rec: createWriteRecorder(), finalCrisis: false };
});

vi.mock('../../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => h.rec.db,
}));
vi.mock('../../../../services/superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => h.rec.db,
}));
vi.mock('firebase-admin/firestore', async (orig) => ({
  ...(await orig<object>()),
  getFirestore: () => h.rec.db,
}));
vi.mock('../../../../utils/shared-firestore.js', async (orig) => ({
  ...(await orig<object>()),
  sharedFirestore: () => h.rec.db,
}));
vi.mock('../../../../memory/storage/redis-cache/factory.js', async (orig) => ({
  ...(await orig<object>()),
  getRedisCache: () => h.rec.redis,
  getRedisCacheAsync: async () => h.rec.redis,
}));
// The classifier's verdict arrives in the final summary; here it reads a crisis when asked to
vi.mock('../turn-crisis.js', async (orig) => {
  const real = await orig<typeof import('../turn-crisis.js')>();
  const startTurnCrisis: typeof real.startTurnCrisis = (...args) => {
    const turn = real.startTurnCrisis(...args);
    const summary = async () => {
      const read = await turn.summary();
      return h.finalCrisis ? { ...read, isCrisis: true, severity: 0.9 } : read;
    };
    return new Proxy(turn, {
      get: (target, key) => {
        if (key === 'summary') return summary;
        const value: unknown = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
  return { ...real, startTurnCrisis };
});
// A heavy topic shifts the persona mood to a marker the mood picker never returns
vi.mock('../../../../intelligence/context-builders/humanization/humanizing.js', async (orig) => ({
  ...(await orig<object>()),
  shouldMoodShift: (_mood: unknown, _emotion: unknown, weight: string) => weight === 'heavy',
  getMoodShift: () => 'shifted_for_heavy_topic',
}));

import { analyzeMessage } from '../../../../intelligence/index.js';
import { dispatchEmotionEvents } from '../../../realtime/emotion-event-dispatcher.js';
import { buildBehaviorContext } from '../../../voice-agent/turn-events.js';
import { processTurn } from '../process-turn.js';

const SHIFTED = 'shifted_for_heavy_topic';
const LINE = 'can you help me plan dinner for Sam';

/** Session services: the real analyzer, anything else answers with an inert stub. */
const inert: unknown = new Proxy(function inert() {}, {
  get: (_t, key) =>
    key === 'then'
      ? undefined
      : key === Symbol.toPrimitive
        ? () => ''
        : key === Symbol.iterator
          ? [][Symbol.iterator].bind([])
          : inert,
  apply: () => inert,
});
const services = (): object =>
  new Proxy(
    {
      sessionId: 'session-cap-lift',
      userId: 'user-sam-rivera',
      analyze: (text: string) => analyzeMessage(text),
      handoffState: { currentAgent: 'ferni' },
    },
    { get: (target, key) => (key in target ? Reflect.get(target, key) : inert) }
  );

async function turn(flag: 'on' | 'off', finalCrisis: boolean) {
  vi.stubEnv('HUMANIZE_DISTRESS_CORROBORATION', flag);
  h.finalCrisis = finalCrisis;
  const userData: Record<string, unknown> = { userId: 'user-sam-rivera', turnCount: 3 };
  const result = await processTurn({
    userText: LINE,
    contextOnly: true,
    userData,
    services: services(),
    persona: { id: 'ferni', name: 'Ferni' },
    turnCtx: { addMessage: () => undefined, items: [] },
    logger: { info: () => undefined, warn: () => undefined, debug: () => undefined },
  } as never);

  const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
  await dispatchEmotionEvents(
    { emotionalState: result.emotional, userId: 'user-sam-rivera', personaId: 'ferni' },
    async (type, payload) => void sent.push({ type, payload })
  );
  const behavior = buildBehaviorContext({
    userId: 'user-sam-rivera',
    personaId: 'ferni',
    sessionId: 'session-cap-lift',
    turnCount: 3,
    emotionalResult: result.emotional,
    injections: [],
    sendDataMessage: async () => undefined,
  } as never);
  return {
    capped: result.emotional.distressCapped === true,
    concern: sent.find((m) => m.payload.signalType === 'concern_detected')?.payload.concernLevel,
    topicWeight: behavior.topicWeight,
    mood: userData.lastMood,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  h.finalCrisis = false;
});

describe('processTurn: the task-help cap comes off when the final summary reads a crisis', () => {
  it('flag off: main reads the ask as crisis, a heavy topic and a mood shift', async () => {
    expect(await turn('off', false)).toEqual({
      capped: false,
      concern: 'crisis',
      topicWeight: 'heavy',
      mood: SHIFTED,
    });
  });

  it('flag on, no crisis anywhere: capped end to end', async () => {
    const t = await turn('on', false);
    expect(t.concern).toBe('elevated');
    expect(t.capped).toBe(true);
    expect(t.topicWeight).not.toBe('heavy');
    expect(t.mood).not.toBe(SHIFTED);
  });

  it("flag on, the final summary reads a crisis: main's concern, topic and mood", async () => {
    expect(await turn('on', true)).toEqual({
      capped: false,
      concern: 'crisis',
      topicWeight: 'heavy',
      mood: SHIFTED,
    });
  });
});
