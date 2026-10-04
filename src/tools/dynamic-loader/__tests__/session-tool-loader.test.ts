/**
 * A voice session's tools are built for that session's caller.
 *
 * Several calls run in one worker process. The loader used to be one shared
 * instance: each new session re-initialized it, and every session's later
 * tool builds used the last caller's user id. Tools that read ctx.userId at
 * build time (listRoutines, the family message tools, ...) then acted on
 * another caller's data. Unloading a domain also unregistered it from the
 * shared registry, stripping it from the other callers' next builds.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildToolSet = vi.fn((_filter: unknown, _ctx: { userId: string }) => ({ tools: {} }));
const unregister = vi.fn(() => true);

vi.mock('../../registry/index.js', () => ({
  toolRegistry: { buildToolSet, unregister, getByDomain: () => [{ id: 'listRoutines', domain: 'routines' }] },
}));
const loadToolDomain = vi.fn(async (_domain: string) => 3);
vi.mock('../../registry/loader.js', () => ({ loadToolDomain, isDomainLoaded: (d: string) => d === 'memory' }));

const { createSessionToolLoader } = await import('../index.js');

const session = (userId: string) => ({
  userId,
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  sessionId: `session-${userId}`,
  services: undefined,
});

describe('per-session tool loader', () => {
  beforeEach(() => {
    buildToolSet.mockClear();
    unregister.mockClear();
  });

  it("builds each session's tools for its own caller, whoever started last", async () => {
    const a = createSessionToolLoader({ essentialDomains: [], enableAutoUnload: false });
    const b = createSessionToolLoader({ essentialDomains: [], enableAutoUnload: false });
    await a.initialize(session('caller-a') as never);
    await b.initialize(session('caller-b') as never); // B starts after A

    a.getCurrentTools();
    b.getCurrentTools();

    const users = buildToolSet.mock.calls.map(([, ctx]) => ctx.userId);
    expect(users).toEqual(['caller-a', 'caller-b']);
  });

  it("unloading a domain leaves the shared registry alone", async () => {
    const a = createSessionToolLoader({ essentialDomains: [], enableAutoUnload: false });
    await a.initialize(session('caller-a') as never);
    await a.loadDomain('routines' as never);
    expect(await a.unloadDomain('routines' as never)).toBe(true);
    expect(a.isDomainLoaded('routines' as never)).toBe(false);
    expect(unregister).not.toHaveBeenCalled();
  });

  it('loads the whole catalog for retrieval and never unloads it mid-session', async () => {
    const a = createSessionToolLoader({ essentialDomains: [], enableAutoUnload: false, maxLoadedDomains: 2 });
    await a.initialize(session('caller-a') as never);
    const loaded = await a.loadAllDomains(['routines', 'games', 'music', 'weather'] as never);
    expect(loaded).toBe(4); // past maxLoadedDomains: nothing evicted
    expect(await a.unloadDomain('games' as never)).toBe(false);
    expect(a.getLoadedDomains()).toHaveLength(4);
  });

  it('every session has the essential tools, whatever domains its words loaded', async () => {
    loadToolDomain.mockClear();
    const a = createSessionToolLoader({
      essentialDomains: [],
      enableAutoUnload: false,
      essentialToolIds: ['quickTimer', 'quickAlarm', 'recallFromMemory'],
      domainOfTool: (id) => (id === 'recallFromMemory' ? 'memory' : 'simple-utilities') as never,
    });
    await a.initialize(session('caller-a') as never);
    // simple-utilities is registered for its essential tools; memory already was.
    expect(loadToolDomain.mock.calls.map((c) => c[0])).toEqual(['simple-utilities']);
    expect(a.isDomainLoaded('simple-utilities' as never)).toBe(false); // not its other 80 tools
    a.getCurrentTools();
    const [spec] = buildToolSet.mock.calls.at(-1)!;
    expect(spec).toEqual({ domains: [], optional: ['quickTimer', 'quickAlarm', 'recallFromMemory'] });
  });
});

