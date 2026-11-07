/**
 * NIGHT_WINDOW_ALL_PATHS (issue 3599): no proactive call rings, and no hold ends, inside the
 * callee's 21:00-08:00 on the member and own-number paths. Off, every cell is today's.
 *
 * A grid through the real makeConversationalCall: 5 owners x 12 callees x 48 half-hour slots on a
 * normal day, both US DST days and the UK DST day, in every combination of CALL_HOURS_GUARD,
 * QUIET_HOURS_UNIFIED and NIGHT_WINDOW_ALL_PATHS. Mocked: Firestore (in memory), the account
 * lookups (time zone, verified phone) and the Twilio client. Fictional numbers.
 * CALL_GRID_DUMP=<file.json> writes every cell, to compare a run against another tree.
 */
import { writeFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeConsentDb } from '../../messaging/__tests__/memory-consent.js';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

vi.hoisted(() => {
  Object.assign(process.env, {
    TZ: 'UTC', // the server clock that unified-off saved quiet hours read
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
  isOwnVerifiedPhone: async (uid: string, phone: string) =>
    uid === OWNER && phone.replace(/\D/g, '') === OWNER_PHONE.replace(/\D/g, ''),
}));
vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: unknown) => config },
  log: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));
const callsCreate = vi.hoisted(() => vi.fn(async (_opts: unknown) => ({ sid: 'CA1' })));
vi.mock('twilio', () => ({ default: () => ({ calls: { create: callsCreate } }) }));

import { makeConversationalCall, scheduleProactiveCall } from '../conversational-calls.js';
import { asOwnCallMe } from '../held-call.js';
import { phoneHash } from '../checkin-replies.js';
import {
  defaultConsentDeps,
  registerMessagingConsent,
  writeOptOut,
} from '../../messaging/consent.js';
import { recordOwnerAttestation } from '../../messaging/consent-grants.js';

registerMessagingConsent();

const OWNERS = {
  ny: 'America/New_York',
  la: 'America/Los_Angeles',
  tokyo: 'Asia/Tokyo',
  london: 'Europe/London',
  nySaved: 'America/New_York', // with saved quiet hours 22:00-07:00
} as const;
type Owner = keyof typeof OWNERS;
const NY = 'America/New_York';
/** Callee: its number, whether reached as a contact, the zone its night is in (none: unzoned). */
const CALLEES: Record<string, { phone: string; contact: boolean; zone?: string }> = {
  '212': { phone: '+12125550142', contact: true, zone: NY },
  '415': { phone: '+14155550123', contact: true, zone: 'America/Los_Angeles' },
  '808': { phone: '+18085550199', contact: true, zone: 'Pacific/Honolulu' },
  '907': { phone: '+19075550111', contact: true, zone: 'America/Anchorage' },
  '305': { phone: '+13055550133', contact: true, zone: NY },
  uk: { phone: '+447700900123', contact: true },
  '800': { phone: '+18005550142', contact: true },
  '888': { phone: '+18885550143', contact: true },
  '533': { phone: '+15335550144', contact: true }, // unmapped area code
  short: { phone: '5550145', contact: true }, // 7 digits
  own: { phone: OWNER_PHONE, contact: true, zone: NY }, // their own number: the dialled zone
  member: { phone: OWNER_PHONE, contact: false }, // a call to them: their stored zone
};
const DAYS = ['2026-11-10', '2026-03-08', '2026-11-01', '2026-10-25'];
const SLOTS = DAYS.flatMap((d) =>
  Array.from({ length: 48 }, (_, i) => new Date(Date.parse(`${d}T00:00:00Z`) + i * 1_800_000))
);
const COMBOS = ['off', 'on'].flatMap((guard) =>
  ['off', 'on'].map((unified) => ({ guard, unified }))
);
const night = (at: Date, zone: string): boolean => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(at)
    .split(':')
    .map(Number);
  return h * 60 + m >= 21 * 60 || h * 60 + m < 8 * 60;
};

function reset(owner: Owner): void {
  state.consent = fakeConsentDb();
  state.rows = [];
  state.ownerZone = OWNERS[owner];
  state.docs =
    owner === 'nySaved'
      ? {
          [`bogle_users/${OWNER}`]: {
            outreachPreferences: { quietHours: { enabled: true, start: '22:00', end: '07:00' } },
          },
        }
      : {};
  callsCreate.mockClear();
}
const grant = (phone: string) =>
  recordOwnerAttestation(phone, 'call', OWNER, defaultConsentDeps(), async () => true);
/** 'rang', 'held <iso>' (deferred or stored for later), or the refusal. */
async function place(callee: string, at: Date, ownCallMe = false): Promise<string> {
  const { phone, contact } = CALLEES[callee];
  if (contact && callee !== 'own') await grant(phone);
  vi.setSystemTime(at);
  const message = 'Thinking of you';
  const result = ownCallMe
    ? await scheduleProactiveCall(
        asOwnCallMe({
          ...{ userId: OWNER, phoneNumber: phone, message, personaId: 'ferni' },
          ...{ ssml: `<speak>${message}</speak>`, reason: 'user_requested_call' }, // as call-user-adapter
        })
      )
    : await makeConversationalCall({
        userId: OWNER,
        phoneNumber: phone,
        message,
        toContact: contact,
      });
  if (callsCreate.mock.calls.length) return 'rang';
  const row = state.rows.find((r) => ['deferred_calls', 'scheduled_calls'].includes(r.collection));
  return row ? `held ${String(row.data.scheduledFor)}` : `refused ${result.error ?? ''}`;
}
/** Inside the callee's night: rung in it, or held to a time in it. Unzoned callees: never. */
function inNight(owner: Owner, callee: string, at: Date, outcome: string): boolean {
  const zone = callee === 'member' ? OWNERS[owner] : CALLEES[callee].zone;
  if (!zone) return false;
  if (outcome === 'rang') return night(at, zone);
  return outcome.startsWith('held ') && night(new Date(outcome.slice(5)), zone);
}

async function grid(owner: Owner, combo: (typeof COMBOS)[number], allPaths: 'on' | 'off') {
  vi.stubEnv('CALL_HOURS_GUARD', combo.guard);
  vi.stubEnv('QUIET_HOURS_UNIFIED', combo.unified);
  vi.stubEnv('NIGHT_WINDOW_ALL_PATHS', allPaths);
  const cells = new Map<string, string>();
  for (const callee of Object.keys(CALLEES)) {
    for (const at of SLOTS) {
      reset(owner);
      cells.set(`${callee}|${at.toISOString()}`, await place(callee, at));
    }
  }
  return cells;
}
const nightCells = (owner: Owner, cells: Map<string, string>) =>
  [...cells].filter(([key, outcome]) => {
    const [callee, iso] = key.split('|');
    return inNight(owner, callee, new Date(iso), outcome);
  });
const dump: Record<string, string> = {};
/** Today's night cells (flag off), per owner and guard|unified: the member and own-number paths. */
const OFF_NIGHT: Record<string, number> = {
  'ny|off|off': 88,
  'ny|off|on': 8,
  'la|off|off': 88,
  'tokyo|off|off': 88,
  'tokyo|off|on': 164,
  'london|off|off': 88,
  'london|off|on': 44,
  'london|on|off': 36,
  'london|on|on': 36,
  'nySaved|off|off': 144,
  'nySaved|off|on': 8,
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('MESSAGING_PIPELINE', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterAll(() => {
  if (process.env.CALL_GRID_DUMP) writeFileSync(process.env.CALL_GRID_DUMP, JSON.stringify(dump));
});

describe('NIGHT_WINDOW_ALL_PATHS: the callee-hours grid', () => {
  describe.each(Object.keys(OWNERS) as Owner[])('owner %s', (owner) => {
    it.each(COMBOS)(
      'guard $guard, unified $unified',
      async (combo) => {
        const tag = `${combo.guard}|${combo.unified}|${owner}`;
        const off = await grid(owner, combo, 'off');
        const on = await grid(owner, combo, 'on');
        for (const [key, outcome] of off) dump[`off|${tag}|${key}`] = outcome;
        for (const [key, outcome] of on) dump[`on|${tag}|${key}`] = outcome;
        expect(off.size).toBe(12 * 192);
        // Off: today's night cells, all on the member and own-number paths.
        const offNight = nightCells(owner, off);
        expect(offNight.length).toBe(OFF_NIGHT[`${owner}|${combo.guard}|${combo.unified}`] ?? 0);
        expect(offNight.filter(([key]) => !/^(member|own)\|/.test(key))).toEqual([]);
        // On: nothing rings, and no hold ends, inside any zoned callee's night.
        expect(nightCells(owner, on)).toEqual([]);
        // Only the member and their own number change; every other callee is as with it off.
        for (const [key, outcome] of off) {
          if (!/^(member|own)\|/.test(key)) expect([key, on.get(key)]).toEqual([key, outcome]);
        }
      },
      600_000
    );
  });
});

describe('NIGHT_WINDOW_ALL_PATHS: the three paths', () => {
  const at = (iso: string, guard: string, unified: string, allPaths: string) => {
    vi.stubEnv('CALL_HOURS_GUARD', guard);
    vi.stubEnv('QUIET_HOURS_UNIFIED', unified);
    vi.stubEnv('NIGHT_WINDOW_ALL_PATHS', allPaths);
    return new Date(iso);
  };
  it.each([
    // 1. A call to them, no saved quiet hours, 22:00 New York: rang; on, held to 08:00 there.
    ['ny', 'member', '2026-11-10T03:00:00Z', 'off', 'off', 'rang', 'held 2026-11-10T13:00:00.000Z'],
    // 2. Saved quiet hours on the server clock end at 02:00 New York; on, at 08:00 there.
    [
      'nySaved',
      'member',
      '2026-11-10T02:00:00Z',
      'off',
      'off',
      'held 2026-11-10T07:00:00.000Z',
      'held 2026-11-10T13:00:00.000Z',
    ],
    // 3. London owner, their own 212 number, guard on, 16:00 New York: held to 09:00 London
    //    (04:00 New York); on, to 09:00 New York (the dialled zone).
    [
      'london',
      'own',
      '2026-11-10T21:00:00Z',
      'on',
      'off',
      'held 2026-11-11T09:00:00.000Z',
      'held 2026-11-11T14:00:00.000Z',
    ],
  ] as const)(
    '%s, %s at %s, guard %s unified %s: off %s, on %s',
    async (owner, callee, iso, guard, unified, off, on) => {
      reset(owner);
      expect(await place(callee, at(iso, guard, unified, 'off'))).toBe(off);
      reset(owner);
      expect(await place(callee, at(iso, guard, unified, 'on'))).toBe(on);
    }
  );
});

describe('NIGHT_WINDOW_ALL_PATHS on: never gates their own "call me", opt-outs or grants', () => {
  it.each(COMBOS)(
    'their own "call me" from a live call, guard $guard unified $unified: as off',
    async (combo) => {
      vi.stubEnv('CALL_HOURS_GUARD', combo.guard);
      vi.stubEnv('QUIET_HOURS_UNIFIED', combo.unified);
      const outcomes = { off: [] as string[], on: [] as string[] };
      for (const allPaths of ['off', 'on'] as const) {
        vi.stubEnv('NIGHT_WINDOW_ALL_PATHS', allPaths);
        for (const owner of Object.keys(OWNERS) as Owner[]) {
          for (const slot of SLOTS) {
            reset(owner);
            outcomes[allPaths].push(await place('member', slot, true));
          }
        }
      }
      expect(outcomes.off.filter((o) => o.startsWith('refused'))).toEqual([]); // placed or held
      expect(outcomes.on).toEqual(outcomes.off);
      // It still rings inside their night where it did (guard off, no saved hours).
      const rangAtNight = outcomes.on.filter(
        (o, i) =>
          o === 'rang' &&
          night(SLOTS[i % 192], OWNERS[(Object.keys(OWNERS) as Owner[])[Math.floor(i / 192)]])
      );
      expect(rangAtNight.length > 0).toBe(combo.guard === 'off');
    },
    600_000
  );

  it.each(COMBOS)(
    'opt-out and no grant, guard $guard unified $unified: refused, as off',
    async (combo) => {
      vi.stubEnv('CALL_HOURS_GUARD', combo.guard);
      vi.stubEnv('QUIET_HOURS_UNIFIED', combo.unified);
      for (const allPaths of ['off', 'on'] as const) {
        vi.stubEnv('NIGHT_WINDOW_ALL_PATHS', allPaths);
        for (const slot of [new Date('2026-11-10T03:00:00Z'), new Date('2026-11-10T19:00:00Z')]) {
          reset('ny');
          vi.setSystemTime(slot);
          const sam = CALLEES['415'].phone;
          expect(await grant(sam)).toBe(true);
          const hash = phoneHash(sam, { LOG_HASH_SECRET: 'test-secret' });
          if (!hash) throw new Error('no phone hash');
          await writeOptOut(hash, 'call', 'inbound-sms');
          const optedOut = await makeConversationalCall({
            userId: OWNER,
            phoneNumber: sam,
            message: 'Hi',
            toContact: true,
          });
          const noGrant = await makeConversationalCall({
            userId: OWNER,
            phoneNumber: CALLEES['212'].phone,
            message: 'Hi',
            toContact: true,
          });
          expect([
            optedOut.success,
            noGrant.success,
            callsCreate.mock.calls.length,
            state.rows.length,
          ]).toEqual([false, false, 0, 0]);
        }
      }
    }
  );
});
