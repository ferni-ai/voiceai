/**
 * TURN_PATH_SINGLE_CAPTURE through the real setup: with turn intelligence on, setupPersonaAgent
 * attaches the turn path to the call's session (attachTurnContextPusher marks it), so with the
 * flag on the transcript handler on that session captures nothing; under TURN_INTELLIGENCE=off
 * nothing is attached and it captures as before. After a handoff the swapped-in persona joins
 * the call's session (callSession), attaches again to the same session object and builds no
 * second transcript handler, so the first one keeps skipping its capture on the next turn.
 *
 * Drives the real setup and its deferred handler wiring, the real attachTurnContextPusher and
 * the real transcript handler (both spies call through and record the session they got).
 * Stubbed: the slow or networked edges (prompts, TTS, tools, the LLM, the call session), the
 * turn hook itself (a no-op, so no turn is processed), the stores (write recorder) and fetch
 * (refused). The transcript handler imports fastCapture and recordTurn from
 * '../../memory/dynamic/index.js' (transcript-handler.ts), the module mocked here.
 *
 * Since #3904 the handler captures only once a crisis read of the turn has started (none: no
 * capture). Each turn notes a clean read first, so a row's 0 is the skip, not a missing read,
 * and the counts are read once they stop changing. The pattern is
 * voice-agent/__tests__/crisis-memory-hold-transcript.test.ts.
 */
import { EventEmitter } from 'node:events';
import { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const w = vi.hoisted(() => ({
  handlerSessions: [] as unknown[],
  attachedSessions: [] as unknown[],
  fastCapture: vi.fn(async () => ({ mentionedEntities: [], asyncJobId: undefined })),
  recordTurn: vi.fn(),
}));

vi.mock('../../voice-agent/transcript-handler.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../voice-agent/transcript-handler.js')>();
  return {
    ...real,
    createTranscriptHandler: vi.fn((ctx: Parameters<typeof real.createTranscriptHandler>[0]) => {
      w.handlerSessions.push(ctx.session);
      return real.createTranscriptHandler(ctx);
    }),
  };
});
vi.mock('../turn-intelligence.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../turn-intelligence.js')>();
  return {
    ...real,
    createTurnIntelligenceHook: () => async () => undefined,
    attachTurnContextPusher: vi.fn((...args: Parameters<typeof real.attachTurnContextPusher>) => {
      w.attachedSessions.push(args[2]);
      return real.attachTurnContextPusher(...args);
    }),
  };
});
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
const { waitUntilQuiet } = await import('../../../tests/helpers/wait-until-quiet.js');
const { resetCrisisCallRisk } = await import('../../../services/safety/crisis-call-risk.js');
const { CRISIS_READ_WAIT, noteCrisisTurnRead } =
  await import('../../../utils/crisis-memory-hold.js');

type SetupConfig = Parameters<typeof setupPersonaAgent>[0];
const USER = 'turn-path-user-1';
const SAID = 'my neighbor Quill Harrowby is moving to Lakeview next month';
const SESSION = 'turn-path-setup';
const WAIT = { ...CRISIS_READ_WAIT };

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
    services: { sessionId: SESSION, userId: USER, userProfile: null },
    userData,
    sessionId: SESSION,
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
  Object.assign(CRISIS_READ_WAIT, { startMs: 300, settleMs: 300 });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    fetches += 1;
    throw new Error('no network in tests');
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  w.handlerSessions.length = 0;
  w.attachedSessions.length = 0;
  w.fastCapture.mockClear();
  w.recordTurn.mockClear();
  Object.assign(CRISIS_READ_WAIT, WAIT);
  resetCrisisCallRisk(); // also the memory hold
});

const captures = () => ({
  fastCapture: w.fastCapture.mock.calls.length,
  recordTurn: w.recordTurn.mock.calls.length,
});

/** One final transcript on the call's session, after the handler's turn-count step. */
async function finalTranscript(session: unknown, userData: Record<string, unknown>) {
  const before = userData.turnCount as number;
  noteCrisisTurnRead(SESSION, SAID); // the turn's crisis read started and came back clean
  (session as EventEmitter).emit(voice.AgentSessionEventTypes.UserInputTranscribed, {
    transcript: SAID,
    isFinal: true,
  });
  // the transcript handler steps turnCount after its capture block
  await vi.waitFor(() => expect(userData.turnCount).toBe(before + 1), { timeout: 10_000 });
  await waitUntilQuiet(captures); // #3904: the capture lands after the handler returns
}

/** A call's first persona, set up and wired, under the given TURN_INTELLIGENCE. */
async function startCall(turnIntelligence: 'on' | 'off') {
  vi.stubEnv('TURN_INTELLIGENCE', turnIntelligence);
  const userData: Record<string, unknown> = { userName: 'Sam', turnCount: 0 };
  const config = firstPersona(userData);
  const first = await setupPersonaAgent(config);
  await first.wireHandlers?.();
  return { config, first, userData };
}

/** A handoff, then one final transcript on the call's session. */
async function turnAfterSwap() {
  vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'on');
  const { config, first, userData } = await startCall('on');
  const next = await setupPersonaAgent(swappedIn(config, first.session));
  await first.release(); // swapPersona releases the outgoing persona once the next is on
  await finalTranscript(first.session, userData);
  return { first, next };
}

describe('setupPersonaAgent → the transcript handler leaves the line to the turn path', () => {
  it('W-on: turn intelligence on, flag on: the transcript handler does not capture', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'on');
    const { first, userData } = await startCall('on');
    expect(w.attachedSessions).toHaveLength(1);
    expect(w.attachedSessions[0]).toBe(first.session);
    expect(w.handlerSessions[0]).toBe(first.session); // the session the turn path marked
    await finalTranscript(first.session, userData);
    expect(captures()).toEqual({ fastCapture: 0, recordTurn: 0 });
    expect(fetches).toBe(0);
  }, 60_000);

  it('W-off: TURN_INTELLIGENCE=off, flag on: nothing attached, captured once as main', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'on');
    const { first, userData } = await startCall('off');
    expect(w.attachedSessions).toEqual([]);
    await finalTranscript(first.session, userData);
    expect(captures()).toEqual({ fastCapture: 1, recordTurn: 1 });
    expect(fetches).toBe(0);
  }, 60_000);

  it('W-swap: after a handoff the next turn is still not captured by the transcript handler', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'on');
    const { first, next } = await turnAfterSwap();
    expect(next.wireHandlers).toBeUndefined(); // the swapped-in persona wires no handlers
    // one transcript handler for the call, the first persona's
    expect(w.handlerSessions).toHaveLength(1);
    expect(w.handlerSessions[0]).toBe(first.session);
    expect(w.attachedSessions).toHaveLength(2); // each persona attaches the turn path...
    expect(w.attachedSessions.every((s) => s === first.session)).toBe(true); // ...to one session
    expect(captures()).toEqual({ fastCapture: 0, recordTurn: 0 });
    expect(fetches).toBe(0);
  }, 60_000);

  it('W-swap control, flag off: the same turn after a handoff is captured once, as main', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'off');
    await turnAfterSwap();
    expect(w.handlerSessions).toHaveLength(1);
    expect(captures()).toEqual({ fastCapture: 1, recordTurn: 1 });
    expect(fetches).toBe(0);
  }, 60_000);
});
