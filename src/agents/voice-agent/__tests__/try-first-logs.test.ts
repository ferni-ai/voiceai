/**
 * A try-first (demo) visitor was told nothing is kept, and a log line keeps what it prints. Their
 * words, and the people and places in them, reach no log line: not the STT trace
 * (transcript-handler.ts E2E_USER_INPUT) and not the learning engine's "Captured key moment"
 * summary (user-learning-engine/engine.ts, from session-manager.ts analyze).
 *
 * Through the REAL loggers (the global setup mocks safe-logger; this unmocks it): every line
 * the process writes to stdout or stderr is read back, as onbehalf-callee-logs.test.ts does.
 * The real transcript handler and the real session services run; stores record writes only
 * (tests/helpers/write-recorder.ts). A member's turn is the control: both lines still carry
 * the words there, so the capture sees the fields when they are present. All data is fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../../../utils/safe-logger.js');

const w = vi.hoisted(() => ({
  bth: vi.fn(async () => ({})),
  ftis: vi.fn(async () => ({ handled: false })),
  fastCapture: vi.fn(async () => ({ mentionedEntities: [], asyncJobId: undefined })),
}));
vi.mock('../../integrations/better-than-human-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processTranscriptForBetterThanHuman: w.bth,
}));
vi.mock('../../processors/tool-routing-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  runFTISRouting: w.ftis,
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
  recordTurn: vi.fn(),
}));

import { createTranscriptHandler } from '../transcript-handler.js';
import { createSessionServices } from '../../../services/session/session-manager.js';

const DEMO = 'device:demo_1793560000000_k3x9q2'; // as /demo-token mints it
const MEMBER = 'member-uid-4b7e';
// A key moment (a decision), a marker, a number, an email, a named person and a place.
const SAID =
  "I've decided to tell my sister Marjorie Testwell, zqxmarker, call 555-0142 or sam@example.com, we meet in Lakeview";
const WORDS = ['zqxmarker', '555-0142', 'sam@example.com', 'marjorie', 'lakeview'];

let out: string[];
beforeEach(() => {
  out = [];
  const keep = (chunk: string | Uint8Array): boolean => {
    out.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(keep);
  vi.spyOn(process.stderr, 'write').mockImplementation(keep);
});
afterEach(() => vi.restoreAllMocks());

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
/** One final turn through the real transcript handler; the log lines written while it ran. */
async function sttTurn(userId: string): Promise<string> {
  const { handler } = createTranscriptHandler({
    room: stub(),
    session: stub(),
    services: stub(),
    sessionPersona: { id: 'ferni', name: 'Ferni' } as never,
    conversationManager: { isAgentSpeaking: () => false } as never,
    voiceHumanization: null,
    userData: { userId, turnCount: 2 } as never,
    userId,
    sessionId: `try-first-logs-${++n}`,
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
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 400);
  });
  return out.join('');
}

/** One caller turn through the real session services' analysis; the key-moment log lines. */
async function analyzedTurn(userId: string): Promise<string> {
  const services = await createSessionServices({ sessionId: `try-first-moment-${++n}`, userId });
  out.length = 0; // only what this turn's analysis logs
  services.analyze(SAID);
  return out.filter((line) => line.includes('Captured key moment')).join('');
}

const carried = (text: string): string[] => WORDS.filter((x) => text.toLowerCase().includes(x));

describe("a try-first visitor's words never reach a log line", { timeout: 60_000 }, () => {
  it("the STT trace logs the turn's length, never the words", async () => {
    const written = await sttTurn(DEMO);
    expect(written).toContain('E2E_USER_INPUT'); // the line ran
    expect(written).toContain(`"fullLength":${SAID.length}`);
    expect(carried(written)).toEqual([]);
  });

  it('control: a member turn still carries its words there', async () => {
    expect(carried(await sttTurn(MEMBER))).toContain('zqxmarker');
  });

  it('a key moment logs its type, never its summary', async () => {
    const written = await analyzedTurn(DEMO);
    expect(written).toContain('"type":"decision"'); // the line ran
    expect(written).not.toContain('"summary"');
    expect(carried(written)).toEqual([]);
  });

  it("control: a member's key moment still logs its summary", async () => {
    const written = await analyzedTurn(MEMBER);
    expect(written).toContain('"summary"');
    expect(carried(written).length).toBeGreaterThan(0);
  });
});
