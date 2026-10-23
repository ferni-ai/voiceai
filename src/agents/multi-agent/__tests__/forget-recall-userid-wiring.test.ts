/**
 * The recall listener in setupPersonaAgent hands sendRecall the caller's id,
 * so the forget re-check (FORGET_EVERY_READER) knows whose topics to read on
 * every transcript. Drives the real setup with its slow edges stubbed (the
 * mind-note wiring harness); the recall hook and sendRecall are spies.
 */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spy = vi.hoisted(() => ({ sent: [] as unknown[][] }));

vi.mock('../memory-recall-hook.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  memoryRecallMode: () => true,
  createMemoryRecall: () => ({
    ready: Promise.resolve(),
    noteFor: () => null, // no new note: the re-check must still run
    newTurn: () => undefined,
    lastPick: () => null,
    snapshot: () => undefined,
  }),
}));
vi.mock('../../personas/context-packet/turn-packet.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendRecall: vi.fn((...args: unknown[]) => {
    spy.sent.push(args);
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

describe('setupPersonaAgent → the recall listener', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    spy.sent.length = 0;
  });

  it('passes the caller id to sendRecall on every transcript, note or not', async () => {
    vi.stubEnv('THEORY_OF_MIND', 'off');
    vi.stubEnv('TURN_INTELLIGENCE', 'off');
    const callSession = Object.assign(new EventEmitter(), { say: () => undefined });
    await setupPersonaAgent({
      persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
      ctx: {},
      room: {
        localParticipant: undefined,
        on: () => undefined,
        off: () => undefined,
        remoteParticipants: new Map(),
      },
      services: { sessionId: 'recall-wiring', userId: 'member-recall-wiring', userProfile: null },
      userData: { userName: 'Sam' },
      sessionId: 'recall-wiring',
      userId: 'member-recall-wiring',
      enableFullHandlers: false,
      deferHandlers: true,
      callSession,
    } as unknown as Parameters<typeof setupPersonaAgent>[0]);
    callSession.emit('user_input_transcribed', { transcript: 'hi there', isFinal: true });
    expect(spy.sent).toHaveLength(1);
    expect(spy.sent[0]![3]).toBeNull(); // no note this turn
    expect(spy.sent[0]![4]).toBe('member-recall-wiring');
  }, 60_000);
});
