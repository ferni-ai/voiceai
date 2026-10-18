/**
 * setupPersonaAgent attaches the theory-of-mind note when THEORY_OF_MIND=on,
 * and not when it's off. Drives the real setup; only its slow or networked
 * edges (prompts, TTS, tools, the LLM) are stubbed, and attachMindNote is a spy.
 */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spy = vi.hoisted(() => ({ attached: [] as Array<{ userId: string }> }));

vi.mock('../mind-note-hook.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  attachMindNote: vi.fn((_session: unknown, _agent: unknown, deps: { userId: string }) => {
    spy.attached.push(deps);
    return { ready: Promise.resolve(), detach: () => undefined };
  }),
}));
vi.mock('../../personas/prompt-loader.js', () => ({
  loadModelBaseInstructions: async () => 'You are Ferni.',
  loadSystemPrompt: async () => 'Ferni system prompt.',
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

function config() {
  const callSession = Object.assign(new EventEmitter(), { say: () => undefined });
  return {
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    ctx: {},
    room: {
      localParticipant: undefined,
      on: () => undefined,
      off: () => undefined,
      remoteParticipants: new Map(),
    },
    services: { sessionId: 'tom-setup', userId: 'tom-user-1', userProfile: null },
    userData: { userName: 'Sam' },
    sessionId: 'tom-setup',
    userId: 'tom-user-1',
    enableFullHandlers: false,
    deferHandlers: true,
    callSession,
  } as unknown as Parameters<typeof setupPersonaAgent>[0];
}

describe('setupPersonaAgent → theory of mind note', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    spy.attached.length = 0;
  });

  it('attaches the note for the caller when THEORY_OF_MIND=on', async () => {
    vi.stubEnv('THEORY_OF_MIND', 'on');
    vi.stubEnv('MEMORY_RECALL', 'off');
    vi.stubEnv('TURN_INTELLIGENCE', 'off');
    await setupPersonaAgent(config());
    expect(spy.attached).toEqual([expect.objectContaining({ userId: 'tom-user-1' })]);
  }, 60_000);

  it('does not attach it when the flag is off', async () => {
    vi.stubEnv('MEMORY_RECALL', 'off');
    vi.stubEnv('TURN_INTELLIGENCE', 'off');
    await setupPersonaAgent(config());
    expect(spy.attached).toHaveLength(0);
  }, 60_000);
});
