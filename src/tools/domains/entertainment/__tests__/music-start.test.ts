/**
 * playMusic tells the model what it started, never '' (music-start.ts).
 *
 * Replays the dev call of 2026-10-12 (session-AJ_FhDLDpE3gTFu): "relaxing late
 * night music", iTunes returns "Late Night" by Antonius B & Krynoze and four
 * more, and the preview download takes 3.1 s. Before this the real playMusic
 * tool waited the full download and then returned '' one time in five (or a
 * line with no track name), and Peter said he couldn't play music.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const player = vi.hoisted(() => ({
  downloadMs: 0,
  ok: true,
  queue: [] as string[],
  played: [] as string[],
}));

vi.mock('../../../../audio/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isMusicAvailable: () => ({ available: true, reason: 'Music playback available' }),
  getMusicPlayer: () => ({
    isInitialized: () => true,
    isCurrentlyPlaying: () => false,
    getCurrentPlayingTrack: () => null,
    playFromUrl: (_url: string, track: { name: string }) =>
      new Promise<boolean>((resolve) =>
        setTimeout(() => {
          if (player.ok) player.played.push(track.name);
          resolve(player.ok);
        }, player.downloadMs)
      ),
    addToQueue: (track: { name: string }) => player.queue.push(track.name),
  }),
}));

const DEV_CALL_RESULTS = [
  ['Late Night', 'Antonius B & Krynoze'],
  ['Midnight Coffee - Relaxing Night Cafe Lo-Fi', 'FM STAR'],
  ['Lo -Fi Morning Coffee - Relaxing Cafe Sounds', 'FM STAR'],
  ['Midnight Reading - Relaxing Lo-Fi Jazz', 'FM STAR'],
  ['The Kind of Love We Make', 'Luke Combs'],
].map(([trackName, artistName], i) => ({
  trackId: i,
  trackName,
  artistName,
  collectionName: '',
  previewUrl: `https://audio-ssl.itunes.apple.com/preview-${i}.m4a`,
  artworkUrl100: '',
  trackTimeMillis: 180000,
  primaryGenreName: i === 0 ? 'Electronic' : 'Lo-Fi',
  releaseDate: '',
}));

vi.mock('../../../../services/itunes.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  searchItunes: async () => ({ resultCount: 5, results: DEV_CALL_RESULTS }),
}));

import { createMusicTools } from '../music.js';
import { START_WAIT_MS, startWithin } from '../music-start.js';

async function playMusic(query = 'relaxing late night music'): Promise<string> {
  const tool = createMusicTools().playMusic as unknown as {
    execute: (args: { query: string }, opts: unknown) => Promise<string>;
  };
  return tool.execute({ query }, {});
}

beforeEach(() => {
  Object.assign(player, { downloadMs: 0, ok: true, queue: [], played: [] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('playMusic on the dev call', () => {
  it('names the track it started and the queue, every time', async () => {
    for (let i = 0; i < 20; i++) {
      player.queue = [];
      const said = await playMusic();
      expect(said).toBe(
        'Starting "Late Night" by Antonius B & Krynoze (electronic). 4 more like it queued after it.'
      );
      expect(player.queue).toHaveLength(4);
    }
  });

  it('with the 3.1 s download, answers within the wait and lets the music fade in', async () => {
    vi.useFakeTimers();
    player.downloadMs = 3108;
    let said: string | undefined;
    void playMusic().then((s) => (said = s));
    await vi.advanceTimersByTimeAsync(START_WAIT_MS);
    expect(said).toBe(
      'Putting on "Late Night" by Antonius B & Krynoze (electronic); it\'ll fade in in a second. 4 more like it queued after it.'
    );
    // Not playing yet, nothing queued: that happens when the download lands.
    expect(player.played).toEqual([]);
    expect(player.queue).toEqual([]);
    await vi.advanceTimersByTimeAsync(3108 - START_WAIT_MS);
    expect(player.played).toEqual(['Late Night']);
    expect(player.queue).toHaveLength(4);
  });

  it('says plainly when playback failed, and queues nothing', async () => {
    player.ok = false;
    const said = await playMusic();
    expect(said).toMatch(/went wrong with the audio system/);
    expect(said).not.toMatch(/Starting|Putting on/);
    expect(player.queue).toEqual([]);
  });
});

describe('startWithin', () => {
  it('reports started, failed or loading, and runs then() once it settles', async () => {
    const then = vi.fn();
    const track = { name: 'Late Night', artist: 'Antonius B & Krynoze' };
    expect(await startWithin(async () => true, track, then, 50)).toBe('started');
    expect(await startWithin(async () => false, track, then, 50)).toBe('failed');
    expect(
      await startWithin(() => Promise.reject(new Error('mixer closed')), track, then, 50)
    ).toBe('failed');
    const slow = () => new Promise<boolean>((r) => setTimeout(() => r(true), 80));
    expect(await startWithin(slow, track, then, 20)).toBe('loading');
    await new Promise((r) => setTimeout(r, 100));
    expect(then.mock.calls.map(([ok]) => ok)).toEqual([true, false, false, true]);
  });
});
