/**
 * MINOR_CARE=on: the per-turn transcript handler (transcript-handler.ts) hands
 * no persisting writer the caller's words or real userId once they've said
 * they're under 18 and aren't a verified owner: Better Than Human recording
 * (vulnerability, contradictions, linguistic patterns), the tool-feedback
 * collector (keeps the raw message) and FTIS (runs storing tools straight from
 * the transcript), plus #1897's fast capture. The real handler runs on a final
 * transcript; only the writers are faked. Each still runs for a verified owner
 * and with the flag off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const w = vi.hoisted(() => ({
  bth: vi.fn(async () => ({})),
  ftis: vi.fn(async () => ({ handled: false })),
  fastCapture: vi.fn(async () => ({ mentionedEntities: [], asyncJobId: undefined })),
  feedback: vi.fn(),
}));
vi.mock('../../agents/integrations/better-than-human-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processTranscriptForBetterThanHuman: w.bth,
}));
vi.mock('../../agents/processors/tool-routing-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  runFTISRouting: w.ftis,
}));
vi.mock('../../config/tool-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isFtisEnabled: () => true,
}));
vi.mock('../../memory/dynamic/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fastCapture: w.fastCapture,
  recordTurn: vi.fn(),
}));

import { createTranscriptHandler } from '../../agents/voice-agent/transcript-handler.js';
import { noteCallerWords, resetMinorCare, setVerifiedOwnerCheck, userHeld } from '../minor-care.js';

type Case = 'held' | 'owner' | 'off';
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

/** One final caller turn through the real handler, in the given state. */
async function turn(c: Case): Promise<{ sessionId: string; userId: string }> {
  const sessionId = `transcript-${c}-${++n}`;
  const userId = `user-${sessionId}`;
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  noteCallerWords(sessionId, "I'm 16 years old and kind of bored");
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
  handler({
    transcript:
      'My mom says I spend too long on my phone, and honestly I feel sad and happy at once.',
    isFinal: true,
  } as never);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 400);
  });
  return { sessionId, userId };
}

beforeEach(() => {
  for (const fn of Object.values(w)) fn.mockClear();
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('transcript-handler: held caller under 18', () => {
  it('Better Than Human recording: not called', async () => {
    await turn('held');
    expect(w.bth).not.toHaveBeenCalled();
  });

  it('tool-feedback collector (keeps the raw message): not called', async () => {
    await turn('held');
    expect(w.feedback).not.toHaveBeenCalled();
  });

  it('FTIS (runs storing tools from the transcript): not called', async () => {
    await turn('held');
    expect(w.ftis).not.toHaveBeenCalled();
  });

  it('fast capture (#1897): not called', async () => {
    await turn('held');
    expect(w.fastCapture).not.toHaveBeenCalled();
  });

  it('the per-user flush timers see the hold (userHeld, keyed by userId)', async () => {
    const { userId } = await turn('held');
    expect(userHeld(userId)).toBe(true);
  });
});

describe('transcript-handler: a bare "16." answering Ferni asking their age', () => {
  it("holds the user: Ferni's last line reaches the detector as `asked`", async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    const sessionId = `transcript-asked-${++n}`;
    const userId = `user-${sessionId}`;
    const { handler } = createTranscriptHandler({
      room: stub(),
      session: stub(),
      services: stub(),
      sessionPersona: { id: 'ferni', name: 'Ferni' } as never,
      conversationManager: { isAgentSpeaking: () => false } as never,
      voiceHumanization: null,
      userData: { userId, turnCount: 3, lastAgentResponse: 'Wait, how old are you?' } as never,
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
    handler({ transcript: '16.', isFinal: true } as never);
    await vi.waitFor(() => expect(userHeld(userId)).toBe(true), { timeout: 2_000 });
  });
});

describe.each<Case>(['owner', 'off'])('transcript-handler: %s still records', (c) => {
  it('each writer runs with the real userId', async () => {
    const { userId } = await turn(c);
    // Poll: the writers run fire-and-forget, so a loaded machine can be slower than the turn wait
    await vi.waitFor(() => expect(w.ftis).toHaveBeenCalled(), { timeout: 5_000 });
    await vi.waitFor(() => expect(w.bth).toHaveBeenCalled(), { timeout: 5_000 });
    expect(w.bth).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId }));
    expect(w.feedback).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId }),
      undefined
    );
    expect(w.ftis).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ userId }));
    expect(w.fastCapture).toHaveBeenCalledWith(expect.objectContaining({ userId }));
  });
});
