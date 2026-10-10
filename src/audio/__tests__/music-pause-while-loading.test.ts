/**
 * A pause that comes while the next track is still loading. On dev (c1371aa60, 3 of 3 calls)
 * a pause sent after Ferni finished talking but before the track started got its ack, the
 * track started anyway ~0.3–1s later, and no paused state ever reached the app: a person
 * who taps pause while a song loads hears it play regardless.
 */
import { describe, expect, it, vi } from 'vitest';

// A playing track: its playout never ends during the test
const played = vi.fn(() => ({
  done: () => false,
  stop: vi.fn(),
  waitForPlayout: () =>
    new Promise<void>(() => {
      // never settles
    }),
}));
vi.mock('@livekit/agents', () => ({
  voice: {
    BackgroundAudioPlayer: vi.fn(function () {
      return {
        start: vi.fn().mockResolvedValue(undefined),
        play: played,
        close: vi.fn().mockResolvedValue(undefined),
      };
    }),
  },
}));
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../utils/safe-logger.js', () => ({ createLogger: () => log, getLogger: () => log }));
vi.mock('../../config/feature-flags.js', () => ({ isDebugEnabled: vi.fn(() => false) }));

const { CallMusicPlayer } = await import('../music-player.js');

type Loading = { finish: () => void };

/** A player whose next download waits until the test finishes it */
function playerLoadingSlowly() {
  const player = new CallMusicPlayer();
  const internals = player as unknown as {
    state: { isInitialized: boolean };
    backgroundPlayer: unknown;
    downloadAudio: () => Promise<{ path: string; actualDurationMs: number }>;
    cleanupTempFile: () => void;
  };
  internals.state.isInitialized = true;
  internals.backgroundPlayer = { play: played, close: vi.fn() };
  internals.cleanupTempFile = () => undefined;
  const loading: Loading = { finish: () => undefined };
  internals.downloadAudio = () =>
    new Promise((resolve) => {
      loading.finish = () => resolve({ path: '/tmp/quiet-jazz.mp3', actualDurationMs: 30_000 });
    });
  const states: string[] = [];
  player.on('stateChange', (state) => states.push(state));
  return { player, loading, states };
}

const jazz = { name: 'Quiet Jazz', artist: 'Ønejazz', previewUrl: 'https://example.test/jazz.m4a' };

describe('a pause while the track loads', () => {
  it("holds the track, paused, and tells the app: it doesn't start anyway", async () => {
    played.mockClear();
    const { player, loading, states } = playerLoadingSlowly();
    const playing = player.playFromUrl(jazz.previewUrl, jazz);
    await Promise.resolve();

    player.pause(); // tapped in the gap: nothing is playing yet
    loading.finish();

    expect(await playing).toBe(true);
    expect(played).not.toHaveBeenCalled();
    expect(states.slice(-2)).toEqual(['playing', 'paused']); // the DJ controller ends paused
    expect(player.getState().currentTrack?.name).toBe('Quiet Jazz'); // what resume replays
    expect(player.getState().isPlaying).toBe(false);
  });

  it('a later play is not held by an old pause', async () => {
    played.mockClear();
    const { player, loading } = playerLoadingSlowly();
    player.pause(); // nothing loading, nothing playing
    const playing = player.playFromUrl(jazz.previewUrl, jazz);
    await Promise.resolve();
    loading.finish();

    expect(await playing).toBe(true);
    expect(played).toHaveBeenCalledTimes(1);
  });

  it('ambient music still starts: it pauses itself under speech, which is not a tap', async () => {
    played.mockClear();
    const { player, loading } = playerLoadingSlowly();
    const playing = player.playFromUrl(jazz.previewUrl, jazz, true);
    await Promise.resolve();
    player.pause();
    loading.finish();

    expect(await playing).toBe(true);
    expect(played).toHaveBeenCalledTimes(1);
  });
});
