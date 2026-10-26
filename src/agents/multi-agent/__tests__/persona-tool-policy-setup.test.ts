/**
 * PERSONA_TOOL_POLICY follows the agent setupPersonaAgent builds, not the
 * persona `userData.personaId` names. A handoff sets userData only after the
 * swap, while the SDK already runs the new agent, so a policy read from userData
 * gave the teammate the previous persona's policy (Maya lost her habit tools).
 *
 * Drives the real setup, as mind-note-setup-wiring.test.ts does: only its slow or
 * networked edges (prompts, TTS, tool loading, the LLM) are stubbed. The policy
 * reads the real persona manifests.
 */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../personas/prompt-loader.js', () => ({
  loadModelBaseInstructions: async () => 'You are a teammate.',
  loadSystemPrompt: async () => 'Teammate system prompt.',
}));
vi.mock('../persona-tts.js', () => ({ createPersonaTTS: async () => ({ on: () => undefined }) }));
vi.mock('../../../tools/orchestrator/voice-agent-integration.js', () => ({
  getToolsForAgent: async () => ({ tools: {}, meta: {} }),
  initializeToolOrchestrator: async () => undefined,
  isOrchestratorInitialized: () => true,
}));
vi.mock('../emergency-toolset.js', () => ({ buildEmergencyToolset: () => ({}) }));
vi.mock('../essential-tool-set.js', () => ({
  buildEssentialToolSet: async () => ({ tools: {}, handoffTools: {}, essentialTools: {} }),
}));
vi.mock('../../model-provider/index.js', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const provider = {
    createLLMModel: async () => ({ on: () => undefined }),
    getPromptModules: () => [],
  };
  return {
    ...real,
    getModelProvider: () =>
      new Proxy(provider, {
        get: (t, k) => (t as Record<string | symbol, unknown>)[k] ?? (() => undefined),
      }),
  };
});

const { setupPersonaAgent } = await import('../agent-setup.js');
const { forbiddenToolsFor } = await import('../../../tools/orchestrator/persona-tool-policy.js');

const NAMES: Record<string, string> = {
  ferni: 'Ferni',
  'maya-santos': 'Maya',
  'peter-john': 'Peter',
};

/** setupPersonaAgent for `to`, handed the call by `from`: userData still names `from`. */
async function handOff(from: string, to: string) {
  const sessionId = `policy-${from}-${to}`;
  const userData = { userName: 'Sam', personaId: from };
  const config = {
    persona: { id: to, name: NAMES[to], displayName: NAMES[to] },
    isHandoff: true,
    previousPersonaId: from,
    ctx: {},
    room: {
      localParticipant: undefined,
      on: () => undefined,
      off: () => undefined,
      remoteParticipants: new Map(),
    },
    services: { sessionId, userId: 'policy-user', userProfile: null },
    userData,
    sessionId,
    userId: 'policy-user',
    enableFullHandlers: false,
    deferHandlers: true,
    callSession: Object.assign(new EventEmitter(), { say: () => undefined }),
  } as unknown as Parameters<typeof setupPersonaAgent>[0];
  const { agent } = await setupPersonaAgent(config);
  return { agent, userData };
}

afterEach(() => vi.unstubAllEnvs());

describe("the agent setup builds carries its own persona's tool policy", () => {
  it.each([
    ['ferni', 'maya-santos'],
    ['maya-santos', 'ferni'],
    ['maya-santos', 'peter-john'],
  ])(
    '%s hands to %s: the new agent gets the new persona policy',
    async (from, to) => {
      vi.stubEnv('PERSONA_TOOL_POLICY', 'on');
      vi.stubEnv('MEMORY_RECALL', 'off');
      vi.stubEnv('TURN_INTELLIGENCE', 'off');
      const { agent, userData } = await handOff(from, to);

      const own = await forbiddenToolsFor(to);
      const previous = await forbiddenToolsFor(from);
      expect(own).not.toEqual(previous); // the two policies differ, so the key matters
      expect(userData.personaId).toBe(from); // the swap hasn't set it yet

      expect(await forbiddenToolsFor(agent)).toEqual(own);
    },
    60_000
  );

  it('Maya keeps the habit tools Ferni forbids, and Ferni does not get them', async () => {
    vi.stubEnv('PERSONA_TOOL_POLICY', 'on');
    vi.stubEnv('MEMORY_RECALL', 'off');
    vi.stubEnv('TURN_INTELLIGENCE', 'off');
    const maya = await handOff('ferni', 'maya-santos');
    const ferni = await handOff('maya-santos', 'ferni');

    expect(await forbiddenToolsFor(maya.agent)).not.toContain('createHabit');
    expect(await forbiddenToolsFor(ferni.agent)).toEqual(
      expect.arrayContaining(['createHabit', 'logHabitCompletion'])
    );
  }, 60_000);
});
