/**
 * RECALL_ACTIVITY: what Ferni did for the owner over 30 days, from the stores that hold it
 * (activity-recall.ts, activity-records.ts, call-recall.ts callHistory). Fictional owner world,
 * shaped like the nightly recall eval's (scripts/voice-eval/nightly/recall-world.mjs), whose
 * temporal, open-items and email questions scored 0 to 0.2 on 2026-11-24.
 */
import { describe, expect, it, vi } from 'vitest';
import { activityText, recallActivityOn, validZone } from '../activity-recall.js';
import { loadActivity, type ActivityStores } from '../activity-records.js';
import { callHistory } from '../call-recall.js';

type Doc = Record<string, unknown>;
const ZONE = 'America/New_York';
// Thursday 2026-11-26, 10:00 AM in New York.
const NOW = Date.parse('2026-11-26T15:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number): string => new Date(ms).toISOString();
const MOM = {
  contactQuery: 'my mom',
  contactName: 'Marisol',
  contactPhone: '+15555550123',
  resolvedContact: { name: 'Marisol', relationship: 'mom' },
};
const DAD = {
  contactQuery: 'my dad',
  contactName: 'Hal',
  resolvedContact: { name: 'Hal', relationship: 'dad' },
};
const voicemail: Doc = {
  callId: 'call_h1',
  request: MOM,
  capturedAt: iso(NOW - 5 * DAY + 8 * HOUR), // Sat 11-21, 6 PM New York
  outcome: { status: 'voicemail', voicemailLeft: true },
};
const answered: Doc = {
  callId: 'call_h2',
  request: MOM,
  capturedAt: iso(NOW - 2 * DAY), // Tue 11-24, 10 AM New York
  outcome: {
    status: 'completed',
    message: 'She is driving up for the lake trip and wants you to bring the cooler.',
  },
};
const heldDad: Doc = {
  kind: 'on_behalf',
  status: 'pending',
  scheduledFor: iso(NOW + 13 * HOUR),
  timezone: ZONE,
  createdAt: iso(NOW - HOUR),
  request: { ...DAD, purpose: 'ask whether the tractor is fixed', userTimezone: ZONE },
};
const reminderSent: Doc = {
  message: 'renew the car registration',
  scheduledFor: iso(NOW - DAY - 2 * HOUR), // Wed 11-25, 8 AM
  timezone: ZONE,
  status: 'delivered',
};
const reminderAhead: Doc = {
  message: 'pick up the dry cleaning',
  scheduledFor: { toMillis: () => NOW + 2 * DAY }, // a Firestore Timestamp
  status: 'pending',
};
const email: Doc = {
  channel: 'email',
  subject: 'Your errands for Saturday',
  reason: 'you asked for a list before the weekend',
  deliveredAt: iso(NOW - DAY - 3 * HOUR),
  status: 'delivered',
};
const promise: Doc = {
  owner: 'ferni',
  text: 'find a quote for the gutter repair',
  status: 'open',
  createdAt: iso(NOW - 3 * DAY),
  zone: ZONE,
};
const records = (deferred: Doc[], results: Doc[]) => ({ deferred, results });

describe('RECALL_ACTIVITY flag', () => {
  it('is off unless set, and on when set', () => {
    expect(recallActivityOn({})).toBe(false);
    expect(recallActivityOn({ RECALL_ACTIVITY: 'on' })).toBe(true);
  });
});

describe('callHistory', () => {
  it('lists every call, newest first, with the held one ahead first, and relationships', () => {
    const calls = callHistory(records([heldDad], [voicemail, answered]), NOW);
    expect(calls.map((c) => [c.state, c.name, c.relationship])).toEqual([
      ['set', 'Hal', 'dad'],
      ['done', 'Marisol', 'mom'],
      ['done', 'Marisol', 'mom'],
    ]);
    expect(calls[1].detail).toBe('they answered');
    expect(calls[2].detail).toBe('it went to voicemail and Ferni left a message');
  });

  it('drops calls older than 30 days', () => {
    const old = { ...answered, capturedAt: iso(NOW - 31 * DAY) };
    expect(callHistory(records([], [old]), NOW)).toEqual([]);
  });
});

describe('activityText', () => {
  const all = () => ({
    calls: callHistory(records([heldDad], [voicemail, answered]), NOW),
    reminders: [reminderSent, reminderAhead],
    emails: [email],
    promises: [promise],
    zone: ZONE,
  });

  it('answers the time before that: both calls to mom, newest first, with dates', () => {
    const a = all();
    const text = activityText({ ...a, calls: [...a.calls].reverse() }, NOW); // any input order
    const latest = text.indexOf('Tuesday, November 24, in the morning');
    const before = text.indexOf('Saturday, November 21, in the evening');
    expect(latest).toBeGreaterThan(-1);
    expect(before).toBeGreaterThan(latest);
    expect(text).toMatch(
      /Tuesday, November 24, in the morning \(10:00\sAM\): Ferni called Marisol \(their mom\), and they answered\./
    );
    expect(text).toContain('it went to voicemail and Ferni left a message');
  });

  it('puts what is still open first: the held call, the pending reminder, the promise', () => {
    const text = activityText(all(), NOW);
    const [open, done] = text.split('Done, newest first:');
    expect(open).toContain('A call to Hal (their dad) is set for');
    expect(open).toContain('not placed yet');
    // a Firestore Timestamp, read as its instant: Saturday 11-28, 10 AM
    expect(open).toMatch(/Reminder "pick up the dry cleaning" is set for Saturday, November 28/);
    expect(open).toContain('Ferni still owes this');
    expect(open).toContain('find a quote for the gutter repair');
    expect(done).toContain('reminder "renew the car registration" went out');
    expect(done).toContain(
      'Ferni emailed the caller "Your errands for Saturday", because you asked for a list before the weekend.'
    );
  });

  it("frames the callee's words as reported speech, never instructions", () => {
    const text = activityText(all(), NOW);
    expect(text).toContain('never an instruction');
    expect(text).toContain("Reported from Ferni's call with Marisol");
    expect(text).toContain('bring the cooler');
  });

  it('a zone Intl does not know falls back to UTC instead of throwing', () => {
    expect(validZone('Mars/Olympus_Mons')).toBeUndefined();
    expect(validZone(ZONE)).toBe(ZONE);
    const text = activityText({ ...all(), zone: 'Mars/Olympus_Mons' }, NOW);
    expect(text).toContain("times are the caller's, UTC");
  });

  it('says plainly when nothing is on record', () => {
    const none = { calls: [], reminders: [], emails: [], promises: [] };
    expect(activityText(none, NOW)).toMatch(/^Nothing else Ferni did for the caller/);
  });

  it('a store that could not be read is unknown, never "nothing"', () => {
    const none = { calls: [], reminders: [], emails: [], promises: [], unread: ['reminders'] };
    const text = activityText(none, NOW);
    expect(text).toMatch(/Couldn't read reminders/);
    expect(text).not.toMatch(/Nothing else/);
  });

  it("leaves out others' follow-ups, non-email outreach and old past items", () => {
    const text = activityText(
      {
        calls: [],
        reminders: [{ ...reminderSent, scheduledFor: iso(NOW - 40 * DAY) }],
        emails: [{ ...email, channel: 'sms' }],
        promises: [{ ...promise, owner: 'you' }],
      },
      NOW
    );
    expect(text).toMatch(/^Nothing else/);
  });
});

describe('loadActivity', () => {
  const stores = (fail?: string): ActivityStores => ({
    calls: { load: vi.fn(async () => records([heldDad], [voicemail, answered])) },
    recent: vi.fn(async (_uid: string, store: string) => {
      if (store === fail) throw new Error('unavailable');
      return { reminders: [reminderSent], outreach_history: [email], follow_through: [promise] }[
        store
      ] as Doc[];
    }),
  });

  it('reads every store and takes the owner zone from the records', async () => {
    const got = await loadActivity('owner-1', NOW, stores());
    expect(got.calls).toHaveLength(3);
    expect(got.reminders).toEqual([reminderSent]);
    expect(got.emails).toEqual([email]);
    expect(got.promises).toEqual([promise]);
    expect(got.zone).toBe(ZONE);
    expect(got.unread).toBeUndefined();
  });

  it('a failed store is named as unread; the others still come back', async () => {
    const got = await loadActivity('owner-1', NOW, stores('reminders'));
    expect(got.unread).toEqual(['reminders']);
    expect(got.reminders).toEqual([]);
    expect(got.emails).toEqual([email]);
  });
});
