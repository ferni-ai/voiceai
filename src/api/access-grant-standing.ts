/**
 * Which stored access grants still let someone in once WAITLIST_GATE is on (#2264).
 *
 * Signing in writes a lasting grant (an active subscription, a waitlist entry
 * marked approved) even when the reason can end: open access while the gate was
 * off, or the admission rules saying yes for a friends-and-family member. With
 * DURABLE_ACCESS_GRANTS on and the gate on, such a grant no longer admits by
 * itself; the live rules (admission.ts) decide each time, so turning the gate on
 * or leaving the cohort ends it.
 *
 * Lasting: an explicit admin approval (approvedBy or approvedReason on the entry),
 * a wave seat (admitted or joined), a subscription granted any other recorded way.
 * Legacy: a grant written before reasons were recorded (no grantedVia; an approved
 * entry with no open-access/admission source) keeps admitting so no current member
 * is locked out, and logs marker access_grant_legacy so the count can be measured.
 *
 * @module api/access-grant-standing
 */
import { flagOn } from '../config/env-flag.js';
import { ADMITTED_STATUSES } from '../services/waitlist/queue.js';
import { createLogger } from '../utils/safe-logger.js';
import { waitlistGateOn } from './open-access.js';

const log = createLogger({ module: 'AccessGrantStanding' });

export type GrantStanding = 'lasting' | 'legacy' | 'lapsing';

/** What a grant records about itself; every field is read as unknown (Firestore data). */
export interface StoredSubscription {
  status?: unknown;
  grantedVia?: unknown;
  stripeSubscriptionId?: unknown;
}
export interface StoredWaitlistEntry {
  status?: unknown;
  source?: unknown;
  approvedBy?: unknown;
  approvedReason?: unknown;
}

/** Reasons that end: the gate was off, or the live rules said yes at the time (open-access.ts). */
const LAPSING_GRANTS = new Set(['open-access', 'admission', 'waitlist-approval-auto']);
/** The same two reasons as written on the waitlist entry (waitlist-routes.ts). */
const LAPSING_SOURCES = new Set(['open_access', 'admission']);

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** The flag is on and so is the gate. With the gate off everyone is admitted, so nothing changes. */
export function durableGrantsActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return waitlistGateOn(env) && flagOn('DURABLE_ACCESS_GRANTS', env);
}

function subscriptionStanding(sub: StoredSubscription): GrantStanding {
  if (!isText(sub.grantedVia)) return 'legacy';
  return LAPSING_GRANTS.has(sub.grantedVia) ? 'lapsing' : 'lasting';
}

export function waitlistStanding(entry: StoredWaitlistEntry): GrantStanding {
  if (entry.status === 'admitted' || entry.status === 'joined') return 'lasting'; // a wave seat
  if (isText(entry.approvedBy) || isText(entry.approvedReason)) return 'lasting'; // an admin said yes
  return isText(entry.source) && LAPSING_SOURCES.has(entry.source) ? 'lapsing' : 'legacy';
}

function admitsByItself(standing: GrantStanding, kind: string, extra: object = {}): boolean {
  if (standing === 'legacy') log.info({ marker: 'access_grant_legacy', kind, ...extra }, 'Legacy grant with no recorded reason: still admitted'); // prettier-ignore
  return standing !== 'lapsing';
}

/** An active subscription that admits by itself. */
export function subscriptionAdmits(sub: StoredSubscription | undefined): boolean {
  if (sub?.status !== 'active') return false;
  return admitsByItself(subscriptionStanding(sub), 'subscription', { paid: isText(sub.stripeSubscriptionId) }); // prettier-ignore
}

const admittedStatus = (entry: StoredWaitlistEntry | undefined): boolean =>
  typeof entry?.status === 'string' && ADMITTED_STATUSES.has(entry.status);

/** An approved / admitted / joined waitlist entry that admits by itself. */
export function waitlistEntryAdmits(entry: StoredWaitlistEntry | undefined): boolean {
  return !!entry && admittedStatus(entry) && admitsByItself(waitlistStanding(entry), 'waitlist');
}

/**
 * For /api/waitlist/check: an approved / admitted / joined entry that still counts. Flag or
 * gate off: any such entry (main's behaviour). A lapsing one falls through to the live check.
 */
export function admittedEntryStands(
  entry: StoredWaitlistEntry | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return admittedStatus(entry) && (!durableGrantsActive(env) || waitlistEntryAdmits(entry));
}

/**
 * An admin approving someone whose approval would lapse is a new, lasting approval, not
 * "already approved". Gate-independent, so an admin can make it last before the gate goes on.
 */
export function approvalLapses(
  entry: StoredWaitlistEntry,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return flagOn('DURABLE_ACCESS_GRANTS', env) && waitlistStanding(entry) === 'lapsing';
}
