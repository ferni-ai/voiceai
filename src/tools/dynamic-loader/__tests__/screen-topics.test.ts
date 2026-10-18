/**
 * Asking about movies or shows reaches the movie and where-to-watch tools.
 *
 * Through a real session loader, the real domain loader and the real tool
 * registry (buildToolSet): the caller's words load the video domain, and the
 * tools offered to the agent mid-session (deferred-tool-update.ts) include
 * them. Before, they sat in entertainment, already loaded on every call, so
 * no topic re-offered them, and the first agent's 64-tool cap had cut them:
 * "is Severance on Netflix?" loaded nothing (local, 2026-10-17).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { capToolsToLimit } from '../../../config/tool-config.js';
import { DEFAULT_INITIAL_TOOL_LIMIT } from '../../../agents/multi-agent/initial-tools.js';
import { toolRegistry } from '../../registry/index.js';
import { autoRegisterAllDomains, loadToolDomainsLazy } from '../../registry/loader.js';
import { createSessionToolLoader } from '../index.js';

const SCREEN_TOOLS = [
  'getWhereToWatch',
  'getMoviesNowPlaying',
  'getUpcomingMovies',
  'getMovieInfo',
  'getMovieShowtimes',
];

async function sessionLoader() {
  const loader = createSessionToolLoader({ enableAutoUnload: false }); // the call's real essentials
  await loader.initialize({
    userId: 'caller-1',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    sessionId: 'session-1',
    services: undefined,
  });
  return loader;
}

/** The tools a topic load offers the agent mid-session. */
async function offeredFor(said: string): Promise<string[]> {
  const loader = await sessionLoader();
  const loaded = await loader.processMessage(said);
  return Object.keys(loader.getToolsForDomains(loaded));
}

beforeAll(async () => {
  vi.stubEnv('TMDB_API_KEY', 'tmdb-test-key'); // registered only with the key (tool-availability.ts)
  await autoRegisterAllDomains(); // job startup
  // First imports of these domains' modules take seconds; not what is under test.
  await loadToolDomainsLazy(['video', 'entertainment', 'play', 'memory', 'handoff', 'awareness']);
}, 180_000);

afterAll(() => vi.unstubAllEnvs());

describe('movie and TV asks reach the TMDB tools', () => {
  it.each([
    "what's playing at the movies tonight?",
    'is Severance on Netflix?',
    'where can I watch Dune?',
    'what should I watch tonight?',
    'is The Bear streaming anywhere?',
    'any good films in theaters right now?',
    'is it on Disney+ or Hulu?',
    'what time is the showtime for Wicked',
  ])(
    '"%s" offers them mid-session',
    async (said) => {
      const offered = await offeredFor(said);
      for (const id of SCREEN_TOOLS) expect(offered, id).toContain(id);
    },
    60_000
  );

  it.each([
    'play some music',
    'I had a long day at work',
    'the theater downtown was packed',
    'a series of meetings ran late',
  ])(
    '"%s" does not load them (no mid-turn tool swap)',
    async (said) => {
      expect(await offeredFor(said)).not.toContain('getWhereToWatch');
    },
    60_000
  );

  it('they live in video, not in entertainment, which every call loads up front', () => {
    const domainOf = (id: string) => toolRegistry.get(id)?.domain;
    for (const id of SCREEN_TOOLS) expect(domainOf(id), id).toBe('video');
  });

  it("the first agent's capped start-up set still leaves them to the topic", async () => {
    const loader = await sessionLoader();
    const start = Object.keys(
      capToolsToLimit(loader.getCurrentTools(), DEFAULT_INITIAL_TOOL_LIMIT)
    );
    expect(start).not.toContain('getWhereToWatch');
    expect(start).toContain('playMusic');
  }, 60_000);
});
