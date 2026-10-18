/**
 * NAMED_TUNE on the clip player's presence path (VOICED_PRESENCE off): the
 * whistle that played can be named and plays again on the next call, and
 * "stop whistling" keeps the next call's silence quiet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TuneRecord } from '../../../services/session/tune-state.js';

const watchers = vi.hoisted(() => [] as Array<{ play: (quietMs: number) => boolean }>);

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  class FakeBackgroundAudioPlayer {
    async start(): Promise<void> {}
    play() {
      return { done: () => true, stop: () => {} };
    }
    async close(): Promise<void> {}
  }
  return {
    ...actual,
    voice: { ...actual.voice, BackgroundAudioPlayer: FakeBackgroundAudioPlayer },
  };
});
vi.mock('../presence-watcher.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../presence-watcher.js')>()),
  createPresenceWatcher: (deps: { play: (quietMs: number) => boolean }) => {
    watchers.push(deps);
    return { onAgentState: () => {}, onUserState: () => {}, close: () => {} };
  },
}));

const { ClipPlayer, startBackchannelClips } = await import('../clip-player.js');
const { namedTuneNote } = await import('../../personas/named-tune-note.js');
const { forgetTuneCalls } = await import('../../../services/session/tune-state.js');

const records = new Map<string, TuneRecord>();
const store = {
  load: async (userId: string) => records.get(userId) ?? null,
  save: async (userId: string, patch: TuneRecord) => {
    records.set(userId, { ...records.get(userId), ...patch });
  },
};
/** Let the record read (a few promise hops) settle. */
const flush = (): Promise<unknown> =>
  [1, 2, 3, 4, 5].reduce<Promise<unknown>>((p) => p.then(), Promise.resolve());

/** One call's easy pause: the PCM played, or null; `shuffle` fixes the clip bag. */
async function call(sessionId: string, shuffle: number) {
  const say = (words: string) =>
    namedTuneNote({ sessionId, userId: 'u1', words, careful: false, verified: true }, store);
  say('hey');
  await flush();
  watchers.length = 0;
  const play = vi.spyOn(ClipPlayer.prototype, 'play');
  const random = vi.spyOn(Math, 'random').mockReturnValue(shuffle);
  const session = { on: vi.fn(), off: vi.fn(), userData: { services: { sessionId } } };
  const clips = await startBackchannelClips(
    {} as never,
    session as never,
    () => 'ferni',
    () => null
  );
  const ok = watchers[0]?.play(6000) === true;
  random.mockRestore();
  const played = play.mock.calls[0]?.[0];
  const pcm = ok && played ? Buffer.from(played) : null;
  await clips?.close();
  play.mockRestore();
  return { pcm, say };
}

const FLAGS = { PRESENCE_SOUNDS: 'on', PRESENCE_SOUND_ASSETS: 'on', NAMED_TUNE: 'on' };

beforeEach(() => {
  for (const [k, v] of Object.entries(FLAGS)) vi.stubEnv(k, v);
  vi.stubEnv('VOICED_PRESENCE', 'off');
  vi.stubEnv('PRESENCE_HUM', 'off');
  records.clear();
  forgetTuneCalls();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('named tune in the clip player', () => {
  it('the whistle they named plays again on the next call', async () => {
    const first = await call('c1', 0.99);
    expect(first.say('were you whistling?')).toContain('Want to name it?');
    first.say('Pharmacy Line Blues');
    await flush();
    expect(records.get('u1')?.name).toBe('Pharmacy Line Blues');
    const next = await call('c2', 0.01);
    expect(first.pcm).not.toBeNull();
    expect(next.pcm?.equals(first.pcm as Buffer)).toBe(true);
  });

  it('without a name the next call draws a different recording (control)', async () => {
    const first = await call('c1', 0.99);
    const next = await call('c2', 0.01);
    expect(next.pcm).not.toBeNull();
    expect(next.pcm?.equals(first.pcm as Buffer)).toBe(false);
  });

  it('after "stop whistling" the next call plays nothing in the silence', async () => {
    const first = await call('c1', 0.99);
    expect(first.say("please don't whistle")).toContain('stop the whistling');
    await flush();
    const next = await call('c2', 0.01);
    expect(next.pcm).toBeNull();
  });
});
