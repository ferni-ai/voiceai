/**
 * QUIET_HOURS_FROM_PREFS is strictly additive, checked over a grid of times ×
 * time-zone setups × saved windows × every sender check: whatever a sender
 * refuses with the flag off (main's decision; flag-off parity is pinned
 * elsewhere), it refuses with the flag on too. With the flag on it also
 * refuses inside the saved window (except a call the user asked for), and any
 * "next allowed" time it offers is later than now and outside the saved window.
 *
 * CI runs a reduced grid. QUIET_HOURS_GRID=full runs every day and quarter hour
 * (about 10 minutes): 6 days incl. the US and UK DST changes, 144+ times each.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const users: Record<string, Record<string, unknown>> = {};
const profileTz: Record<string, string | undefined> = {};

vi.mock('../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const d = name === 'bogle_users' ? users[id] : undefined;
          return { exists: !!d, data: () => d, id };
        },
      }),
    }),
  }),
}));
vi.mock('../user-contact.js', () => ({
  getUserContactInfo: async (id: string) =>
    profileTz[id] ? { timezone: profileTz[id] } : undefined,
}));
const delivered: string[] = [];
vi.mock('../delivery/index.js', () => ({
  deliverOutreach: async (o: { userId: string }) => {
    delivered.push(o.userId);
    return { success: true };
  },
}));
vi.mock('../outreach-history.js', () => ({ outreachHistory: { recordAttempt: async () => {} } }));
vi.mock('../decision-engine.js', () => ({
  getOutreachDecisionEngine: () => ({
    getUserState: () => ({
      outreachEnabled: true,
      counters: { outreachToday: 0 },
      preferences: { maxPerDay: 10, preferredChannel: 'sms' },
    }),
  }),
}));
vi.mock('../proactive-channels/outreach-log.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  alreadySent: async () => false,
  recentOutreach: async () => [],
}));
vi.mock('../proactive-channels/proactive-tick.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isProactiveChannelsUser: async () => true,
}));

const qh = await import('../quiet-hours.js');
const guard = await import('../call-hours-guard.js');
const { chooseChannel } = await import('../proactive-channels/channel-policy.js');
const { timezoneOf } = await import('../proactive-channels/proactive-tick.js');
const { dailyCheckIn } = await import('../proactive-channels/daily-checkin.js');
const { isInQuietHours } = await import('../automated-scheduler.js');
const { evaluateTrigger } = await import('../../../workers/outreach-worker.js');
const { deliverAndRecord } = await import('../deliver-and-record.js');

const CHI = 'America/Chicago';
const LON = 'Europe/London';
type Shape = { mp?: Record<string, unknown>; op?: Record<string, unknown> };
const SAVED: Record<string, Shape> = {
  none: {},
  '20-0930': { mp: { quietStart: '20:00', quietEnd: '09:30' } },
  '22-07': { mp: { quietStart: '22:00', quietEnd: '07:00' } },
  '12-14': { mp: { quietStart: '12:00', quietEnd: '14:00' } },
  allday: { mp: { quietStart: '00:00', quietEnd: '23:59' } },
  '2330-0015': { mp: { quietStart: '23:30', quietEnd: '00:15' } },
  'bad-25': { mp: { quietStart: '25:00', quietEnd: '08:00' } },
  'plus-older': {
    mp: { quietStart: '20:00', quietEnd: '09:30' },
    op: { quietHours: { enabled: true, start: '22:00', end: '07:00' } },
  },
  'older-off': {
    mp: { quietStart: '22:00', quietEnd: '07:00' },
    op: { quietHours: { enabled: false, start: '22:00', end: '07:00' } },
  },
  'plus-hours': {
    mp: { quietStart: '23:00', quietEnd: '06:00' },
    op: { quietHoursStart: 21, quietHoursEnd: 9 },
  },
};
/** mp: the panel's zone, op: outreachPreferences.timezone, ci: contactInfo, prof: the profile. */
type Zones = { mp?: string; op?: string; ci?: string; prof?: string };
const ZONES: Record<string, Zones> = {
  none: {},
  chicago: { mp: CHI, op: CHI, prof: CHI },
  london: { mp: LON, op: LON, prof: LON },
  'panel-only': { mp: CHI },
  'panel-la-stored-ny': {
    mp: 'America/Los_Angeles',
    op: 'America/New_York',
    prof: 'America/New_York',
  },
  'contact-london': { ci: LON },
  'panel-invalid': { mp: 'Mars/Base', op: CHI, prof: CHI },
  tokyo: { mp: 'Asia/Tokyo', op: 'Asia/Tokyo', prof: 'Asia/Tokyo' },
};
const FULL = process.env.QUIET_HOURS_GRID === 'full';
const DAYS = FULL
  ? ['2026-01-15', '2026-03-08', '2026-03-29', '2026-07-15', '2026-10-25', '2026-11-01']
  : ['2026-03-08', '2026-10-25'];
const STEP_MIN = FULL ? 15 : 50;
const TIMES = DAYS.flatMap((d) => {
  const base = Date.parse(`${d}T00:00:00Z`);
  const out: Date[] = [];
  for (let m = 0; m < 24 * 60; m += STEP_MIN) out.push(new Date(base + m * 60_000));
  out.push(new Date(base + (20 * 60 + 29) * 60_000 + 30_000)); // a :29:30 edge
  return out;
});

function docOf(p: Shape, z: Zones): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  const op = { ...p.op, ...(z.op && { timezone: z.op }) };
  if (Object.keys(op).length) doc.outreachPreferences = op;
  if (z.ci) doc.contactInfo = { timezone: z.ci };
  if (p.mp || z.mp) doc.messagingPrefs = { ...p.mp, ...(z.mp && { zone: z.mp }) };
  return doc;
}

/** One decision: refused or not, and the "next allowed" time it offers when refused. */
type Decision = { refused: boolean; next?: Date };
type Check = {
  name: string;
  exemptFromSaved?: boolean;
  run: (uid: string, doc: Record<string, unknown>, now: Date) => Promise<Decision>;
};

const callGuard =
  (extra: Partial<Parameters<typeof guard.checkCallHours>[0]>) =>
  async (uid: string, doc: Record<string, unknown>, now: Date): Promise<Decision> => {
    const tz = (doc.outreachPreferences as { timezone?: string } | undefined)?.timezone;
    const d = await guard.checkCallHours({
      now,
      recipientUserId: uid,
      ...extra,
      ...(extra.recipientTimezone === '' && { recipientTimezone: tz }),
    });
    return { refused: !d.allowed, next: d.allowed ? undefined : d.at };
  };
const unified =
  <T>(fn: () => Promise<T>) =>
  async () => {
    process.env.QUIET_HOURS_UNIFIED = 'on';
    try {
      return await fn();
    } finally {
      delete process.env.QUIET_HOURS_UNIFIED;
    }
  };
const CHECKS: Check[] = [
  { name: 'guard by user', run: callGuard({}) },
  { name: 'guard with a Chicago phone', run: callGuard({ recipientPhone: '+13125550100' }) },
  { name: 'guard with the zone passed', run: callGuard({ recipientTimezone: '' }) },
  {
    name: 'guard, a call they asked for',
    exemptFromSaved: true,
    run: callGuard({ userAsked: true }),
  },
  {
    name: 'call schedulers (callQuietHours)',
    run: async (uid, _d, now) => {
      const r = await qh.callQuietHours(uid, now);
      return { refused: r.quiet, next: r.quiet ? r.until : undefined };
    },
  },
  {
    name: 'call schedulers, QUIET_HOURS_UNIFIED',
    run: (uid, _d, now) =>
      unified(async () => {
        const r = await qh.callQuietHours(uid, now);
        return { refused: r.quiet, next: r.quiet ? r.until : undefined };
      })(),
  },
  {
    name: 'morning brief (isUserQuiet)',
    run: async (_u, doc, now) => ({ refused: qh.isUserQuiet(doc, now) }),
  },
  {
    name: 'daily scheduler',
    run: async (uid, doc) => ({ refused: isInQuietHours({ userId: uid, ...doc } as never) }),
  },
  {
    name: 'daily scheduler, QUIET_HOURS_UNIFIED',
    run: (uid, doc) =>
      unified(async () => ({ refused: isInQuietHours({ userId: uid, ...doc } as never) }))(),
  },
  {
    name: 'outreach worker',
    run: async (uid) => ({
      refused: !(await evaluateTrigger({ id: 't', userId: uid, reason: 'r' } as never)).shouldSend,
    }),
  },
  {
    name: 'outreach worker, QUIET_HOURS_UNIFIED',
    run: (uid) =>
      unified(async () => ({
        refused: !(await evaluateTrigger({ id: 't', userId: uid, reason: 'r' } as never))
          .shouldSend,
      }))(),
  },
  {
    name: 'orchestrator sends (deliverAndRecord)',
    run: async (uid) => {
      const send = {
        userId: uid,
        channel: 'sms' as const,
        message: 'm',
        personaId: 'ferni',
        outreachId: 'o',
        reason: 'r',
      };
      return { refused: !(await deliverAndRecord(send)) };
    },
  },
  {
    name: 'proactive check-in policy, as the tick builds it',
    run: async (_u, doc, now) => {
      const savedQuiet = qh.savedQuietHours(doc);
      const choice = chooseChannel({
        trigger: { weight: 'meaningful', timely: true },
        now,
        prefs: doc.outreachPreferences,
        timezone: timezoneOf(doc),
        ...(savedQuiet && { savedQuiet }),
        verifiedPhone: '+13125550100',
        lastTalkedAt: now.getTime() - 86_400_000,
        recent: [],
        canCall: true,
        optedOut: { sms: false, call: false },
      });
      return { refused: choice.why === 'quiet hours' || choice.why === 'outside call hours' };
    },
  },
  {
    name: 'daily check-in',
    run: async (uid, _d, now) => ({
      refused: (await dailyCheckIn(uid, now))?.why === 'quiet hours',
    }),
  },
];

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  process.env.CALL_HOURS_GUARD = 'on';
});
afterAll(() => {
  vi.useRealTimers();
  delete process.env.CALL_HOURS_GUARD;
  delete process.env.QUIET_HOURS_FROM_PREFS;
});

describe('QUIET_HOURS_FROM_PREFS only adds quiet time (property grid)', () => {
  it('every sender refuses on ⊇ off; refuses inside the saved window; next allowed is past it', async () => {
    const problems: string[] = [];
    let decisions = 0;
    for (const [sk, shape] of Object.entries(SAVED)) {
      for (const [zk, zones] of Object.entries(ZONES)) {
        const uid = `u_${sk}_${zk}`;
        const doc = docOf(shape, zones);
        users[uid] = doc;
        profileTz[uid] = zones.prof;
        // A saved window with no gap at all (all day, read on both coasts): "none" is the answer.
        const saved = ((process.env.QUIET_HOURS_FROM_PREFS = 'on'), qh.savedQuietHours(doc));
        const day0 = Date.parse('2026-07-15T00:00:00Z');
        const clears =
          !saved ||
          Array.from({ length: 1440 }, (_, m) => new Date(day0 + m * 60_000)).some(
            (t) => !qh.isQuietAt(t, saved.window, saved.zones)
          );
        for (const now of TIMES) {
          vi.setSystemTime(now);
          for (const check of CHECKS) {
            process.env.QUIET_HOURS_FROM_PREFS = 'off';
            const off = await check.run(uid, doc, now);
            process.env.QUIET_HOURS_FROM_PREFS = 'on';
            const on = await check.run(uid, doc, now);
            const savedQuiet = !!saved && qh.isQuietAt(now, saved.window, saved.zones);
            decisions++;
            const at = `${check.name} | ${sk} | ${zk} | ${now.toISOString()}`;
            if (off.refused && !on.refused) problems.push(`opened: ${at}`);
            if (savedQuiet && !check.exemptFromSaved && !on.refused)
              problems.push(`ignored the saved window: ${at}`);
            if (on.refused && on.next && saved && clears && !check.exemptFromSaved) {
              if (on.next.getTime() <= now.getTime()) problems.push(`next not later: ${at}`);
              if (qh.isQuietAt(on.next, saved.window, saved.zones))
                problems.push(`next inside the saved window: ${at} -> ${on.next.toISOString()}`);
            }
          }
        }
      }
    }
    expect(problems.slice(0, 20)).toEqual([]);
    expect(decisions).toBe(
      Object.keys(SAVED).length * Object.keys(ZONES).length * TIMES.length * CHECKS.length
    );
  }, 1_200_000);
});
