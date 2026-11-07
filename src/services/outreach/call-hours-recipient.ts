/**
 * Whose calling hours a proactive call keeps (checkCallHours, call-hours-guard.ts).
 *
 * A call to the member keeps their time zone and quiet hours. A contact's number goes by its
 * area code, else both coasts: never the member's zone or hours on someone else. With
 * QUIET_HOURS_UNIFIED on, a contact with an area code also waits for both coasts. The member's
 * own number reached as a contact keeps both: it waits while either rule or their hours say so.
 */
import { decide, priorityOf } from '../messaging/policy.js';
import type { Intent, PolicyCtx } from '../messaging/types.js';
import type { CallHoursInput } from './call-hours-guard.js';
import { timezoneFromPhone } from './area-code-timezones.js';
import { holdForCallHours, type Deferral, type DeferredCall } from './deferred-calls.js';
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
  return (await holdForCallHours(userId, call, first)) ?? holdForCallees(userId, call, rest);
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
 * zone). QUIET_HOURS_UNIFIED on adds both coasts to a known zone. Each hold ends when one zone
 * wakes; asked again until no zone holds, as quietEndsAt does.
 */
function contactHoldUntil(phone: string | undefined, now: Date): Date {
  const zone = timezoneFromPhone(phone);
  const zones = !zone ? [''] : isQuietHoursUnified() ? ['', zone] : [zone];
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

/** CALL_HOURS_GUARD off: held until every check (a contact's night, the member's hours) allows. */
export async function calleeCallHold(
  callees: CallHoursInput[],
  now: Date
): Promise<QuietHoursResult> {
  const memberHoldUntil = async (id: string): Promise<Date> => {
    const hours = await callQuietHours(id, now);
    return hours.quiet ? hours.until : now;
  };
  const ends = await Promise.all(
    callees.map(async (c): Promise<Date> =>
      c.recipientUserId
        ? memberHoldUntil(c.recipientUserId)
        : contactHoldUntil(c.recipientPhone, now)
    )
  );
  const until = new Date(Math.max(now.getTime(), ...ends.map((e) => e.getTime())));
  return { quiet: until.getTime() !== now.getTime(), until };
}
