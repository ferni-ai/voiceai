/**
 * setupPersonaAgent tells the transcript handler whether the turn path runs for the call
 * (TURN_PATH_SINGLE_CAPTURE reads it): true when turn intelligence is hooked on the session,
 * false under TURN_INTELLIGENCE=off. After a handoff the swapped-in persona joins the call's
 * session (callSession) and builds no second transcript handler, so the first one, still
 * hooked, keeps skipping its capture on the next turn.
 *
 * Drives the real setup and its deferred handler wiring, and the real transcript handler (the
 * spy calls through). Stubbed: the slow or networked edges (prompts, TTS, tools, the LLM, the
 * call session), the turn hook itself (so no turn is processed; the hook still exists, which is
 * what the setup reads), the stores (write recorder) and fetch (refused). The transcript handler
 * imports fastCapture and recordTurn from '../../memory/dynamic/index.js' (transcript-handler.ts),
 * the module mocked here.
 */
import { EventEmitter } from 'node:events';
import { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const w = vi.hoisted(() => ({
  hooked: [] as Array<boolean | undefined>,
  fastCapture: vi.fn(async () => ({ mentionedEntities: [], asyncJobId: undefined })),
  recordTurn: vi.fn(),
}));

vi.mock('../../voice-agent/transcript-handler.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../voice-agent/transcript-handler.js')>();
  return {
    ...real,
    createTranscriptHandler: vi.fn((ctx: Parameters<typeof real.createTranscriptHandler>[0]) => {
      w.hooked.push(ctx.turnPathHooked);
      return real.createTranscriptHandler(ctx);
    }),
  };
});
vi.mock('../turn-intelligence.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createTurnIntelligenceHook: () => async () => undefined,
  attachTurnContextPusher: () => () => undefined,
}));
vi.mock('../../../memory/dynamic/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fastCapture: w.fastCapture,
  recordTurn: w.recordTurn,
}));
vi.mock('../../integrations/better-than-human-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processTranscriptForBetterThanHuman: vi.fn(async () => ({})),
}));
vi.mock('../../processors/tool-routing-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  runFTISRouting: vi.fn(async () => ({ handled: false })),
}));
const rec = await vi.hoisted(async () => {
  const { createWriteRecorder } = await import('../../../tests/helpers/write-recorder.js');
  return createWriteRecorder();
});
vi.mock('../../../utils/shared-firestore.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sharedFirestore: () => rec.db,
}));
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => rec.db,
}));
vi.mock('../../../memory/storage/redis-cache/factory.js', async (orig) => ({
  ...(await orig<object>()),
  getRedisCache: () => rec.redis,
  getRedisCacheAsync: async () => rec.redis,
}));
// No model call from a test: the low-confidence emotion pass gets no answer.
vi.mock('../../../services/llm-utils.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createEmotionLLMCaller: () => async () => Promise.reject(new Error('no model in tests')),
}));
vi.mock('../call-session.js', () => ({
  createCallSession: async () =>
    Object.assign(new EventEmitter(), { say: () => undefined, interrupt: () => undefined }),
}));
vi.mock('../../../tools/dynamic-loader/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createSessionToolLoader: () => ({
    initialize: async () => undefined,
    shutdown: () => undefined,
    processMessage: async () => [],
    getCurrentTools: () => ({}),
    getLoadedDomains: () => [],
    getToolsForDomains: () => ({}),
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

type SetupConfig = Parameters<typeof setupPersonaAgent>[0];
const USER = 'turn-path-user-1';
const SAID = 'my neighbor Quill Harrowby is moving to Lakeview next month';

/** A call's first persona: no callSession, so it owns the session and wires the handlers. */
function firstPersona(userData: Record<string, unknown> = { userName: 'Sam' }): SetupConfig {
  return {
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    ctx: {},
    room: {
      localParticipant: undefined,
      on: () => undefined,
      off: () => undefined,
      remoteParticipants: new Map(),
    },
    services: { sessionId: 'turn-path-setup', userId: USER, userProfile: null },
    userData,
    sessionId: 'turn-path-setup',
    userId: USER,
    conversationManager: { isAgentSpeaking: () => false },
    enableFullHandlers: true,
    deferHandlers: true,
  } as unknown as SetupConfig;
}

/** The persona a handoff swaps in: it joins the first persona's session (orchestrator.ts). */
function swappedIn(first: SetupConfig, callSession: unknown): SetupConfig {
  return {
    ...first,
    persona: { id: 'maya-santos', name: 'Maya', displayName: 'Maya' },
    isHandoff: true,
    previousPersonaId: 'ferni',
    callSession,
  } as unknown as SetupConfig;
}

let fetches = 0;
beforeEach(() => {
  fetches = 0;
  vi.stubEnv('MEMORY_RECALL', 'off');
  vi.stubEnv('THEORY_OF_MIND', 'off');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    fetches += 1;
    throw new Error('no network in tests');
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  w.hooked.length = 0;
  w.fastCapture.mockClear();
  w.recordTurn.mockClear();
});

const captures = () => ({
  fastCapture: w.fastCapture.mock.calls.length,
  recordTurn: w.recordTurn.mock.calls.length,
});

/** A handoff, then one final transcript on the call's session; the captures it made. */
async function turnAfterSwap() {
  vi.stubEnv('TURN_INTELLIGENCE', 'on');
  vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'on');
  const userData: Record<string, unknown> = { userName: 'Sam', turnCount: 0 };
  const config = firstPersona(userData);
  const first = await setupPersonaAgent(config);
  await first.wireHandlers?.();
  const next = await setupPersonaAgent(swappedIn(config, first.session));
  await first.release(); // swapPersona releases the outgoing persona once the next is on
  (first.session as unknown as EventEmitter).emit(voice.AgentSessionEventTypes.UserInputTranscribed, {
    transcript: SAID,
    isFinal: true,
  });
  // the transcript handler steps turnCount after its capture block
  await vi.waitFor(() => expect(userData.turnCount).toBe(1), { timeout: 10_000 });
  return { next };
}

describe('setupPersonaAgent → the transcript handler knows whether the turn path runs', () => {
  it('W-on: turn intelligence on: turnPathHooked is true', async () => {
    vi.stubEnv('TURN_INTELLIGENCE', 'on');
    const setup = await setupPersonaAgent(firstPersona());
    await setup.wireHandlers?.();
    expect(w.hooked).toEqual([true]);
    expect(fetches).toBe(0);
  }, 60_000);

  it('W-off: TURN_INTELLIGENCE=off: turnPathHooked is false', async () => {
    vi.stubEnv('TURN_INTELLIGENCE', 'off');
    const setup = await setupPersonaAgent(firstPersona());
    await setup.wireHandlers?.();
    expect(w.hooked).toEqual([false]);
    expect(fetches).toBe(0);
  }, 60_000);

  it('W-swap: after a handoff the next turn is still not captured by the transcript handler', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'on');
    const { next } = await turnAfterSwap();
    expect(next.wireHandlers).toBeUndefined(); // the swapped-in persona wires no handlers
    expect(w.hooked).toEqual([true]); // one transcript handler for the call, the first persona's
    expect(captures()).toEqual({ fastCapture: 0, recordTurn: 0 });
    expect(fetches).toBe(0);
  }, 60_000);

  it('W-swap control, flag off: the same turn after a handoff is captured once, as main', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'off');
    await turnAfterSwap();
    expect(w.hooked).toEqual([true]);
    expect(captures()).toEqual({ fastCapture: 1, recordTurn: 1 });
    expect(fetches).toBe(0);
  }, 60_000);
});
