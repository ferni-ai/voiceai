/**
 * PRIVACY: tools built once per process run as each call's own caller.
 *
 * The Tier-0 gateway built its tools with `userId: 'gateway'` and the fast
 * path's essential tools with `userId: 'shared'`, once per process, and handed
 * them to every session. A tool keyed by its factory ctx.userId (Spotify rooms,
 * favourite teams, watchlist) then gave every caller one bucket. Here a tool
 * shaped like those runs as two members, then as two callers with no id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rooms = vi.hoisted(() => new Map<string, string>());
/** A tool keyed by its factory ctx.userId, like spotify-connect.ts's room tools. */
const roomDef = vi.hoisted(() => (id: string, domain = 'entertainment') => ({
  id,
  domain,
  create: (ctx: { userId: string }) => ({
    type: 'function',
    description: `${id} tool`,
    parameters: {},
    execute: async (args: { room?: string }) => {
      if (args.room) rooms.set(ctx.userId, args.room);
      return rooms.get(ctx.userId) ?? 'no rooms yet';
    },
  }),
}));

vi.mock('../../registry/loader.js', () => ({
  loadToolDomainsLazy: vi.fn(async () => 0),
  autoRegisterAllDomains: vi.fn(async () => undefined),
}));
vi.mock('../../registry/index.js', async () => {
  const { TIER_0_CRITICAL_TOOLS } = await import('../tool-tiers.generated.js');
  const defs = ['setMusicRoom', ...TIER_0_CRITICAL_TOOLS].map((id) => roomDef(id));
  return { toolRegistry: { getByDomain: (d: string) => (d === 'entertainment' ? defs : []) } };
});
vi.mock('../../builder.js', () => ({
  buildAgentTools: vi.fn(async () => ({})),
  buildEssentialTools: vi.fn(async ({ userId }: { userId: string }) => ({
    setMusicRoom: roomDef('setMusicRoom').create({ userId }),
  })),
}));

import { getToolGateway, resetToolGateway } from '../index.js';
import { getToolsForAgent } from '../../orchestrator/voice-agent-integration.js';

type Run = (args: { room?: string }, opts: unknown) => Promise<string>;

/** LiveKit's tool options: the caller is the call's own userData.userId. */
const as = (userId?: string) => ({ ctx: { userData: userId ? { userId } : {} }, toolCallId: 't' });

beforeEach(() => {
  rooms.clear();
  resetToolGateway();
});

describe('Tier-0 gateway tools', () => {
  async function gatewayTool(): Promise<Run> {
    const gateway = getToolGateway();
    await gateway.warmup();
    const tool = gateway.getSessionTools().setMusicRoom as { execute: Run; description: string };
    expect(tool.description).toBe('setMusicRoom tool');
    return (args, opts) => tool.execute(args, opts);
  }

  it('run as each member: one never reads the other', async () => {
    const run = await gatewayTool();
    await run({ room: 'Kitchen' }, as('uid-alice'));

    expect(await run({}, as('uid-bob'))).toBe('no rooms yet');
    expect(await run({}, as('uid-alice'))).toBe('Kitchen');
    expect([...rooms.keys()]).toEqual(['uid-alice']);
  });

  it('two callers without an id never share a bucket', async () => {
    const run = await gatewayTool();
    await run({ room: 'Bedroom' }, as(undefined));

    expect(await run({}, as('unknown'))).toBe('no rooms yet');
    expect(rooms.has('gateway')).toBe(false);
    expect([...rooms.keys()].every((id) => id.startsWith('anon:'))).toBe(true);
  });
});

describe('fast-path essential tools', () => {
  async function essentialTool(userId: string): Promise<Run> {
    const { tools } = await getToolsForAgent({
      persona: { id: 'ferni', name: 'Ferni' },
      userId,
      fastPath: true,
    } as Parameters<typeof getToolsForAgent>[0]);
    const tool = tools.setMusicRoom as { execute: Run };
    return (args, opts) => tool.execute(args, opts);
  }

  it("are built for the caller, so one member's rooms stay theirs", async () => {
    await (await essentialTool('uid-alice'))({ room: 'Kitchen' }, as('uid-alice'));

    expect(await (await essentialTool('uid-bob'))({}, as('uid-bob'))).toBe('no rooms yet');
    expect([...rooms.keys()]).toEqual(['uid-alice']);
  });

  it('never build for a placeholder id', async () => {
    await (await essentialTool('anonymous'))({ room: 'Den' }, as('anonymous'));

    expect(rooms.has('shared')).toBe(false);
    expect(rooms.has('anonymous')).toBe(false);
  });
});
