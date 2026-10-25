/**
 * Alex, handed the call, has his planning tools as chief of staff
 * (ALEX_CHIEF_OF_STAFF=on, chief-of-staff-tools.ts), and the cap keeps them.
 *
 * What decides a handed-to persona's tools is the handoff path in
 * setupPersonaAgent (agent-setup.ts): with HANDOFF_FULL_TOOLS=on (prod), the
 * first agent's essential set; then withAlwaysOnTools; then the initial cap.
 * The persona manifest's tool block is never read there. Each case runs the
 * real setupPersonaAgent for alex-chen and reads the set the cap is applied to,
 * as everyday-basics.test.ts does for Peter.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ after: [] as string[][], prompts: [] as string[] }));
const STOP = 'stop after the tools';

vi.mock('../../personas/prompt-loader.js', () => ({
  loadModelBaseInstructions: vi.fn(async () => '## Honesty Rules\nNever invent memories.\n'),
  loadSystemPrompt: vi.fn(async () => '# Alex\nYou are Alex.'),
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
// Calls through to the real role; only records the prompt it gave Alex.
vi.mock('../../personas/chief-of-staff-role.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../personas/chief-of-staff-role.js')>();
  return {
    ...actual,
    withChiefOfStaffRole: async (personaId: string, prompt: string) => {
      const out = await actual.withChiefOfStaffRole(personaId, prompt);
      captured.prompts.push(out);
      return out;
    },
  };
});
// Calls through to the real builder; only records what it returned.
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
      captured.after.push(Object.keys(out));
      return out;
    },
  };
});

const { setupPersonaAgent } = await import('../agent-setup.js');
const { getToolGateway } = await import('../../../tools/gateway/tool-gateway.js');
const { capToolsToLimit, getMaxTools } = await import('../../../config/tool-config.js');
const { resolveInitialToolLimit } = await import('../initial-tools.js');

/** What Alex needs as chief of staff, by registry id (goals are manageGoal and goalsSummary). */
const PLANNING = [
  'addTask',
  'getTasks',
  'completeTask',
  'recordCommitment',
  'getCommitments',
  'completeCommitment',
  'getCalendarToday',
  'getCalendarWeek',
  'createCalendarEvent',
  'setReminder',
  'getReminders',
  'manageGoal',
  'goalsSummary',
];
/** Not in the essential set at all: the goal tools load only on the word "goal". */
const NOT_LOADED = ['manageGoal', 'goalsSummary'];
/** In the essential set, but not must-keep, so the 64-slot cap drops them. */
const CAPPED_OUT = ['completeTask', 'recordCommitment', 'getCommitments', 'completeCommitment'];

/** `persona`, handed the call by Ferni: its tools before the cap, and after it. */
async function handedTo(persona: string): Promise<{ tools: string[]; capped: string[] }> {
  captured.after.length = 0;
  captured.prompts.length = 0;
  await expect(
    setupPersonaAgent({
      persona: { id: persona, name: persona } as never,
      isHandoff: true,
      previousPersonaId: 'ferni',
      ctx: {} as never,
      room: { name: 'chief-room', on: vi.fn(), off: vi.fn() } as never,
      services: {
        userProfile: { totalConversations: 40, unlockedPersonas: ['ferni', 'alex-chen'] },
      } as never,
      userData: { callerTimezone: 'America/New_York' } as never,
      userId: 'signed-in-person',
      sessionId: `chief-${Math.random()}`,
      enableFullHandlers: false,
      deferHandlers: true,
    })
  ).rejects.toThrow(STOP);
  expect(captured.after).toHaveLength(1);
  const tools = captured.after[0];
  const all = Object.fromEntries(tools.map((name) => [name, {}]));
  const capped = Object.keys(capToolsToLimit(all, resolveInitialToolLimit(getMaxTools())));
  return { tools, capped };
}

beforeAll(async () => {
  await getToolGateway().warmup(); // what gce/warmup.ts does at boot
}, 60_000);
afterEach(() => vi.unstubAllEnvs());

describe('Alex handed the call, HANDOFF_FULL_TOOLS=on (prod)', () => {
  it('flag off: no chief-of-staff tools beyond what he had', async () => {
    vi.stubEnv('HANDOFF_FULL_TOOLS', 'on');
    const { tools, capped } = await handedTo('alex-chen');
    for (const name of NOT_LOADED) expect(tools, name).not.toContain(name);
    for (const name of [...NOT_LOADED, ...CAPPED_OUT]) expect(capped, name).not.toContain(name);
    expect(captured.prompts).toEqual(['# Alex\nYou are Alex.']);
  }, 60_000);

  it('flag on: every planning tool, and the cap keeps them', async () => {
    vi.stubEnv('HANDOFF_FULL_TOOLS', 'on');
    vi.stubEnv('ALEX_CHIEF_OF_STAFF', 'on');
    const { tools, capped } = await handedTo('alex-chen');
    expect(tools).toEqual(expect.arrayContaining(PLANNING));
    expect(capped).toEqual(expect.arrayContaining(PLANNING));
    expect(capped).toEqual(expect.arrayContaining(['quickTimer', 'setReminder', 'getWeather']));
    expect(captured.prompts).toHaveLength(1);
    expect(captured.prompts[0]).toMatch(/^# Alex\nYou are Alex\.\n\n## Chief of staff\n/);
    process.stderr.write(
      `Alex as chief of staff: ${tools.length} tools, capped ${capped.length}\n`
    );
  }, 60_000);

  it('flag on: another teammate gets none of them added', async () => {
    vi.stubEnv('HANDOFF_FULL_TOOLS', 'on');
    vi.stubEnv('ALEX_CHIEF_OF_STAFF', 'on');
    const { tools, capped } = await handedTo('maya-santos');
    for (const name of NOT_LOADED) expect(tools, name).not.toContain(name);
    vi.stubEnv('ALEX_CHIEF_OF_STAFF', 'off');
    const before = (await handedTo('maya-santos')).capped;
    process.stderr.write(
      `Maya capped, flag on vs off: +${capped.filter((n) => !before.includes(n))} -${before.filter((n) => !capped.includes(n))}\n`
    );
  }, 60_000);
});

describe('Alex handed the call on the gateway Tier 0 (HANDOFF_FULL_TOOLS off)', () => {
  it('flag on: every planning tool, and the cap keeps them', async () => {
    vi.stubEnv('ALEX_CHIEF_OF_STAFF', 'on');
    const { capped } = await handedTo('alex-chen');
    expect(capped).toEqual(expect.arrayContaining(PLANNING));
  }, 60_000);
});
