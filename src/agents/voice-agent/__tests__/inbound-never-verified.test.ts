/**
 * An inbound phone call is never a verified caller (isVerifiedIdentification,
 * verified-caller.ts): its caller is known only by caller ID. No signed
 * inbound_call dispatch exists today, so this runs one made up for the test,
 * naming a member, through the real identifyUser, and checks every owner-only
 * tool refuses. Web/app, self-call and on-behalf sessions are unchanged.
 * All data is fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '@livekit/rtc-node';

import { InMemoryStore } from '../../../memory/storage/in-memory-store.js';
import { signDispatch } from '../../../services/outreach/on-behalf-dispatch.js';
import { selfCallDispatch } from '../../../services/outreach/proactive-channels/self-call.js';

const OWNER = 'uid-inbound-owner';
const store = new InMemoryStore();
const h = vi.hoisted(() => ({ credentialReads: [] as string[] }));
vi.mock('../../../memory/firestore-store.js', () => ({ getFirestoreStore: () => store }));
vi.mock('../../../services/identity/identity-linking.js', () => ({ autoLinkOnAuth: vi.fn(async () => undefined) })); // prettier-ignore
vi.mock('../../../services/superhuman/commitment-prefetch.js', () => ({ prefetchUserCommitments: vi.fn(async () => {}) })); // prettier-ignore
vi.mock('../../../services/trust-and-identity/voice-agent-integration.js', () => ({ onSessionStart: vi.fn(async () => ({})) })); // prettier-ignore
vi.mock('../../../services/voice/voice-speaker-change.js', () => ({ getSpeakerChangeDetector: () => ({ on: vi.fn(), start: vi.fn() }) })); // prettier-ignore
vi.mock('../../../services/smart-home/user-credentials.js', () => ({
  getCredential: vi.fn(async (uid: string) => void h.credentialReads.push(uid)),
}));

const { setGlobalStore } = await import('../../../services/identity/user-identification.js');
const { identifyUser } = await import('../user-identification-handler.js');
const { callerVerification, verifiedAllowanceKey } = await import('../../../services/identity/verified-caller.js'); // prettier-ignore
const { plaidCaller } = await import('../../../tools/domains/finance/plaid-caller.js');
const { listCallerLights } = await import('../../../tools/domains/smart-home/caller-lifx-tools.js');
const { callerOf } = await import('../../../tools/domains/wellness/sleep-summary.js');

const SECRET = 'livekit-test-secret';
let seq = 0;

/** A call through the real identifyUser, then every owner-only tool with the userData index.ts builds. */
async function call(metadata: Record<string, unknown>) {
  const result = await identifyUser({ jobMetadata: JSON.stringify(metadata), room: {} as Room, sessionId: `in-${++seq}` }); // prettier-ignore
  const userData = { userId: result.userId, ...callerVerification(result.verified, metadata.type as string | undefined) }; // prettier-ignore
  const opts = { ctx: { userData } };
  h.credentialReads.length = 0;
  await listCallerLights(opts);
  return {
    verified: result.verified,
    plaid: plaidCaller(opts).outcome,
    sleep: callerOf(opts).verified,
    allowance: verifiedAllowanceKey(userData, () => false),
    lightsRead: h.credentialReads.length > 0,
  };
}
const owner = { verified: true, plaid: 'verified', sleep: true, allowance: `user:${OWNER}`, lightsRead: true }; // prettier-ignore

beforeEach(() => {
  vi.stubEnv('LIVEKIT_API_SECRET', SECRET);
  vi.stubEnv('CALLER_RECOGNITION', 'off'); // so only the dispatch decides
  setGlobalStore(store);
});
afterEach(() => vi.unstubAllEnvs());

describe('an inbound phone call', () => {
  it('is never verified, even signed and naming a member; no owner-only tool opens', async () => {
    expect(await call(signDispatch({ type: 'inbound_call', user_id: OWNER }, SECRET))).toEqual({
      verified: false,
      plaid: 'needs_verification',
      sleep: false,
      allowance: null,
      lightsRead: false,
    });
  });
});

describe('every other call: unchanged', () => {
  it('a signed-in app session (signed user_id, or /token firebase_uid) is the owner', async () => {
    expect(await call(signDispatch({ user_id: OWNER }, SECRET))).toEqual(owner);
    expect(await call({ firebase_uid: OWNER, firebase_account: true })).toEqual(owner);
  });

  it('a self-call is verified as before', async () => {
    const dispatch = selfCallDispatch(OWNER, 'c1', { kind: 'planned_checkin', reason: 'check in', sourceId: 't' }); // prettier-ignore
    expect((await call(signDispatch(dispatch, SECRET))).verified).toBe(true);
  });

  it('an on-behalf call is not verified, as before', async () => {
    const dispatch = { type: 'on_behalf_call', session_id: 'onbehalf:c2', requester: { userId: OWNER } }; // prettier-ignore
    expect((await call(signDispatch(dispatch, SECRET))).verified).toBe(false);
  });
});
