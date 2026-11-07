/**
 * Whose calling hours a proactive call keeps (checkCallHours, call-hours-guard.ts).
 *
 * A call to the member keeps their time zone and quiet hours. A contact's number goes by its
 * area code, else both coasts: never the member's zone or hours on someone else. With
 * QUIET_HOURS_UNIFIED on, a contact with an area code also waits for both coasts. The member's
 * own number reached as a contact keeps both: it waits while either rule or their hours say so.
 *
 * NIGHT_WINDOW_ALL_PATHS on: the member also keeps the default night in their zone, saved hours
 * or not (not on their own "call me" from a live call), and each hold's end is asked again until
 * every check allows, so no hold ends inside another callee's night.
 */
import { flagOn } from '../../config/env-flag.js';
import { decide, priorityOf } from '../messaging/policy.js';
import type { Intent, PolicyCtx } from '../messaging/types.js';
import { checkCallHours, userTimezone, type CallHoursInput } from './call-hours-guard.js';
import { timezoneFromPhone } from './area-code-timezones.js';
import { holdForCallHours, type Deferral, type DeferredCall } from './deferred-calls.js';
import { USER_REQUESTED_CALL } from './live-agent-call.js';
import { callQuietHours, isQuietHoursUnified, type QuietHoursResult } from './quiet-hours.js';

/** The calling-hours checks a call keeps; any one of them holds it. */
export async function callHoursRecipients(
  userId: string,
  phone: string,
  toContact?: boolean
): Promise<CallHoursInput[]> {
  const member = { recipientPhone: phone, recipientUserId: userId };
  if (!toContact) return [member];
  const contact = { recipientPhone: phone };
  const { isOwnVerifiedPhone } = await import('./guarded-text.js');
  const own = await isOwnVerifiedPhone(userId, phone).catch(() => false);
  return own ? [contact, member] : [contact];
}

/** CALL_HOURS_GUARD on: the first check that defers the call holds it. */
export async function holdForCallees(
  userId: string,
  call: DeferredCall,
  callees: CallHoursInput[]
): Promise<Deferral | undefined> {
  if (callees.length === 0) return undefined;
  const [first, ...rest] = callees;
  if (rest.length > 0 && isNightWindowAllPaths()) return holdForAll(userId, call, callees);
  return (await holdForCallHours(userId, call, first)) ?? holdForCallees(userId, call, rest);
}

const isNightWindowAllPaths = (): boolean => flagOn('NIGHT_WINDOW_ALL_PATHS');

/** Held to the first time every check allows: the check that holds last is asked at that hold. */
async function holdForAll(
  userId: string,
  call: DeferredCall,
  callees: CallHoursInput[]
): Promise<Deferral | undefined> {
  const userAsked = call.kind === 'proactive' && call.request.reason === USER_REQUESTED_CALL;
  let at = new Date();
  let last: CallHoursInput | undefined;
  for (let step = 0; step < 8; step++) {
    const ends = await Promise.all(
      callees.map(async (c) => {
        const d = await checkCallHours({ ...c, now: at, ...(userAsked && { userAsked }) });
        return { c, end: d.allowed ? at : (d.recheckAt ?? d.at) };
      })
    );
    const latest = ends.reduce((a, b) => (b.end > a.end ? b : a));
    if (latest.end.getTime() === at.getTime()) break;
    [last, at] = [{ ...latest.c, now: at }, latest.end]; // asked at `at`, it holds to the end
  }
  return last && holdForCallHours(userId, call, last);
}

// Only the time is asked here: consent, opt-outs and holds were decided before (ownerRefusal).
const CONTACT_CALL: Intent = {
  personId: 'contact',
  recipient: 'third-party',
  kind: 'on-behalf',
  persona: 'ferni',
  priority: priorityOf('on-behalf', 'user'),
  anchor: 'conversation call',
  requestedBy: 'user', // the member asked to reach them (reachOut)
  intentKey: 'conversation-call',
  channel: 'call',
};
const CONTACT_CTX: Omit<PolicyCtx, 'now' | 'zone'> = {
  consent: { sms: 'in', call: 'in' },
  prefs: { textsOff: false },
  crisis: {},
  ledger: [],
  verifiedRecipient: false,
  isFirstContact: false,
};

/**
 * policy.ts decides a contact's night where their number is, else on either coast ('' is no
 * zone). QUIET_HOURS_UNIFIED on adds both coasts to a known zone.
 */
function contactHoldUntil(phone: string | undefined, now: Date): Date {
  const zone = timezoneFromPhone(phone);
  return nightHoldUntil(!zone ? [''] : isQuietHoursUnified() ? ['', zone] : [zone], now);
}

/** The end of policy.ts's night in the zones: each hold ends when one zone wakes; asked again
 * until no zone holds, as quietEndsAt does. */
function nightHoldUntil(zones: string[], now: Date): Date {
  let at = now;
  for (let step = 0; step < 8; step++) {
    const ends = zones.map((z) => {
      const d = decide(CONTACT_CALL, { ...CONTACT_CTX, now: at, zone: z });
      if (d.action !== 'send' && !d.holdUntil) throw new Error(`Contact call held: ${d.reason}`);
      return d.holdUntil?.getTime() ?? at.getTime();
    });
    const until = Math.max(...ends);
    if (until === at.getTime()) return at;
    at = new Date(until);
  }
  throw new Error('Contact call: no time both coasts and the callee allow');
}

type Hold = (at: Date) => Promise<Date>;

/** Each check's hold from `at`: a contact's night, the member's hours (`night`: and night). */
async function calleeHolds(callees: CallHoursInput[], night: boolean): Promise<Hold[]> {
  const memberHours: (id: string) => Hold = (id) => async (at) => {
    const hours = await callQuietHours(id, at);
    return hours.quiet ? hours.until : at;
  };
  const memberNight = async (c: CallHoursInput): Promise<Hold> => {
    const stored = await userTimezone(c.recipientUserId).catch(() => undefined);
    const zone = stored ?? timezoneFromPhone(c.recipientPhone) ?? ''; // '' is both coasts
    return async (at) => nightHoldUntil([zone], at);
  };
  const holds = await Promise.all(
    callees.map(async (c): Promise<Hold[]> => {
      if (!c.recipientUserId) return [async (at) => contactHoldUntil(c.recipientPhone, at)];
      const hours = memberHours(c.recipientUserId);
      return night ? [hours, await memberNight(c)] : [hours];
    })
  );
  return holds.flat();
}

/**
 * CALL_HOURS_GUARD off: held until every check (a contact's night, the member's hours) allows.
 * NIGHT_WINDOW_ALL_PATHS on (not their own "call me", asOwnCallMe): the member's night too, and
 * the end is asked again until no check holds it.
 */
export async function calleeCallHold(
  callees: CallHoursInput[],
  now: Date,
  ownCallMe = false
): Promise<QuietHoursResult> {
  const night = isNightWindowAllPaths() && !ownCallMe;
  const holds = await calleeHolds(callees, night);
  const latest = async (at: Date): Promise<Date> => {
    const ends = await Promise.all(holds.map((hold) => hold(at)));
    return new Date(Math.max(at.getTime(), ...ends.map((e) => e.getTime())));
  };
  let until = await latest(now);
  for (let step = 0; night && step < 8; step++) {
    const next = await latest(until);
    if (next.getTime() === until.getTime()) break;
    until = next;
  }
  return { quiet: until.getTime() !== now.getTime(), until };
}
