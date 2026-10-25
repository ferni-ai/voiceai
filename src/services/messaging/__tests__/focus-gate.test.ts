/**
 * The policy's Focus gate (ENGAGEMENT-SPEC 3.3, PR F2): while the person's Focus holds,
 * what Ferni starts waits until capUntil; replies, their own codes, in-app and (unless they
 * said not to) reminders they timed still go. Each row was run against a broken gate and
 * went red (the PR lists the mutation for each).
 */
import { describe, expect, it } from 'vitest';
import { zonedWallTimeToUtc } from '../../../utils/time-zone.js';
import { decide, priorityOf } from '../policy.js';
import type { Decision, Intent, PolicyCtx } from '../types.js';

const NY = 'America/New_York';
const at = (h: number, m = 0): Date =>
  zonedWallTimeToUtc({ year: 2026, month: 10, day: 14, hour: h, minute: m }, NY);
const NOON = at(12);
const CAP = at(20); // a Work Focus that began at 10:00 caps at 20:00
const WORK = { held: true, kind: 'work', remindersThrough: true, capUntil: CAP } as const;

function intent(o: Partial<Intent> = {}): Intent {
  return {
    personId: 'u1',
    recipient: 'owner',
    kind: 'check-in',
    persona: 'ferni',
    priority: priorityOf(o.kind ?? 'check-in', o.requestedBy ?? 'ferni'),
    anchor: 'commitment:c1',
    requestedBy: 'ferni',
    intentKey: 'k-new',
    channel: 'sms',
    ...o,
  };
}

function ctx(o: Partial<PolicyCtx> = {}): PolicyCtx {
  return {
    now: NOON,
    zone: NY,
    consent: { sms: 'in', call: 'in' },
    prefs: { textsOff: false },
    crisis: {},
    ledger: [],
    verifiedRecipient: true,
    isFirstContact: false,
    focus: WORK,
    ...o,
  };
}

const HELD: Partial<Decision> = { action: 'hold', reason: 'focus-hold', holdUntil: CAP };
const SEND: Partial<Decision> = { action: 'send', reason: 'ok' };
const REMINDER = { kind: 'reminder', requestedBy: 'user', requestedAt: NOON } as const;

interface Row {
  name: string;
  i?: Partial<Intent>;
  c?: Partial<PolicyCtx>;
  want: Partial<Decision>;
}

const rows: Row[] = [
  { name: 'a held check-in by SMS holds until capUntil', want: HELD },
  {
    name: 'a held follow-up by push holds too',
    i: { kind: 'follow-up', channel: 'push' },
    want: HELD,
  },
  { name: 'a Ferni call holds too', i: { kind: 'proactive', channel: 'call' }, want: HELD },
  { name: 'the morning brief holds', i: { kind: 'morning-brief' }, want: HELD },
  {
    name: 'a reply to their text goes',
    i: { kind: 'reply', anchor: 'inbound:1' },
    c: { lastInboundAt: new Date(NOON.getTime() - 5 * 60_000) },
    want: SEND,
  },
  {
    name: 'a reminder they timed goes when remindersThrough',
    i: REMINDER,
    want: { action: 'send' },
  },
  {
    name: 'a reminder they timed holds when they turned remindersThrough off',
    i: REMINDER,
    c: { focus: { ...WORK, remindersThrough: false } },
    want: HELD,
  },
  { name: 'in-app goes', i: { channel: 'in_app' }, want: SEND },
  {
    name: 'a code they asked for goes',
    i: { kind: 'transactional', requestedBy: 'user', anchor: undefined, destination: 'p1' },
    want: SEND,
  },
  {
    name: 'a third party is not the person in Focus',
    i: { recipient: 'third-party', kind: 'on-behalf', requestedBy: 'user' },
    want: { action: 'send' },
  },
  { name: 'no Focus: the check-in goes', c: { focus: undefined }, want: SEND },
  { name: 'past capUntil the hold is over', c: { now: CAP }, want: SEND },
  {
    name: 'a crisis decides first (Ferni-started outreach is dropped)',
    c: { crisis: { lastCrisisAt: at(9) } },
    want: { action: 'drop', reason: 'crisis-quiet' },
  },
  {
    name: 'it runs before quiet hours, so a Sleep hold says why with its own cap',
    c: { now: at(23), focus: { ...WORK, kind: 'sleep', capUntil: at(23, 30) } },
    want: { action: 'hold', reason: 'focus-hold', holdUntil: at(23, 30) },
  },
];

describe('decide: focus', () => {
  it.each(rows)('$name', ({ i, c, want }) => {
    const d = decide(intent(i), ctx(c));
    const { holdUntil, ...rest } = want;
    expect(d).toMatchObject(rest);
    if ('holdUntil' in want) expect(d.holdUntil).toEqual(holdUntil);
  });
});
