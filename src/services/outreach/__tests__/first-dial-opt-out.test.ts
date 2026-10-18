/**
 * The first dial of an on-behalf call honours the do-not-call list when
 * ON_BEHALF_DNC_CHECK is on. The orchestrator is real; the list and the
 * call-hours hold are mocked. The hold is the first step after the check, so
 * reaching it means the call went on toward dialling.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const optedOut = vi.hoisted(() => new Set<string>());
const hold = vi.hoisted(() => vi.fn(async () => ({ id: 'deferred-1' })));

vi.mock('../call-retry.js', () => ({
  isCallOptedOut: vi.fn(async (phone: string) => optedOut.has(phone)),
}));
vi.mock('../deferred-calls.js', () => ({ holdForCallHours: hold }));

const { getOnBehalfCallOrchestrator } = await import('../on-behalf-call-orchestrator.js');
const { assertNotOptedOut, RecipientOptedOutError } = await import('../first-dial-opt-out.js');

const request = (phone: string) =>
  ({
    userId: 'seth-uid',
    userName: 'Seth',
    purpose: 'ask about Saturday',
    callType: 'personal',
    resolvedContact: { name: 'Pat', phone },
  }) as never;

describe('the first on-behalf dial', () => {
  afterEach(() => {
    optedOut.clear();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('is refused for a number on the do-not-call list when the check is on', async () => {
    vi.stubEnv('ON_BEHALF_DNC_CHECK', 'on');
    optedOut.add('+18015550100');
    await expect(
      getOnBehalfCallOrchestrator().initiateCall(request('+18015550100'))
    ).rejects.toThrow(RecipientOptedOutError);
    expect(hold).not.toHaveBeenCalled();
  });

  it('goes ahead for a number that is not on the list (control)', async () => {
    vi.stubEnv('ON_BEHALF_DNC_CHECK', 'on');
    optedOut.add('+18015550199');
    await expect(getOnBehalfCallOrchestrator().initiateCall(request('+18015550100'))).resolves.toBe(
      'deferred-1'
    );
    expect(hold).toHaveBeenCalledOnce();
  });

  it('is unchanged when the check is off, even for a listed number', async () => {
    vi.stubEnv('ON_BEHALF_DNC_CHECK', 'off');
    optedOut.add('+18015550100');
    await expect(getOnBehalfCallOrchestrator().initiateCall(request('+18015550100'))).resolves.toBe(
      'deferred-1'
    );
    expect(hold).toHaveBeenCalledOnce();
  });
});

describe('assertNotOptedOut', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('fails closed when the list cannot be read', async () => {
    vi.stubEnv('ON_BEHALF_DNC_CHECK', 'on');
    // isCallOptedOut answers true when the list can't be read; a lookup that throws must not dial either
    const unreadable = async () => {
      throw new Error('firestore down');
    };
    await expect(assertNotOptedOut('+18015550100', unreadable)).rejects.toThrow('firestore down');
  });

  it('does not look the number up when the check is off', async () => {
    vi.stubEnv('ON_BEHALF_DNC_CHECK', 'off');
    const lookup = vi.fn(async () => true);
    await assertNotOptedOut('+18015550100', lookup);
    expect(lookup).not.toHaveBeenCalled();
  });
});
