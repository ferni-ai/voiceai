/**
 * NAMED_TUNE on the live quiet-window path (voiced-presence.ts, prod's
 * VOICED_PRESENCE + PRESENCE_SOUND_ASSETS): the recorded whistle that played
 * is the tune the caller names, the next call's quiet window plays that same
 * recording, and "stop whistling" keeps the next call's quiet window silent.
 * Off, the whistle is the clip bag's pick as before.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';
import { startVoicedPresence } from '../voiced-presence.js';
import { namedTuneNote } from '../../personas/named-tune-note.js';
import {
  forgetTuneCalls,
  type TuneRecord,
  type TuneStore,
} from '../../../services/session/tune-state.js';

const ASSETS = { VOICED_PRESENCE: 'on', PRESENCE_SOUNDS: 'on', PRESENCE_SOUND_ASSETS: 'on' };
const ON = { ...ASSETS, NAMED_TUNE: 'on' };

const labels: string[] = [];
const direct = {
  play: (_pcm: ArrayBuffer, _volume: number, label: string) => {
    labels.push(label);
    return true;
  },
  stop: () => {},
};

function memoryStore(): TuneStore & { records: Map<string, TuneRecord> } {
  const records = new Map<string, TuneRecord>();
  return {
    records,
    load: async (userId) => records.get(userId) ?? null,
    save: async (userId, patch) => {
      records.set(userId, { ...records.get(userId), ...patch });
    },
  };
}

/** Let the record read (a few promise hops) settle. */
const flush = (): Promise<unknown> =>
  [1, 2, 3, 4, 5].reduce<Promise<unknown>>((p) => p.then(), Promise.resolve());

/**
 * One call: the caller's first turn (which reads their record), then an easy
 * pause. `shuffle` fixes the clip bag's order, so two calls draw different
 * recordings unless something picks the tune.
 */
async function quietWindow(
  sessionId: string,
  env: Record<string, string>,
  store: TuneStore,
  shuffle: number
) {
  const say = (words: string) =>
    namedTuneNote({ sessionId, userId: 'u1', words, careful: false, verified: true }, store, env);
  say('hey, how are you');
  await flush();
  const random = vi.spyOn(Math, 'random').mockReturnValue(shuffle);
  const session = new EventEmitter() as EventEmitter & { userData: unknown };
  session.userData = { userId: 'u1', services: { sessionId } };
  const presence = startVoicedPresence({
    session: session as never,
    direct,
    mixerBusy: () => false,
    getClip: () => new Int16Array(2400).fill(8000).buffer,
    personaId: () => 'ferni',
    env,
    rng: () => 0.1,
    now: () => new Date('2026-10-12T14:00:00Z'),
  });
  for (let i = 0; i < 3; i++) {
    session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'speaking' });
    session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'listening' });
  }
  const before = labels.length;
  vi.advanceTimersByTime(8000);
  presence?.close();
  random.mockRestore();
  return { played: labels.slice(before), say };
}

beforeEach(() => {
  vi.useFakeTimers();
  labels.length = 0;
  forgetTuneCalls();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('named tune on the quiet-window path', () => {
  it('the whistle they named is the one the next call plays', async () => {
    const store = memoryStore();
    const first = await quietWindow('call-1', ON, store, 0.99);
    expect(first.played).toHaveLength(1);
    const tune = first.played[0] as string;
    expect(tune).toMatch(/^recorded-whistle:people-.+\.wav$/);
    expect(first.say('were you whistling?')).toContain('Want to name it?');
    expect(first.say('Pharmacy Line Blues')).toContain('"Pharmacy Line Blues"');
    await flush();
    expect(store.records.get('u1')).toMatchObject({
      tuneId: tune.replace('recorded-whistle:', 'whistle:'),
      name: 'Pharmacy Line Blues',
    });

    // Without a name, this shuffle draws a different recording (the control below).
    const next = await quietWindow('call-2', ON, store, 0.01);
    expect(next.played).toEqual([tune]);
  });

  it('flag off: the bag picks as before, whatever is kept for the caller', async () => {
    const store = memoryStore();
    const first = await quietWindow('call-1', ON, store, 0.99);
    first.say('were you whistling?');
    first.say('Pharmacy Line Blues');
    await flush();
    const off = await quietWindow('call-2', ASSETS, store, 0.01);
    expect(off.played).toHaveLength(1);
    expect(off.played[0]).not.toBe(first.played[0]);
  });

  it('after "stop whistling", the next call has no whistle or hum', async () => {
    const store = memoryStore();
    const first = await quietWindow('call-1', ON, store, 0.99);
    expect(first.say('stop whistling please')).toContain('stop the whistling');
    await flush();
    const next = await quietWindow('call-2', ON, store, 0.01);
    expect(next.played).toEqual([]);
  });
});
