/**
 * The messaging policy's fixtures (SOTA requirement 22): every gate, its
 * boundaries and its exceptions, one row each. Each gate was disabled in turn
 * and these went red (the PR lists gate -> test).
 */
import { describe, expect, it } from 'vitest';
import { zonedWallTimeToUtc } from '../../../utils/time-zone.js';
import { GATES, decide, fitsSms, isDigestible, priorityOf, segments } from '../policy.js';
import type { Decision, Intent, LedgerEntry, PolicyCtx } from '../types.js';

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const H = 3_600_000;
const DAY = 24 * H;

/** A local wall time ("2026-10-14T21:00") in a zone, as its UTC instant. */
function at(local: string, zone: string = NY): Date {
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0] = local.split(/[-T:]/).map(Number);
  return zonedWallTimeToUtc({ year, month, day, hour, minute }, zone);
}

const NOON = at('2026-10-14T12:00');

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
    ...o,
  };
}

let seq = 0;
/** A ledger row `hoursAgo` before noon: a sent Ferni proactive text unless overridden. */
function row(hoursAgo: number, o: Partial<LedgerEntry> = {}): LedgerEntry {
  seq += 1;
  return {
    kind: 'proactive',
    channel: 'sms',
    status: 'sent',
    at: new Date(NOON.getTime() - hoursAgo * H),
    intentKey: `old-${seq}`,
    priority: 30,
    ...o,
  };
}
/** n sent proactive texts spread over the last few hours (past the 4 h proactive gap from now). */
const sentToday = (n: number, o: Partial<LedgerEntry> = {}): LedgerEntry[] =>
  Array.from({ length: n }, (_, k) => row(5 + k, o));

interface Row {
  name: string;
  i?: Partial<Intent>;
  c?: Partial<PolicyCtx>;
  want: Partial<Decision>;
}

const SEND: Partial<Decision> = { action: 'send', reason: 'ok' };
const quietUntil = (until: Date): Partial<Decision> => ({
  action: 'hold',
  reason: 'quiet-hours',
  holdUntil: until,
});

const recipient: Row[] = [
  {
    name: 'owner sms to an unverified number is dropped',
    c: { verifiedRecipient: false },
    want: { action: 'drop', reason: 'no-verified-phone' },
  },
  {
    name: 'owner call to an unverified number is dropped',
    i: { channel: 'call' },
    c: { verifiedRecipient: false },
    want: { action: 'drop', reason: 'no-verified-phone' },
  },
  {
    name: 'owner push needs no verified number',
    i: { channel: 'push' },
    c: { verifiedRecipient: false },
    want: SEND,
  },
  {
    name: 'a third party is never reached by push',
    i: { recipient: 'third-party', kind: 'on-behalf', channel: 'push' },
    want: { action: 'drop', reason: 'bad-channel' },
  },
  {
    name: 'a third party with no anchor is dropped',
    i: { recipient: 'third-party', kind: 'on-behalf', requestedBy: 'user', anchor: undefined },
    want: { action: 'drop', reason: 'no-anchor' },
  },
  {
    name: 'a proactive text to the owner with no anchor is dropped',
    i: { anchor: undefined },
    want: { action: 'drop', reason: 'no-anchor' },
  },
  {
    name: 'a blank anchor is no anchor',
    i: { anchor: '  ' },
    want: { action: 'drop', reason: 'no-anchor' },
  },
  {
    name: 'a text the owner asked for needs no anchor',
    i: { kind: 'reminder', requestedBy: 'user', anchor: undefined },
    want: SEND,
  },
];

const consent: Row[] = [
  {
    name: 'a third party who never said yes waits for consent',
    i: { recipient: 'third-party', kind: 'on-behalf', requestedBy: 'user' },
    c: { consent: { sms: 'unknown', call: 'unknown' } },
    want: { action: 'hold', reason: 'needs-consent', holdUntil: undefined },
  },
  {
    name: 'a third party who sent STOP is dropped, not held',
    i: { recipient: 'third-party', kind: 'on-behalf', requestedBy: 'user' },
    c: { consent: { sms: 'out', call: 'in' } },
    want: { action: 'drop', reason: 'opted-out' },
  },
  {
    name: 'owner opted out of sms: a text is dropped',
    c: { consent: { sms: 'out', call: 'in' } },
    want: { action: 'drop', reason: 'opted-out' },
  },
  {
    name: 'owner opted out of sms but not calls: a call goes',
    i: { channel: 'call' },
    c: { consent: { sms: 'out', call: 'in' } },
    want: SEND,
  },
  {
    name: 'owner opted out of calls: a call is dropped',
    i: { channel: 'call' },
    c: { consent: { sms: 'in', call: 'out' } },
    want: { action: 'drop', reason: 'opted-out' },
  },
  {
    name: 'owner with unknown sms consent is texted',
    c: { consent: { sms: 'unknown', call: 'unknown' } },
    want: SEND,
  },
  {
    name: 'opted out wins over quiet hours (gate order)',
    c: { now: at('2026-10-14T23:00'), consent: { sms: 'out', call: 'in' } },
    want: { action: 'drop', reason: 'opted-out' },
  },
];

const textsOff: Row[] = [
  {
    name: 'texts off: a check-in by sms is dropped',
    c: { prefs: { textsOff: true } },
    want: { action: 'drop', reason: 'sms-off' },
  },
  {
    name: 'texts off: their own reminder is not texted either',
    i: { kind: 'reminder', requestedBy: 'user' },
    c: { prefs: { textsOff: true } },
    want: { action: 'drop', reason: 'sms-off' },
  },
  {
    name: 'texts off: a reply to their text still goes',
    i: { kind: 'reply', anchor: undefined },
    c: { prefs: { textsOff: true } },
    want: SEND,
  },
  {
    name: 'texts off: push still goes',
    i: { channel: 'push' },
    c: { prefs: { textsOff: true } },
    want: SEND,
  },
  {
    name: "texts off is the owner's, not a third party's",
    i: { recipient: 'third-party', kind: 'on-behalf', requestedBy: 'user' },
    c: { prefs: { textsOff: true } },
    want: SEND,
  },
];

const crisis: Row[] = [
  {
    name: 'crisis 13 days ago: a proactive text is dropped',
    c: { crisis: { lastCrisisAt: new Date(NOON.getTime() - 13 * DAY) } },
    want: { action: 'drop', reason: 'crisis-quiet' },
  },
  {
    name: 'crisis 15 days ago: it goes',
    c: { crisis: { lastCrisisAt: new Date(NOON.getTime() - 15 * DAY) } },
    want: SEND,
  },
  {
    name: 'crisis 13 days ago: their own reminder still goes',
    i: { kind: 'reminder', requestedBy: 'user' },
    c: { crisis: { lastCrisisAt: new Date(NOON.getTime() - 13 * DAY) } },
    want: SEND,
  },
  {
    name: 'crisis 13 days ago: a reply still goes',
    i: { kind: 'reply', anchor: undefined },
    c: { crisis: { lastCrisisAt: new Date(NOON.getTime() - 13 * DAY) } },
    want: SEND,
  },
];

const quietHours: Row[] = [
  { name: 'NY 20:59 goes', c: { now: at('2026-10-14T20:59') }, want: SEND },
  {
    name: 'NY 21:00 holds to 08:00 tomorrow',
    c: { now: at('2026-10-14T21:00') },
    want: quietUntil(at('2026-10-15T08:00')),
  },
  {
    name: 'NY 07:59 holds to 08:00 today',
    c: { now: at('2026-10-14T07:59') },
    want: quietUntil(at('2026-10-14T08:00')),
  },
  { name: 'NY 08:00 goes', c: { now: at('2026-10-14T08:00') }, want: SEND },
  { name: 'LA 20:59 goes', c: { now: at('2026-10-14T20:59', LA), zone: LA }, want: SEND },
  {
    name: 'LA 21:00 holds to 08:00 tomorrow',
    c: { now: at('2026-10-14T21:00', LA), zone: LA },
    want: quietUntil(at('2026-10-15T08:00', LA)),
  },
  {
    name: 'LA 07:59 holds to 08:00 today',
    c: { now: at('2026-10-14T07:59', LA), zone: LA },
    want: quietUntil(at('2026-10-14T08:00', LA)),
  },
  { name: 'LA 08:00 goes', c: { now: at('2026-10-14T08:00', LA), zone: LA }, want: SEND },
  {
    name: "the recipient's zone governs: 23:30 in NY is 20:30 in LA",
    c: { now: at('2026-10-14T23:30'), zone: LA },
    want: SEND,
  },
  {
    name: 'DST ends overnight: 22:00 EDT holds to 08:00 EST (13:00Z)',
    c: { now: at('2026-10-31T22:00') },
    want: quietUntil(new Date('2026-11-01T13:00:00Z')),
  },
  {
    name: 'DST starts overnight: 23:00 EST holds to 08:00 EDT (12:00Z)',
    c: { now: at('2026-03-07T23:00') },
    want: quietUntil(new Date('2026-03-08T12:00:00Z')),
  },
  {
    name: 'a reminder the owner set for 06:30 goes at 06:30',
    i: { kind: 'reminder', requestedBy: 'user', requestedAt: at('2026-10-14T06:30') },
    c: { now: at('2026-10-14T06:30') },
    want: { action: 'send', reason: 'requested-time' },
  },
  {
    name: 'a reminder Ferni set for 06:30 waits for 08:00',
    i: { kind: 'reminder' },
    c: { now: at('2026-10-14T06:30') },
    want: quietUntil(at('2026-10-14T08:00')),
  },
  {
    name: 'a user request with no time they chose waits for 08:00',
    i: { kind: 'reminder', requestedBy: 'user' },
    c: { now: at('2026-10-14T06:30') },
    want: quietUntil(at('2026-10-14T08:00')),
  },
  {
    name: "a time the owner chose doesn't break a third party's quiet hours",
    i: {
      recipient: 'third-party',
      kind: 'on-behalf',
      requestedBy: 'user',
      requestedAt: at('2026-10-14T06:30'),
    },
    c: { now: at('2026-10-14T06:30') },
    want: quietUntil(at('2026-10-14T08:00')),
  },
  {
    name: 'a reply at 23:00 waits for 08:00',
    i: { kind: 'reply', anchor: undefined },
    c: { now: at('2026-10-14T23:00') },
    want: quietUntil(at('2026-10-15T08:00')),
  },
  {
    name: 'a push at 23:00 waits for 08:00',
    i: { channel: 'push' },
    c: { now: at('2026-10-14T23:00') },
    want: quietUntil(at('2026-10-15T08:00')),
  },
  {
    name: 'an in-app note at 23:00 goes (it waits for them to look)',
    i: { channel: 'in_app' },
    c: { now: at('2026-10-14T23:00') },
    want: SEND,
  },
  {
    name: 'invalid zone: a proactive text holds for a zone',
    c: { zone: 'Mars/Olympus' },
    want: { action: 'hold', reason: 'no-timezone', holdUntil: undefined },
  },
  {
    name: 'invalid zone: a reply at NY noon goes (both coasts awake)',
    i: { kind: 'reply', anchor: undefined },
    c: { zone: 'Mars/Olympus' },
    want: SEND,
  },
  {
    name: 'invalid zone: a reply at LA 07:30 waits for LA 08:00',
    i: { kind: 'reply', anchor: undefined },
    c: { zone: 'Mars/Olympus', now: at('2026-10-14T07:30', LA) },
    want: quietUntil(at('2026-10-14T08:00', LA)),
  },
  {
    name: 'their window 09:00-12:00: at 14:00 a proactive text holds to 09:00 tomorrow',
    c: {
      prefs: { textsOff: false, windows: [{ startMin: 540, endMin: 720 }] },
      now: at('2026-10-14T14:00'),
    },
    want: { action: 'hold', reason: 'outside-window', holdUntil: at('2026-10-15T09:00') },
  },
  {
    name: 'their window 09:00-12:00: at 10:00 it goes',
    c: {
      prefs: { textsOff: false, windows: [{ startMin: 540, endMin: 720 }] },
      now: at('2026-10-14T10:00'),
    },
    want: SEND,
  },
  {
    name: "their window doesn't hold a reminder they asked for",
    i: { kind: 'reminder', requestedBy: 'user' },
    c: {
      prefs: { textsOff: false, windows: [{ startMin: 540, endMin: 720 }] },
      now: at('2026-10-14T14:00'),
    },
    want: SEND,
  },
];

const DIGEST_TODAY = {
  action: 'merge',
  reason: 'over-budget',
  mergeInto: 'digest:2026-10-14',
} as const;
const budget: Row[] = [
  { name: 'budget: 2 sent, the 3rd goes', c: { ledger: sentToday(2) }, want: SEND },
  {
    name: 'budget: 3 sent, a check-in merges into the digest',
    c: { ledger: sentToday(3) },
    want: DIGEST_TODAY,
  },
  { name: 'budget: 4 sent, still merged', c: { ledger: sentToday(4) }, want: DIGEST_TODAY },
  {
    name: 'budget: 3 sent, a morning brief (not digestible) is dropped',
    i: { kind: 'morning-brief' },
    c: { ledger: sentToday(3) },
    want: { action: 'drop', reason: 'over-budget' },
  },
  {
    name: 'budget is a rolling 24 h: one of 3 sent 25 h ago',
    c: { ledger: [...sentToday(2), row(25)] },
    want: SEND,
  },
  {
    name: 'budget counts every kind and persona',
    c: {
      ledger: [
        row(5, { kind: 'follow-up' }),
        row(6, { kind: 'morning-brief' }),
        row(7, { kind: 'commitment-nudge' }),
      ],
    },
    want: DIGEST_TODAY,
  },
  {
    name: 'budget: maxPerDay 1 lowers it',
    c: { prefs: { textsOff: false, maxPerDay: 1 }, ledger: sentToday(1) },
    want: DIGEST_TODAY,
  },
  {
    name: 'budget: maxPerDay 10 never raises it',
    c: { prefs: { textsOff: false, maxPerDay: 10 }, ledger: sentToday(3) },
    want: DIGEST_TODAY,
  },
  {
    name: 'budget: a reminder they asked for is outside it',
    i: { kind: 'reminder', requestedBy: 'user' },
    c: { ledger: sentToday(3) },
    want: SEND,
  },
  {
    name: 'budget: a reply is outside it',
    i: { kind: 'reply', anchor: undefined },
    c: { ledger: sentToday(3) },
    want: SEND,
  },
  {
    name: "budget: texts they asked for don't use it",
    c: { ledger: sentToday(3, { kind: 'reminder', requestedBy: 'user' }) },
    want: SEND,
  },
  {
    name: "budget: replies sent don't use it",
    c: { ledger: sentToday(3, { kind: 'reply' }) },
    want: SEND,
  },
  {
    name: 'budget: lower priority than everything queued merges',
    i: { kind: 'proactive' },
    c: { ledger: [...sentToday(2), row(1, { status: 'held', kind: 'check-in', priority: 50 })] },
    want: DIGEST_TODAY,
  },
  {
    name: 'budget: higher priority than a queued one takes the slot',
    i: { kind: 'follow-up' },
    c: { ledger: [...sentToday(2), row(1, { status: 'held', kind: 'check-in', priority: 50 })] },
    want: SEND,
  },
  {
    name: 'budget: its own hold is not a queued rival',
    i: { redecide: true },
    c: {
      ledger: [
        ...sentToday(2),
        row(9, { status: 'held', kind: 'check-in', intentKey: 'k-new', priority: 50 }),
      ],
    },
    want: SEND,
  },
  {
    name: "budget: once today's digest went, merge into tomorrow's",
    c: { ledger: [...sentToday(3), row(4, { kind: 'digest', channel: 'in_app' })] },
    want: { ...DIGEST_TODAY, mergeInto: 'digest:2026-10-15' },
  },
  {
    name: 'budget: push and in-app share a cap of 6',
    i: { channel: 'push' },
    c: { ledger: [...sentToday(3, { channel: 'push' }), ...sentToday(3, { channel: 'in_app' })] },
    want: DIGEST_TODAY,
  },
  {
    name: 'budget: 5 push plus 3 sms, a push still goes',
    i: { channel: 'push' },
    c: { ledger: [...sentToday(5, { channel: 'push' }), ...sentToday(3)] },
    want: SEND,
  },
];

const dedupe: Row[] = [
  {
    name: 'dedupe: a duplicate over budget is dropped, not merged into the digest',
    c: { ledger: [...sentToday(3), row(30, { intentKey: 'k-new', kind: 'check-in' })] },
    want: { action: 'drop', reason: 'duplicate' },
  },
  {
    name: 'dedupe: the same intent key already sent is dropped',
    c: { ledger: [row(5 * 24, { intentKey: 'k-new', kind: 'follow-up' })] },
    want: { action: 'drop', reason: 'duplicate' },
  },
  {
    name: 'dedupe: the same intent key held is dropped',
    c: { ledger: [row(1, { intentKey: 'k-new', status: 'held', kind: 'follow-up' })] },
    want: { action: 'drop', reason: 'duplicate' },
  },
  {
    name: 'dedupe: re-deciding its own hold is not a duplicate',
    i: { redecide: true },
    c: { ledger: [row(1, { intentKey: 'k-new', status: 'held', kind: 'follow-up' })] },
    want: SEND,
  },
  {
    name: 'dedupe: a failed send may be retried',
    c: { ledger: [row(1, { intentKey: 'k-new', status: 'failed', kind: 'follow-up' })] },
    want: SEND,
  },
  {
    name: 'dedupe: the same body 11 h ago is dropped',
    i: { kind: 'proactive', bodyHash: 'h1' },
    c: { ledger: [row(11, { bodyHash: 'h1' })] },
    want: { action: 'drop', reason: 'duplicate' },
  },
  {
    name: 'dedupe: the same body 13 h ago goes',
    i: { kind: 'proactive', bodyHash: 'h1' },
    c: { ledger: [row(13, { bodyHash: 'h1' })] },
    want: SEND,
  },
];

const gap: Row[] = [
  {
    name: 'gap: inside the gap and over budget is dropped, not merged',
    c: { ledger: [...sentToday(2), row(19, { kind: 'check-in' })] },
    want: { action: 'drop', reason: 'recently-sent' },
  },
  {
    name: 'gap: a check-in 19 h after the last is dropped',
    c: { ledger: [row(19, { kind: 'check-in' })] },
    want: { action: 'drop', reason: 'recently-sent' },
  },
  {
    name: 'gap: a check-in 21 h after the last goes',
    c: { ledger: [row(21, { kind: 'check-in' })] },
    want: SEND,
  },
  {
    name: 'gap: a reminder 30 s after another is dropped',
    i: { kind: 'reminder', requestedBy: 'user' },
    c: { ledger: [row(30 / 3600, { kind: 'reminder', requestedBy: 'user' })] },
    want: { action: 'drop', reason: 'recently-sent' },
  },
  {
    name: 'gap: is per channel',
    c: { ledger: [row(1, { kind: 'check-in', channel: 'push' })] },
    want: SEND,
  },
];

const firstContact: Row[] = [
  {
    name: 'a third party, first contact: send with the intro',
    i: { recipient: 'third-party', kind: 'on-behalf', requestedBy: 'user' },
    c: { isFirstContact: true },
    want: { action: 'send', reason: 'ok', introRequired: true },
  },
  {
    name: 'a third party, not the first text: no intro',
    i: { recipient: 'third-party', kind: 'on-behalf', requestedBy: 'user' },
    want: { action: 'send', introRequired: false },
  },
  {
    name: 'the owner never gets the intro',
    c: { isFirstContact: true },
    want: { action: 'send', introRequired: false },
  },
];

describe.each([
  ['recipient', recipient],
  ['consent', consent],
  ['texts off', textsOff],
  ['crisis quiet', crisis],
  ['quiet hours', quietHours],
  ['daily budget', budget],
  ['dedupe', dedupe],
  ['per-kind gap', gap],
  ['first contact', firstContact],
] as const)('decide: %s', (_gate, rows) => {
  it.each(rows)('$name', ({ i, c, want }) => {
    const d = decide(intent(i), ctx(c));
    const { holdUntil, ...rest } = want;
    expect(d).toMatchObject(rest);
    if ('holdUntil' in want) expect(d.holdUntil).toEqual(holdUntil);
  });
});

describe('decide: the gates', () => {
  it('run in the design order', () => {
    expect(GATES.map(([name]) => name)).toEqual([
      'recipient',
      'consent',
      'texts-off',
      'crisis',
      'quiet-hours',
      'dedupe',
      'gap',
      'budget',
    ]);
  });

  it('a held message re-decided at 08:00 goes', () => {
    const held = row(11, { intentKey: 'k-new', status: 'held', kind: 'check-in', priority: 50 });
    const first = decide(intent(), ctx({ now: at('2026-10-14T23:00') }));
    expect(first).toMatchObject({ action: 'hold', reason: 'quiet-hours' });
    const now = first.holdUntil ?? new Date(0);
    const later = decide(intent({ redecide: true }), ctx({ now, ledger: [held] }));
    expect(later).toMatchObject(SEND);
  });
});

describe('priorityOf and isDigestible', () => {
  it('a user request outranks every kind; a reminder > a check-in > a nudge', () => {
    expect(priorityOf('proactive', 'user')).toBeGreaterThan(priorityOf('transactional', 'ferni'));
    expect(priorityOf('reminder', 'ferni')).toBeGreaterThan(priorityOf('check-in', 'ferni'));
    expect(priorityOf('check-in', 'ferni')).toBeGreaterThan(
      priorityOf('commitment-nudge', 'ferni')
    );
  });

  it('check-ins and nudges can wait for the digest; reminders and replies cannot', () => {
    expect(isDigestible('check-in')).toBe(true);
    expect(isDigestible('commitment-nudge')).toBe(true);
    expect(isDigestible('reminder')).toBe(false);
    expect(isDigestible('reply')).toBe(false);
    expect(isDigestible('on-behalf')).toBe(false);
  });
});

describe('segments', () => {
  const a = (n: number): string => 'a'.repeat(n);
  it.each([
    [a(160), 1],
    [a(161), 2],
    [a(306), 2],
    [a(307), 3],
    [a(459), 3],
    [a(460), 4],
    ['€'.repeat(80), 1],
    ['€'.repeat(81), 2],
    [`${a(152)}€${a(152)}`, 3], // the escape pair can't straddle: 152 | 153 | 1, not 2
    ['✓'.repeat(70), 1],
    ['✓'.repeat(71), 2],
    ['✓'.repeat(134), 2],
    ['✓'.repeat(135), 3],
    ['😀'.repeat(35), 1],
    ['😀'.repeat(67), 3], // 33 a segment: a surrogate pair can't straddle
    [`It’s Ferni. ${a(60)}`, 2], // one curly apostrophe makes it UCS-2
  ])('case %#', (text, n) => {
    expect(segments(text)).toBe(n);
  });

  it('fitsSms: 3 segments by default', () => {
    expect(fitsSms('a'.repeat(459))).toBe(true);
    expect(fitsSms('a'.repeat(460))).toBe(false);
    expect(fitsSms('a'.repeat(161), 1)).toBe(false);
  });
});
