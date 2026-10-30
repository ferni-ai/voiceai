/**
 * The house Spotify refresh token is revoked (invalid_grant) and every music
 * request fell back to a 30-second iTunes preview in silence; the tool also
 * told callers to "link your account in settings" where the connect route
 * answers 503 (integration audit, 2026-10-29). MUSIC_HONEST_WHEN_UNLINKED
 * makes the reply say what is true. Per-user Spotify will not be built
 * (Developer Policy III.3), so no reply offers to link it, flag on or off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  played: [] as string[],
  spotify: { configured: true, revoked: true, token: null as string | null },
}));

vi.mock('../../../../audio/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isMusicAvailable: () => ({ available: true, reason: 'Music playback available' }),
  getMusicPlayer: () => ({
    getSessionId: () => 's1',
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
    addToQueue: () => undefined,
  }),
}));

vi.mock('../../../../services/itunes.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  searchItunes: async () => ({
    resultCount: 1,
    results: [
      {
        trackId: 1,
        trackName: 'Sunny Strum',
        artistName: 'Luke Gaul',
        collectionName: '',
        previewUrl: 'https://audio-ssl.itunes.apple.com/preview-1.m4a',
        artworkUrl100: '',
        trackTimeMillis: 180000,
        primaryGenreName: 'Acoustic',
        releaseDate: '',
      },
    ],
  }),
  findTrack: async () => ({
    found: true,
    track: {
      name: 'Brown Eyed Girl',
      artist: 'Van Morrison',
      previewUrl: 'https://audio-ssl.itunes.apple.com/preview-2.m4a',
      artwork: '',
    },
  }),
}));

vi.mock('../../../../services/identity/spotify-auth.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isSpotifyConfigured: () => world.spotify.configured,
  isSpotifyRefreshRevoked: () => world.spotify.revoked,
  getSpotifyAccessToken: async () => world.spotify.token,
}));

import { resetAmbientSession, PREVIEW_NOTICE } from '../ambient-play.js';
import {
  createMusicTools,
  initializeMusicConfig,
  playMusicUnified,
  SPOTIFY_HOUSE_READY,
} from '../music.js';
import { listeningUnavailable, NO_LINK_OFFER } from '../music-honesty.js';
import { toolOutcome } from '../../../../agents/voice-agent/tool-outcome.js';

const LISTEN = 'play Brown Eyed Girl on spotify';
const HONEST =
  "Spotify isn't connected right now, so I can only play short previews. Want a preview?";
const NOT_LINKED =
  "Spotify isn't connected right now, so I can only play short previews. I can't play from your own Spotify account.";
/** Any wording that offers the caller a Spotify link, which does not exist. */
const LINK_OFFER =
  /link it in settings|link your (spotify|account)|offer to link spotify for full songs/i;

type Tool = { execute: (args: Record<string, unknown>) => Promise<string> };
const tool = (name: 'playMusic' | 'useSpotify'): Tool =>
  createMusicTools()[name] as unknown as Tool;

beforeEach(() => {
  world.played.length = 0;
  world.spotify = { configured: true, revoked: true, token: null };
  resetAmbientSession();
  vi.stubEnv('SPOTIFY_CLIENT_ID', '');
  vi.stubEnv('SPOTIFY_CLIENT_SECRET', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('flag on, revoked house token', () => {
  beforeEach(() => vi.stubEnv('MUSIC_HONEST_WHEN_UNLINKED', 'on'));

  it('a Spotify request gets a structured unavailable result and a true line, and plays nothing', async () => {
    const reply = await tool('playMusic').execute({ query: LISTEN });

    expect(JSON.parse(reply)).toEqual({ spotify: 'unavailable', reason: 'revoked', say: HONEST });
    expect(world.played).toEqual([]);
  });

  it('never suggests linking, even where the connect route is configured: a caller link does not repair the house token', async () => {
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'client');
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'secret');

    const reply = await playMusicUnified(LISTEN);

    expect(JSON.parse(reply).say).toBe(HONEST);
  });

  it('the first ambient preview says Spotify is not connected, once, with no link offer', async () => {
    vi.stubEnv('MUSIC_CONTINUE_AS_ASKED', 'on');

    const first = await playMusicUnified('upbeat acoustic guitar');
    const second = await playMusicUnified('smooth jazz');

    expect(first).toContain("because Spotify isn't connected right now");
    expect(first).toContain(NO_LINK_OFFER);
    expect(first).not.toMatch(LINK_OFFER);
    expect(first).not.toContain(PREVIEW_NOTICE);
    expect(second).not.toContain("Spotify isn't connected");
  });

  it('useSpotify does not tell the caller to link in settings', async () => {
    const reply = await tool('useSpotify').execute({});

    expect(reply).toBe(NOT_LINKED);
  });
});

describe('flag on: no link is offered, whether or not the connect route is configured', () => {
  beforeEach(() => {
    vi.stubEnv('MUSIC_HONEST_WHEN_UNLINKED', 'on');
    world.spotify = { configured: true, revoked: false, token: null };
  });

  it('connect not configured: no settings suggestion anywhere', async () => {
    const listening = JSON.parse(await playMusicUnified(LISTEN));
    const useSpotify = await tool('useSpotify').execute({});
    vi.stubEnv('MUSIC_CONTINUE_AS_ASKED', 'on');
    const ambient = await playMusicUnified('upbeat acoustic guitar');

    expect(listening).toMatchObject({ spotify: 'unavailable', reason: 'auth_failed' });
    for (const text of [listening.say, useSpotify, ambient]) {
      expect(text).not.toMatch(LINK_OFFER);
      expect(text).not.toMatch(/settings/i);
    }
  });

  it('connect configured and the token merely failed: still no link offer', async () => {
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'client');
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'secret');

    const listening = JSON.parse(await playMusicUnified(LISTEN));
    const useSpotify = await tool('useSpotify').execute({});

    expect(listening.say).toBe(HONEST);
    expect(useSpotify).toBe(NOT_LINKED);
  });

  it('nothing configured at all: reason not_configured, no settings suggestion', async () => {
    world.spotify = { configured: false, revoked: false, token: null };

    const listening = JSON.parse(await playMusicUnified(LISTEN));

    expect(listening).toMatchObject({ spotify: 'unavailable', reason: 'not_configured' });
    expect(listening.say).not.toMatch(/settings|link/i);
  });

  it('a working token means there is nothing to report', async () => {
    world.spotify = { configured: true, revoked: false, token: 'access-token' };

    expect(await listeningUnavailable()).toBeNull();
  });
});

describe('flag off: a preview plays as before, with no link offer', () => {
  it('a Spotify request plays a preview, with no unavailable result and no promise to queue it', async () => {
    const reply = await playMusicUnified(LISTEN);

    expect(reply).not.toContain('unavailable');
    expect(reply).toMatch(/Brown Eyed Girl|full thing|full track|full song/);
    expect(reply).not.toMatch(/queue it up/i);
    expect(world.played).toEqual(['Brown Eyed Girl']);
  });

  it('an ambient preview never ends with a PS to link Spotify', async () => {
    const reply = await playMusicUnified('upbeat acoustic guitar');

    expect(reply).not.toMatch(LINK_OFFER);
    expect(reply).not.toContain('PS:');
  });

  it('the first ambient preview ends with the notice, which tells the model not to offer a link', async () => {
    vi.stubEnv('MUSIC_CONTINUE_AS_ASKED', 'on');

    expect((await playMusicUnified('upbeat acoustic guitar')).endsWith(PREVIEW_NOTICE)).toBe(true);
    expect(PREVIEW_NOTICE).toContain(NO_LINK_OFFER);
    expect(PREVIEW_NOTICE).not.toMatch(LINK_OFFER);
  });

  it('useSpotify says previews only and that it cannot use their own account', async () => {
    expect(await tool('useSpotify').execute({})).toBe(NOT_LINKED);
  });
});

describe('house Spotify working', () => {
  afterEach(async () => {
    world.spotify = { configured: true, revoked: true, token: null };
    await initializeMusicConfig();
  });

  it("useSpotify never claims the caller's own library", async () => {
    world.spotify = { configured: true, revoked: false, token: 'access-token' };
    const useSpotify = tool('useSpotify');
    await initializeMusicConfig();

    const reply = await useSpotify.execute({});

    expect(reply).toBe(SPOTIFY_HOUSE_READY);
    expect(reply).toContain("I can't play from your own Spotify account.");
    expect(reply).not.toMatch(/your library|linked and ready/i);
  });
});

describe('outcome', () => {
  it('a thrown error is error for any tool', () => {
    expect(toolOutcome(true, undefined, true)).toBe('error');
    expect(toolOutcome(false, undefined, true)).toBe('error');
  });

  it('a music reply that says Spotify is not connected is unavailable, whichever flag wrote it', async () => {
    vi.stubEnv('MUSIC_HONEST_WHEN_UNLINKED', 'on');
    const honest = await playMusicUnified(LISTEN);
    const legacy = await (async () => {
      vi.stubEnv('MUSIC_HONEST_WHEN_UNLINKED', 'off');
      return tool('useSpotify').execute({});
    })();

    expect(toolOutcome(true, honest, false)).toBe('unavailable');
    expect(toolOutcome(true, legacy, false)).toBe('unavailable');
    expect(
      toolOutcome(true, "I can't play it right now, music isn't available in this session.", false)
    ).toBe('unavailable');
  });

  it('a music reply that played a track is ok; other tools get no verdict', () => {
    expect(toolOutcome(true, 'Here\'s "Sunny Strum" by Luke Gaul!', false)).toBe('ok');
    expect(toolOutcome(false, 'It is 70 and sunny.', false)).toBeUndefined();
  });
});
