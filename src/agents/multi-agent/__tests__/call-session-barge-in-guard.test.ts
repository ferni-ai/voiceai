/**
 * BARGE_IN_GUARD reaches LiveKit: the session the call builds resolves its
 * interruption options from our overrides, not from the 150 ms voiceOptions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../model-provider/index.js', () => ({
  createProviderSTT: () => undefined,
  buildCascadeKeyterms: () => ['Ferni'],
  getModelProvider: () => ({ getSessionTurnDetection: () => 'stt', speaksNatively: () => false }),
}));
vi.mock('../../shared/session-listener-limit.js', () => ({ limitSessionListeners: () => {} }));
vi.mock('../live-call-behaviors.js', () => ({ logBargeInDecisions: () => {} }));

const { createCallSession } = await import('../call-session.js');

interface Resolved {
  sessionOptions: {
    turnHandling: { interruption: { minDuration: number; falseInterruptionTimeout: number } };
  };
}

async function interruption() {
  process.env.DISABLE_VAD = 'true';
  const session = (await createCallSession({
    persona: { id: 'ferni' } as never,
    sessionId: 's1',
    services: {} as never,
    userData: {} as never,
    llmModel: {},
    tts: {} as never,
  })) as unknown as Resolved;
  return session.sessionOptions.turnHandling.interruption;
}

describe('createCallSession barge-in guard', () => {
  afterEach(() => {
    delete process.env.BARGE_IN_GUARD;
  });

  it('keeps the 150 ms gate and LiveKit 2 s resume when the guard is off', async () => {
    const opts = await interruption();
    expect(opts.minDuration).toBe(150);
    expect(opts.falseInterruptionTimeout).toBe(2000);
  });

  it('BARGE_IN_GUARD=on: 500 ms of speech to pause, 1 s to resume', async () => {
    process.env.BARGE_IN_GUARD = 'on';
    const opts = await interruption();
    expect(opts.minDuration).toBe(500);
    expect(opts.falseInterruptionTimeout).toBe(1000);
  });
});
