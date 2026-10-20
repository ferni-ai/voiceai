/**
 * SPECIALIST_TOOLS: a specialist handed the call gets its own specialty tools,
 * the safety core, and the handoffs, within the 64-tool cap.
 *
 * Each case runs the real setupPersonaAgent handoff path (as everyday-basics
 * and chief-of-staff-tools tests do) with a warmed gateway, and reads the set
 * withAlwaysOnTools hands to the cap. The run stops at createLLMModel, before
 * agent-setup.ts appends findTools (live retrieval) and endCall (on-behalf calls)
 * past the cap, so the final count is checked as that set plus those two, and
 * the cap itself is applied to show it drops nothing.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  calls: [] as Array<{ before: string[]; after: string[]; ctx: unknown; handedTo: boolean }>,
}));
const STOP = 'stop after the tools';

vi.mock('../../personas/prompt-loader.js', () => ({
  loadModelBaseInstructions: vi.fn(async () => '## Honesty Rules\nNever invent memories.\n'),
  loadSystemPrompt: vi.fn(async () => '# Teammate\nYou are a teammate.'),
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
      captured.calls.push({ before: Object.keys(tools), after: Object.keys(out), ctx, handedTo });
      return out;
    },
  };
});

const { setupPersonaAgent } = await import('../agent-setup.js');
const { getToolGateway } = await import('../../../tools/gateway/tool-gateway.js');
const { capToolsToLimit, getMaxTools, isTeammateTool } =
  await import('../../../config/tool-config.js');
const { resolveInitialToolLimit } = await import('../initial-tools.js');
const { withEverydayBasics } = await import('../everyday-basics.js');
const { withAlwaysOnInfoTools } = await import('../always-on-info-tools.js');
const { withChiefOfStaffTools } = await import('../chief-of-staff-tools.js');
const { SPECIALIST_TOOL_SETS } = await import('../specialist-tool-sets.js');

const SPECIALISTS = Object.keys(SPECIALIST_TOOL_SETS);
const TEAM = ['ferni', ...SPECIALISTS];
const SAFETY = [
  'provideCrisisResources',
  'quickCrisisResources',
  'createSafetyPlan',
  'evaluateHumanTransfer',
  'connectToHumanExpert',
  'groundingForTrauma',
  'recallFromMemory',
  'rememberAboutUser',
  // what shared-capabilities.md tells every teammate they can do
  'playMusic',
  'musicControl',
  'quickTimer',
  'quickAlarm',
  'setReminder',
  'getWeather',
];
const ADDED_AFTER_CAP = ['findTools', 'endCall'];
const HARD_CAP = 64;

interface Run {
  before: string[];
  after: string[];
  capped: string[];
  ctx: unknown;
}

/** `persona`, handed the call by Ferni: the set given to and returned by withAlwaysOnTools. */
async function handedTo(persona: string): Promise<Run> {
  captured.calls.length = 0;
  await expect(
    setupPersonaAgent({
      persona: { id: persona, name: persona } as never,
      isHandoff: true,
      previousPersonaId: 'ferni',
      ctx: {} as never,
      room: { name: 'specialist-room', on: vi.fn(), off: vi.fn() } as never,
      services: {
        userProfile: { totalConversations: 40, unlockedPersonas: TEAM },
      } as never,
      userData: { callerTimezone: 'America/New_York' } as never,
      userId: 'signed-in-person',
      sessionId: `specialist-${Math.random()}`,
      enableFullHandlers: false,
      deferHandlers: true,
    })
  ).rejects.toThrow(STOP);
  expect(captured.calls).toHaveLength(1);
  const { before, after, ctx, handedTo: handed } = captured.calls[0];
  expect(handed).toBe(true);
  const all = Object.fromEntries(after.map((name) => [name, {}]));
  const capped = Object.keys(capToolsToLimit(all, resolveInitialToolLimit(getMaxTools())));
  return { before, after, capped, ctx };
}

/** The always-on pipeline as it was before SPECIALIST_TOOLS, run on the same input. */
async function oldPipeline(run: Run): Promise<string[]> {
  const ctx = run.ctx as Parameters<typeof withEverydayBasics>[1];
  const input = Object.fromEntries(run.before.map((name) => [name, {}]));
  const withInfo = await withAlwaysOnInfoTools(input, ctx);
  return Object.keys(await withChiefOfStaffTools(await withEverydayBasics(withInfo, ctx), ctx));
}

beforeAll(async () => {
  await getToolGateway().warmup(); // what gce/warmup.ts does at boot
}, 60_000);
afterEach(() => vi.unstubAllEnvs());

describe('SPECIALIST_TOOLS=on, handed the call on the essential set (HANDOFF_FULL_TOOLS=on)', () => {
  it.each(SPECIALISTS)(
    '%s: every specialty tool, the safety core and the handoffs, within 64',
    async (persona) => {
      vi.stubEnv('HANDOFF_FULL_TOOLS', 'on');
      const off = await handedTo(persona);
      vi.stubEnv('SPECIALIST_TOOLS', 'on');
      const run = await handedTo(persona);
      const specialty = Object.keys(SPECIALIST_TOOL_SETS[persona]);
      const finalCount = run.after.filter((n) => !ADDED_AFTER_CAP.includes(n)).length + 2;
      expect(finalCount).toBeLessThanOrEqual(HARD_CAP);
      expect(run.capped).toEqual(run.after); // the cap drops nothing
      expect(run.after).toEqual(expect.arrayContaining(specialty));
      expect(run.after).toEqual(expect.arrayContaining(SAFETY));
      const teammates = off.capped.filter(isTeammateTool);
      expect(teammates).toContain('handoffToFerni');
      expect(run.after).toEqual(expect.arrayContaining(teammates));
      const lostWhenOff = specialty.filter((n) => !off.capped.includes(n));
      expect(lostWhenOff.length).toBeGreaterThan(0); // the gap this flag closes
      process.stderr.write(
        `${persona}: on ${run.after.length} (<= ${finalCount} final), off ${off.after.length} capped ${off.capped.length}, specialty missing when off ${lostWhenOff.length}/${specialty.length}\n`
      );
    },
    60_000
  );

  it('Ferni keeps exactly the set he had', async () => {
    vi.stubEnv('HANDOFF_FULL_TOOLS', 'on');
    const off = await handedTo('ferni');
    vi.stubEnv('SPECIALIST_TOOLS', 'on');
    const on = await handedTo('ferni');
    expect(on.after).toEqual(off.after);
  }, 60_000);

  it('alex-chen keeps the chief-of-staff tools with ALEX_CHIEF_OF_STAFF on too', async () => {
    vi.stubEnv('HANDOFF_FULL_TOOLS', 'on');
    vi.stubEnv('SPECIALIST_TOOLS', 'on');
    vi.stubEnv('ALEX_CHIEF_OF_STAFF', 'on');
    const { CHIEF_OF_STAFF_TOOLS } = await import('../../../config/alex-chief-of-staff-flag.js');
    const run = await handedTo('alex-chen');
    expect(run.after).toEqual(expect.arrayContaining([...CHIEF_OF_STAFF_TOOLS]));
    expect(run.after.length + 2).toBeLessThanOrEqual(HARD_CAP);
  }, 60_000);
});

describe('SPECIALIST_TOOLS=on, handed the call on the gateway Tier 0', () => {
  it('maya-santos gains the crisis and human-transfer tools Tier 0 lacks', async () => {
    vi.stubEnv('SPECIALIST_TOOLS', 'on');
    const run = await handedTo('maya-santos');
    expect(run.before).not.toContain('provideCrisisResources'); // the Tier 0 gap
    expect(run.after).toEqual(expect.arrayContaining(SAFETY));
    expect(run.after).toEqual(
      expect.arrayContaining(Object.keys(SPECIALIST_TOOL_SETS['maya-santos']))
    );
    expect(run.capped).toEqual(run.after);
  }, 60_000);
});

describe('SPECIALIST_TOOLS off', () => {
  const cases = ['ferni', ...SPECIALISTS].flatMap((p) => [
    [p, 'off'],
    [p, 'unset'],
  ]);
  it.each(cases)(
    '%s, flag %s: the set equals the old always-on pipeline',
    async (p, value) => {
      vi.stubEnv('HANDOFF_FULL_TOOLS', 'on');
      if (value === 'off') vi.stubEnv('SPECIALIST_TOOLS', 'off');
      const run = await handedTo(p);
      expect(run.after.length).toBeGreaterThan(64); // the uncapped set, not a trimmed one
      expect(run.after).toEqual(await oldPipeline(run));
    },
    60_000
  );
});
