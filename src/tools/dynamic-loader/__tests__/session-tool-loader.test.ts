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
vi.mock('../../registry/loader.js', () => ({ loadToolDomain: vi.fn(async () => 3) }));

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
});
