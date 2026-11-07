/**
 * A conversation call (reachOut) to a contact keeps the contact's calling hours. The owner's id
 * rides the call (#3571) for their holds, grants and records, but their time zone and quiet hours
 * are theirs: a contact's hours go by the contact's area code, the owner's zone only as the
 * fallback, as on-behalf calls do. A call to the owner's own number keeps the owner's hours,
 * whether it is a call to them or their own number reached as a contact.
 *
 * Through the real makeConversationalCall, scheduleProactiveCall, holdForCallHours and
 * checkCallHours, with MESSAGING_PIPELINE and CALL_HOURS_GUARD on. Mocked: Firestore (in memory),
 * the account lookups (time zone, verified phone) and the Twilio client. Fictional numbers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeConsentDb } from '../../messaging/__tests__/memory-consent.js';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

vi.hoisted(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+12025550100',
    TWILIO_STREAM_WEBHOOK_URL: 'wss://stream.example.test',
  });
});
const OWNER = 'owner-1';
const OWNER_PHONE = '+12125550100'; // a New York number
const state = vi.hoisted(() => ({
  consent: null as unknown as { db: unknown },
  rows: [] as Row[],
  docs: {} as Record<string, Record<string, unknown>>,
  ownerZone: 'America/New_York',
}));
// Consent, holds: utils/firestore-utils. Calls, deferrals, quiet hours: superhuman/firestore-utils.
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => state.consent.db,
}));
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => {
    const base = fakeFirestore(state.rows);
    return {
      ...base,
      collection: (name: string) => ({
        doc: (id: string) => ({
          ...base.collection().doc(id),
          get: async () => ({
            exists: !!state.docs[`${name}/${id}`],
            data: () => state.docs[`${name}/${id}`],
          }),
        }),
      }),
    };
  },
}));
vi.mock('../user-contact.js', () => ({
  getUserContactInfo: async (id: string) =>
    id === OWNER ? { timezone: state.ownerZone } : undefined,
}));
vi.mock('../guarded-text.js', async (orig) => ({
  ...(await orig<typeof import('../guarded-text.js')>()),
  // Only the owner's own number is the owner's.
  isOwnVerifiedPhone: async (uid: string, phone: string) =>
    uid === OWNER && phone.replace(/\D/g, '') === OWNER_PHONE.replace(/\D/g, ''),
}));
vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: unknown) => config },
  log: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));
const callsCreate = vi.hoisted(() => vi.fn(async (_opts: unknown) => ({ sid: 'CA1' })));
vi.mock('twilio', () => ({ default: () => ({ calls: { create: callsCreate } }) }));

import { makeConversationalCall } from '../conversational-calls.js';
import { phoneHash } from '../checkin-replies.js';
import {
  defaultConsentDeps,
  registerMessagingConsent,
  writeOptOut,
} from '../../messaging/consent.js';
import { recordOwnerAttestation } from '../../messaging/consent-grants.js';

registerMessagingConsent(); // as each process entry does (utils/consent-port.ts)

const SF = '+14155550123'; // a San Francisco number: Pacific time
const NYC = '+12125550177'; // a New York number: Eastern time
const AT_15Z = new Date('2026-11-10T15:00:00Z'); // 10:00 New York, 07:00 San Francisco, 00:00 Tokyo

const twilioCalls = () => callsCreate.mock.calls.length;
const deferred = () => state.rows.filter((r) => r.collection === 'deferred_calls');
/** As reachOut calls a contact: the owner's id, the contact's number, toContact. */
const callContact = (phoneNumber: string) =>
  makeConversationalCall({
    userId: OWNER,
    toContact: true,
    phoneNumber,
    message: 'Thinking of you',
  });
/** The owner said yes to Ferni calling this number for them (a grant, MESSAGING_PIPELINE). */
const ownerGrant = async (phone: string) =>
  expect(
    await recordOwnerAttestation(phone, 'call', OWNER, defaultConsentDeps(), async () => true)
  ).toBe(true);

beforeEach(() => {
  state.consent = fakeConsentDb();
  state.rows = [];
  state.docs = {};
  state.ownerZone = 'America/New_York';
  vi.stubEnv('MESSAGING_PIPELINE', 'on');
  vi.stubEnv('CALL_HOURS_GUARD', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  vi.useFakeTimers({ toFake: ['Date'] });
  callsCreate.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('conversation call to a contact: the contact’s calling hours', () => {
  it('owner in New York, contact on a 415 number at 07:00 their time: waits for 9:00 Pacific', async () => {
    await ownerGrant(SF);
    vi.setSystemTime(AT_15Z);

    expect(await callContact(SF)).toMatchObject({ success: true, status: 'scheduled' });
    expect(twilioCalls()).toBe(0);
    expect(deferred()).toHaveLength(1);
    expect(deferred()[0].userId).toBe(OWNER); // the owner's held call, in their records
    expect(deferred()[0].data).toMatchObject({
      scheduledFor: '2026-11-10T17:00:00.000Z', // 09:00 Pacific
      timezone: 'America/Los_Angeles',
      timezoneSource: 'area_code',
    });
  });

  it('owner in Tokyo at midnight and in their own quiet hours: a contact at 10:00 their time is rung', async () => {
    state.ownerZone = 'Asia/Tokyo';
    state.docs[`bogle_users/${OWNER}`] = {
      outreachPreferences: { quietHours: { enabled: true, start: '22:00', end: '11:00' } },
    };
    await ownerGrant(NYC);
    vi.setSystemTime(AT_15Z);

    await callContact(NYC);
    expect(deferred()).toHaveLength(0);
    expect(twilioCalls()).toBe(1);
  });

  it('a contact who opted out of calls: refused, nothing dialled or held', async () => {
    await ownerGrant(SF);
    const hash = phoneHash(SF, { LOG_HASH_SECRET: 'test-secret' });
    if (!hash) throw new Error('no phone hash');
    await writeOptOut(hash, 'call', 'inbound-sms');
    vi.setSystemTime(new Date('2026-11-10T19:00:00Z')); // 11:00 Pacific

    expect(await callContact(SF)).toMatchObject({ success: false });
    expect(twilioCalls()).toBe(0);
    expect(deferred()).toHaveLength(0);
  });
});

describe('conversation call to the owner’s own number: the owner’s hours', () => {
  it('a call to them: their stored zone (Los Angeles) wins over their number’s area code', async () => {
    state.ownerZone = 'America/Los_Angeles';
    vi.setSystemTime(AT_15Z); // 10:00 on their New York number, 07:00 where they are

    const toThem = { userId: OWNER, phoneNumber: OWNER_PHONE, message: 'Thinking of you' };
    expect(await makeConversationalCall(toThem)).toMatchObject({
      success: true,
      status: 'scheduled',
    });
    expect(twilioCalls()).toBe(0);
    expect(deferred()[0].data).toMatchObject({
      scheduledFor: '2026-11-10T17:00:00.000Z', // 09:00 Los Angeles
      timezone: 'America/Los_Angeles',
      timezoneSource: 'stored',
    });
  });

  it('their own number reached as a contact: their quiet hours hold it, in their zone', async () => {
    state.ownerZone = 'America/Los_Angeles';
    state.docs[`bogle_users/${OWNER}`] = {
      outreachPreferences: { quietHours: { enabled: true, start: '10:00', end: '14:00' } },
    };
    vi.setSystemTime(new Date('2026-11-10T19:00:00Z')); // 11:00 Los Angeles

    expect(await callContact(OWNER_PHONE)).toMatchObject({ success: true, status: 'scheduled' });
    expect(twilioCalls()).toBe(0);
    expect(deferred()[0].data).toMatchObject({ scheduledFor: '2026-11-10T22:00:00.000Z' });
  });
});
