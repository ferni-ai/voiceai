/**
 * A teammate the caller is handed to can set a timer, set a reminder and check
 * the weather, as shared-capabilities.md tells every teammate they can (#1128).
 *
 * The handoff path (setupPersonaAgent with isHandoff) took the Tool Gateway's
 * Tier 0, which has none of the three; with HANDOFF_FULL_TOOLS the essential set
 * has setReminder only. Each case runs the real setupPersonaAgent with a warmed
 * gateway, as gce/warmup.ts leaves it, and reads the set the cap is applied to.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  calls: [] as Array<{ before: string[]; after: string[]; handedTo: boolean }>,
}));
const STOP = 'stop after the tools';

vi.mock('../../personas/prompt-loader.js', () => ({
  loadModelBaseInstructions: vi.fn(async () => '## Honesty Rules\nNever invent memories.\n'),
  loadSystemPrompt: vi.fn(async () => '# Peter\nYou are Peter.'),
}));
vi.mock('../persona-tts.js', () => ({ createPersonaTTS: vi.fn(async () => ({})) }));
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
          if (prop === 'createLLMModel') {
            return async () => {
              throw new Error(STOP);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      }),
  };
});
// Calls through to the real builder; only records what it was given and returned.
vi.mock('../everyday-basics.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../everyday-basics.js')>();
  return {
    ...actual,
    withAlwaysOnTools: async (
      tools: Record<string, unknown>,
      ctx: Parameters<typeof actual.withAlwaysOnTools>[1],
      handedTo: boolean
    ) => {
      const out = await actual.withAlwaysOnTools(tools, ctx, handedTo);
      captured.calls.push({ before: Object.keys(tools), after: Object.keys(out), handedTo });
      return out;
    },
  };
});

const { setupPersonaAgent } = await import('../agent-setup.js');
const { getToolGateway } = await import('../../../tools/gateway/tool-gateway.js');
const { capToolsToLimit, getMaxTools } = await import('../../../config/tool-config.js');
const { resolveInitialToolLimit } = await import('../initial-tools.js');

const BASICS = ['quickTimer', 'setReminder', 'getWeather'];

/** Peter, handed the call by Ferni: the tool set before and after the always-on tools. */
async function handedToPeter(): Promise<{ before: string[]; after: string[]; capped: string[] }> {
  captured.calls.length = 0;
  await expect(
    setupPersonaAgent({
      persona: { id: 'peter-john', name: 'Peter' } as never,
      isHandoff: true,
      previousPersonaId: 'ferni',
      ctx: {} as never,
      room: { name: 'basics-room', on: vi.fn(), off: vi.fn() } as never,
      services: {
        userProfile: { totalConversations: 12, unlockedPersonas: ['ferni', 'peter-john'] },
      } as never,
      userData: { callerTimezone: 'America/New_York' } as never,
      userId: 'signed-in-person',
      sessionId: `basics-${Math.random()}`,
      enableFullHandlers: false,
      deferHandlers: true,
    })
  ).rejects.toThrow(STOP);
  expect(captured.calls).toHaveLength(1);
  const { before, after, handedTo } = captured.calls[0];
  expect(handedTo).toBe(true);
  const all = Object.fromEntries(after.map((name) => [name, {}]));
  const capped = Object.keys(capToolsToLimit(all, resolveInitialToolLimit(getMaxTools())));
  return { before, after, capped };
}

beforeAll(async () => {
  await getToolGateway().warmup(); // what gce/warmup.ts does at boot
}, 60_000);
afterEach(() => vi.unstubAllEnvs());

describe('a teammate the caller is handed to', () => {
  it('gets a timer, setReminder and getWeather on top of the gateway Tier 0', async () => {
    const { before, after, capped } = await handedToPeter();
    for (const name of BASICS) expect(before).not.toContain(name); // the gap
    expect(capped).toEqual(expect.arrayContaining(BASICS));
    expect(after.length - before.length).toBe(BASICS.length);
    process.stderr.write(`handed-to tools: ${before.length} -> ${after.length}\n`);
  }, 60_000);

  it('gets them on the HANDOFF_FULL_TOOLS essential set too, and the cap keeps them', async () => {
    vi.stubEnv('HANDOFF_FULL_TOOLS', 'on');
    const { before, after, capped } = await handedToPeter();
    expect(before).toContain('setReminder');
    expect(before).not.toContain('quickTimer');
    expect(before).not.toContain('getWeather');
    expect(capped).toEqual(expect.arrayContaining(BASICS));
    process.stderr.write(
      `HANDOFF_FULL_TOOLS tools: ${before.length} -> ${after.length}, capped ${capped.length}\n`
    );
  }, 60_000);
});
