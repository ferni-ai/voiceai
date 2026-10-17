/**
 * An easy stop: a family member who says "stop calling" on a check-in call is
 * never rung for a check-in again. Real path: listenForStop on the session's
 * addTurn, then finishCallTypeContexts at session end with the signed
 * dispatch. Only the consent store and the do-not-call write are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { withdraw, recordCallOptOut } = vi.hoisted(() => ({
  withdraw: vi.fn(async () => true),
  recordCallOptOut: vi.fn(async () => true),
}));
vi.mock('../../../services/stores/family-call-consent-store.js', () => ({
  createFamilyConsentStore: () => ({ withdraw }),
}));
vi.mock('../../../services/outreach/call-retry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/outreach/call-retry.js')>()),
  recordCallOptOut,
}));

const { listenForStop } = await import('../family-checkin-stop.js');
const { finishCallTypeContexts } = await import('../../voice-agent-entry/metadata-parser.js');
const { signDispatch } = await import('../../../services/outreach/on-behalf-dispatch.js');

const SECRET = 'lk-test-secret';
const dispatch = {
  type: 'family_checkin',
  callId: 'call-1',
  sponsorUserId: 'seth-uid',
  sponsorName: 'Seth',
  sponsoredIdentityId: 'doug-id',
  familyMemberPhone: '8015550100',
  familyMemberName: 'Doug',
};

/** A check-in session: the family member says `said`, then the session ends. */
async function checkinCall(sessionId: string, said: string[], raw: string) {
  const memory: Array<[string, string]> = [];
  const services = {
    addTurn: (role: 'user' | 'assistant', text: string) => void memory.push([role, text]),
  };
  listenForStop(sessionId, services);
  services.addTurn('assistant', "Hi Doug, it's Ferni. Seth asked me to check in on you.");
  for (const text of said) services.addTurn('user', text);
  const metadata = JSON.parse(raw) as Record<string, unknown>;
  await finishCallTypeContexts(metadata, 'family_checkin', sessionId, 60_000, raw);
  return memory;
}
const signed = () => JSON.stringify(signDispatch(dispatch, SECRET));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('LIVEKIT_API_SECRET', SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe('with FAMILY_CHECKIN_STOP on', () => {
  beforeEach(() => vi.stubEnv('FAMILY_CHECKIN_STOP', 'on'));

  it('"please stop calling" withdraws his consent and puts the number on the do-not-call list', async () => {
    await checkinCall('s-stop', ["I'm fine. Please stop calling me, okay?"], signed());
    expect(withdraw).toHaveBeenCalledWith('doug-id', expect.any(Date));
    expect(recordCallOptOut).toHaveBeenCalledWith('8015550100', {
      callId: 'call-1',
      requesterUserId: 'seth-uid',
    });
  });

  it('hears "don’t call me again" with a typographic apostrophe', async () => {
    await checkinCall('s-curly', ['Don’t call me again.'], signed());
    expect(withdraw).toHaveBeenCalledWith('doug-id', expect.any(Date));
  });

  it('an ordinary goodbye changes nothing', async () => {
    await checkinCall('s-bye', ["I'm doing well, thanks", 'Talk soon, bye now'], signed());
    expect(withdraw).not.toHaveBeenCalled();
    expect(recordCallOptOut).not.toHaveBeenCalled();
  });

  it('Ferni saying the words does not count, only the family member', async () => {
    const services = { addTurn: (_role: 'user' | 'assistant', _text: string) => undefined };
    listenForStop('s-ferni', services);
    services.addTurn('assistant', 'I will stop calling if you ever want me to.');
    services.addTurn('user', 'No, I like the calls.');
    const raw = signed();
    await finishCallTypeContexts(JSON.parse(raw), 'family_checkin', 's-ferni', 60_000, raw);
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('an unsigned dispatch does nothing', async () => {
    await checkinCall('s-unsigned', ['Stop calling me'], JSON.stringify(dispatch));
    expect(withdraw).not.toHaveBeenCalled();
    expect(recordCallOptOut).not.toHaveBeenCalled();
  });

  it('a failed write never throws out of the session end', async () => {
    withdraw.mockRejectedValueOnce(new Error('firestore down'));
    await expect(checkinCall('s-fail', ['Stop calling me'], signed())).resolves.toBeDefined();
    expect(recordCallOptOut).toHaveBeenCalled();
  });

  it('every turn still reaches where it went before', async () => {
    const memory = await checkinCall('s-pass', ['Stop calling me'], signed());
    expect(memory.map(([role]) => role)).toEqual(['assistant', 'user']);
  });
});

describe('with FAMILY_CHECKIN_STOP off (the default)', () => {
  it('"stop calling" changes nothing and addTurn is left as it was', async () => {
    const addTurn = vi.fn();
    const services = { addTurn };
    listenForStop('s-off', services);
    expect(services.addTurn).toBe(addTurn);
    await checkinCall('s-off-2', ['Stop calling me'], signed());
    expect(withdraw).not.toHaveBeenCalled();
    expect(recordCallOptOut).not.toHaveBeenCalled();
  });
});
