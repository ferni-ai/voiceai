/**
 * A tool whose credentials are unset is never registered, so no path (the
 * always-on Tier 0 fetcher included) can offer it; with the key set it is.
 * Prod tool audit 2026-10-17: four movie tools without TMDB_API_KEY and nine
 * Sonos tools without SONOS_CLIENT_ID sat in every agent's always-on set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logs = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => {
  const l = { debug: vi.fn(), info: logs.info, warn: vi.fn(), error: vi.fn(), child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) };
  return { getLogger: () => l, createLogger: () => l, safeLog: () => l };
});

import { ToolRegistry } from '../index.js';
import { missingEnv, requiringEnv, resetToolAvailabilityLog } from '../tool-availability.js';
import type { ToolDefinition } from '../types.js';
import { definitions as entertainmentDefs } from '../../domains/entertainment/index.js';
import { definitions as videoDefs } from '../../domains/video/index.js';

const KEYS = ['TMDB_API_KEY', 'SONOS_CLIENT_ID', 'SONOS_CLIENT_SECRET', 'FAKE_TOOL_KEY'];
const MOVIES = [
  'getMovieInfo',
  'getMoviesNowPlaying',
  'getUpcomingMovies',
  'getMovieShowtimes',
  'getWhereToWatch',
];
const SONOS = [
  'playSonosMusic',
  'playSonosFavorite',
  'pauseSonos',
  'resumeSonos',
  'setSonosVolume',
  'whatsSonosPlaying',
  'setSonosRoom',
  'listSonosRooms',
  'searchSonosFavorites',
];

const fake = (requiresEnv?: string[]): ToolDefinition => ({
  id: 'fakeKeyedTool',
  name: 'Fake',
  description: 'A tool that needs a key',
  domain: 'information',
  requiresEnv,
  create: () => ({ description: 'fake', execute: async () => 'ok' }),
});

function registered(defs: ToolDefinition[]): string[] {
  const registry = new ToolRegistry();
  registry.registerAll(defs);
  return registry.getAll().map((d) => d.id);
}

describe('requiresEnv availability', () => {
  beforeEach(() => {
    for (const k of KEYS) vi.stubEnv(k, '');
    resetToolAvailabilityLog();
    logs.info.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('a tool is not registered while its key is unset, and is once set', () => {
    expect(registered([fake(['FAKE_TOOL_KEY'])])).toEqual([]);
    vi.stubEnv('FAKE_TOOL_KEY', 'k');
    expect(registered([fake(['FAKE_TOOL_KEY'])])).toEqual(['fakeKeyedTool']);
  });

  it('a blank value counts as unset; tools with no requiresEnv are untouched', () => {
    vi.stubEnv('FAKE_TOOL_KEY', '   ');
    expect(missingEnv(fake(['FAKE_TOOL_KEY']))).toEqual(['FAKE_TOOL_KEY']);
    expect(registered([fake()])).toEqual(['fakeKeyedTool']);
  });

  it('logs a skipped tool once, with the names of the missing vars and no values', () => {
    registered([fake(['FAKE_TOOL_KEY'])]);
    registered([fake(['FAKE_TOOL_KEY'])]);
    const skips = logs.info.mock.calls.filter((c) => String(c[1]).startsWith('TOOL_UNAVAILABLE'));
    expect(skips).toHaveLength(1);
    expect(skips[0][0]).toEqual({
      toolId: 'fakeKeyedTool',
      domain: 'information',
      missingEnv: ['FAKE_TOOL_KEY'],
    });
  });

  it('TOOL_REQUIRES_ENV=off registers it anyway, as before', () => {
    vi.stubEnv('TOOL_REQUIRES_ENV', 'off');
    expect(registered([fake(['FAKE_TOOL_KEY'])])).toEqual(['fakeKeyedTool']);
  });

  it('requiringEnv adds to what a definition already needs', () => {
    const [def] = requiringEnv(['B'], [fake(['A'])]);
    expect(def.requiresEnv).toEqual(['A', 'B']);
  });

  it('without TMDB and Sonos keys, no movie or Sonos tool is offered', () => {
    const ids = registered([...entertainmentDefs, ...videoDefs]);
    for (const id of [...MOVIES, ...SONOS]) expect(ids).not.toContain(id);
    expect(ids).toContain('playMusic'); // the rest of both domains is unchanged
    expect(ids).toContain('searchYouTube');
  });

  it('with the keys set, the movie and Sonos tools are offered again', () => {
    vi.stubEnv('TMDB_API_KEY', 'tmdb');
    vi.stubEnv('SONOS_CLIENT_ID', 'id');
    vi.stubEnv('SONOS_CLIENT_SECRET', 'secret');
    const ids = registered([...entertainmentDefs, ...videoDefs]);
    for (const id of [...MOVIES, ...SONOS]) expect(ids).toContain(id);
    // The movie tools live in video, which a movie or TV topic loads (screen-topics.ts).
    for (const id of MOVIES) expect(videoDefs.find((d) => d.id === id)?.domain).toBe('video');
  });

  it('Sonos needs both halves of its OAuth client', () => {
    vi.stubEnv('SONOS_CLIENT_ID', 'id');
    const ids = registered(entertainmentDefs);
    for (const id of SONOS) expect(ids).not.toContain(id);
  });
});
