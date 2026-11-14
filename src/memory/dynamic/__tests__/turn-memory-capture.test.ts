/**
 * captureTurnMemory: keep captures as before; a crisis verdict records the caller's line for this
 * call only, with nothing extracted, and session-end promotion's readers skip it. Lines are
 * fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const spy = vi.hoisted(() => ({
  captured: [] as string[],
  held: [] as Record<string, unknown>[],
}));

vi.mock('../../../utils/safe-logger.js', async (orig) => {
  const base = await orig<Record<string, unknown>>();
  const quiet = () => undefined;
  const hold: Record<string, unknown> = {
    info: (fields: Record<string, unknown>, msg: string) => {
      if (msg === 'TURN_MEMORY_HELD') spy.held.push(fields);
    },
    debug: quiet,
    warn: quiet,
    error: quiet,
    trace: quiet,
    fatal: quiet,
  };
  hold.child = () => hold;
  const create = base.createLogger as (opts?: unknown) => unknown;
  return {
    ...base,
    createLogger: (opts?: { module?: string }) =>
      opts?.module === 'TurnMemoryCapture' ? hold : create(opts),
  };
});

vi.mock('../fast-capture.js', async (orig) => {
  const real = await orig<typeof import('../fast-capture.js')>();
  return {
    ...real,
    fastCapture: vi.fn(async (input: { transcript: string }) => {
      spy.captured.push(input.transcript);
      const result: Awaited<ReturnType<typeof real.fastCapture>> = {
        mentionedEntities: [{ name: 'Wren', type: 'person', context: 'Wren', confidence: 0.9 }],
        emotionSignals: [{ emotion: 'joy', intensity: 'medium', source: 'keyword' }],
        topicHints: ['gardening'],
        dateSignals: [],
        relationshipSignals: [],
        linkingSignals: [],
        asyncJobId: null,
        captureTimeMs: 1,
      };
      return result;
    }),
  };
});

import { captureTurnMemory, type TurnCapture } from '../turn-memory-capture.js';
import {
  cleanupSession,
  getEmotionalTrajectory,
  getRecentTurns,
  getVoiceEmotionTrajectory,
  promotableTurns,
} from '../stm-buffer.js';

const SESSION = 'capture-unit-1';
const VOICE = { primary: 'sad', confidence: 0.9, stressLevel: 0.8, valence: -0.5, arousal: 0.4 };

function capture(transcript: string, turnNumber: number): TurnCapture {
  return {
    input: { userId: 'member-capture-unit', sessionId: SESSION, turnNumber, transcript },
    personaId: 'ferni',
    voiceEmotion: VOICE,
  };
}

afterEach(() => {
  spy.captured.length = 0;
  spy.held.length = 0;
  cleanupSession(SESSION);
});

describe('captureTurnMemory', () => {
  it('keep: captures, records the turn for promotion, and returns the capture', async () => {
    const line = 'Wren and I planted tomatoes this morning.';
    const result = await captureTurnMemory('test-site', Promise.resolve('keep'), capture(line, 1));
    expect(spy.captured).toEqual([line]);
    expect(result?.topicHints).toEqual(['gardening']);
    const [turn] = getRecentTurns(SESSION);
    expect(turn.transcript).toBe(line);
    expect(turn.sessionOnly).toBeUndefined();
    expect(turn.entities.map((e) => e.name)).toEqual(['Wren']);
    expect(promotableTurns(SESSION)).toHaveLength(1);
    expect(spy.held).toEqual([]);
  });

  it('crisis: nothing captured; the line stays in this call only, with nothing extracted', async () => {
    const line = 'It has been a heavy week and I keep thinking about Wren.';
    const result = await captureTurnMemory(
      'test-site',
      Promise.resolve('crisis'),
      capture(line, 1)
    );
    expect(result).toBeNull();
    expect(spy.captured).toEqual([]);
    const [turn] = getRecentTurns(SESSION);
    expect([turn.transcript, turn.sessionOnly, turn.entities, turn.topics]).toEqual([
      line,
      true,
      [],
      [],
    ]);
    // Words-free: the site, the reason and the session.
    expect(spy.held).toEqual([{ site: 'test-site', reason: 'crisis', sessionId: SESSION }]);
  });

  it('promotion readers skip a session-only turn: promotable turns, emotions and voice', async () => {
    await captureTurnMemory(
      'a',
      Promise.resolve('keep'),
      capture('Wren called about the garden.', 1)
    );
    await captureTurnMemory('b', Promise.resolve('crisis'), capture('A heavy line, held.', 2));
    await captureTurnMemory(
      'c',
      Promise.resolve('keep'),
      capture('Then we ate lunch with Wren.', 3)
    );
    expect(getRecentTurns(SESSION)).toHaveLength(3);
    expect(promotableTurns(SESSION).map((t) => t.turnNumber)).toEqual([1, 3]);
    expect(getEmotionalTrajectory(SESSION)).toHaveLength(2);
    expect(getVoiceEmotionTrajectory(SESSION).map((v) => v.turnNumber)).toEqual([1, 3]);
  });
});
