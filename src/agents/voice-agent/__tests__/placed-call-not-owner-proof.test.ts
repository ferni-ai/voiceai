/**
 * PLACED_CALL_NOT_OWNER_PROOF (verified-caller.ts): a call Ferni placed to the
 * owner's number (a proactive self-call) carries a signed dispatch that names
 * the account, but anyone can answer it. With the flag on, the session is
 * recognised like an inbound call from that number (accountNamedByDispatch),
 * so it is never a dispatch-proven owner: no tools that reach other people
 * (mayReachOthers), no reading the owner's texts (signedInOwnerSession), and a
 * caller under 18 is held by MINOR_CARE like anyone else. With the flag off,
 * all of it is exactly as before. Web/app and inbound sessions are unchanged
 * either way. Runs the real identifyUser; only caller recognition's SIP lookup
 * is faked. All data is fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '@livekit/rtc-node';

import { InMemoryStore } from '../../../memory/storage/in-memory-store.js';
import { signDispatch } from '../../../services/outreach/on-behalf-dispatch.js';
import { selfCallDispatch } from '../../../services/outreach/proactive-channels/self-call.js';

const OWNER = 'uid-placed-owner';
const store = new InMemoryStore();
/** What the SIP lookup finds on the line: nothing (not SIP), a stranger, or the owner's number with attestation A. */
const line = vi.hoisted(() => ({ found: 'none' as 'none' | 'stranger' | 'known' }));

vi.mock('../../../memory/firestore-store.js', () => ({ getFirestoreStore: () => store }));
vi.mock('../../../services/identity/identity-linking.js', () => ({
  autoLinkOnAuth: vi.fn(async () => undefined),
}));
vi.mock('../../../services/superhuman/commitment-prefetch.js', () => ({
  prefetchUserCommitments: vi.fn(async () => {}),
}));
vi.mock('../../../services/trust-and-identity/voice-agent-integration.js', () => ({
  onSessionStart: vi.fn(async () => ({})),
}));
vi.mock('../../../services/voice/voice-speaker-change.js', () => ({
  getSpeakerChangeDetector: () => ({ on: vi.fn(), start: vi.fn() }),
}));
vi.mock('../../voice-agent-entry/caller-recognition.js', async (orig) => {
  const real = await orig<typeof import('../../voice-agent-entry/caller-recognition.js')>();
  return {
    ...real,
    recognizePhoneSession: vi.fn(async (_room: unknown, sessionId: string) => {
      if (line.found === 'none') return null;
      const known = line.found === 'known';
      real.rememberCallerRecognition(sessionId, {
        status: known ? 'known' : 'stranger',
        attestation: known ? 'A' : 'none',
        ...(known ? { userId: OWNER, name: 'Pat' } : {}),
      });
      return known ? { userId: OWNER, userName: 'Pat' } : {};
    }),
  };
});

const { setGlobalStore } = await import('../../../services/identity/user-identification.js');
const { identifyUser } = await import('../user-identification-handler.js');
const recognition = await import('../../voice-agent-entry/caller-recognition.js');
const { mayReachOthers } = await import('../../shared/third-party-tools.js');
const { signedInOwnerSession } = await import('../../voice-agent-entry/sms-owner-register.js');
const minorCare = await import('../../../utils/minor-care.js');

const SECRET = 'livekit-test-secret';
const room = {} as Room;
let seq = 0;

const selfCall = () =>
  signDispatch(selfCallDispatch(OWNER, 'call-1', { kind: 'planned_checkin', reason: 'checking in', sourceId: 't1' }), SECRET); // prettier-ignore
const appSession = () => signDispatch({ user_id: OWNER }, SECRET);
const signedInWeb = () => ({ firebase_uid: OWNER, firebase_account: true });
const inbound = () => signDispatch({ type: 'inbound_call', user_id: OWNER }, SECRET);

/** One call through the real identifyUser, and every owner check that keys on its session. */
async function call(metadata: Record<string, unknown>) {
  const sessionId = `placed-${++seq}`;
  const result = await identifyUser({ jobMetadata: JSON.stringify(metadata), room, sessionId });
  return {
    userId: result.userId,
    verified: result.verified,
    verifiedOwner: recognition.sessionIsVerifiedOwner(sessionId),
    mayReachOthers: mayReachOthers(result.userId, sessionId, recognition.sessionIsVerifiedOwner),
    readsOwnTexts: signedInOwnerSession(sessionId),
    phoneSafeTools: recognition.phoneOnlyIdentity(sessionId),
    sessionId,
  };
}

beforeEach(() => {
  vi.stubEnv('LIVEKIT_API_SECRET', SECRET);
  setGlobalStore(store);
  line.found = 'none';
});
afterEach(() => vi.unstubAllEnvs());

describe('flag off (the default): a self-call is the dispatch-proven owner, as today', () => {
  it.each(['off', 'on'])('with CALLER_RECOGNITION %s', async (recognitionFlag) => {
    vi.stubEnv('CALLER_RECOGNITION', recognitionFlag);
    line.found = 'known'; // never consulted: the dispatch named the account
    expect(await call(selfCall())).toMatchObject({
      userId: OWNER,
      verified: true,
      verifiedOwner: true,
      mayReachOthers: true,
      readsOwnTexts: true,
      phoneSafeTools: false,
    });
  });
});

describe('flag on: whoever answers a call Ferni placed proves no owner', () => {
  beforeEach(() => vi.stubEnv('PLACED_CALL_NOT_OWNER_PROOF', 'on'));

  it('CALLER_RECOGNITION off (prod today): still the account, but no tool reaches others and no texts are read', async () => {
    vi.stubEnv('CALLER_RECOGNITION', 'off');
    expect(await call(selfCall())).toMatchObject({
      userId: OWNER,
      verified: true, // nothing re-identified the line; owner-only tools refuse via ownerProvenOnThisCall
      verifiedOwner: false,
      mayReachOthers: false,
      readsOwnTexts: false,
    });
  });

  it("CALLER_RECOGNITION on, the owner's number reads 'known': their account, phone-safe tools only", async () => {
    vi.stubEnv('CALLER_RECOGNITION', 'on');
    line.found = 'known';
    expect(await call(selfCall())).toMatchObject({
      userId: OWNER,
      verified: false, // deliberate: a number names the caller now, as on an inbound call
      verifiedOwner: true, // recognition 'known', exactly as an inbound call from that number
      readsOwnTexts: false, // a phone-only identity never reads texts
      phoneSafeTools: true,
    });
  });

  it('CALLER_RECOGNITION on, the line is not recognised: a fresh anon: caller, nothing of the account', async () => {
    vi.stubEnv('CALLER_RECOGNITION', 'on');
    line.found = 'stranger';
    expect(await call(selfCall())).toMatchObject({
      userId: expect.stringMatching(/^anon:/), // never the account the dispatch named
      verified: false,
      verifiedOwner: false,
      mayReachOthers: false,
      readsOwnTexts: false,
    });
  });

  it('a caller under 18 on a self-call is held by MINOR_CARE (today a self-call is exempt as the owner)', async () => {
    vi.stubEnv('CALLER_RECOGNITION', 'off');
    vi.stubEnv('MINOR_CARE', 'on');
    const on = await call(selfCall());
    minorCare.noteCallerWords(on.sessionId, "i'm 15");
    expect(minorCare.minorHeld(on.sessionId)).toBe(true);

    vi.stubEnv('PLACED_CALL_NOT_OWNER_PROOF', 'off');
    const off = await call(selfCall());
    minorCare.noteCallerWords(off.sessionId, "i'm 15");
    expect(minorCare.minorHeld(off.sessionId)).toBe(false);
  });
});

describe('web/app and inbound calls: unchanged by the flag', () => {
  it.each(['off', 'on'])('flag %s', async (flag) => {
    vi.stubEnv('PLACED_CALL_NOT_OWNER_PROOF', flag);
    vi.stubEnv('CALLER_RECOGNITION', 'on');
    for (const app of [appSession(), signedInWeb()]) {
      expect(await call(app)).toMatchObject({ userId: OWNER, verified: true, verifiedOwner: true, mayReachOthers: true, readsOwnTexts: true }); // prettier-ignore
    }
    line.found = 'stranger';
    expect(await call(inbound())).toMatchObject({ userId: expect.stringMatching(/^anon:/), verified: false, verifiedOwner: false, mayReachOthers: false }); // prettier-ignore
  });

  it('accountNamedByDispatch changes only for a self-call, and only with the flag on', () => {
    const named = (type: string | undefined) =>
      recognition.accountNamedByDispatch('web_auth', JSON.stringify(type ? { type } : {}));
    const types = [undefined, 'inbound_call', 'on_behalf_call', 'family_checkin', 'conversational_call', 'proactive_outreach']; // prettier-ignore
    const off = types.map(named);
    vi.stubEnv('PLACED_CALL_NOT_OWNER_PROOF', 'on');
    const on = types.map(named);
    expect(off).toEqual([true, false, true, true, true, true]);
    expect(on).toEqual([true, false, true, true, true, false]);
  });
});
