/**
 * NIGHT_WINDOW_ALL_PATHS (issue 3599): no proactive call rings, and no hold ends, inside the
 * callee's 21:00-08:00 on the member and own-number paths. Off, every cell is today's.
 *
 * A grid through the real makeConversationalCall: 5 owners x 12 callees x 48 half-hour slots on a
 * normal day, both US DST days and the UK DST day, in every combination of CALL_HOURS_GUARD,
 * QUIET_HOURS_UNIFIED and NIGHT_WINDOW_ALL_PATHS. Mocked: Firestore (in memory), the account
 * lookups (time zone, verified phone) and the Twilio client. Fictional numbers.
 * Round 2: owners with saved windows that end on the minute, read on the server clock; every grid
 * runs with the server in UTC (prod) and in New York. With the flag on, a call that has no allowed
 * time within a week is refused (NO_ALLOWED_TIME), never held into a night.
 * CALL_GRID_DUMP=<file.json> writes every cell, to compare a run against another tree.
 */
import { writeFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  stuckNight: false, // policy.ts holds every call-hours ask an hour more, forever
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
vi.mock('../../messaging/policy.js', async (orig) => {
  const real = await orig<typeof import('../../messaging/policy.js')>();
  return {
    ...real,
    decide: (...[intent, ctx]: Parameters<typeof real.decide>) =>
      state.stuckNight && intent.intentKey === 'conversation-call'
        ? {
            action: 'hold',
            reason: 'quiet-hours',
            holdUntil: new Date(ctx.now.getTime() + 3_600_000),
          }
        : real.decide(intent, ctx),
  };
});
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
import { asCrisisCallMe, asOwnCallMe } from '../held-call.js';
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

const SAVED: Partial<Record<Owner, string>> = { nySaved: '22:00-07:00' };
/** A fresh store; `saved` ('HH:MM-HH:MM') is the owner's saved quiet hours. */
function reset(owner: Owner, saved = SAVED[owner]): void {
  state.consent = fakeConsentDb();
  state.rows = [];
  state.ownerZone = OWNERS[owner];
  state.stuckNight = false;
  const [start, end] = saved?.split('-') ?? [];
  state.docs = saved
    ? {
        [`bogle_users/${OWNER}`]: {
          outreachPreferences: { quietHours: { enabled: true, start, end } },
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

interface GridOpts {
  saved?: string;
  callees?: string[];
  slots?: Date[];
}
async function grid(
  owner: Owner,
  combo: (typeof COMBOS)[number],
  allPaths: 'on' | 'off',
  { saved, callees = Object.keys(CALLEES), slots = SLOTS }: GridOpts = {}
) {
  vi.stubEnv('CALL_HOURS_GUARD', combo.guard);
  vi.stubEnv('QUIET_HOURS_UNIFIED', combo.unified);
  vi.stubEnv('NIGHT_WINDOW_ALL_PATHS', allPaths);
  const cells = new Map<string, string>();
  for (const callee of callees) {
    for (const at of slots) {
      reset(owner, saved);
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
const SERVER_TZS = ['UTC', 'America/New_York'] as const;
const REFUSED = 'refused Not calling: NO_ALLOWED_TIME';
/** When the cell's call goes: now when rung, its hold end, never when refused. */
const goes = (at: Date, outcome: string): number =>
  outcome === 'rang'
    ? at.getTime()
    : outcome.startsWith('held ')
      ? Date.parse(outcome.slice(5))
      : Infinity;
/** Inside the saved window on the server clock (what serverClockQuiet reads). */
function inSaved(t: number, saved?: string): boolean {
  if (!saved) return false;
  const [start, end] = saved
    .split('-')
    .map((hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)));
  const min = new Date(t).getHours() * 60 + new Date(t).getMinutes();
  return start <= end ? min >= start && min < end : min >= start || min < end;
}
/**
 * Flag on against off, cell by cell: no night cell; callees other than the member and their own
 * number unchanged; never sooner, except where off's hold ends inside the saved window (the end
 * hour without its minutes, e.g. 18:00 in 12:00-18:30). Returns the NO_ALLOWED_TIME refusals.
 */
function onAgainstOff(
  owner: Owner,
  off: Map<string, string>,
  on: Map<string, string>,
  saved?: string
): number {
  expect(nightCells(owner, on)).toEqual([]);
  let refused = 0;
  for (const [key, was] of off) {
    const now = on.get(key) ?? '';
    const at = new Date(key.split('|')[1]);
    if (!/^(member|own)\|/.test(key)) expect([key, now]).toEqual([key, was]);
    if (goes(at, now) < goes(at, was)) {
      expect([key, was, inSaved(goes(at, was), saved)]).toEqual([key, was, true]);
    }
    if (now === REFUSED) refused++;
  }
  return refused;
}
/** Today's night cells (flag off), per server clock, owner and guard|unified. */
const OFF_NIGHT: Record<string, number> = {
  'UTC|ny|off|off': 88,
  'UTC|ny|off|on': 8,
  'UTC|la|off|off': 88,
  'UTC|tokyo|off|off': 88,
  'UTC|tokyo|off|on': 164,
  'UTC|london|off|off': 88,
  'UTC|london|off|on': 44,
  'UTC|london|on|off': 36,
  'UTC|london|on|on': 36,
  'UTC|nySaved|off|off': 144,
  'UTC|nySaved|off|on': 8,
  // New York: the same, but nySaved's 22:00-07:00 ends at 07:00 New York (the issue's 736).
  'America/New_York|ny|off|off': 88,
  'America/New_York|ny|off|on': 8,
  'America/New_York|la|off|off': 88,
  'America/New_York|tokyo|off|off': 88,
  'America/New_York|tokyo|off|on': 164,
  'America/New_York|london|off|off': 88,
  'America/New_York|london|off|on': 44,
  'America/New_York|london|on|off': 36,
  'America/New_York|london|on|on': 36,
  'America/New_York|nySaved|off|off': 88,
  'America/New_York|nySaved|off|on': 8,
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

describe.each(SERVER_TZS)(
  'NIGHT_WINDOW_ALL_PATHS: the callee-hours grid, server clock %s',
  (tz) => {
    beforeEach(() => void (process.env.TZ = tz));
    afterEach(() => void (process.env.TZ = 'UTC'));
    describe.each(Object.keys(OWNERS) as Owner[])('owner %s', (owner) => {
      it.each(COMBOS)(
        'guard $guard, unified $unified',
        async (combo) => {
          const tag = `${tz}|${combo.guard}|${combo.unified}|${owner}`;
          const off = await grid(owner, combo, 'off');
          const on = await grid(owner, combo, 'on');
          for (const [key, outcome] of off) dump[`off|${tag}|${key}`] = outcome;
          for (const [key, outcome] of on) dump[`on|${tag}|${key}`] = outcome;
          expect(off.size).toBe(12 * 192);
          // Off: today's night cells, all on the member and own-number paths.
          const offNight = nightCells(owner, off);
          expect(offNight.length).toBe(
            OFF_NIGHT[`${tz}|${owner}|${combo.guard}|${combo.unified}`] ?? 0
          );
          expect(offNight.filter(([key]) => !/^(member|own)\|/.test(key))).toEqual([]);
          // On: no night cell, other callees unchanged, never sooner; nothing refused here.
          expect(onAgainstOff(owner, off, on, SAVED[owner])).toBe(0);
        },
        600_000
      );
    });
  }
);

/** The verifier's wider grid: saved windows ending on the minute, and ones that leave no time. */
const WINDOWS = [
  '20:00-21:30',
  '17:00-19:00',
  '22:00-07:00',
  '06:00-09:00',
  '12:00-18:30',
  '19:00-23:00',
];
const WIDE_CALLEES = ['own', 'member', '212', '415'];
const WIDE_SLOTS = SLOTS.slice(0, 96); // 2026-11-10 and 2026-03-08 (US DST)
/** NO_ALLOWED_TIME refusals (flag on), per server clock, window and owner; all four combos. */
const WIDE_REFUSED: Record<string, number> = {
  'UTC|12:00-18:30|tokyo': 96,
  'UTC|19:00-23:00|tokyo': 48,
  'UTC|22:00-07:00|tokyo': 96,
  'America/New_York|12:00-18:30|tokyo': 96,
  'America/New_York|19:00-23:00|tokyo': 96,
};
describe.each(SERVER_TZS)('NIGHT_WINDOW_ALL_PATHS: saved windows, server clock %s', (tz) => {
  beforeEach(() => void (process.env.TZ = tz));
  afterEach(() => void (process.env.TZ = 'UTC'));
  describe.each(WINDOWS)('saved %s', (saved) => {
    it.each(['tokyo', 'la', 'london'] as const)(
      'owner %s, every combo',
      async (owner) => {
        const runs = [];
        for (const combo of COMBOS) {
          const opts = { saved, callees: WIDE_CALLEES, slots: WIDE_SLOTS };
          const off = await grid(owner, combo, 'off', opts);
          const on = await grid(owner, combo, 'on', opts);
          const tag = `${tz}|${combo.guard}|${combo.unified}|${owner}|${saved}`;
          for (const [key, outcome] of off) dump[`off|${tag}|${key}`] = outcome;
          for (const [key, outcome] of on) dump[`on|${tag}|${key}`] = outcome;
          runs.push({ off, on }); // every combo dumped before any assertion
        }
        let refused = 0;
        for (const { off, on } of runs) refused += onAgainstOff(owner, off, on, saved);
        expect(refused).toBe(WIDE_REFUSED[`${tz}|${saved}|${owner}`] ?? 0);
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
  // Saved hours 'HH:MM-HH:MM' on the server clock (UTC here).
  it.each([
    // 4. London owner, own 212 number, 00:00Z: London's night to 08:00, New York's to 13:00,
    //    the saved hours to 18:30 (three asks; one re-ask stops at 13:00).
    [
      'london',
      '12:00-18:30',
      'own',
      '2026-11-10T00:00:00Z',
      'off',
      'off',
      'rang',
      'held 2026-11-10T18:30:00.000Z',
    ],
    // 5. Tokyo owner, own 212 number, saved 01:00Z-02:30Z on both coasts: to 02:30Z, then New
    //    York's night to 13:00, Tokyo's to 23:00 (one re-ask stops at 16:00, LA's morning).
    [
      'tokyo',
      '20:00-21:30',
      'own',
      '2026-11-10T01:00:00Z',
      'off',
      'on',
      'held 2026-11-10T02:30:00.000Z',
      'held 2026-11-10T23:00:00.000Z',
    ],
    // 6. Guard on, as 4 (holdForAll): off held to London's 09:00 only.
    [
      'london',
      '12:00-18:30',
      'own',
      '2026-11-10T00:00:00Z',
      'on',
      'off',
      'held 2026-11-10T09:00:00.000Z',
      'held 2026-11-10T18:30:00.000Z',
    ],
    // 7. 18:15 inside 12:00-18:30: off waits to the end hour, the next day's 18:00 (still
    //    quiet); on, to 18:30 the same day.
    [
      'london',
      '12:00-18:30',
      'member',
      '2026-11-10T18:15:00Z',
      'off',
      'off',
      'held 2026-11-11T18:00:00.000Z',
      'held 2026-11-10T18:30:00.000Z',
    ],
    // 8. No allowed time: New York's night (01:00-12:00Z after the US clock change), Tokyo's
    //    (12:00-23:00Z) and the saved 19:00-23:00 on both coasts (23:00-06:00Z) leave none.
    //    Never settles: refused, 0 calls, 0 rows.
    ['tokyo', '19:00-23:00', 'own', '2026-03-08T15:00:00Z', 'off', 'on', 'rang', REFUSED],
  ] as const)(
    '%s saved %s, %s at %s, guard %s unified %s: off %s, on %s',
    async (owner, saved, callee, iso, guard, unified, off, on) => {
      reset(owner, saved);
      expect(await place(callee, at(iso, guard, unified, 'off'))).toBe(off);
      reset(owner, saved);
      expect(await place(callee, at(iso, guard, unified, 'on'))).toBe(on);
      // On never rings here: held is one stored row, refused is none.
      expect([callsCreate.mock.calls.length, state.rows.length]).toEqual([
        0,
        on === REFUSED ? 0 : 1,
      ]);
    }
  );
});

describe('NIGHT_WINDOW_ALL_PATHS on: a night that never ends', () => {
  // policy.ts keeps holding (stubbed): the member's night has no end. Off rings, as main; on
  // refuses NO_ALLOWED_TIME, never a throw. A contact's night throws, flag on or off, as main.
  it.each([
    ['member', 'rang', REFUSED],
    ['212', 'refused Error: Contact call: no time both coasts and the callee allow', 'same'],
  ] as const)('%s, 12:00 New York: off %s, on %s', async (callee, off, on) => {
    vi.stubEnv('CALL_HOURS_GUARD', 'off');
    vi.stubEnv('QUIET_HOURS_UNIFIED', 'off');
    const outcomes: string[] = [];
    for (const allPaths of ['off', 'on']) {
      vi.stubEnv('NIGHT_WINDOW_ALL_PATHS', allPaths);
      reset('ny');
      state.stuckNight = true;
      outcomes.push(await place(callee, new Date('2026-11-10T17:00:00Z')));
    }
    expect(outcomes).toEqual([off, on === 'same' ? off : on]);
    expect([callsCreate.mock.calls.length, state.rows.length]).toEqual([0, 0]);
  });
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

describe('NIGHT_WINDOW_ALL_PATHS on: their own "call me" keeps main\'s hold time', () => {
  // Round 4: the flag's minute-precise end (serverClockQuiet) does not apply to their own "call
  // me": saved 12:00-18:30 on the server clock (UTC) holds to 18:00, as main, never to 18:30.
  it.each([
    ['2026-11-10T12:00:00Z', 'held 2026-11-10T18:00:00.000Z'],
    ['2026-11-10T15:00:00Z', 'held 2026-11-10T18:00:00.000Z'],
    ['2026-11-10T17:59:00Z', 'held 2026-11-10T18:00:00.000Z'],
    ['2026-11-10T18:00:00Z', 'held 2026-11-11T18:00:00.000Z'], // main: the next day's 18:00
  ])('asked at %s, guard off unified off: %s, flag off and on', async (iso, held) => {
    vi.stubEnv('CALL_HOURS_GUARD', 'off');
    vi.stubEnv('QUIET_HOURS_UNIFIED', 'off');
    for (const allPaths of ['off', 'on']) {
      vi.stubEnv('NIGHT_WINDOW_ALL_PATHS', allPaths);
      reset('london', '12:00-18:30');
      expect([allPaths, await place('member', new Date(iso), true)]).toEqual([allPaths, held]);
    }
  });

  const EIGHT = COMBOS.flatMap((c) => ['off', 'on'].map((prefs) => ({ ...c, prefs })));
  const HALF_HOUR_WINDOWS = ['12:00-18:30', '20:00-21:30', '22:00-07:30'];
  describe.each(SERVER_TZS)('server clock %s', (tz) => {
    beforeEach(() => void (process.env.TZ = tz));
    afterEach(() => void (process.env.TZ = 'UTC'));
    it.each(EIGHT)(
      'guard $guard, unified $unified, QUIET_HOURS_FROM_PREFS $prefs: on equals off',
      async ({ guard, unified, prefs }) => {
        vi.stubEnv('CALL_HOURS_GUARD', guard);
        vi.stubEnv('QUIET_HOURS_UNIFIED', unified);
        vi.stubEnv('QUIET_HOURS_FROM_PREFS', prefs);
        const outcomes = { off: [] as string[], on: [] as string[] };
        for (const allPaths of ['off', 'on'] as const) {
          vi.stubEnv('NIGHT_WINDOW_ALL_PATHS', allPaths);
          for (const saved of HALF_HOUR_WINDOWS) {
            for (const owner of ['london', 'tokyo'] as const) {
              for (const slot of SLOTS.slice(0, 48)) {
                reset(owner, saved);
                const [quietStart, quietEnd] = saved.split('-'); // the menu's window too
                Object.assign(state.docs[`bogle_users/${OWNER}`], {
                  messagingPrefs: { quietStart, quietEnd },
                });
                outcomes[allPaths].push(await place('member', slot, true));
              }
            }
          }
        }
        expect(outcomes.on.length).toBe(3 * 2 * 48);
        // Not vacuous: the saved windows hold some asks and let others ring, in every combo.
        expect(['held', 'rang'].map((k) => outcomes.on.some((o) => o.startsWith(k)))).toEqual([
          true,
          true,
        ]);
        expect(outcomes.on).toEqual(outcomes.off);
      },
      600_000
    );
  });
});

describe('a crisis text\'s "call me" rings now with the guard off, on every night-window setting', () => {
  // Round 7: hoursApply (scheduleProactiveCall) skips calleeCallHold and its NO_ALLOWED_TIME
  // refusal for a request call-user-adapter.ts marked asCrisisCallMe (Seth, 2026-11-06). Not
  // vacuous: the same request unmarked is held or refused in every cell, so each ask is inside a
  // night. London owner, a call to them, saved 12:00-18:30 on the server clock (UTC), 15:00Z.
  const AT = new Date('2026-11-10T15:00:00Z');
  type Mark = 'none' | 'crisis' | 'crisis+own';
  /** 'rang <scheduledFor>', 'held <iso>' or the refusal, for one request asked at AT. */
  async function ask(mark: Mark, stuckNight: boolean): Promise<string> {
    reset('london', '12:00-18:30');
    state.stuckNight = stuckNight;
    vi.setSystemTime(AT);
    const message = 'Thinking of you';
    const request = {
      ...{ userId: OWNER, phoneNumber: OWNER_PHONE, message, personaId: 'ferni' },
      ...{ ssml: `<speak>${message}</speak>`, reason: 'user_requested_call' },
    };
    if (mark === 'crisis') asCrisisCallMe(request); // the mark alone, not their own "call me"
    if (mark === 'crisis+own') asCrisisCallMe(asOwnCallMe(request)); // as call-user-adapter.ts
    const result = await scheduleProactiveCall(request);
    const row = state.rows.find((r) =>
      ['deferred_calls', 'scheduled_calls'].includes(r.collection)
    );
    if (callsCreate.mock.calls.length) return `rang ${String(row?.data.scheduledFor)}`;
    return row ? `held ${String(row.data.scheduledFor)}` : `refused ${result.error ?? ''}`;
  }
  it.each([
    // Saved hours: unmarked, held to their end (18:00 as main; 18:30 with the flag on).
    [false, 'off', 'off', 'held 2026-11-10T18:00:00.000Z'],
    [false, 'on', 'off', 'held 2026-11-10T18:30:00.000Z'],
    // And a night that never ends (policy.ts stubbed): with the flag on, unmarked is refused.
    [true, 'off', 'off', 'held 2026-11-10T18:00:00.000Z'],
    [true, 'on', 'off', REFUSED],
    [true, 'on', 'on', REFUSED],
  ] as const)(
    'never-ending night %s, NIGHT_WINDOW_ALL_PATHS %s, unified %s: unmarked %s, crisis rings now',
    async (stuckNight, allPaths, unified, unmarked) => {
      vi.stubEnv('CALL_HOURS_GUARD', 'off');
      vi.stubEnv('QUIET_HOURS_UNIFIED', unified);
      vi.stubEnv('NIGHT_WINDOW_ALL_PATHS', allPaths);
      const now = `rang ${AT.toISOString()}`; // placed at once, scheduled for the ask, no delay
      expect([
        await ask('none', stuckNight),
        await ask('crisis', stuckNight),
        await ask('crisis+own', stuckNight),
      ]).toEqual([unmarked, now, now]);
    }
  );
});
