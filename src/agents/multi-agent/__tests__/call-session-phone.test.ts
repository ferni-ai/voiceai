/**
 * The call session tells the STT whether the caller is on the phone, so
 * PHONE_AUDIO_MODE can give a SIP caller narrowband settings, and gives the
 * interruption options and the PHONE_AUDIO_SUMMARY watcher the same answer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createProviderSTT = vi.fn((..._args: unknown[]) => undefined);
const watchPhoneAudio = vi.fn();
const built: { opts: unknown }[] = [];

vi.mock('../../model-provider/index.js', () => ({
  createProviderSTT: (...args: unknown[]) => createProviderSTT(...args),
  buildCascadeKeyterms: () => ['Ferni'],
  getModelProvider: () => ({ getSessionTurnDetection: () => 'stt', speaksNatively: () => false }),
}));
vi.mock('@livekit/agents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@livekit/agents')>()),
  voice: {
    AgentSession: class {
      constructor(readonly opts: unknown) {
        built.push(this);
      }
    },
  },
}));
vi.mock('../../shared/session-listener-limit.js', () => ({ limitSessionListeners: () => {} }));
vi.mock('../live-call-behaviors.js', () => ({ logBargeInDecisions: () => {} }));
vi.mock('../phone-audio-summary.js', () => ({
  watchPhoneAudio: (...args: unknown[]) => watchPhoneAudio(...args),
}));

const { createCallSession } = await import('../call-session.js');

interface Opts {
  turnHandling: { interruption: Record<string, unknown> };
}

async function build(phone?: boolean): Promise<Opts> {
  await createCallSession({
    persona: { id: 'ferni' } as never,
    sessionId: 's1',
    services: {} as never,
    userData: {} as never,
    llmModel: {},
    tts: {} as never,
    phone,
  });
  return built[built.length - 1]!.opts as Opts;
}

describe('createCallSession STT caller', () => {
  beforeEach(() => {
    process.env.DISABLE_VAD = 'true';
    delete process.env.PHONE_INTERRUPT_TUNING;
    createProviderSTT.mockClear();
    watchPhoneAudio.mockClear();
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

  it('PHONE_INTERRUPT_TUNING off: a phone caller gets the app caller session options', async () => {
    const app = JSON.stringify(await build(false));
    expect(JSON.stringify(await build(true))).toBe(app);
    expect(watchPhoneAudio).toHaveBeenCalledTimes(1);
    expect(watchPhoneAudio.mock.calls[0]?.slice(1)).toEqual(['s1', false]);
  });

  it('PHONE_INTERRUPT_TUNING on: only the phone caller session gets the tuned options', async () => {
    const before = JSON.stringify(await build(false));
    process.env.PHONE_INTERRUPT_TUNING = 'on';
    expect(JSON.stringify(await build(false))).toBe(before);
    expect(JSON.stringify(await build(undefined))).toBe(before);
    const phone = await build(true);
    expect(phone.turnHandling.interruption).toMatchObject({
      minDuration: 500,
      falseInterruptionTimeout: 1000,
      resumeFalseInterruption: true,
    });
    expect(watchPhoneAudio).toHaveBeenCalledTimes(1);
    expect(watchPhoneAudio.mock.calls[0]?.slice(1)).toEqual(['s1', true]);
  });
});
