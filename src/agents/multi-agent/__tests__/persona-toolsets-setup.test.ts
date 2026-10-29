/**
 * PERSONA_TOOLSETS through the real agent build: the tools setupPersonaAgent
 * gives the agent are the persona set with the flag on, and today's capped set
 * with it off, for Ferni's first agent and for Ferni handing the call to Maya.
 *
 * Drives the real setup with real tool loading (as specialist-tools.test.ts
 * does); only prompts, TTS, the orchestrator's tool pick and the LLM are
 * stubbed. withAlwaysOnTools is wrapped only to record its input, so the
 * expected sets are computed from exactly what the build loaded.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ inputs: [] as Array<Record<string, unknown>> }));

vi.mock('../../personas/prompt-loader.js', () => ({
  loadModelBaseInstructions: vi.fn(async () => '## Honesty Rules\nNever invent memories.\n'),
  loadSystemPrompt: vi.fn(async () => '# Teammate\nYou are a teammate.'),
}));
vi.mock('../persona-tts.js', () => ({ createPersonaTTS: vi.fn(async () => ({ on: () => {} })) }));
vi.mock('../../../tools/orchestrator/voice-agent-integration.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getToolsForAgent: vi.fn(async () => ({
    tools: {},
    meta: { toolCount: 0, mode: 'test', selectionTimeMs: 0 },
  })),
}));
vi.mock('../../model-provider/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../model-provider/index.js')>();
  const provider = actual.getModelProvider();
  return {
    ...actual,
    getModelProvider: () =>
      new Proxy(provider, {
        get(target, prop, receiver) {
          if (prop === 'createLLMModel') return async () => ({ on: () => undefined });
          return Reflect.get(target, prop, receiver);
        },
      }),
  };
});
vi.mock('../everyday-basics.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../everyday-basics.js')>();
  return {
    ...actual,
    withAlwaysOnTools: async (
      tools: Record<string, unknown>,
      ...rest: [Parameters<typeof actual.withAlwaysOnTools>[1], boolean]
    ) => {
      seen.inputs.push({ ...tools });
      return actual.withAlwaysOnTools(tools, ...rest);
    },
  };
});

const { setupPersonaAgent } = await import('../agent-setup.js');
const { getToolGateway } = await import('../../../tools/gateway/tool-gateway.js');
const { capToolsToLimit } = await import('../../../config/tool-config.js');
const { withAlwaysOnTools } = await import('../everyday-basics.js');
const { withTeammateTool } = await import('../../../tools/handoff/locked-teammates.js');
const { withPersonaToolset, SAFETY_TOOLS, PERSONA_TOOLSET_MAX, toolPicksFor } =
  await import('../persona-toolsets.js');

const TEAM = ['ferni', 'maya-santos', 'peter-john', 'alex-chen', 'jordan-taylor', 'nayan-patel'];

interface Built {
  offered: string[];
  input: Record<string, unknown>;
  ctx: { userId: string; sessionId: string; agentId: string; agentDisplayName: string };
}

/** setupPersonaAgent for `persona`: the first agent, or handed the call by Ferni. */
async function build(persona: string, handoff: boolean): Promise<Built> {
  seen.inputs.length = 0;
  const sessionId = `persona-sets-${Math.random()}`;
  const { agent } = await setupPersonaAgent({
    persona: { id: persona, name: persona } as never,
    isHandoff: handoff,
    previousPersonaId: handoff ? 'ferni' : undefined,
    ctx: {} as never,
    room: {
      name: 'persona-sets-room',
      on: vi.fn(),
      off: vi.fn(),
      remoteParticipants: new Map(),
    } as never,
    services: { userProfile: { totalConversations: 40, unlockedPersonas: TEAM } } as never,
    userData: { callerTimezone: 'America/New_York' } as never,
    userId: 'signed-in-person',
    sessionId,
    enableFullHandlers: false,
    deferHandlers: true,
    callSession: Object.assign(new EventEmitter(), { say: () => undefined }) as never,
  });
  expect(seen.inputs).toHaveLength(1);
  const tools = (agent as unknown as { toolCtx: { functionTools: Record<string, unknown> } })
    .toolCtx.functionTools;
  const ctx = {
    userId: 'signed-in-person',
    sessionId,
    agentId: persona,
    agentDisplayName: persona,
  };
  return { offered: Object.keys(tools), input: seen.inputs[0], ctx };
}

/** Today's set from the same input: the always-on pipeline, the 64 cap, then askForTeammate. */
async function todaysSet(run: Built, handoff: boolean): Promise<string[]> {
  const capped = capToolsToLimit(await withAlwaysOnTools(run.input, run.ctx, handoff), 64);
  return Object.keys(withTeammateTool(capped));
}

beforeAll(async () => {
  await getToolGateway().warmup(); // what gce/warmup.ts does at boot
}, 60_000);
afterEach(() => vi.unstubAllEnvs());

describe.each([
  ['Ferni, first agent', 'ferni', false],
  ['Ferni hands the call to Maya', 'maya-santos', true],
] as const)('%s', (_, persona, handoff) => {
  it('flag on: the agent is offered exactly the persona set', async () => {
    vi.stubEnv('HANDOFF_FULL_TOOLS', 'on'); // prod
    vi.stubEnv('PERSONA_TOOLSETS', 'on');
    const run = await build(persona, handoff);
    const expected = Object.keys(await withPersonaToolset(run.input, run.ctx));
    expect(run.offered).toEqual(expected);
    expect(run.offered.length).toBeLessThanOrEqual(PERSONA_TOOLSET_MAX);
    expect(run.offered.slice(0, SAFETY_TOOLS.length)).toEqual(SAFETY_TOOLS);
    expect(run.offered).toEqual(expect.arrayContaining([...toolPicksFor(persona).beat]));
    expect(run.offered.some((n) => n.startsWith('handoffTo'))).toBe(true);
    process.stderr.write(
      `${persona} on: ${run.offered.length} offered (input ${Object.keys(run.input).length})\n`
    );
  }, 60_000);

  it('flag off: the agent is offered today’s set', async () => {
    vi.stubEnv('HANDOFF_FULL_TOOLS', 'on');
    const run = await build(persona, handoff);
    expect(run.offered).toEqual(await todaysSet(run, handoff));
    expect(run.offered.length).toBeGreaterThan(PERSONA_TOOLSET_MAX);
    process.stderr.write(`${persona} off: ${run.offered.length} offered\n`);
  }, 60_000);
});
