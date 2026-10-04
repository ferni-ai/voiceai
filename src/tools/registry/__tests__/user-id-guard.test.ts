/**
 * User ID Guard Tests
 *
 * ToolRegistry.register() must make sure that for any tool whose arguments
 * include a `userId`, the REAL session identity (ctx.userId) always wins
 * over whatever the model put in its tool-call arguments. Without this, a
 * confused or prompt-injected model can read or write another user's data
 * through any of the ~70 tools that take `userId` as an LLM-supplied arg.
 *
 * These tests exercise the REAL ToolRegistry — register a definition, call
 * create(ctx), then execute(...) — never a reimplementation of the guard.
 *
 * Run with: npx vitest run src/tools/registry/__tests__/user-id-guard.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { warnMock } = vi.hoisted(() => ({ warnMock: vi.fn() }));

function makeLoggerStub() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: warnMock,
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: warnMock, error: vi.fn() })),
  };
}

vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => makeLoggerStub(),
  createLogger: () => makeLoggerStub(),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config: Record<string, unknown>) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// createGoal/getGoalsSummary (life-planning) best-effort persist to Firestore
// and sync to calendar; neither should be reachable (or needed) in a unit test.
vi.mock('../../../services/stores/life-data-store.js', () => ({
  getLifeDataStore: () => ({
    saveGoal: vi.fn(async () => {}),
    saveMilestone: vi.fn(async () => {}),
    savePortfolio: vi.fn(async () => {}),
  }),
}));
vi.mock('../../../services/calendar/calendar-bridge.js', () => ({
  syncGoalToCalendar: vi.fn(async () => {}),
  removeCalendarSyncedItem: vi.fn(async () => {}),
}));

import { ToolRegistry } from '../index.js';
import type { Tool, ToolContext, ToolDefinition } from '../types.js';

function requireDef(registry: ToolRegistry, id: string): ToolDefinition {
  const def = registry.get(id);
  if (def === undefined) {
    throw new Error(`Expected tool "${id}" to be registered`);
  }
  return def;
}

function createMockContext(userId: string, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId,
    agentId: 'test-agent',
    agentDisplayName: 'Test Agent',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
    ...overrides,
  };
}

interface EchoResult {
  received: Record<string, unknown>;
}

function makeToolDefinition(opts: {
  id: string;
  hasUserIdParam: boolean;
  execute?: (args: Record<string, unknown>) => unknown;
}): ToolDefinition {
  const execute =
    opts.execute ??
    (async (args: Record<string, unknown>): Promise<EchoResult> => ({ received: args }));

  const parameters = opts.hasUserIdParam
    ? z.object({ userId: z.string(), note: z.string().optional() })
    : z.object({ note: z.string().optional() });

  const tool: Tool = {
    description: `${opts.id} tool`,
    parameters,
    execute,
  };

  return {
    id: opts.id,
    name: opts.id,
    description: `${opts.id} description`,
    domain: 'memory',
    create: (_ctx: ToolContext) => tool,
  };
}

describe('ToolRegistry userId guard', () => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  // (a) ---------------------------------------------------------------------
  it('replaces a model-supplied userId with the session identity', async () => {
    const registry = new ToolRegistry();
    registry.register(makeToolDefinition({ id: 'toolA', hasUserIdParam: true }));

    const ctx = createMockContext('user-123');
    const tool = requireDef(registry, 'toolA').create(ctx);

    const result = (await tool.execute({ userId: 'Sam', note: 'hi' })) as EchoResult;

    expect(result.received.userId).toBe('user-123');
    expect(result.received.note).toBe('hi');
  });

  // (b) ---------------------------------------------------------------------
  it('still overrides the legacy `create: (_ctx) => tool` pattern that ignores context', async () => {
    // Mirrors finance/index.ts and life-planning/index.ts's wrapLegacyTool:
    // ONE shared tool object, reused across every create(ctx) call.
    const sharedTool: Tool = {
      description: 'legacy tool',
      parameters: z.object({ userId: z.string() }),
      execute: async (args: Record<string, unknown>): Promise<EchoResult> => ({ received: args }),
    };
    const definition: ToolDefinition = {
      id: 'legacyTool',
      name: 'Legacy Tool',
      description: 'legacy',
      domain: 'memory',
      create: (_ctx: ToolContext) => sharedTool,
    };

    const registry = new ToolRegistry();
    registry.register(definition);

    const toolForA = requireDef(registry, 'legacyTool').create(createMockContext('user-A'));
    const toolForB = requireDef(registry, 'legacyTool').create(createMockContext('user-B'));

    const resultA = (await toolForA.execute({ userId: 'attacker' })) as EchoResult;
    const resultB = (await toolForB.execute({ userId: 'attacker' })) as EchoResult;

    expect(resultA.received.userId).toBe('user-A');
    expect(resultB.received.userId).toBe('user-B');
    // the shared legacy tool object itself was never mutated in place
    expect(sharedTool.execute).not.toBe(toolForA.execute);
  });

  // (c) ---------------------------------------------------------------------
  it.each(['shared', 'anonymous', 'default', ''])(
    'leaves the model-supplied userId unchanged for placeholder ctx.userId=%j',
    async (placeholder) => {
      const toolId = `toolC_${placeholder || 'empty'}`;
      const registry = new ToolRegistry();
      registry.register(makeToolDefinition({ id: toolId, hasUserIdParam: true }));

      const ctx = createMockContext(placeholder);
      const tool = requireDef(registry, toolId).create(ctx);

      const result = (await tool.execute({ userId: 'model-supplied' })) as EchoResult;

      expect(result.received.userId).toBe('model-supplied');
    }
  );

  // (d) ---------------------------------------------------------------------
  it('passes args through unchanged for a tool with no userId parameter', async () => {
    const registry = new ToolRegistry();
    registry.register(makeToolDefinition({ id: 'toolD', hasUserIdParam: false }));

    const ctx = createMockContext('user-123');
    const tool = requireDef(registry, 'toolD').create(ctx);

    const args = { note: 'no user id here' };
    const result = (await tool.execute(args)) as EchoResult;

    expect(result.received).toEqual(args);
    expect(Object.prototype.hasOwnProperty.call(result.received, 'userId')).toBe(false);
  });

  // (e) ---------------------------------------------------------------------
  it('logs a mismatch warning without the raw userId values', async () => {
    const registry = new ToolRegistry();
    registry.register(makeToolDefinition({ id: 'toolE', hasUserIdParam: true }));

    const ctx = createMockContext('user-real-identity');
    const tool = requireDef(registry, 'toolE').create(ctx);

    await tool.execute({ userId: 'Sam-the-models-guess' });

    expect(warnMock).toHaveBeenCalledTimes(1);
    const [fields] = warnMock.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields.toolId).toBe('toolE');
    expect(fields.userIdOverridden).toBe(true);

    const serializedCall = JSON.stringify(warnMock.mock.calls[0]);
    expect(serializedCall).not.toContain('user-real-identity');
    expect(serializedCall).not.toContain('Sam-the-models-guess');
  });

  it('does not warn when the model-supplied userId already matches the session', async () => {
    const registry = new ToolRegistry();
    registry.register(makeToolDefinition({ id: 'toolE2', hasUserIdParam: true }));

    const ctx = createMockContext('user-real-identity');
    const tool = requireDef(registry, 'toolE2').create(ctx);

    await tool.execute({ userId: 'user-real-identity' });

    expect(warnMock).not.toHaveBeenCalled();
  });

  // (f) ---------------------------------------------------------------------
  it('passes through the async return value unchanged', async () => {
    const registry = new ToolRegistry();
    registry.register(
      makeToolDefinition({
        id: 'toolF',
        hasUserIdParam: true,
        execute: async (args: Record<string, unknown>) => {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 1);
          });
          return { ok: true, echoedUserId: args.userId };
        },
      })
    );

    const ctx = createMockContext('user-final');
    const tool = requireDef(registry, 'toolF').create(ctx);

    const result = await tool.execute({ userId: 'whoever-the-model-guessed' });

    expect(result).toEqual({ ok: true, echoedUserId: 'user-final' });
  });

  it('propagates a rejected execute promise', async () => {
    const registry = new ToolRegistry();
    registry.register(
      makeToolDefinition({
        id: 'toolFErr',
        hasUserIdParam: true,
        execute: async () => {
          throw new Error('boom');
        },
      })
    );

    const ctx = createMockContext('user-x');
    const tool = requireDef(registry, 'toolFErr').create(ctx);

    await expect(tool.execute({ userId: 'whoever' })).rejects.toThrow('boom');
  });

  // Idempotency ---------------------------------------------------------------
  it('is idempotent: re-registering an already-guarded definition does not stack another wrapper', () => {
    const registry = new ToolRegistry();
    registry.register(makeToolDefinition({ id: 'toolG', hasUserIdParam: true }));
    const wrappedCreateOnce = requireDef(registry, 'toolG').create;

    // Simulate re-registration with the definition the registry itself handed back
    // (already guarded), as happens during "parallel init" per registry/index.ts.
    registry.register(requireDef(registry, 'toolG'));
    const wrappedCreateTwice = requireDef(registry, 'toolG').create;

    expect(wrappedCreateTwice).toBe(wrappedCreateOnce);
  });

  // (g) ---------------------------------------------------------------------
  describe('real reachable tool: life-planning domain', () => {
    it('prevents a model-supplied userId from leaking another user’s goals through manageGoal/goalsSummary', async () => {
      const { getToolDefinitions } = await import('../../domains/life-planning/index.js');

      const registry = new ToolRegistry();
      const definitions = await getToolDefinitions();
      registry.registerAll(definitions);

      const manageGoalDef = requireDef(registry, 'manageGoal');
      const goalsSummaryDef = requireDef(registry, 'goalsSummary');

      const userAId = 'user-alpha-userid-guard-test';
      const userBId = 'user-beta-userid-guard-test';
      const userACtx = createMockContext(userAId);
      const userBCtx = createMockContext(userBId);

      // User A creates a goal. The orchestrator calls create(ctx) with the real
      // session context, but we simulate a model that supplied a DIFFERENT
      // (wrong) userId in the tool-call arguments.
      const createToolForA = manageGoalDef.create(userACtx);
      await createToolForA.execute({
        title: 'Secret goal belonging to user A',
        category: 'career',
        timeframe: 'annual',
        userId: 'not-user-a-id-from-the-model',
      });

      // User B's session asks for a goals summary; a confused/malicious model
      // passes User A's id as the userId argument, trying to read A's goals.
      const summaryToolForB = goalsSummaryDef.create(userBCtx);
      const resultForB = await summaryToolForB.execute({ userId: userAId });
      expect(String(resultForB)).not.toContain('Secret goal belonging to user A');

      // User A reading their own summary still sees it, even though the model
      // sent garbage for userId — proves the override, not just a block.
      const summaryToolForA = goalsSummaryDef.create(userACtx);
      const resultForA = await summaryToolForA.execute({ userId: 'someone-elses-id' });
      expect(String(resultForA)).toContain('Secret goal belonging to user A');
    });
  });
});
