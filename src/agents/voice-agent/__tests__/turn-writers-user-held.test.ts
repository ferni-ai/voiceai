/**
 * A caller held on another call (userHeld) has nothing from this call's turns written, the same as
 * a call held itself: none of the per-turn writers in transcript-handler.ts runs (FTIS, fast
 * capture, the thread recorder, Better Than Human, the preference save, the tool-feedback
 * collector), and the daily check-in records no emotional weather. An unheld caller's turn still
 * reaches all seven. The real handler runs on a final turn; only the writers and the stores are
 * faked. The hold is MINOR_CARE's (a caller who said they're 16). Each turn notes its crisis read
 * as started, as the turn pipeline does in a call: fast capture waits for that read and captures
 * nothing without it (crisis-memory-hold.ts). So a held row first waits for the capture to finish,
 * then checks it captured nothing. Fixtures are fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const w = vi.hoisted(() => ({
  ftis: vi.fn(async () => ({ handled: false })),
  fastCapture: vi.fn(async () => ({ mentionedEntities: [], asyncJobId: undefined })),
  thread: vi.fn(async () => undefined),
  bth: vi.fn(async () => ({})),
  prefs: vi.fn(() => []),
  feedback: vi.fn(),
  recordWeather: vi.fn(async () => undefined),
  recordCompletionAsync: vi.fn(async () => ({ streak: 1 })),
  identity: vi.fn(async () => ({})),
  captureDone: vi.fn(),
}));
/** The memory capture's task runs unchanged and marks when it finished (read wait and gate). */
vi.mock('../../../utils/safe-fire-and-forget.js', async (orig) => {
  const real = await orig<typeof import('../../../utils/safe-fire-and-forget.js')>();
  return {
    ...real,
    safeFireAndForget: (...[fn, options]: Parameters<typeof real.safeFireAndForget>) => {
      const capture = options.context === 'transcript-memory-capture';
      const marked = (): Promise<unknown> => fn().finally(() => w.captureDone());
      real.safeFireAndForget(capture ? marked : fn, options);
    },
  };
});
vi.mock('../../processors/tool-routing-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  runFTISRouting: w.ftis,
}));
vi.mock('../../../config/tool-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isFtisEnabled: () => true,
}));
vi.mock('../../../memory/dynamic/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fastCapture: w.fastCapture,
  recordTurn: vi.fn(),
}));
vi.mock('../../../services/conversation-thread/thread-recorder.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  recordUserMessage: w.thread,
}));
vi.mock('../../integrations/better-than-human-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processTranscriptForBetterThanHuman: w.bth,
}));
vi.mock('../../../intelligence/preference-extractor.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  hasPreferenceContent: () => true,
  extractPreferences: w.prefs,
}));
vi.mock('../../../services/engagement/engagement-store.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getEngagementStore: async () => ({ recordWeather: w.recordWeather }),
}));
vi.mock('../../../services/daily-rituals.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getDailyRitualsService: () => ({ recordCompletionAsync: w.recordCompletionAsync }),
}));
vi.mock('../../../config/gemini-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isGeminiConfigured: () => false,
}));
/** Reached by every turn, held or not, just before the check-in: the turn's end mark. */
vi.mock('../../../services/trust-and-identity/voice-agent-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  onUserMessage: w.identity,
}));

import { createTranscriptHandler } from '../transcript-handler.js';
import {
  bindSessionUser,
  memoryHeld,
  noteCallerWords,
  resetMinorCare,
  userHeld,
} from '../../../utils/minor-care.js';
import { CRISIS_READ_WAIT, noteCrisisTurnRead } from '../../../utils/crisis-memory-hold.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';

const UNDER_18 = "I'm 16 years old and kind of bored";
const CHECK_IN = "sky check: I'm feeling happy and great today";
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

/** A caller with an earlier call; `said16` holds that earlier call (MINOR_CARE on). */
function caller(said16: boolean): { userId: string; now: string } {
  n++;
  const userId = `user-turn-writers-${n}`;
  const earlier = `turn-writers-earlier-${n}`;
  bindSessionUser(earlier, userId);
  if (said16) noteCallerWords(earlier, UNDER_18);
  return { userId, now: `turn-writers-now-${n}` };
}

/**
 * One final check-in turn through the real handler. Resolves once the turn has passed every
 * writer's gate, the check-in's last: voice identity is started synchronously just before the
 * check-in and reaches onUserMessage only after an await, so by then the check-in's gate has run.
 */
async function turn(sessionId: string, userId: string): Promise<void> {
  const { handler } = createTranscriptHandler({
    room: stub(),
    session: stub(),
    services: stub(),
    sessionPersona: { id: 'ferni', name: 'Ferni' } as never,
    conversationManager: { isAgentSpeaking: () => false } as never,
    voiceHumanization: null,
    userData: { userId, turnCount: 1 } as never,
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
  noteCrisisTurnRead(sessionId, CHECK_IN); // the turn's crisis read started (and finds nothing)
  handler({ transcript: CHECK_IN, isFinal: true } as never);
  await vi.waitFor(() => expect(w.identity).toHaveBeenCalled(), { timeout: 5_000 });
}

beforeEach(() => {
  vi.stubEnv('MINOR_CARE', 'on');
  for (const fn of Object.values(w)) fn.mockClear();
  Object.assign(CRISIS_READ_WAIT, { startMs: 300, settleMs: 300 });
});
afterEach(() => {
  Object.assign(CRISIS_READ_WAIT, WAIT);
  resetCrisisCallRisk(); // also the memory hold
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('per-turn writers (transcript-handler.ts) for a caller held on another call', () => {
  // First, so the lazily imported writers are loaded before a held row's wait starts.
  it('control: an unheld caller turn reaches every writer and the check-in', async () => {
    const { userId, now } = caller(false);
    expect(userHeld(userId) || memoryHeld(now)).toBe(false);
    await turn(now, userId);
    await vi.waitFor(() => expect(w.bth).toHaveBeenCalled(), { timeout: 5_000 });
    await vi.waitFor(() => expect(w.recordWeather).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    const withUser = expect.objectContaining({ userId });
    expect(w.ftis).toHaveBeenCalledWith(expect.any(String), withUser);
    await vi.waitFor(() => expect(w.fastCapture).toHaveBeenCalledWith(withUser), {
      timeout: 2_000,
    });
    await vi.waitFor(() => expect(w.captureDone).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    expect(w.thread).toHaveBeenCalledWith(withUser);
    expect(w.bth).toHaveBeenCalledWith(expect.anything(), withUser);
    expect(w.prefs).toHaveBeenCalled();
    expect(w.feedback).toHaveBeenCalledWith(expect.any(String), withUser, undefined);
    expect(w.recordWeather).toHaveBeenCalledWith(userId, expect.anything());
  });

  it('a caller held on another call: none of the six writers runs', async () => {
    const { userId, now } = caller(true);
    expect(userHeld(userId)).toBe(true);
    expect(memoryHeld(now)).toBe(false);
    await turn(now, userId);
    // The capture has decided: it waits for the turn's crisis read, so a bare wait proves nothing
    await vi.waitFor(() => expect(w.captureDone).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
    expect(w.ftis).not.toHaveBeenCalled();
    expect(w.fastCapture).not.toHaveBeenCalled();
    expect(w.thread).not.toHaveBeenCalled();
    expect(w.bth).not.toHaveBeenCalled();
    expect(w.prefs).not.toHaveBeenCalled();
    expect(w.feedback).not.toHaveBeenCalled();
  });

  it('a caller held on another call: the check-in records no weather', async () => {
    const { userId, now } = caller(true);
    expect(userHeld(userId)).toBe(true);
    expect(memoryHeld(now)).toBe(false);
    await turn(now, userId);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
    expect(w.recordWeather).not.toHaveBeenCalled();
    expect(w.recordCompletionAsync).not.toHaveBeenCalled();
  });
});
