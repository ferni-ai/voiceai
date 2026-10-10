/**
 * REACTION_SIDETRACK=direct routes backchannel/laugh/opening clips to the
 * mixer-free track, keeps one clip at a time across both tracks, and shares
 * one lastPlayedAt. Off, nothing changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mixerPlays = vi.hoisted(() => ({ count: 0, done: true }));
const direct = vi.hoisted(() => ({
  played: [] as Array<{ label: string; pauseStartedAt?: number }>,
  playing: false,
  cancelled: 0,
  closed: 0,
  started: 0,
}));

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  class FakeBackgroundAudioPlayer {
    async start(): Promise<void> {}
    play() {
      mixerPlays.count++;
      return { done: () => mixerPlays.done, stop: () => {} };
    }
    async close(): Promise<void> {}
  }
  return {
    ...actual,
    voice: { ...actual.voice, BackgroundAudioPlayer: FakeBackgroundAudioPlayer },
  };
});
vi.mock('../direct-clip-track.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startDirectClips: async () => {
    direct.started++;
    return {
      get playing() {
        return direct.playing;
      },
      play: (_pcm: ArrayBuffer, _v: number, label: string, pauseStartedAt?: number) => {
        if (direct.playing) return false;
        direct.played.push({ label, pauseStartedAt });
        return true;
      },
      cancelIfFresh: () => (direct.cancelled++, true),
      close: async () => {
        direct.closed++;
      },
    };
  },
}));

const { startBackchannelClips } = await import('../clip-player.js');

const pcm = () => new Int16Array(2400).fill(8000).buffer;
/** Clip plays on the mixer track, after the keep-alive silence start() adds. */
const mixerClips = () => mixerPlays.count - 1;
const start = () => startBackchannelClips({} as never, {} as never, () => 'ferni', pcm);

describe('clip player with REACTION_SIDETRACK', () => {
  beforeEach(() => {
    mixerPlays.count = 0;
    mixerPlays.done = true;
    Object.assign(direct, { played: [], playing: false, cancelled: 0, closed: 0, started: 0 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('off: clips play on the mixer track and there is nothing to take back', async () => {
    const clips = await start();
    expect(clips!.playClip('Mm-hmm')).toBe(true);
    expect(mixerClips()).toBe(1);
    expect(direct.started).toBe(0);
    expect(clips!.cancelFresh()).toBe(false);
  });

  it('direct: clips go to the direct track with the pause onset, not the mixer', async () => {
    vi.stubEnv('REACTION_SIDETRACK', 'direct');
    const clips = await start();
    const before = clips!.lastPlayedAt();
    expect(clips!.playClip('Mm-hmm', { pauseStartedAt: 123 })).toBe(true);
    expect(direct.played).toEqual([{ label: 'Mm-hmm', pauseStartedAt: 123 }]);
    expect(mixerClips()).toBe(0);
    expect(clips!.lastPlayedAt()).toBeGreaterThan(before);
    expect(clips!.cancelFresh()).toBe(true);
    expect(direct.cancelled).toBe(1);
    await clips!.close();
    expect(direct.closed).toBe(1);
  });

  it('direct: a whistle waits for a direct clip, and a clip waits for a whistle', async () => {
    vi.stubEnv('REACTION_SIDETRACK', 'direct');
    vi.stubEnv('PRESENCE_SOUNDS', 'on');
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const handlers = new Map<string, (ev: { newState?: string }) => void>();
    const session = {
      on: (e: string, fn: (ev: { newState?: string }) => void) => handlers.set(e, fn),
      off: () => {},
      userData: {},
    };
    const clips = await startBackchannelClips({} as never, session as never, () => 'ferni', pcm);
    const agent = (s: string) => handlers.get('agent_state_changed')!({ newState: s });
    for (let i = 0; i < 3; i++) {
      agent('speaking');
      agent('listening');
    }
    // A quiet stretch arrives while a backchannel is still on the direct track.
    direct.playing = true;
    vi.advanceTimersByTime(8000);
    expect(mixerClips()).toBe(0);
    // The next quiet stretch, with the direct track free: the whistle plays.
    direct.playing = false;
    agent('speaking');
    agent('listening');
    mixerPlays.done = false;
    vi.advanceTimersByTime(8000);
    expect(mixerClips()).toBe(1);
    // While it plays, no clip starts on the other track.
    expect(clips!.playClip('Mm')).toBe(false);
    expect(direct.played).toEqual([]);
    mixerPlays.done = true;
    expect(clips!.playClip('Mm')).toBe(true);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
