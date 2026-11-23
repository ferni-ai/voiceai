/**
 * Tool outcome evals (#4245): did the tool DO what it said, not just was it chosen.
 *
 * Each case runs a real tool (the registered definition, gates included) against an
 * in-memory Firestore, healthy or with every read or write failing. It checks two things
 * together: the store's state afterwards, and what the tool said.
 *   ok        healthy: the store holds the outcome and the reply doesn't say it failed
 *   honest    faulted: the reply says it couldn't, and claims nothing the store lacks
 *   dishonest faulted: the reply sounds done (or "clear") while the store says otherwise
 *   broken    healthy, but the outcome is missing or the reply says it failed
 *   untested  faulted, but no store call hit the fault, so the case proved nothing
 *
 * pass^k: every case runs K=4 times on a fresh person and must give the same verdict each
 * time. A case whose fix is behind a flag also runs with that flag on, once the flag exists
 * on main; until then that run is skipped and names the PR it waits for. GAPS lists the
 * cases that are dishonest on main today. The list is asserted exactly, so a gap that closes
 * or a new one that opens turns this file red. Failure words count only in the reply's first
 * sentence, which is where a reply says whether it worked: "Alarm set. It can't ring if your
 * phone is off" is a success with a caveat, and "Saved! I couldn't reach the server" is a claim
 * of success. A tool that throws is scored on its error text,
 * which is what the model hears. Canary tools (a reply that claims a save the store never got,
 * and one that never touches the store) must score broken, dishonest and untested, so the
 * scoring itself can go red. OUTCOME_DEBUG=1
 * prints each reply.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { FakeFirestore, type Fault } from './fake-firestore.js';

const db = vi.hoisted(() => ({ fake: null as unknown }));

vi.mock('../../../services/superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => db.fake,
}));
vi.mock('../../../utils/shared-firestore.js', () => ({ sharedFirestore: () => db.fake }));
// Life-automation stores (#4272) read Firestore through utils/firestore-utils.
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => db.fake,
}));
// The relationship store (#4282) opens Firestore through the admin app.
vi.mock('firebase-admin/app', () => ({ getApps: () => [{}] }));
vi.mock('../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => db.fake }));

const fake = new FakeFirestore();
db.fake = fake;

const FLAGS: Record<string, unknown> = await import('../../../config/flags/index.generated.js');
const { reminderTools } = await import('../../domains/productivity/reminders.js');
const { smartCalendarTools } = await import('../../domains/calendar/calendar-connection-gate.js');
const store = await import('./store-cases.js');

const K = 4;
const FAILED = /\b(?:couldn't|could not|can't|cannot|didn't|unable|wasn't able)\b/i;
/** The reply's first sentence: up to the first . ! or ? followed by a space, or a line break. */
const firstSentence = (reply: string): string => reply.trim().split(/(?<=[.!?])\s+|\n/)[0] ?? '';
const saysFailed = (reply: string): boolean => FAILED.test(firstSentence(reply));
/** A faulted reply that reports absence ("clear", "none connected") is a claim the store can't back. */
const ABSENT =
  /\b(?:is clear|no meetings|no calendar is connected|none is connected|nothing (?:on|scheduled))\b/i;

type Exec = { execute: (p: unknown, o: unknown) => Promise<unknown> };
type Verdict = 'ok' | 'honest' | 'dishonest' | 'broken' | 'untested';

interface Case {
  id: string;
  tool: string;
  fault: Fault;
  /** Run healthy before the fault is set (e.g. the reminder a cancel needs). */
  seed?: (uid: string) => Promise<void>;
  args: Record<string, unknown>;
  /** The store (and, for a read, the reply) show the outcome the caller asked for. */
  outcome: (uid: string, reply: string) => boolean;
  /** The flag whose fix makes a faulted run honest, and the PR that adds it. */
  fix?: { flag: string; pr: string };
  /** A canary's verdict on main; real tools take ok / honest / GAPS. */
  expected?: Verdict;
}

/** Says saved whatever happened, and writes where no outcome check looks. */
const canary = {
  id: 'canarySaysSaved',
  create: (ctx: { userId: string }) => ({
    execute: async () => {
      await fake
        .doc(`canary/${ctx.userId}`)
        .set({ note: 'water the ferns' })
        .catch(() => {});
      return 'Saved: water the ferns.';
    },
  }),
};

/** Saves, then adds a caveat with a failure word after the first sentence. */
const caveat = {
  id: 'canarySavedWithCaveat',
  create: (ctx: { userId: string }) => ({
    execute: async () => {
      await fake.doc(`bogle_users/${ctx.userId}/reminders/canary`).set({ text: 'water the ferns' });
      return "Saved: water the ferns. I can't ring your phone, so it comes as a message.";
    },
  }),
};

/** Says saved, then admits the failure only after the first sentence. */
const buried = {
  id: 'canaryBuriesFailure',
  create: (ctx: { userId: string }) => ({
    execute: async () => {
      const ok = await fake
        .doc(`bogle_users/${ctx.userId}/reminders/canary`)
        .set({ text: 'water the ferns' })
        .then(
          () => true,
          () => false
        );
      return ok
        ? 'Saved: water the ferns.'
        : "Saved: water the ferns. I couldn't reach the server.";
    },
  }),
};

/** Says it couldn't, without ever touching the store: its fault proves nothing. */
const idle = {
  id: 'canaryTouchesNothing',
  create: () => ({ execute: async () => "I couldn't save that." }),
};

const TOOLS = [
  ...reminderTools,
  ...smartCalendarTools,
  ...store.STORE_TOOLS,
  canary as never,
  caveat as never,
  buried as never,
  idle as never,
];

async function call(tool: string, uid: string, args: Record<string, unknown>): Promise<string> {
  const def = TOOLS.find((d) => d.id === tool);
  if (!def) throw new Error(`no tool ${tool}`);
  try {
    const out = await (def.create({ userId: uid } as never) as Exec).execute(args, {});
    return typeof out === 'string' ? out : JSON.stringify(out);
  } catch (error) {
    return `tool error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const reminders = (uid: string) => [...fake.list(`bogle_users/${uid}/reminders`).values()];
/** Calendar events stored under their own id, so the store can read, change or delete them. */
const events = (uid: string) =>
  [...fake.list(`users/${uid}/calendar_events`)].filter(([id, e]) => e.id === id).map(([, e]) => e);

const tomorrow = (): string => {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The person has a calendar connected, so the tools answer from it, not "none connected". */
async function seedConnected(uid: string): Promise<void> {
  await fake.doc(`users/${uid}/calendar_providers/apple`).set({
    ...{ provider: 'apple', connected: true, syncEnabled: true, syncDirection: 'two-way' },
  });
}

async function seedEventToday(uid: string): Promise<void> {
  await seedConnected(uid);
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  const iso = start.toISOString();
  const end = new Date(start.getTime() + 30 * 60_000).toISOString();
  await fake.doc(`users/${uid}/calendar_events/evt_seed`).set({
    ...{ id: 'evt_seed', userId: uid, title: 'Dentist checkup', startTime: iso, endTime: end },
    ...{ isAllDay: false, attendees: [], status: 'confirmed', source: 'ferni' },
    ...{ syncStatus: 'local', reminders: [], createdAt: iso, updatedAt: iso },
  });
}

const setFerns = (uid: string) =>
  call('setReminder', uid, { message: 'water the ferns', when: 'in 2 hours' }).then(() => {});

const STORE_CASES: Case[] = store.storeCases(fake);

const CASES: Case[] = [
  {
    id: 'setReminder/healthy',
    tool: 'setReminder',
    fault: 'none',
    args: { message: 'water the ferns', when: 'in 2 hours' },
    outcome: (uid) => reminders(uid).some((r) => r.message === 'water the ferns'),
  },
  {
    id: 'setReminder/write-fails',
    tool: 'setReminder',
    fault: 'write',
    args: { message: 'water the ferns', when: 'in 2 hours' },
    outcome: (uid) => reminders(uid).some((r) => r.message === 'water the ferns'),
    fix: { flag: 'REMINDER_WRITES_TRUTHFUL', pr: '#4228' },
  },
  {
    id: 'getReminders/healthy',
    tool: 'getReminders',
    fault: 'none',
    seed: setFerns,
    args: {},
    outcome: (_uid, reply) => reply.includes('water the ferns'),
  },
  {
    id: 'cancelReminder/healthy',
    tool: 'cancelReminder',
    fault: 'none',
    seed: setFerns,
    args: { reminderQuery: 'water the ferns' },
    outcome: (uid) => reminders(uid).every((r) => r.status === 'cancelled'),
  },
  {
    id: 'cancelReminder/write-fails',
    tool: 'cancelReminder',
    fault: 'write',
    seed: setFerns,
    args: { reminderQuery: 'water the ferns' },
    outcome: (uid) => reminders(uid).every((r) => r.status === 'cancelled'),
    fix: { flag: 'REMINDER_WRITES_TRUTHFUL', pr: '#4228' },
  },
  {
    id: 'getCalendarToday/healthy',
    tool: 'getCalendarToday',
    fault: 'none',
    seed: seedEventToday,
    args: {},
    outcome: (_uid, reply) => reply.includes('Dentist checkup'),
  },
  {
    id: 'getCalendarToday/read-fails',
    tool: 'getCalendarToday',
    fault: 'read',
    seed: seedEventToday,
    args: {},
    outcome: (_uid, reply) => reply.includes('Dentist checkup'),
    fix: { flag: 'CALENDAR_LOAD_FAIL_HONEST', pr: '#4240' },
  },
  {
    id: 'createCalendarEvent/healthy',
    tool: 'createCalendarEvent',
    fault: 'none',
    seed: seedConnected,
    args: { title: 'Lunch with Riley', date: tomorrow(), startTime: '12:30' },
    outcome: (uid) => events(uid).some((e) => e.title === 'Lunch with Riley'),
  },
  {
    id: 'createCalendarEvent/write-fails',
    tool: 'createCalendarEvent',
    fault: 'write',
    seed: seedConnected,
    args: { title: 'Lunch with Riley', date: tomorrow(), startTime: '12:30' },
    outcome: (uid) => events(uid).some((e) => e.title === 'Lunch with Riley'),
    fix: { flag: 'CALENDAR_WRITES_TRUTHFUL', pr: '#4255' },
  },
  {
    id: 'deleteCalendarEvent/healthy',
    tool: 'deleteCalendarEvent',
    fault: 'none',
    seed: seedEventToday,
    args: { eventId: 'evt_seed', eventTitle: 'Dentist checkup' },
    outcome: (uid) => events(uid).length === 0,
  },
  {
    id: 'deleteCalendarEvent/write-fails',
    tool: 'deleteCalendarEvent',
    fault: 'write',
    seed: seedEventToday,
    args: { eventId: 'evt_seed', eventTitle: 'Dentist checkup' },
    outcome: (uid) => events(uid).length === 0,
    fix: { flag: 'CALENDAR_WRITES_TRUTHFUL', pr: '#4255' },
  },
  {
    id: 'updateCalendarEvent/healthy',
    tool: 'updateCalendarEvent',
    fault: 'none',
    seed: seedEventToday,
    args: { eventId: 'evt_seed', title: 'Dentist follow-up' },
    outcome: (uid) => events(uid).some((e) => e.title === 'Dentist follow-up'),
  },
  {
    id: 'updateCalendarEvent/write-fails',
    tool: 'updateCalendarEvent',
    fault: 'write',
    seed: seedEventToday,
    args: { eventId: 'evt_seed', title: 'Dentist follow-up' },
    outcome: (uid) => events(uid).some((e) => e.title === 'Dentist follow-up'),
    fix: { flag: 'CALENDAR_WRITES_TRUTHFUL', pr: '#4255' },
  },
  {
    id: 'canary/healthy',
    tool: 'canarySaysSaved',
    fault: 'none',
    args: {},
    outcome: (uid) => reminders(uid).length > 0,
    expected: 'broken',
  },
  {
    id: 'canary/write-fails',
    tool: 'canarySaysSaved',
    fault: 'write',
    args: {},
    outcome: (uid) => reminders(uid).length > 0,
    expected: 'dishonest',
  },
  {
    id: 'canary/caveat-after-success',
    tool: 'canarySavedWithCaveat',
    fault: 'none',
    args: {},
    outcome: (uid) => reminders(uid).length > 0,
    expected: 'ok',
  },
  {
    id: 'canary/failure-after-success',
    tool: 'canaryBuriesFailure',
    fault: 'write',
    args: {},
    outcome: (uid) => reminders(uid).length > 0,
    expected: 'dishonest',
  },
  {
    id: 'canary/fault-not-hit',
    tool: 'canaryTouchesNothing',
    fault: 'write',
    args: {},
    outcome: () => false,
    expected: 'untested',
  },
  ...STORE_CASES,
];

/** Dishonest on main today, each with the fix that closes it. Asserted exactly. */
const GAPS = new Set([
  'setReminder/write-fails', // #4225, fix #4228 (REMINDER_WRITES_TRUTHFUL)
  'cancelReminder/write-fails', // #4225, fix #4228 (REMINDER_WRITES_TRUTHFUL)
  'getCalendarToday/read-fails', // #4237, fix #4240 (CALENDAR_LOAD_FAIL_HONEST)
  'createCalendarEvent/write-fails', // #4244, fix #4255 (CALENDAR_WRITES_TRUTHFUL)
  'deleteCalendarEvent/write-fails', // #4244, fix #4255 (CALENDAR_WRITES_TRUTHFUL)
  'updateCalendarEvent/write-fails', // #4244, fix #4255 (CALENDAR_WRITES_TRUTHFUL)
  ...STORE_CASES.filter((c) => c.fault === 'write').map((c) => c.id), // fixes: store-cases.ts
]);

let runs = 0;
async function runOnce(c: Case, env: Record<string, string>): Promise<Verdict> {
  const uid = `uid-riley-test-outcome-${String(++runs).padStart(6, '0')}`;
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    fake.fault = 'none';
    await c.seed?.(uid);
    fake.fault = c.fault;
    fake.thrown = 0;
    const reply = await call(c.tool, uid, c.args);
    if (process.env.OUTCOME_DEBUG) console.info(`REPLY ${c.id}: ${reply}`);
    fake.fault = 'none';
    const done = c.outcome(uid, reply);
    if (c.fault === 'none') return done && !saysFailed(reply) ? 'ok' : 'broken';
    if (fake.thrown === 0) return 'untested';
    return saysFailed(reply) && !ABSENT.test(reply) && !done ? 'honest' : 'dishonest';
  } finally {
    fake.fault = 'none';
    process.env = saved;
  }
}

/** The K verdicts of one case; pass^k means they are all the expected one. */
async function passK(c: Case, env: Record<string, string> = {}): Promise<Verdict[]> {
  const verdicts: Verdict[] = [];
  for (let i = 0; i < K; i++) verdicts.push(await runOnce(c, env));
  return verdicts;
}

const scorecard: Array<{ case: string; flag: string; verdicts: string }> = [];
afterAll(() => {
  console.info(
    `tool outcome evals, pass^${K}:\n${scorecard.map((r) => `  ${r.case} [${r.flag}] ${r.verdicts}`).join('\n')}`
  );
});

describe('tool outcome evals (main, flags at their defaults)', () => {
  for (const c of CASES) {
    const expected: Verdict =
      c.expected ?? (c.fault === 'none' ? 'ok' : GAPS.has(c.id) ? 'dishonest' : 'honest');
    it(`${c.id}: ${expected} ${K}/${K}`, async () => {
      const verdicts = await passK(c);
      scorecard.push({ case: c.id, flag: 'defaults', verdicts: verdicts.join(',') });
      expect(verdicts).toEqual(Array(K).fill(expected));
    });
  }
});

describe('tool outcome evals (each fix flag on)', () => {
  for (const c of CASES.filter((x) => x.fix)) {
    const { flag, pr } = c.fix!;
    it.skipIf(!(flag in FLAGS))(
      `${c.id} with ${flag}=on: honest ${K}/${K} (awaits ${pr})`,
      async () => {
        const verdicts = await passK(c, { [flag]: 'on' });
        scorecard.push({ case: c.id, flag: `${flag}=on`, verdicts: verdicts.join(',') });
        expect(verdicts).toEqual(Array(K).fill('honest'));
      }
    );
  }
});
