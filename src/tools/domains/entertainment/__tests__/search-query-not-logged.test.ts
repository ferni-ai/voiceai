/**
 * #4331 slice 1: a search query is usually the caller's own words ("songs about my dad"), so
 * the music, Spotify, iTunes, book and game-music searches log its length (`[N chars]`, via
 * replyForLog), never the words. Each row drives the real writer with an invented query,
 * captures every log call (child-logger bindings included), and asserts that no captured
 * line holds the query's distinctive word, and that every `query` field is a length.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => {
  interface Call {
    level: string;
    fields: Record<string, unknown>;
    msg: unknown;
  }
  const calls: Call[] = [];
  const make = (bindings: Record<string, unknown>): Record<string, unknown> => {
    const logger: Record<string, unknown> = {};
    for (const level of ['info', 'warn', 'error', 'debug', 'trace', 'fatal']) {
      // pino's (fields, msg), and the (msg, fields) some debug lines use.
      logger[level] = (a: unknown, b?: unknown) => {
        const [own, msg] = typeof a === 'string' ? [b, a] : [a, b];
        const fields = typeof own === 'object' && own !== null ? own : {};
        calls.push({ level, fields: { ...bindings, ...fields }, msg });
      };
    }
    logger.child = (more: Record<string, unknown>) => make({ ...bindings, ...more });
    return logger;
  };
  const player = {
    isInitialized: () => false,
    getSessionId: () => 'session-1',
    waitForInitialization: async () => false,
    getState: () => 'idle',
    playFromUrl: async () => false,
  };
  return {
    calls,
    logger: make({}),
    player,
    available: true,
    enabled: true,
    /** What findTrack (the services/itunes.js shim music, Spotify and games import) does. */
    findTrack: async (query: string): Promise<unknown> => ({
      found: false,
      error: `Couldn't find "${query}" on iTunes. Try a different search?`,
    }),
    /** The ambient route's player: a row can make it throw. */
    ambient: async (): Promise<string> => 'Playing something.',
    /** Every network call: a row sets what each host answers. */
    fetch: async (_url: string): Promise<Response> =>
      Response.json({ resultCount: 0, results: [] }),
  };
});

/** Invented caller words. "oatfield" survives URL encoding, so a logged URL is caught too. */
const QUERY = 'songs about riley oatfield and the long drive home';
const WORD = 'oatfield';
const LENGTH = `[${QUERY.length} chars]`;

vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getLogger: () => cap.logger,
  safeLog: () => cap.logger,
  createLogger: () => cap.logger,
}));
// The Spotify token file lives in the working directory: never read or write it from a test.
vi.mock('fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs')>();
  const isTokenFile = (p: unknown) => String(p).endsWith('.spotify-tokens.json');
  return {
    ...real,
    existsSync: (p: Parameters<typeof real.existsSync>[0]) => !isTokenFile(p) && real.existsSync(p),
    writeFileSync: (...args: Parameters<typeof real.writeFileSync>) => {
      if (!isTokenFile(args[0])) real.writeFileSync(...args);
    },
  };
});
vi.mock('../../../../audio/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getMusicPlayer: () => cap.player,
  isMusicAvailable: () => ({ available: cap.available, reason: 'test' }),
}));
vi.mock('../../../../config/environment.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isMusicEnabled: () => cap.enabled,
}));
vi.mock('../../../../services/itunes.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  findTrack: async (query: string) => cap.findTrack(query),
}));
vi.mock('../../../../services/identity/spotify-auth.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isSpotifyConfigured: () => true,
  getSpotifyAccessToken: async () => 'test-token',
  getSpotifyHealthStatus: () => ({ configured: true }),
  recordSpotifyError: () => undefined,
  startAutoRefresh: () => undefined,
  stopAutoRefresh: () => undefined,
}));
vi.mock('../ambient-play.js', () => ({
  noteMusicRequest: () => undefined,
  playAmbientMusic: async () => cap.ambient(),
  resetAmbientSession: () => undefined,
}));
vi.mock('../music-honesty.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listeningUnavailable: async () => null,
}));

const music = await import('../music.js');
const { default: createSpotifyTools, searchTracksWithPreviews } = await import('../spotify.js');
const { searchItunes, findTrack } = await import('../../../../services/external-apis/itunes.js');
const { searchBooks } = await import('../../../../services/books/google-books.js');
const gameMusic = await import('../../../../services/games/game-music.js');
const { getCircuitBreaker } = await import('../../../../utils/circuit-breaker.js');

type Execute = (args: Record<string, unknown>) => Promise<string>;
const tool = (tools: Record<string, unknown>, name: string): Execute =>
  (tools[name] as { execute: Execute }).execute;

/** The one captured line with this message; fails the row when the writer never logged it. */
function line(msg: string): Record<string, unknown> {
  const found = cap.calls.find((c) => c.msg === msg);
  expect(found, `no log line "${msg}"`).toBeDefined();
  return found?.fields ?? {};
}

/** No captured line holds the query's words, and every `query` field is a length. */
function nothingSaid(): void {
  expect(cap.calls.length).toBeGreaterThan(0);
  expect(JSON.stringify(cap.calls)).not.toContain(WORD);
  for (const { fields } of cap.calls) {
    if ('query' in fields) expect(fields.query).toMatch(/^\[\d+ chars\]$/);
  }
}

/** Calls run one after another: a breaker or limiter counts each before the next starts. */
const inTurn = (n: number, call: () => Promise<unknown>): Promise<unknown> =>
  Array.from({ length: n }).reduce<Promise<unknown>>((done) => done.then(call), Promise.resolve());

/** A host that answers this status with this body text. */
const failing =
  (status: number, text = 'error') =>
  async () =>
    new Response(text, { status });

beforeEach(() => {
  cap.calls.length = 0;
  cap.available = true;
  cap.enabled = true;
  cap.player.isInitialized = () => false;
  cap.player.playFromUrl = async () => false;
  cap.ambient = async () => 'Playing something.';
  cap.findTrack = async (query) => ({ found: false, error: `Couldn't find "${query}" on iTunes.` });
  cap.fetch = async () => Response.json({ resultCount: 0, results: [] });
  vi.stubGlobal('fetch', (url: string) => cap.fetch(String(url)));
  getCircuitBreaker('itunes-api').reset();
  getCircuitBreaker('google-books-api').reset();
  music.resetMusicConfig();
});
afterEach(() => vi.unstubAllGlobals());

describe('music routing logs the query as a length', () => {
  it('intent detection, listening and ambient', () => {
    expect(music.detectMusicIntent(`${QUERY} on spotify`)).toBe('listening');
    expect(music.detectMusicIntent(QUERY)).toBe('ambient');
    nothingSaid();
    expect(line('🎵 Detected LISTENING intent (explicit Spotify/device request)').query).toBe(
      `[${QUERY.length + 11} chars]`
    );
    expect(line('🎵 AMBIENT intent (default: iTunes previews)').query).toBe(LENGTH);
  });

  it('a Sonos room, music unavailable, and the ambient route', async () => {
    await music.playMusicUnified(`${QUERY} in the kitchen`);
    expect(line('🎵 Sonos mentioned - LLM should use playSonosMusic').query).toMatch(/chars/);
    cap.available = false;
    await music.playMusicUnified(QUERY);
    expect(line('🎵 Music playback NOT available for this session').query).toBe(LENGTH);
    cap.available = true;
    await music.playMusicUnified(QUERY);
    expect(line('🎵 AMBIENT mode: Using iTunes DJ (chains previews)').query).toBe(LENGTH);
    expect(line('🎵 Playing music (intent-based routing)').query).toMatch(/chars/);
    nothingSaid();
  });

  it('listening with no Spotify falls back to an iTunes preview', async () => {
    await music.playMusicUnified(`${QUERY} on spotify`);
    nothingSaid();
    expect(line('🎵 LISTENING mode: No Spotify, using iTunes preview').query).toMatch(/chars/);
    expect(line('🎵 [iTunes] Starting search...').query).toMatch(/chars/);
    // findTrack's error repeats the query: logged as a length too.
    expect(line('🎵 [iTunes] Track not found').error).toMatch(/^\[\d+ chars\]$/);
    expect(line('findTrack result').error).toMatch(/^\[\d+ chars\]$/);
  });

  it('listening with Spotify linked tries Spotify first', async () => {
    cap.fetch = failing(404, 'NO_ACTIVE_DEVICE');
    await music.initializeMusicConfig();
    await music.playMusicUnified(`${QUERY} on spotify`);
    nothingSaid();
    expect(line('🎵 LISTENING mode: Trying Spotify...').query).toMatch(/chars/);
    expect(line('🎵 Playing via Spotify (full track)').query).toMatch(/chars/);
  });
});

describe('iTunes playback logs the query as a length', () => {
  it('music disabled', async () => {
    cap.enabled = false;
    await music.playViaItunes(QUERY);
    nothingSaid();
    expect(line('🎵 [DIAG] playViaItunes START - checking player state').query).toBe(LENGTH);
    expect(line('🎵 [DIAG] Music feature is disabled (MUSIC_ENABLED=false)').query).toBe(LENGTH);
  });

  it('a player that never initialises', async () => {
    const track = { name: 'Long Drive', artist: 'Test Band', previewUrl: 'https://x.test/p.m4a' };
    cap.findTrack = async () => ({ found: true, track: { ...track, duration: 30000 } });
    await music.playViaItunes(QUERY);
    nothingSaid();
    expect(line('🎵 [DIAG] Music player NOT initialized! Waiting up to 5s...').query).toBe(LENGTH);
    const failed =
      '🎵 [DIAG] Music player FAILED to initialize! Was dispose() called? Check previous logs!';
    expect(line(failed).query).toBe(LENGTH);
  });

  it('a search that throws', async () => {
    cap.findTrack = async () => {
      throw new Error('boom');
    };
    await music.playViaItunes(QUERY);
    nothingSaid();
    expect(line('🎵 [iTunes] EXCEPTION in playViaItunes').query).toBe(LENGTH);
  });

  it('the playMusic tool binds the query once, as a length', async () => {
    await tool(music.createMusicTools(), 'playMusic')({ query: QUERY });
    nothingSaid();
    expect(line('🎵 [DIAG] ========== playMusic TOOL INVOKED BY LLM ==========').query).toBe(
      LENGTH
    );
    expect(line('🎵 [DIAG] Music availability check at tool entry').query).toBe(LENGTH);
    const done = line('🎵 [DIAG] playMusic completed - check if music actually played');
    expect(done.query).toBe(LENGTH);
    expect(done.resultPreview).toMatch(/^\[\d+ chars\]$/);
    cap.ambient = async () => {
      throw new Error('boom');
    };
    await tool(music.createMusicTools(), 'playMusic')({ query: QUERY });
    nothingSaid();
    expect(line('🎵 [DIAG] playMusic EXCEPTION').query).toBe(LENGTH);
  });
});

describe('Spotify logs the query as a length', () => {
  const spotify = () => createSpotifyTools() as unknown as Record<string, unknown>;

  it('search errors, with and without previews', async () => {
    cap.fetch = failing(400);
    await tool(spotify(), 'searchMusic')({ query: QUERY });
    expect(await searchTracksWithPreviews(QUERY)).toEqual([]);
    nothingSaid();
    expect(line('Spotify search error').query).toBe(LENGTH);
    expect(line('Spotify search for previews failed').query).toBe(LENGTH);
    expect(line('🎵 Spotify API request').endpoint).toBe('/search');
  });

  it('music disabled', async () => {
    cap.enabled = false;
    await tool(spotify(), 'playMusic')({ query: QUERY });
    nothingSaid();
    expect(line('TOOL: playMusic CALLED').query).toBe(LENGTH);
    expect(line('🎵 [Spotify] Music disabled (MUSIC_ENABLED=false)').query).toBe(LENGTH);
    expect(line('TOOL: playMusic RESULT').result).toMatch(/^\[\d+ chars\]$/);
  });

  it('no Spotify device and a preview that will not play falls back to iTunes', async () => {
    const hit = { name: 'Long Drive', artists: [{ name: 'Test' }], uri: 'u', preview_url: 'p' };
    cap.fetch = async (url) =>
      url.includes('/search') ? Response.json({ tracks: { items: [hit] } }) : failing(400)();
    cap.player.isInitialized = () => true;
    await tool(spotify(), 'playMusic')({ query: QUERY });
    nothingSaid();
    expect(line('🎵 No Spotify preview, trying iTunes').query).toBe(LENGTH);
  });

  it('a play error, and Premium required with a failing iTunes fallback', async () => {
    cap.fetch = failing(400);
    await tool(spotify(), 'playPreview')({ query: QUERY });
    expect(line('Playing preview in call').query).toBe(LENGTH);
    expect(line('🎵 ===== PLAY MUSIC CALLED =====').query).toBe(LENGTH);
    expect(line('Spotify play error').query).toBe(LENGTH);
    cap.fetch = failing(403, 'PREMIUM_REQUIRED');
    cap.findTrack = async () => {
      throw new Error('boom');
    };
    await tool(spotify(), 'playMusic')({ query: QUERY });
    nothingSaid();
    expect(line('🎵 Premium required - falling back to iTunes').query).toBe(LENGTH);
    expect(line('🎵 Attempting iTunes fallback').query).toBe(LENGTH);
    expect(line('🎵 iTunes fallback failed').query).toBe(LENGTH);
  });
});

describe('the iTunes API logs the query as a length', () => {
  it('a search, a found track and a failing request', async () => {
    const hit = { trackId: 1, trackName: 'Long Drive', artistName: 'Test', previewUrl: 'p' };
    cap.fetch = async () => Response.json({ resultCount: 1, results: [hit] });
    await findTrack(QUERY);
    expect(line('🎵 [DIAG] iTunes circuit breaker allows request').query).toBe(LENGTH);
    expect(line('iTunes API searching').query).toBe(LENGTH);
    expect(line('🎵 [iTunes API] ✅ Search complete').query).toBe(LENGTH);
    cap.fetch = async () => {
      throw new Error('offline');
    };
    await searchItunes(QUERY);
    nothingSaid();
    const failed = line('iTunes API exception');
    expect(failed.query).toBe(LENGTH);
    expect(failed.url).toMatch(/^\[\d+ chars\]$/);
  });

  it('an open circuit breaker', async () => {
    cap.fetch = failing(500);
    await inTurn(5, () => searchItunes('warm up'));
    cap.calls.length = 0;
    await searchItunes(QUERY);
    await findTrack(QUERY);
    nothingSaid();
    const open =
      '🎵 [DIAG] iTunes circuit breaker is OPEN - skipping request! Music search will fail.';
    expect(line(open).query).toBe(LENGTH);
    const openFind =
      '🎵 [DIAG] iTunes circuit breaker OPEN - returning service unavailable message';
    expect(line(openFind).query).toBe(LENGTH);
  });
});

describe('Google Books logs the query as a length', () => {
  it('a search, a failure and an open circuit breaker', async () => {
    cap.fetch = async () => Response.json({ totalItems: 1, items: [{ id: 'b1', volumeInfo: {} }] });
    await searchBooks(QUERY);
    expect(line('Searching books').query).toBe(LENGTH);
    expect(line('Book search complete').query).toBe(LENGTH);
    cap.fetch = failing(500);
    await inTurn(6, () => searchBooks(QUERY));
    expect(line('Book search failed').query).toBe(LENGTH);
    expect(line('Google Books circuit breaker is OPEN').query).toBe(LENGTH);
    nothingSaid();
  });

  it('the rate limit', async () => {
    await inTurn(16, () => searchBooks(QUERY));
    nothingSaid();
    expect(line('Google Books rate limited').query).toBe(LENGTH);
  });
});

describe('game music logs the query as a length', () => {
  it('a fallback song, a cache hit and a search that throws', async () => {
    await gameMusic.searchSong(QUERY);
    expect(line('🎮 iTunes search failed, using fallback').query).toBe(LENGTH);
    await gameMusic.searchSong(QUERY);
    expect(line('🎮 Cache hit for search').query).toBe(LENGTH);
    cap.findTrack = async () => {
      throw new Error('network down');
    };
    await gameMusic.searchSong(`${QUERY} again`);
    expect(line('🎮 Failed to search song').query).toMatch(/chars/);
    nothingSaid();
  });

  it('random game songs whose searches throw', async () => {
    cap.findTrack = async () => {
      throw new Error('boom');
    };
    await gameMusic.getRandomGameSongs(2);
    nothingSaid();
    expect(line('🎮 Search failed for query').query).toMatch(/^\[\d+ chars\]$/);
  });
});
