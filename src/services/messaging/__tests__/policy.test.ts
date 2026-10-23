/**
 * The messaging policy's fixtures (SOTA requirement 22): every gate, its
 * boundaries and its exceptions, one row each. Each gate was disabled in turn
 * and these went red (the PR lists gate -> test).
 */
import { describe, expect, it } from 'vitest';
import { zonedWallTimeToUtc } from '../../../utils/time-zone.js';
import { GATES, decide, isDigestible, priorityOf } from '../policy.js';
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
/** A reply answers their text: anchored to it, sent while they're still there unless a row says. */
const REPLY = { kind: 'reply', anchor: 'inbound:1' } as const;
const LIVE = { lastInboundAt: new Date(NOON.getTime() - 5 * 60_000) };

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
    name: 'a verification code to a number not being verified is dropped',
    i: { kind: 'transactional', requestedBy: 'user', anchor: undefined },
    c: { verifiedRecipient: false },
    want: { action: 'drop', reason: 'no-verified-phone' },
  },
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
    name: 'a verification code to an opted-out number is dropped',
    i: { kind: 'transactional', requestedBy: 'user', anchor: undefined },
    c: { now: at('2026-10-14T02:00'), consent: { sms: 'out', call: 'in' } },
    want: { action: 'drop', reason: 'opted-out' },
  },
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
    i: REPLY,
    c: { ...LIVE, prefs: { textsOff: true } },
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
    name: 'crisis 13 days ago: even a reminder they set holds until the 14 days end',
    i: { kind: 'reminder', requestedBy: 'user' },
    c: { crisis: { lastCrisisAt: new Date(NOON.getTime() - 13 * DAY) } },
    want: { action: 'hold', reason: 'crisis-quiet', holdUntil: new Date(NOON.getTime() + DAY) },
  },
  {
    name: 'crisis 13 days ago: a reply holds',
    i: REPLY,
    c: { ...LIVE, crisis: { lastCrisisAt: new Date(NOON.getTime() - 13 * DAY) } },
    want: { action: 'hold', reason: 'crisis-quiet', holdUntil: new Date(NOON.getTime() + DAY) },
  },
  {
    name: 'crisis 13 days ago: a transactional Ferni sends unasked holds',
    i: { kind: 'transactional', anchor: undefined },
    c: { crisis: { lastCrisisAt: new Date(NOON.getTime() - 13 * DAY) } },
    want: { action: 'hold', reason: 'crisis-quiet' },
  },
  {
    name: 'crisis 13 days ago: a code they asked for still goes',
    i: { kind: 'transactional', requestedBy: 'user', anchor: undefined },
    c: { crisis: { lastCrisisAt: new Date(NOON.getTime() - 13 * DAY) } },
    want: SEND,
  },
  {
    name: 'crisis 13 days ago: a code to a number they are verifying still goes',
    i: { kind: 'transactional', requestedBy: 'user', anchor: undefined, verifyingNumber: true },
    c: { verifiedRecipient: false, crisis: { lastCrisisAt: new Date(NOON.getTime() - 13 * DAY) } },
    want: SEND,
  },
];

const OWN_QUIET = { textsOff: false, quietStart: '22:30', quietEnd: '07:00' } as const;
const quietHours: Row[] = [
  {
    name: "LA owner's quiet 22:30-07:00: 22:29 goes",
    c: { zone: LA, now: at('2026-10-14T22:29', LA), prefs: OWN_QUIET },
    want: SEND,
  },
  {
    name: "LA owner's quiet 22:30-07:00: 22:30 holds to 07:00",
    c: { zone: LA, now: at('2026-10-14T22:30', LA), prefs: OWN_QUIET },
    want: quietUntil(at('2026-10-15T07:00', LA)),
  },
  {
    name: "LA owner's quiet 22:30-07:00: 06:59 holds to 07:00",
    c: { zone: LA, now: at('2026-10-14T06:59', LA), prefs: OWN_QUIET },
    want: quietUntil(at('2026-10-14T07:00', LA)),
  },
  {
    name: "LA owner's quiet 22:30-07:00: 07:00 goes",
    c: { zone: LA, now: at('2026-10-14T07:00', LA), prefs: OWN_QUIET },
    want: SEND,
  },
  {
    name: "LA third party, owner's quiet 22:30-07:00 set: 21:00 still holds to 08:00",
    i: { recipient: 'third-party', kind: 'on-behalf', requestedBy: 'user' },
    c: { zone: LA, now: at('2026-10-14T21:00', LA), prefs: OWN_QUIET },
    want: quietUntil(at('2026-10-15T08:00', LA)),
  },
  {
    name: 'prefs saved at the default 21:00-08:00: 20:59 goes',
    c: {
      now: at('2026-10-14T20:59'),
      prefs: { textsOff: false, quietStart: '21:00', quietEnd: '08:00' },
    },
    want: SEND,
  },
  {
    name: 'prefs saved at the default 21:00-08:00: 21:00 holds to 08:00',
    c: {
      now: at('2026-10-14T21:00'),
      prefs: { textsOff: false, quietStart: '21:00', quietEnd: '08:00' },
    },
    want: quietUntil(at('2026-10-15T08:00')),
  },
  {
    name: 'only one end saved: the default applies (21:30 holds)',
    c: { now: at('2026-10-14T21:30'), prefs: { textsOff: false, quietStart: '22:30' } },
    want: quietUntil(at('2026-10-15T08:00')),
  },
  {
    name: 'a saved window of exactly 4 h is used (23:00-03:00): 22:59 goes',
    c: {
      now: at('2026-10-14T22:59'),
      prefs: { textsOff: false, quietStart: '23:00', quietEnd: '03:00' },
    },
    want: SEND,
  },
  {
    name: "owner's quiet 22:30-07:00: 21:30 goes",
    c: { now: at('2026-10-14T21:30'), prefs: OWN_QUIET },
    want: SEND,
  },
  {
    name: "owner's quiet 22:30-07:00: 22:45 holds to 07:00",
    c: { now: at('2026-10-14T22:45'), prefs: OWN_QUIET },
    want: quietUntil(at('2026-10-15T07:00')),
  },
  {
    name: "owner's quiet 22:30-07:00: 06:59 holds to 07:00",
    c: { now: at('2026-10-14T06:59'), prefs: OWN_QUIET },
    want: quietUntil(at('2026-10-14T07:00')),
  },
  {
    name: "owner's quiet 22:30-07:00: 07:00 goes",
    c: { now: at('2026-10-14T07:00'), prefs: OWN_QUIET },
    want: SEND,
  },
  {
    name: "owner's quiet never applies to a third party: 21:30 holds to 08:00",
    i: { recipient: 'third-party', kind: 'on-behalf', requestedBy: 'user' },
    c: { now: at('2026-10-14T21:30'), prefs: OWN_QUIET },
    want: quietUntil(at('2026-10-15T08:00')),
  },
  {
    name: 'a saved window under 4 h is ignored: 21:30 holds to 08:00',
    c: {
      now: at('2026-10-14T21:30'),
      prefs: { textsOff: false, quietStart: '23:00', quietEnd: '02:30' },
    },
    want: quietUntil(at('2026-10-15T08:00')),
  },
  {
    name: 'a saved window over 16 h is ignored',
    c: {
      now: at('2026-10-14T21:30'),
      prefs: { textsOff: false, quietStart: '20:00', quietEnd: '12:01' },
    },
    want: quietUntil(at('2026-10-15T08:00')),
  },
  {
    name: 'a 16 h saved window is used: 12:00 goes',
    c: {
      now: at('2026-10-14T12:00'),
      prefs: { textsOff: false, quietStart: '20:00', quietEnd: '12:00' },
    },
    want: SEND,
  },
  {
    name: 'a malformed saved window is ignored',
    c: {
      now: at('2026-10-14T21:30'),
      prefs: { textsOff: false, quietStart: '9pm', quietEnd: '07:00' },
    },
    want: quietUntil(at('2026-10-15T08:00')),
  },
  {
    name: 'a non-wrapping saved window (01:00-07:00): 01:30 holds to 07:00',
    c: {
      now: at('2026-10-14T01:30'),
      prefs: { textsOff: false, quietStart: '01:00', quietEnd: '07:00' },
    },
    want: quietUntil(at('2026-10-14T07:00')),
  },
  {
    name: 'a non-wrapping saved window: 00:30 goes',
    c: {
      now: at('2026-10-14T00:30'),
      prefs: { textsOff: false, quietStart: '01:00', quietEnd: '07:00' },
    },
    want: SEND,
  },
  {
    name: 'a code to the number being verified at 02:00 goes',
    i: { kind: 'transactional', requestedBy: 'user', anchor: undefined, verifyingNumber: true },
    c: { now: at('2026-10-14T02:00'), verifiedRecipient: false },
    want: SEND,
  },
  {
    name: 'a code Ferni sends unasked at 02:00 waits for 08:00',
    i: { kind: 'transactional', anchor: undefined },
    c: { now: at('2026-10-14T02:00') },
    want: quietUntil(at('2026-10-14T08:00')),
  },
  {
    name: 'a code to a third party not being verified waits for 08:00',
    i: { kind: 'transactional', requestedBy: 'user', recipient: 'third-party', anchor: 'req:1' },
    c: { now: at('2026-10-14T02:00') },
    want: quietUntil(at('2026-10-14T08:00')),
  },
  {
    name: 'a reply at 23:15, 5 min after their text, goes (they are awake and talking)',
    i: REPLY,
    c: { now: at('2026-10-14T23:15'), lastInboundAt: at('2026-10-14T23:10') },
    want: SEND,
  },
  {
    name: 'the same reply 45 min after their text is proactive: waits for 08:00',
    i: REPLY,
    c: { now: at('2026-10-14T23:15'), lastInboundAt: at('2026-10-14T22:30') },
    want: { ...quietUntil(at('2026-10-15T08:00')), recordAs: 'proactive' },
  },
  {
    name: 'a verification code at 02:00 goes',
    i: { kind: 'transactional', requestedBy: 'user', anchor: undefined },
    c: { now: at('2026-10-14T02:00') },
    want: SEND,
  },
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
    name: 'a reply at 23:00 with no text from them is proactive: waits for 08:00',
    i: REPLY,
    c: { now: at('2026-10-14T23:00') },
    want: { ...quietUntil(at('2026-10-15T08:00')), recordAs: 'proactive' },
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
    name: 'invalid zone: a reminder they asked for at NY noon goes (both coasts awake)',
    i: { kind: 'reminder', requestedBy: 'user' },
    c: { zone: 'Mars/Olympus' },
    want: SEND,
  },
  {
    name: 'invalid zone: a reminder they asked for at LA 07:30 waits for LA 08:00',
    i: { kind: 'reminder', requestedBy: 'user' },
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
  {
    name: 'budget: a verification code is outside it',
    i: { kind: 'transactional', requestedBy: 'user', anchor: undefined },
    c: { ledger: sentToday(3) },
    want: SEND,
  },
  {
    name: 'budget: a live reply at 23:15 with 3 sent today goes',
    i: REPLY,
    c: { now: at('2026-10-14T23:15'), lastInboundAt: at('2026-10-14T23:10'), ledger: sentToday(3) },
    want: SEND,
  },
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
    name: 'budget: a live reply is outside it',
    i: REPLY,
    c: { ...LIVE, ledger: sentToday(3) },
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

const CODE = { kind: 'transactional', requestedBy: 'user', anchor: undefined } as const;
/** Codes sent `minutesAgo` before `from` (noon by default). */
const codes = (minutesAgo: number[], o: Partial<LedgerEntry> = {}, from = NOON): LedgerEntry[] =>
  minutesAgo.map((m) => ({
    ...row(0, { kind: 'transactional', requestedBy: 'user', ...o }),
    at: new Date(from.getTime() - m * 60_000),
  }));
const RATE = { action: 'drop', reason: 'transactional-rate' } as const;
const HOURS = (n: number): number[] => Array.from({ length: n }, (_, k) => (k + 1) * 60);
const codeRate: Row[] = [
  {
    name: "codes: 4 to another number don't count toward this number's limits",
    i: { ...CODE, destination: 'h:b' },
    c: { ledger: codes(HOURS(4), { destination: 'h:a' }) },
    want: SEND,
  },
  {
    name: 'codes: the 30 s gap is per number',
    i: { ...CODE, destination: 'h:b' },
    c: { ledger: codes([20 / 60], { destination: 'h:a' }) },
    want: SEND,
  },
  {
    name: 'codes per person: 10 in 24 h across two numbers, an 11th to a third is dropped',
    i: { ...CODE, destination: 'h:c' },
    c: {
      ledger: [
        ...codes(HOURS(5), { destination: 'h:a' }),
        ...codes(
          HOURS(5).map((m) => m + 30),
          { destination: 'h:b' }
        ),
      ],
    },
    want: RATE,
  },
  {
    name: 'codes per person: 9 in 24 h across two numbers, a 10th to a third goes',
    i: { ...CODE, destination: 'h:c' },
    c: {
      ledger: [
        ...codes(HOURS(5), { destination: 'h:a' }),
        ...codes(
          HOURS(4).map((m) => m + 30),
          { destination: 'h:b' }
        ),
      ],
    },
    want: SEND,
  },
  {
    name: 'codes per person: 5 in an hour across numbers, a 6th is dropped',
    i: { ...CODE, destination: 'h:a' },
    c: {
      ledger: [
        ...codes([5, 15, 25], { destination: 'h:a' }),
        ...codes([35, 45], { destination: 'h:b' }),
      ],
    },
    want: RATE,
  },
  {
    name: 'codes per person: a 4th number in 24 h is dropped',
    i: { ...CODE, destination: 'h:d' },
    c: {
      ledger: [
        ...codes([120], { destination: 'h:a' }),
        ...codes([240], { destination: 'h:b' }),
        ...codes([360], { destination: 'h:c' }),
      ],
    },
    want: { action: 'drop', reason: 'too-many-destinations' },
  },
  {
    name: 'codes per person: failed sends to 3 numbers count toward the 4th',
    i: { ...CODE, destination: 'h:d' },
    c: {
      ledger: ['h:a', 'h:b', 'h:c'].flatMap((d, k) =>
        codes([120 * (k + 1)], { destination: d, status: 'failed' })
      ),
    },
    want: { action: 'drop', reason: 'too-many-destinations' },
  },
  {
    name: 'codes per person: one of the 3 numbers already used today still goes',
    i: { ...CODE, destination: 'h:a' },
    c: {
      ledger: [
        ...codes([120], { destination: 'h:a' }),
        ...codes([240], { destination: 'h:b' }),
        ...codes([360], { destination: 'h:c' }),
      ],
    },
    want: SEND,
  },
  {
    name: 'codes: the 11th to the same number in 24 h is dropped',
    i: { ...CODE, destination: 'h:a' },
    c: { ledger: codes(HOURS(10), { destination: 'h:a' }) },
    want: RATE,
  },
  {
    name: 'codes: the 11th in 24 h is dropped',
    i: CODE,
    c: { ledger: codes([120, 240, 360, 480, 600, 720, 840, 960, 1080, 1200]) },
    want: RATE,
  },
  {
    name: 'codes: the 10th in 24 h goes',
    i: CODE,
    c: { ledger: codes([120, 240, 360, 480, 600, 720, 840, 960, 1080]) },
    want: SEND,
  },
  {
    name: 'codes: a code 25 h ago no longer counts',
    i: CODE,
    c: { ledger: codes([120, 240, 360, 480, 600, 720, 840, 960, 1080, 1500]) },
    want: SEND,
  },
  {
    name: 'codes: the 6th in an hour is dropped',
    i: CODE,
    c: { ledger: codes([5, 15, 25, 35, 45]) },
    want: RATE,
  },
  {
    name: 'codes: the 5th in an hour goes',
    i: CODE,
    c: { ledger: codes([5, 15, 25, 35]) },
    want: SEND,
  },
  {
    name: 'codes: failed sends count too',
    i: CODE,
    c: { ledger: codes([5, 15, 25, 35, 45], { status: 'failed' }) },
    want: RATE,
  },
  {
    name: 'codes: a 2nd within 30 s is dropped',
    i: CODE,
    c: { ledger: codes([20 / 60]) },
    want: RATE,
  },
  { name: 'codes: 31 s after the last goes', i: CODE, c: { ledger: codes([31 / 60]) }, want: SEND },
  {
    name: 'codes: the limits hold at 02:00 too',
    i: { ...CODE, verifyingNumber: true },
    c: { now: at('2026-10-14T02:00'), ledger: codes([20 / 60], {}, at('2026-10-14T02:00')) },
    want: RATE,
  },
  {
    name: 'codes: unasked codes are limited too',
    i: { kind: 'transactional', anchor: undefined },
    c: { ledger: codes([20 / 60]) },
    want: RATE,
  },
];

const replies = (minutesAgo: number[]): LedgerEntry[] =>
  codes(minutesAgo, { kind: 'reply', requestedBy: 'ferni' });
const REPLY_RATE = { action: 'drop', reason: 'reply-rate' } as const;
const replyRate: Row[] = [
  {
    name: 'replies: no text from them in 30 min, over budget, it merges as proactive',
    i: REPLY,
    c: { ledger: sentToday(3) },
    want: { ...DIGEST_TODAY, recordAs: 'proactive' },
  },
  {
    name: 'replies: no text from them, sent, it is recorded as proactive',
    i: REPLY,
    c: { lastInboundAt: new Date(NOON.getTime() - 45 * 60_000) },
    want: { ...SEND, recordAs: 'proactive' },
  },
  {
    name: 'replies: #51 in 50 min with no text from them is dropped',
    i: REPLY,
    c: { ledger: replies(Array.from({ length: 50 }, (_, k) => k + 1)) },
    want: REPLY_RATE,
  },
  {
    name: 'replies: a 6th reply to one text is dropped',
    i: REPLY,
    c: { lastInboundAt: new Date(NOON.getTime() - 10 * 60_000), ledger: replies([1, 2, 3, 4, 5]) },
    want: REPLY_RATE,
  },
  {
    name: 'replies: a 5th reply to one text goes',
    i: REPLY,
    c: { lastInboundAt: new Date(NOON.getTime() - 10 * 60_000), ledger: replies([1, 2, 3, 4]) },
    want: SEND,
  },
  {
    name: "replies: replies before their latest text don't count toward it",
    i: REPLY,
    c: {
      lastInboundAt: new Date(NOON.getTime() - 2 * 60_000),
      ledger: replies([10, 11, 12, 13, 14]),
    },
    want: SEND,
  },
  {
    name: 'replies: a 21st in an hour is dropped, however many texts they sent',
    i: REPLY,
    c: {
      lastInboundAt: new Date(NOON.getTime() - 60_000),
      ledger: replies(Array.from({ length: 20 }, (_, k) => 2 + k * 2)),
    },
    want: REPLY_RATE,
  },
  {
    name: 'replies: a 20th in an hour goes',
    i: REPLY,
    c: {
      lastInboundAt: new Date(NOON.getTime() - 60_000),
      ledger: replies(Array.from({ length: 19 }, (_, k) => 2 + k * 2)),
    },
    want: SEND,
  },
];

const asked = (minutesAgo: number[], from = NOON): LedgerEntry[] =>
  codes(minutesAgo, { kind: 'reminder' }, from);
const ASKED_RATE = { action: 'drop', reason: 'requested-rate' } as const;
const requestedRate: Row[] = [
  {
    name: 'requested: an 11th text they asked for in 24 h is dropped',
    i: { kind: 'reminder', requestedBy: 'user' },
    c: { ledger: asked(HOURS(10)) },
    want: ASKED_RATE,
  },
  {
    name: 'requested: a 10th goes',
    i: { kind: 'reminder', requestedBy: 'user' },
    c: { ledger: asked(HOURS(9)) },
    want: SEND,
  },
  {
    name: 'requested: a check-in claimed as asked for at 02:00, cap full, is bounded',
    i: { requestedBy: 'user', requestedAt: at('2026-10-14T02:00') },
    c: {
      now: at('2026-10-14T02:00'),
      ledger: [...asked(HOURS(10), at('2026-10-14T02:00')), ...sentToday(3)],
    },
    want: ASKED_RATE,
  },
  {
    name: "requested: codes they asked for don't count toward it",
    i: { kind: 'reminder', requestedBy: 'user' },
    c: { ledger: codes(HOURS(10)) },
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
  ['code rate', codeRate],
  ['reply rate', replyRate],
  ['requested rate', requestedRate],
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
      'focus',
      'quiet-hours',
      'dedupe',
      'gap',
      'code-rate',
      'rate',
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
