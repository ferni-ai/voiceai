/**
 * The transcript handler (transcript-handler.ts) is its own path: it stores a turn's words and can
 * run before the turn pipeline reads that turn. A crisis pattern in the words holds the call at
 * once (crisis-pattern-hold.ts), so nothing below the held check runs: Better Than Human, the
 * tool-feedback collector, FTIS, preference extraction, fast capture. Fast capture also waits for
 * the turn's crisis read: none that starts, or one that finds risk, means no capture. The real
 * handler runs on a final transcript; only the writers are faked. Invented lines only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const w = vi.hoisted(() => ({
  bth: vi.fn(async () => ({})),
  ftis: vi.fn(async () => ({ handled: false })),
  fastCapture: vi.fn(async () => ({ mentionedEntities: [], asyncJobId: undefined })),
  prefs: vi.fn(() => []),
  feedback: vi.fn(),
}));
vi.mock('../../integrations/better-than-human-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processTranscriptForBetterThanHuman: w.bth,
}));
vi.mock('../../processors/tool-routing-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  runFTISRouting: w.ftis,
}));
vi.mock('../../../config/tool-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isFtisEnabled: () => true,
}));
vi.mock('../../../intelligence/preference-extractor.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  hasPreferenceContent: () => true,
  extractPreferences: w.prefs,
}));
vi.mock('../../../memory/dynamic/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fastCapture: w.fastCapture,
  recordTurn: vi.fn(),
}));

import { createTranscriptHandler } from '../transcript-handler.js';
import { memoryHeld, resetMinorCare } from '../../../utils/minor-care.js';
import { CRISIS_READ_WAIT, noteCrisisTurnRead } from '../../../utils/crisis-memory-hold.js';
import {
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../services/safety/crisis-call-risk.js';

const ORDINARY = 'We drove out to the lake on Saturday and the water was freezing but fun.';
const PATTERN = 'Honestly I want to kill myself, I am done with all of it.';
const WAIT = { ...CRISIS_READ_WAIT };
let n = 0;

/** Anything the handler touches that isn't under test: every property is a no-op. */
function stub(): never {
  const fn = (): unknown => proxy;
  const proxy: unknown = new Proxy(fn, {
    get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : proxy),
    apply: () => proxy,
  });
  return proxy as never;
}

/** One final caller turn through the real handler; `before` runs as the turn starts. */
async function turn(words: string, before: (sessionId: string) => void = () => undefined) {
  const sessionId = `crisis-transcript-${++n}`;
  const userId = `user-${sessionId}`;
  const { handler } = createTranscriptHandler({
    room: stub(),
    session: stub(),
    services: stub(),
    sessionPersona: { id: 'ferni', name: 'Ferni' } as never,
    conversationManager: { isAgentSpeaking: () => false } as never,
    voiceHumanization: null,
    userData: { userId, turnCount: 3 } as never,
    userId,
    sessionId,
    silenceContext: { topicsDiscussed: [], memorableMoments: [] } as never,
    dynamicToolLoader: {
      processMessage: async () => [],
      getLoadedDomains: () => [],
      getToolsForDomains: () => ({}),
    },
    agent: stub(),
    autoOptimizer: { processUserMessage: w.feedback },
  });
  before(sessionId);
  handler({ transcript: words, isFinal: true } as never);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 800); // past the shortened read wait
  });
  return { sessionId, userId };
}

beforeEach(() => {
  for (const fn of Object.values(w)) fn.mockClear();
  Object.assign(CRISIS_READ_WAIT, { startMs: 300, settleMs: 300 });
});
afterEach(() => {
  Object.assign(CRISIS_READ_WAIT, WAIT);
  resetCrisisCallRisk(); // also the memory hold
  resetMinorCare();
});

describe('transcript-handler: a crisis pattern before the turn pipeline reads it', () => {
  it('held at once: no writer below the held check runs', async () => {
    const { sessionId } = await turn(PATTERN);
    expect(memoryHeld(sessionId)).toBe(true);
    expect(w.bth).not.toHaveBeenCalled();
    expect(w.feedback).not.toHaveBeenCalled();
    expect(w.ftis).not.toHaveBeenCalled();
    expect(w.prefs).not.toHaveBeenCalled();
    expect(w.fastCapture).not.toHaveBeenCalled();
  });
});

describe('transcript-handler: fast capture waits for the turn crisis read', () => {
  it('no read of the turn starts: no capture (fail closed); the call is not held', async () => {
    const { sessionId } = await turn(ORDINARY);
    expect(w.fastCapture).not.toHaveBeenCalled();
    expect(memoryHeld(sessionId)).toBe(false);
    expect(w.ftis).toHaveBeenCalled();
  });

  it('a classifier read that finds risk after the held check ran: no capture', async () => {
    const late = new Promise<{ risk: string }>((resolve) => {
      setTimeout(resolve, 150, { risk: 'crisis' });
    });
    const { sessionId } = await turn(ORDINARY, (id) => void trackCrisisRead(id, ORDINARY, late));
    expect(memoryHeld(sessionId)).toBe(true);
    expect(w.fastCapture).not.toHaveBeenCalled();
  });

  it('an ordinary turn whose read started and came back clean: captured', async () => {
    await turn(ORDINARY, (id) => noteCrisisTurnRead(id, ORDINARY));
    await vi.waitFor(() => expect(w.fastCapture).toHaveBeenCalled(), { timeout: 2_000 });
    expect(w.prefs).toHaveBeenCalled();
  });
});
