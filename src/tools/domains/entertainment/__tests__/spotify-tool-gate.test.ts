/**
 * SPOTIFY_TOOLS_HIDE_WHEN_DOWN: the house Spotify token has been revoked since
 * 2026-10-22 and the startup validation failed on every worker start, yet the
 * Spotify-only tools stayed in the toolset. These tests drive the real startup
 * path: importing the entertainment domain starts spotify-auth's validation,
 * Spotify's token endpoint (stubbed, no network) answers invalid_grant, and the
 * domain's registry entries follow. Fresh modules per test, so each starts as a
 * new worker would.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capToolsToLimit, isEssentialTool } from '../../../../config/tool-config.js';
import type { ToolRegistry } from '../../../registry/index.js';
import type { ToolContext } from '../../../registry/types.js';

type TokenReply = 'revoked' | 'valid';

const world = vi.hoisted(() => {
  let release: () => void = () => undefined;
  return {
    tokenReply: 'revoked' as 'revoked' | 'valid',
    released: Promise.resolve(),
    hold(): void {
      this.released = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    release: () => release(),
    spotifyCalls: [] as string[],
    info: [] as Array<{ fields: unknown; msg: unknown }>,
  };
});

vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const quiet = () => undefined;
  const logger = {
    trace: quiet,
    debug: quiet,
    warn: quiet,
    error: quiet,
    fatal: quiet,
    info: (fields: unknown, msg?: unknown) => world.info.push({ fields, msg }),
    child: () => logger,
  };
  return { ...real, getLogger: () => logger, safeLog: () => logger };
});

// The token file lives in the working directory: never read or write it from a test.
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

const SPOTIFY_ONLY = [
  'spotifyAdvanced',
  'callMusic',
  'spotifyStatus',
  'playMusicInRoom',
  'transferToRoom',
  'setRoomVolume',
  'listMusicRooms',
  'syncMusicRooms',
  'discoverSpotifyDevices',
];
/** iTunes-preview music: works without Spotify, so it is never hidden. */
const PREVIEW_MUSIC = ['playMusic', 'musicControl', 'musicInfo', 'musicProvider'];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function spotifyStub(input: unknown): Promise<Response> {
  const url = String(input);
  if (!/^https:\/\/(accounts|api)\.spotify\.com\//.test(url)) {
    throw new Error(`no network in this test: ${url}`);
  }
  world.spotifyCalls.push(url);
  await world.released;
  if (url.startsWith('https://accounts.spotify.com/api/token')) {
    return world.tokenReply === 'revoked'
      ? json(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' })
      : json(200, { access_token: 'a1', expires_in: 3600, token_type: 'Bearer' });
  }
  return json(200, { id: 'riley-test' }); // GET /v1/me
}

/** A worker start: fresh modules, the domain imported (its validation starts), then registered. */
async function startWorker(tokenReply: TokenReply) {
  world.tokenReply = tokenReply;
  vi.resetModules();
  const auth = await import('../../../../services/identity/spotify-auth.js');
  const entertainment = await import('../index.js');
  const { toolRegistry } = await import('../../../registry/index.js');
  toolRegistry.registerAll(entertainment.definitions); // what the domain loader does
  return { auth, entertainment, registry: toolRegistry };
}

const present = (registry: { has: (id: string) => boolean }, ids: string[]) =>
  ids.filter((id) => registry.has(id));
/** What a call holding a Spotify-only tool hears once Spotify is down (music-honesty.ts). */
const NOT_LINKED =
  "Spotify isn't connected right now, so I can only play short previews. I can't play from your own Spotify account.";
const ctx = {
  userId: 'riley-test-user',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  services: { has: () => false, get: () => undefined, getOptional: () => undefined },
} as unknown as ToolContext;
interface Held {
  execute: (args: Record<string, unknown>, opts?: unknown) => Promise<unknown>;
}
/** A live call's toolset, built from the registry the way the always-on fetcher does. */
const holdTools = (registry: ToolRegistry, ids: string[]) =>
  ids.map((id) => {
    const def = registry.get(id);
    if (!def) throw new Error(`${id} is not registered`);
    return def.create(ctx) as Held;
  });
const ARGS = { room: 'kitchen', query: 'Sunny Strum', action: 'transfer' };
const hiddenLogs = () => world.info.filter((line) => line.msg === 'SPOTIFY_TOOLS_HIDDEN');
/** Lets the startup validation's pending callbacks run. */
const tick = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

beforeEach(() => {
  world.spotifyCalls.length = 0;
  world.info.length = 0;
  world.hold();
  vi.stubGlobal('fetch', vi.fn(spotifyStub));
  vi.stubEnv('SPOTIFY_CLIENT_ID', 'test-id');
  vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'test-value');
  vi.stubEnv('SPOTIFY_REFRESH_TOKEN', 'house-refresh');
});

afterEach(async () => {
  world.release();
  const auth = await import('../../../../services/identity/spotify-auth.js');
  auth.stopAutoRefresh();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('flag on (SPOTIFY_TOOLS_HIDE_WHEN_DOWN=on)', () => {
  beforeEach(() => vi.stubEnv('SPOTIFY_TOOLS_HIDE_WHEN_DOWN', 'on'));

  it('a revoked token found by the startup validation takes every Spotify-only tool out of the registry', async () => {
    const { auth, entertainment, registry } = await startWorker('revoked');
    expect(present(registry, SPOTIFY_ONLY)).toEqual(SPOTIFY_ONLY); // before Spotify answers

    world.release();
    await vi.waitFor(() => expect(auth.isSpotifyRefreshRevoked()).toBe(true));

    expect(present(registry, SPOTIFY_ONLY)).toEqual([]);
    expect(present(registry, PREVIEW_MUSIC)).toEqual(PREVIEW_MUSIC);
    registry.registerAll(entertainment.definitions); // a domain reload is refused too
    expect(present(registry, SPOTIFY_ONLY)).toEqual([]);
    expect(world.spotifyCalls[0]).toMatch(/^https:\/\/accounts\.spotify\.com\/api\/token/);
  });

  it('a valid token keeps them', async () => {
    const { registry } = await startWorker('valid');
    world.release();
    await vi.waitFor(() => expect(world.spotifyCalls).toContain('https://api.spotify.com/v1/me'));
    await tick();

    expect(present(registry, SPOTIFY_ONLY)).toEqual(SPOTIFY_ONLY);
    expect(hiddenLogs()).toEqual([]);
  });

  it('logs the revocation once, words-free, however many starts and syncs follow', async () => {
    const { auth, entertainment } = await startWorker('revoked');
    world.release();
    await vi.waitFor(() => expect(auth.isSpotifyRefreshRevoked()).toBe(true));

    auth.startAutoRefresh();
    auth.startAutoRefresh();
    const gate = await import('../spotify-tool-gate.js');
    gate.syncSpotifyOnlyTools(entertainment.definitions);
    gate.syncSpotifyOnlyTools(entertainment.definitions);
    await tick();

    expect(hiddenLogs()).toEqual([
      {
        fields: { reason: 'revoked', toolCount: SPOTIFY_ONLY.length },
        msg: 'SPOTIFY_TOOLS_HIDDEN',
      },
    ]);
  });

  it('a newly stored token brings them back', async () => {
    const { auth, registry } = await startWorker('revoked');
    world.release();
    await vi.waitFor(() => expect(present(registry, SPOTIFY_ONLY)).toEqual([]));

    auth.storeSpotifyTokens('a2', 'new-refresh', 3600);

    expect(present(registry, SPOTIFY_ONLY)).toEqual(SPOTIFY_ONLY);
    expect(world.info.map((line) => line.msg)).toContain('SPOTIFY_TOOLS_RESTORED');
  });

  it('a call that already holds the tools gets the honest not-connected line, not a crash', async () => {
    const { auth, registry } = await startWorker('revoked');
    const held = holdTools(registry, SPOTIFY_ONLY); // the call started before Spotify answered

    world.release();
    await vi.waitFor(() => expect(present(registry, SPOTIFY_ONLY)).toEqual([]));
    const callsBefore = world.spotifyCalls.length;

    const replies = await Promise.all(held.map((tool) => tool.execute(ARGS)));
    expect(replies).toEqual(SPOTIFY_ONLY.map(() => NOT_LINKED));
    expect(world.spotifyCalls.length).toBe(callsBefore); // no Spotify attempt
    expect(auth.isSpotifyRefreshRevoked()).toBe(true);
  });

  it('two stored tokens in a row register each tool once, without a throw', async () => {
    const { auth, registry } = await startWorker('revoked');
    world.release();
    await vi.waitFor(() => expect(present(registry, SPOTIFY_ONLY)).toEqual([]));
    const registered: string[] = [];
    registry.on((event) => {
      if (event.type === 'tool_registered' && SPOTIFY_ONLY.includes(event.tool.id)) {
        registered.push(event.tool.id);
      }
    });

    auth.storeSpotifyTokens('a2', 'new-refresh', 3600);
    auth.storeSpotifyTokens('a3', 'newer-refresh', 3600);

    expect([...registered].sort()).toEqual([...SPOTIFY_ONLY].sort());
    expect(present(registry, SPOTIFY_ONLY)).toEqual(SPOTIFY_ONLY);
  });

  it('playMusicInRoom leaving frees a slot under the tool cap', async () => {
    const { auth, entertainment, registry } = await startWorker('revoked');
    world.release();
    await vi.waitFor(() => expect(auth.isSpotifyRefreshRevoked()).toBe(true));
    expect(isEssentialTool('playMusicInRoom')).toBe(true);
    const offered = Object.fromEntries(
      registry.query({ domains: ['entertainment'] }).map((def) => [def.id, def.id])
    );
    const nextInLine = { ...offered, nextInLine: 'nextInLine' };
    expect(entertainment.definitions.map((def) => def.id)).toContain('playMusicInRoom');
    const withRoom = { ...nextInLine, playMusicInRoom: 'playMusicInRoom' };
    const limit = Object.keys(nextInLine).length; // exactly what the hidden set needs

    expect(Object.keys(capToolsToLimit(nextInLine, limit))).toContain('nextInLine');
    expect(Object.keys(capToolsToLimit(withRoom, limit))).not.toContain('nextInLine');
    expect(offered).not.toHaveProperty('playMusicInRoom');
  });

  it('no Spotify configured: never registered, logged once as not_configured', async () => {
    vi.stubEnv('SPOTIFY_REFRESH_TOKEN', '');
    const { registry } = await startWorker('revoked');

    expect(present(registry, SPOTIFY_ONLY)).toEqual([]);
    expect(present(registry, PREVIEW_MUSIC)).toEqual(PREVIEW_MUSIC);
    expect(hiddenLogs()).toEqual([
      {
        fields: { reason: 'not_configured', toolCount: SPOTIFY_ONLY.length },
        msg: 'SPOTIFY_TOOLS_HIDDEN',
      },
    ]);
    expect(world.spotifyCalls).toEqual([]);
  });
});

describe('flag off (default)', () => {
  it('a revoked token leaves every tool registered, as on main, and logs nothing new', async () => {
    const { auth, entertainment, registry } = await startWorker('revoked');
    world.release();
    await vi.waitFor(() => expect(auth.isSpotifyRefreshRevoked()).toBe(true));

    expect(present(registry, SPOTIFY_ONLY)).toEqual(SPOTIFY_ONLY);
    const gated = entertainment.definitions.filter((def) => SPOTIFY_ONLY.includes(def.id));
    expect(gated.map((def) => def.availableWhen?.() ?? true)).toEqual(SPOTIFY_ONLY.map(() => true));
    expect(hiddenLogs()).toEqual([]);
    const [status] = holdTools(registry, ['spotifyStatus']); // runs as on main
    expect(await status.execute({})).not.toBe(NOT_LINKED);
  });
});
