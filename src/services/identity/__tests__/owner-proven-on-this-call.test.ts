/**
 * ownerProvenOnThisCall (verified-caller.ts): the owner-only tools (bank data,
 * lights, the per-person search allowance) take the verified caller, except
 * that with PLACED_CALL_NOT_OWNER_PROOF on, whoever answers a call Ferni placed
 * proves nobody. Flag off: exactly verifiedCallerId. Real plaidCaller and LIFX
 * tool code; only the credential store is faked. All data is fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ credentialReads: [] as string[] }));
vi.mock('../../smart-home/user-credentials.js', () => ({
  getCredential: vi.fn(async (uid: string) => {
    h.credentialReads.push(uid);
    return undefined; // linked or not, a read means the tool acted for that caller
  }),
}));

import { plaidCaller } from '../../../tools/domains/finance/plaid-caller.js';
import { listCallerLights } from '../../../tools/domains/smart-home/caller-lifx-tools.js';
import {
  callerVerification,
  ownerProvenOnThisCall,
  verifiedAllowanceKey,
  verifiedCallerId,
} from '../verified-caller.js';

const OWNER = 'uid-proof-owner';
/** userData as voice-agent-entry builds it (callerVerification), for a call of this type. */
const data = (callType: string | undefined, verified = true) => ({
  userId: OWNER,
  ...callerVerification(verified, callType),
});
const run = (userData: unknown) => ({ ctx: { userData } });
const isUnverified = () => false;
const SELF_CALL = 'proactive_outreach';

afterEach(() => {
  vi.unstubAllEnvs();
  h.credentialReads.length = 0;
});

describe('flag off (the default): exactly verifiedCallerId', () => {
  it.each([SELF_CALL, 'inbound_call', undefined])('call type %s', (callType) => {
    const userData = data(callType);
    expect(ownerProvenOnThisCall(userData)).toBe(verifiedCallerId(userData));
    expect(ownerProvenOnThisCall(userData)).toBe(OWNER);
  });

  it('a self-call still opens bank data, lights and the per-person allowance, as today', async () => {
    expect(plaidCaller(run(data(SELF_CALL)))).toEqual({ outcome: 'verified', id: OWNER });
    expect(verifiedAllowanceKey(data(SELF_CALL), isUnverified)).toBe(`user:${OWNER}`);
    await listCallerLights(run(data(SELF_CALL)));
    expect(h.credentialReads).toEqual([OWNER]);
  });
});

describe('flag on: a self-call proves no owner', () => {
  it('ownerProvenOnThisCall is null for a self-call, and unchanged for every other call', () => {
    vi.stubEnv('PLACED_CALL_NOT_OWNER_PROOF', 'on');
    expect(verifiedCallerId(data(SELF_CALL))).toBe(OWNER); // the verifiedCaller bit itself is untouched
    expect(ownerProvenOnThisCall(data(SELF_CALL))).toBeNull();
    for (const callType of ['inbound_call', 'on_behalf_call', 'family_checkin', undefined]) {
      expect(ownerProvenOnThisCall(data(callType)), String(callType)).toBe(OWNER);
    }
    expect(ownerProvenOnThisCall(data(undefined, false))).toBeNull();
  });

  it('bank data asks to verify instead of reading the account', () => {
    vi.stubEnv('PLACED_CALL_NOT_OWNER_PROOF', 'on');
    expect(plaidCaller(run(data(SELF_CALL)))).toEqual({ outcome: 'needs_verification' });
    expect(plaidCaller(run(data(undefined)))).toEqual({ outcome: 'verified', id: OWNER });
  });

  it("the lights are refused, and the owner's saved token is never read", async () => {
    vi.stubEnv('PLACED_CALL_NOT_OWNER_PROOF', 'on');
    expect(await listCallerLights(run(data(SELF_CALL)))).toMatch(/signed-in account/);
    expect(h.credentialReads).toEqual([]);
    await listCallerLights(run(data(undefined)));
    expect(h.credentialReads).toEqual([OWNER]);
  });

  it("the search allowance is the strangers' bucket, not the owner's", () => {
    vi.stubEnv('PLACED_CALL_NOT_OWNER_PROOF', 'on');
    expect(verifiedAllowanceKey(data(SELF_CALL), isUnverified)).toBeNull();
    expect(verifiedAllowanceKey(data(undefined), isUnverified)).toBe(`user:${OWNER}`);
  });
});
