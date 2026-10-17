/**
 * The call session starts loading the caller's world facts (in-call-load.ts)
 * as it is built: once per call, keyed by the call's userData, which the turn
 * request reads them back from. The loader itself checks WORLD_FACTS_IN_CALL.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadWorldFactsForCall = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock('../../../intelligence/world-model/temporal/in-call-load.js', () => ({
  loadWorldFactsForCall: (...args: unknown[]) => loadWorldFactsForCall(...args),
}));
vi.mock('../../model-provider/index.js', () => ({
  createProviderSTT: () => undefined,
  buildCascadeKeyterms: () => ['Ferni'],
  getModelProvider: () => ({ getSessionTurnDetection: () => 'stt', speaksNatively: () => false }),
}));
vi.mock('@livekit/agents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@livekit/agents')>()),
  voice: {
    AgentSession: class {
      constructor(readonly opts: unknown) {}
    },
  },
}));
vi.mock('../../shared/session-listener-limit.js', () => ({ limitSessionListeners: () => {} }));
vi.mock('../live-call-behaviors.js', () => ({ logBargeInDecisions: () => {} }));

const { createCallSession } = await import('../call-session.js');

describe('createCallSession world facts', () => {
  beforeEach(() => {
    process.env.DISABLE_VAD = 'true';
    loadWorldFactsForCall.mockClear();
  });

  it("starts the caller's world-facts load for this call's userData", async () => {
    const userData = { userName: 'Sam' };
    expect(loadWorldFactsForCall).not.toHaveBeenCalled();
    await createCallSession({
      persona: { id: 'ferni' } as never,
      sessionId: 's1',
      services: {} as never,
      userData: userData as never,
      userId: 'u1',
      llmModel: {},
      tts: {} as never,
    });
    expect(loadWorldFactsForCall).toHaveBeenCalledTimes(1);
    expect(loadWorldFactsForCall.mock.calls[0][0]).toBe(userData);
    expect(loadWorldFactsForCall.mock.calls[0][1]).toBe('u1');
  });
});
