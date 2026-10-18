/**
 * The SMS reading tools read one number's texts with Ferni and no one
 * else's. Every member's texts sit on one Twilio account; before this, readSMS
 * listed the whole account to whoever asked, anonymous callers included.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER = '+15555550101';
const OTHER = '+15555550199';
const FERNI = '+15555550100';

const twilio = vi.hoisted(() => ({
  /** When true the fake ignores the to/from filter, as a misbehaving API would. */
  ignoreFilter: false,
  list: undefined as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('twilio', () => ({
  default: () => ({ messages: { list: twilio.list } }),
}));

vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  getFirebaseUser: vi.fn(async (uid: string) => {
    if (uid === 'uid-owner') return { uid, phoneNumber: OWNER };
    if (uid === 'uid-no-phone') return { uid };
    return null;
  }),
}));

import { setOutboundCallContext } from '../../../../intelligence/context-builders/external/outbound-call-context.js';
import {
  rememberCallerRecognition,
  rememberDispatchIdentity,
} from '../../../../agents/voice-agent-entry/caller-recognition.js';
import {
  SMS_OWNER_ONLY,
  checkNewMessagesDef,
  readSMSDef,
  registerSmsOwnerSessionCheck,
  searchMessagesDef,
} from '../sms-reading-tools.js';
import { signedInOwnerSession } from '../../../../agents/voice-agent-entry/sms-owner-register.js';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const ACCOUNT = [
  { sid: 'SM1', from: OWNER, to: FERNI, body: 'owner says hi', direction: 'inbound' },
  { sid: 'SM2', from: FERNI, to: OWNER, body: 'ferni replies to owner', direction: 'outbound-api' },
  { sid: 'SM3', from: OTHER, to: FERNI, body: 'other member secret', direction: 'inbound' },
  { sid: 'SM4', from: FERNI, to: OTHER, body: 'ferni to other member', direction: 'outbound-api' },
].map((m, i) => ({
  ...m,
  status: 'delivered',
  dateSent: minutesAgo(5 + i),
  dateCreated: minutesAgo(5 + i),
}));

type Exec = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };
const run = (def: typeof readSMSDef, ctx: { userId: string; sessionId?: string }, args = {}) =>
  (def.create({ ...ctx, agentId: 'ferni', agentDisplayName: 'Ferni' }) as unknown as Exec).execute(
    args,
    {}
  );

let n = 0;
function appSession(): string {
  const id = `sms-app-${n++}`;
  rememberDispatchIdentity(id, 'firebase', '{}');
  return id;
}

beforeAll(() => {
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'test-token';
});
afterAll(() => {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
});
beforeEach(() => {
  twilio.ignoreFilter = false;
  twilio.list = vi.fn(async (opts: { to?: string; from?: string }) =>
    ACCOUNT.filter(
      (m) =>
        twilio.ignoreFilter ||
        ((!opts.to || m.to === opts.to) && (!opts.from || m.from === opts.from))
    )
  );
  registerSmsOwnerSessionCheck(signedInOwnerSession);
});

describe('a signed-in owner reads only their own texts', () => {
  it('readSMS shows the texts with their verified number and never another member', async () => {
    const out = await run(readSMSDef, { userId: 'uid-owner', sessionId: appSession() });
    expect(out).toContain('owner says hi');
    expect(out).toContain('ferni replies to owner');
    expect(out).not.toContain('other member');
    for (const call of twilio.list.mock.calls) {
      const opts = call[0] as { to?: string; from?: string };
      expect(opts.to === OWNER || opts.from === OWNER).toBe(true);
    }
  });

  it('still drops other members when Twilio ignores the filter', async () => {
    twilio.ignoreFilter = true;
    const session = appSession();
    const read = await run(readSMSDef, { userId: 'uid-owner', sessionId: session });
    expect(read).not.toContain('other member');
    const found = await run(
      searchMessagesDef,
      { userId: 'uid-owner', sessionId: session },
      {
        query: 'secret',
      }
    );
    expect(found).not.toContain('other member secret');
    expect(found).toContain('No texts between us');
  });

  it("checkNewMessages and searchMessages count and find only the owner's texts", async () => {
    const session = appSession();
    expect(await run(checkNewMessagesDef, { userId: 'uid-owner', sessionId: session })).toBe(
      'Today: 1 text from me, 1 from you.'
    );
    const found = await run(
      searchMessagesDef,
      { userId: 'uid-owner', sessionId: session },
      {
        query: 'member',
      }
    );
    expect(found).not.toContain('other member');
  });
});

describe('everyone else is refused and Twilio is never asked', () => {
  it.each([
    ['an anonymous caller', { userId: 'anonymous', sessionId: 'sms-anon' }],
    ['a phone-first account', { userId: `phone:${OWNER}`, sessionId: 'sms-phone-id' }],
    ['no session', { userId: 'uid-owner' }],
  ])('%s', async (_label, ctx) => {
    for (const def of [readSMSDef, checkNewMessagesDef, searchMessagesDef]) {
      expect(await run(def, ctx, { query: 'hi' })).toBe(SMS_OWNER_ONLY);
    }
    expect(twilio.list).not.toHaveBeenCalled();
  });

  it("a caller matched only by caller ID, even to the owner's account", async () => {
    const id = 'sms-phone-only';
    rememberCallerRecognition(id, { status: 'known', attestation: 'A', userId: 'uid-owner' });
    expect(await run(readSMSDef, { userId: 'uid-owner', sessionId: id })).toBe(SMS_OWNER_ONLY);
    expect(twilio.list).not.toHaveBeenCalled();
  });

  it("a call Ferni placed to someone else on the owner's behalf", async () => {
    const id = appSession();
    setOutboundCallContext(id, {
      callId: 'c1',
      recipientName: 'Doug',
      recipientPhone: OTHER,
      purpose: 'check in',
      callType: 'personal',
      objective: '',
      script: '',
      complianceScript: '',
      mustConfirm: [],
      mustNotDo: [],
      informationToGather: [],
      userName: 'Owner',
      originalSessionId: 's0',
    });
    expect(await run(readSMSDef, { userId: 'uid-owner', sessionId: id })).toBe(SMS_OWNER_ONLY);
    expect(twilio.list).not.toHaveBeenCalled();
  });

  it('a signed-in member with no verified phone', async () => {
    expect(await run(readSMSDef, { userId: 'uid-no-phone', sessionId: appSession() })).toBe(
      SMS_OWNER_ONLY
    );
    expect(twilio.list).not.toHaveBeenCalled();
  });

  it('every session while the call layer has not registered its check', async () => {
    registerSmsOwnerSessionCheck(() => false);
    expect(await run(readSMSDef, { userId: 'uid-owner', sessionId: appSession() })).toBe(
      SMS_OWNER_ONLY
    );
    expect(twilio.list).not.toHaveBeenCalled();
  });
});
