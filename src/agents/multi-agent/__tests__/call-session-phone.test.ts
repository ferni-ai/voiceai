/**
 * The call session tells the STT whether the caller is on the phone, so
 * PHONE_AUDIO_MODE can give a SIP caller narrowband settings.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createProviderSTT = vi.fn((..._args: unknown[]) => undefined);

vi.mock('../../model-provider/index.js', () => ({
  createProviderSTT: (...args: unknown[]) => createProviderSTT(...args),
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

async function build(phone?: boolean): Promise<void> {
  await createCallSession({
    persona: { id: 'ferni' } as never,
    sessionId: 's1',
    services: {} as never,
    userData: {} as never,
    llmModel: {},
    tts: {} as never,
    phone,
  });
}

describe('createCallSession STT caller', () => {
  beforeEach(() => {
    process.env.DISABLE_VAD = 'true';
    createProviderSTT.mockClear();
  });

  it('marks a phone caller for the STT', async () => {
    await build(true);
    expect(createProviderSTT).toHaveBeenCalledTimes(1);
    expect(createProviderSTT.mock.calls[0][2]).toEqual({ phone: true });
  });

  it('marks an app caller as not on the phone', async () => {
    await build(false);
    expect(createProviderSTT.mock.calls[0][2]).toEqual({ phone: false });
    await build(undefined);
    expect(createProviderSTT.mock.calls[1][2]).toEqual({ phone: false });
  });
});
