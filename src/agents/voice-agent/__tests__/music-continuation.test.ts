/**
 * Seth's prod call, 2026-10-12: Spotify not linked, 13 iTunes previews. He
 * asked for "something a little more to wake me up" (playMusic('upbeat
 * acoustic guitar')); when the queue ran out the DJ searched "more <last
 * artist>", drifted, then found nothing for "more Luke Gaul" and the music
 * stopped without a word.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  queries: [] as Array<{ query: string; limit: number }>,
  played: [] as string[],
  queued: [] as string[],
  catalog: [] as string[],
  session: 's1',
}));

vi.mock('../../../audio/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isMusicAvailable: () => ({ available: true, reason: 'Music playback available' }),
  getMusicPlayer: () => ({
    getSessionId: () => world.session,
    isInitialized: () => true,
    isCurrentlyPlaying: () => false,
    isPlaying: () => false,
    getCurrentPlayingTrack: () => null,
    waitForInitialization: async () => true,
    getState: () => ({ queue: [] }),
    playFromUrl: async (_url: string, track: { name: string }) => {
      world.played.push(track.name);
      return true;
    },
    addToQueue: (track: { name: string }) => world.queued.push(track.name),
  }),
}));

const result = (trackName: string, i: number) => ({
  trackId: i,
  trackName,
  artistName: trackName === 'Sunny Strum' ? 'Luke Gaul' : 'Guitar Covers',
  collectionName: '',
  previewUrl: `https://audio-ssl.itunes.apple.com/preview-${i}.m4a`,
  artworkUrl100: '',
  trackTimeMillis: 180000,
  primaryGenreName: 'Acoustic',
  releaseDate: '',
});

vi.mock('../../../services/itunes.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  searchItunes: async (query: string, limit = 5) => {
    world.queries.push({ query, limit });
    const results = world.catalog.slice(0, limit).map(result);
    return { resultCount: results.length, results };
  },
  // "more Luke Gaul": nothing.
  findTrack: async () => ({ found: false }),
}));

import {
  lastMusicRequest,
  PREVIEW_NOTICE,
  resetAmbientSession,
} from '../../../tools/domains/entertainment/ambient-play.js';
import { playMusicUnified } from '../../../tools/domains/entertainment/music.js';
import { continueAfterQueue } from '../music-continuation.js';

const FIRST_FIVE = [
  'Upbeat Acoustic Guitar',
  'Acoustic Guitar',
  'Brown Eyed Girl (Arr. For Guitar)',
  'Bad Guy (Arr. For Guitar)',
  'Sunny Strum',
];
const lastTrack = { name: 'Sunny Strum', artist: 'Luke Gaul', previewUrl: 'x', duration: 30000 };

function deps() {
  return { personaId: 'ferni', djSay: vi.fn(), say: vi.fn() };
}

beforeEach(() => {
  world.session = 's1';
  resetAmbientSession();
  world.queries.length = 0;
  world.played.length = 0;
  world.queued.length = 0;
  world.catalog = [...FIRST_FIVE];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('flag on: auto-continue keeps what the caller asked for', () => {
  beforeEach(() => vi.stubEnv('MUSIC_CONTINUE_AS_ASKED', 'on'));

  it('continues with the request, not "more <last artist>", skipping what already played', async () => {
    await playMusicUnified('upbeat acoustic guitar');
    world.catalog = [...FIRST_FIVE, 'Morning Pick', 'Bright Strings', 'Coffee Chords'];
    world.queries.length = 0;
    world.played.length = 0;
    world.queued.length = 0;
    const d = deps();

    await continueAfterQueue(lastTrack, d);

    expect(world.queries.map((q) => q.query)).toEqual(['upbeat acoustic guitar']);
    expect(world.played).toEqual(['Morning Pick']);
    expect(world.queued).toEqual(['Bright Strings', 'Coffee Chords']);
    expect(d.say).not.toHaveBeenCalled();
  });

  it('when nothing new is left, Ferni says so instead of going silent', async () => {
    await playMusicUnified('upbeat acoustic guitar');
    world.played.length = 0;
    const d = deps();

    await continueAfterQueue(lastTrack, d);

    expect(world.played).toEqual([]);
    expect(d.say).toHaveBeenCalledWith(
      "That's all the upbeat acoustic guitar I could find. Want something different?"
    );
  });

  it('after a specific song it continues with the artist, never the word "more"', async () => {
    await playMusicUnified('play Brown Eyed Girl on spotify');
    world.queries.length = 0;
    const d = deps();

    await continueAfterQueue(lastTrack, d);

    expect(world.queries.map((q) => q.query)).toEqual(['Luke Gaul']);
    expect(world.played).toEqual(['Upbeat Acoustic Guitar']);
    expect(d.say).not.toHaveBeenCalled();
  });

  it('when the artist search finds nothing, the stop is spoken', async () => {
    await playMusicUnified('play Brown Eyed Girl on spotify');
    world.catalog = [];
    const d = deps();

    await continueAfterQueue(lastTrack, d);

    expect(d.say).toHaveBeenCalledWith(
      "That's all the Luke Gaul I could find. Want something different?"
    );
  });

  it('says once per call that these are previews when Spotify is not linked', async () => {
    const first = await playMusicUnified('relaxing instrumental acoustic guitar');
    const second = await playMusicUnified('upbeat acoustic guitar');
    expect(first.endsWith(PREVIEW_NOTICE)).toBe(true);
    expect(second).not.toContain(PREVIEW_NOTICE);
  });
});

describe('per call', () => {
  it('the next call starts over: no request carried over, and it hears the preview notice again', async () => {
    vi.stubEnv('MUSIC_CONTINUE_AS_ASKED', 'on');
    expect(await playMusicUnified('upbeat acoustic guitar')).toContain(PREVIEW_NOTICE);
    world.session = 's2';
    expect(lastMusicRequest()).toBeUndefined();
    expect(await playMusicUnified('smooth jazz')).toContain(PREVIEW_NOTICE);
  });
});

describe('flag off: as before', () => {
  it('searches "more <last artist>" and stops silently when it finds nothing', async () => {
    await playMusicUnified('upbeat acoustic guitar');
    world.queries.length = 0;
    world.played.length = 0;
    const d = deps();

    await continueAfterQueue(lastTrack, d);

    // playViaItunes looks "more Luke Gaul" up through findTrack, which finds nothing.
    expect(world.queries).toEqual([]);
    expect(world.played).toEqual([]);
    expect(d.say).not.toHaveBeenCalled();
  });

  it('no preview notice', async () => {
    expect(await playMusicUnified('relaxing instrumental acoustic guitar')).not.toContain(
      PREVIEW_NOTICE
    );
  });
});
