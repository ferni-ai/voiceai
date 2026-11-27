/**
 * NAME_GUEST_NAMES_OWNER=on: rememberName (tools layer) asks utils/guest-names-owner.ts
 * whether a guest is on the line, and room-guests.ts (agents layer, which holds the
 * guest state) registers the answer when it loads. This proves the persona agent's own
 * module graph registers it (ferni-agent.ts → turn-request.ts → room-guests.ts), and
 * that with nothing registered no name is held and the gap is logged once.
 * Names are fictional: the account is Sam's, the guest is Raj.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const errors = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: Record<string, unknown>) => {
      const logger = real.createLogger(bindings);
      if (bindings.module !== 'GuestNamesOwner') return logger;
      return { ...logger, error: (_fields: unknown, msg: unknown) => errors.push(msg) };
    },
  };
});

vi.mock('../../voice-agent/audio-processor.js', () => ({
  processAudioStream: vi.fn(async () => undefined),
}));

function samCall(sessionId: string) {
  const userProfile = { id: 'u1', name: 'Sam Rivera', preferredName: 'Sam' };
  return { userData: { userId: 'u1', userName: 'Sam', services: { sessionId, userProfile } } };
}

beforeEach(() => {
  vi.resetModules(); // each test starts from an empty module graph
  vi.stubEnv('NAME_GUEST_NAMES_OWNER', 'on');
  vi.stubEnv('NAME_CAPTURE_STRICT', 'on');
  errors.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the guest check rememberName reads', () => {
  it('unregistered: holds nothing, and says so in the log once', async () => {
    const { accountNameHeld } = await import('../../../utils/guest-names-owner.js');
    expect(accountNameHeld(samCall('startup-unset').userData)).toBe(false);
    expect(accountNameHeld(samCall('startup-unset').userData)).toBe(false);
    expect(errors).toEqual(['NAME_GUEST_NAMES_OWNER: no guest check registered']);
  });

  it('is registered by loading the persona agent, and reads its guest state', async () => {
    await import('../ferni-agent.js');
    const { accountNameHeld } = await import('../../../utils/guest-names-owner.js');
    const session = samCall('startup-guest');
    expect(accountNameHeld(session.userData)).toBe(false); // no guest yet
    expect(errors).toEqual([]); // registered: the unset branch never ran
    const { roomGuestsNote } = await import('../room-guests.js');
    roomGuestsNote(session, 'Hey Ferni, this is Raj, a friend of Sam. How do I impress Sam?');
    expect(accountNameHeld(session.userData)).toBe(true);
    expect(accountNameHeld(samCall('startup-other').userData)).toBe(false); // per call
  }, 60_000); // importing ferni-agent takes ~15 s
});
