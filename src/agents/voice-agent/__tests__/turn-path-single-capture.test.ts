/**
 * TURN_PATH_SINGLE_CAPTURE: once the turn path is attached to the call's session
 * (noteTurnPathAttached, from attachTurnContextPusher), the transcript handler no longer captures
 * a final transcript into dynamic memory (process-turn and the turn handler capture every run
 * that carries it). Where nothing attached the turn path (the single-agent path, or
 * TURN_INTELLIGENCE=off) it captures as before, and with the flag off nothing changes.
 *
 * The real transcript handler runs; fastCapture and recordTurn are spies, stores record writes
 * only (tests/helpers/write-recorder.ts), no model is called and fetch is refused. The mocked
 * module is the one the handler loads: transcript-handler.ts imports fastCapture and recordTurn
 * from '../../memory/dynamic/index.js', the file mocked below. Each row
 * waits for the handler's turn-count step, which comes after the capture block, so a row with
 * zero captures passed that block rather than stopping early. All data is fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const w = vi.hoisted(() => ({
  fastCapture: vi.fn(async () => ({ mentionedEntities: [], asyncJobId: undefined })),
  recordTurn: vi.fn(),
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
vi.mock('../../../memory/dynamic/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fastCapture: w.fastCapture,
  recordTurn: w.recordTurn,
}));

import { noteTurnPathAttached } from '../../shared/turn-path-capture.js';
import { createTranscriptHandler } from '../transcript-handler.js';

const MEMBER = 'member-uid-7c2d';
const SAID = 'my neighbor Quill Harrowby is moving to Lakeview next month';

let fetches = 0;
beforeEach(() => {
  fetches = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    fetches += 1;
    throw new Error('no network in tests');
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  w.fastCapture.mockClear();
  w.recordTurn.mockClear();
});

/** Anything the handler touches that isn't under test: every property is a no-op. */
function stub(): never {
  const fn = (): unknown => proxy;
  const proxy: unknown = new Proxy(fn, {
    get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : proxy),
    apply: () => proxy,
  });
  return proxy as never;
}

let n = 0;
/** One final transcript through a real handler built on the given call session. */
async function finalTranscript(session: object): Promise<void> {
  const userData = { userId: MEMBER, turnCount: 2 };
  const { handler } = createTranscriptHandler({
    room: stub(),
    session: session as never,
    services: stub(),
    sessionPersona: { id: 'ferni', name: 'Ferni' } as never,
    conversationManager: { isAgentSpeaking: () => false } as never,
    voiceHumanization: null,
    userData: userData as never,
    userId: MEMBER,
    sessionId: `turn-path-single-capture-${++n}`,
    silenceContext: { topicsDiscussed: [], memorableMoments: [] } as never,
    dynamicToolLoader: {
      processMessage: async () => [],
      getLoadedDomains: () => [],
      getToolsForDomains: () => ({}),
    },
    agent: stub(),
    autoOptimizer: { processUserMessage: vi.fn() },
  });
  handler({ transcript: SAID, isFinal: true } as never);
  // transcript-handler steps turnCount after the capture block, so the block has run by then
  await vi.waitFor(() => expect(userData.turnCount).toBe(3), { timeout: 10_000 });
}

const captures = () => ({
  fastCapture: w.fastCapture.mock.calls.length,
  recordTurn: w.recordTurn.mock.calls.length,
});

describe('TURN_PATH_SINGLE_CAPTURE', { timeout: 60_000 }, () => {
  it('B1: the turn path attached, flag on: the transcript handler captures nothing', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'on');
    const session = stub();
    // In-row control: on the same session before the turn path attaches, the handler reaches
    // the mocked capture, so the 0 added below is the skip, not a mock the handler never imports.
    await finalTranscript(session);
    expect(captures()).toEqual({ fastCapture: 1, recordTurn: 1 });
    noteTurnPathAttached(session);
    await finalTranscript(session);
    expect(captures()).toEqual({ fastCapture: 1, recordTurn: 1 });
    expect(fetches).toBe(0);
  });

  it('B2: no turn path attached (single-agent or TURN_INTELLIGENCE=off): captures', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'on');
    await finalTranscript(stub()); // handler-setup.ts never calls attachTurnContextPusher
    expect(captures()).toEqual({ fastCapture: 1, recordTurn: 1 });
    expect(fetches).toBe(0);
  });

  it('B2: another call attached the turn path, flag on: this call still captures', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'on');
    noteTurnPathAttached(stub()); // a different session in the same process
    await finalTranscript(stub());
    expect(captures()).toEqual({ fastCapture: 1, recordTurn: 1 });
    expect(fetches).toBe(0);
  });

  it('flag off: the turn path attached still captures exactly as main', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'off'); // explicit: a run with every flag on stays honest
    const session = stub();
    noteTurnPathAttached(session);
    await finalTranscript(session);
    expect(captures()).toEqual({ fastCapture: 1, recordTurn: 1 });
    expect(w.fastCapture).toHaveBeenCalledWith(
      expect.objectContaining({ userId: MEMBER, turnNumber: 0, transcript: SAID })
    );
    expect(w.recordTurn).toHaveBeenCalledWith(
      expect.stringMatching(/^turn-path-single-capture-/),
      MEMBER,
      expect.anything(),
      SAID,
      0
    );
    expect(fetches).toBe(0);
  });
});
