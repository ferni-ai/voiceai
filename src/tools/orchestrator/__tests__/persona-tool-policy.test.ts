/**
 * PERSONA_TOOL_POLICY: a persona's manifest `tools.forbidden` reaches its tool set.
 *
 * Before: getToolsForAgent read `persona.tools.forbidden`, but every caller
 * passed only `{id, displayName}` and the fast path never filtered, so the rule
 * was dead. Reads the real manifests. Mocked: the tool builders and the domain
 * loader (the catalog side), so each path's output is a fixed, known record.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const FORBIDDEN_BY_SOMEONE = ['dayTrade', 'analyzeStock', 'makeInvestment', 'createHabit'];
const PROTECTED = [
  'provideCrisisResources',
  'quickCrisisResources',
  'groundingExercise',
  'forgetMemory',
  'updateMemory',
  'endCall',
  'handoffToMaya',
  'handoffToFerni',
  'meetTheTeam',
];
const ORDINARY = ['playMusic', 'getWeather', 'logHabitCompletion'];

const record = (names: string[]) => Object.fromEntries(names.map((n) => [n, { name: n }]));

const policyLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (bindings: Record<string, unknown>) =>
      bindings.module === 'PersonaToolPolicy' ? policyLog : actual.createLogger(bindings),
  };
});
vi.mock('../../builder.js', () => ({
  buildEssentialTools: vi.fn(async () => record([...FORBIDDEN_BY_SOMEONE, ...ORDINARY])),
  buildAgentTools: vi.fn(async () => record(['provideCrisisResources', 'forgetMemory'])),
}));
vi.mock('../../handoff/handoff-factory.js', () => ({
  buildHandoffTools: vi.fn(async () => ({
    tools: record(PROTECTED.filter((n) => !['provideCrisisResources', 'forgetMemory'].includes(n))),
  })),
}));
vi.mock('../../registry/loader.js', () => ({
  loadToolDomainsLazy: vi.fn(async () => 0),
  autoRegisterAllDomains: vi.fn(async () => undefined),
}));

const PERSONAS = [
  'ferni',
  'alex-chen',
  'maya-santos',
  'jordan-taylor',
  'peter-john',
  'nayan-patel',
];

async function load(flag: string) {
  vi.resetModules();
  vi.stubEnv('PERSONA_TOOL_POLICY', flag);
  const policy = await import('../persona-tool-policy.js');
  const { getToolsForAgent } = await import('../voice-agent-integration.js');
  return { ...policy, getToolsForAgent };
}

/** Both paths that run without an initialized orchestrator: fast and legacy. */
async function toolNames(personaId: string, flag: string, path: 'fast' | 'legacy') {
  const { getToolsForAgent } = await load(flag);
  const { tools } = await getToolsForAgent({
    persona: { id: personaId, displayName: personaId },
    userId: 'u1',
    fastPath: path === 'fast',
    useLegacy: path === 'legacy',
  });
  return Object.keys(tools);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('flag off: unchanged', () => {
  it('no policy, and the tool record comes back as the same object', async () => {
    const { personaToolPolicy, applyPersonaToolPolicy } = await load('off');
    for (const id of PERSONAS) {
      expect(await personaToolPolicy(id)).toBeUndefined();
      const tools = record(FORBIDDEN_BY_SOMEONE);
      expect(await applyPersonaToolPolicy(tools, id)).toBe(tools);
    }
  });

  it.each(['fast', 'legacy'] as const)(
    'getToolsForAgent (%s path) keeps every tool',
    async (path) => {
      const names = await toolNames('ferni', 'off', path);
      for (const n of ['dayTrade', 'createHabit', 'logHabitCompletion']) expect(names).toContain(n);
    }
  );
});

describe('flag on: each persona loses its forbidden tools', () => {
  it('reads the real manifests', async () => {
    const { personaToolPolicy } = await load('on');
    expect((await personaToolPolicy('ferni'))?.forbidden).toEqual([
      'dayTrade',
      'analyzeStock',
      'makeInvestment',
      'createHabit',
      'logHabitCompletion',
    ]);
    expect((await personaToolPolicy('maya-santos'))?.forbidden).toEqual([
      'dayTrade',
      'analyzeStock',
      'makeInvestment',
    ]);
    // A short alias resolves to the bundle
    expect((await personaToolPolicy('alex'))?.forbidden).toContain('createHabit');
  });

  it.each(['fast', 'legacy'] as const)('getToolsForAgent (%s path) drops them', async (path) => {
    const names = await toolNames('ferni', 'on', path);
    for (const n of ['dayTrade', 'analyzeStock', 'createHabit', 'logHabitCompletion']) {
      expect(names).not.toContain(n);
    }
    expect(names).toContain('playMusic');
  });

  it('maya keeps the habit tools ferni loses', async () => {
    const names = await toolNames('maya-santos', 'on', 'fast');
    expect(names).toContain('logHabitCompletion');
    expect(names).not.toContain('dayTrade');
  });

  it('applyPersonaToolPolicy (the multi-agent set) drops them per persona', async () => {
    const { applyPersonaToolPolicy } = await load('on');
    const all = record([...FORBIDDEN_BY_SOMEONE, ...ORDINARY]);
    expect(Object.keys(await applyPersonaToolPolicy(all, 'peter-john'))).toEqual(
      expect.not.arrayContaining(['dayTrade', 'createHabit'])
    );
    expect(Object.keys(await applyPersonaToolPolicy(all, 'peter-john'))).toContain('analyzeStock');
    expect(Object.keys(all)).toContain('dayTrade'); // the caller's record is never mutated
  });
});

describe('crisis, privacy, handoff and endCall tools are always present', () => {
  // A manifest that forbids a protected tool: persona-tool-policy-midcall.test.ts
  it('joel-dickson keeps every protected tool and loses only dayTrade', async () => {
    const { personaToolPolicy, applyPersonaToolPolicy } = await load('on');
    expect((await personaToolPolicy('joel-dickson'))?.forbidden).toEqual(['dayTrade']);

    const kept = Object.keys(await applyPersonaToolPolicy(record(PROTECTED), 'joel-dickson'));
    expect(kept).toEqual(PROTECTED);
  });

  it('an explicit forbidden list naming protected tools never removes them', async () => {
    const { getToolsForAgent } = await load('off');
    const { tools } = await getToolsForAgent({
      persona: { id: 'ferni', tools: { forbidden: [...PROTECTED, 'dayTrade'] } },
      userId: 'u1',
      fastPath: true,
    });
    for (const n of PROTECTED.filter(
      (p) => p !== 'provideCrisisResources' && p !== 'forgetMemory'
    )) {
      expect(Object.keys(tools)).toContain(n);
    }
    expect(Object.keys(tools)).not.toContain('dayTrade');
  });

  it.each(PERSONAS)('%s keeps every protected tool with the flag on', async (id) => {
    const { applyPersonaToolPolicy } = await load('on');
    const kept = Object.keys(await applyPersonaToolPolicy(record(PROTECTED), id));
    expect(kept).toEqual(PROTECTED);
  });
});
