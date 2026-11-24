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
 * A live paid plan (Stripe or the App Store, services/billing/paying-twice.ts)
 * always admits, whatever reason the grant records.
 *
 * Waitlist approvals are classified by server-written fields: approvedVia (written
 * with every approval since APPROVAL_REASONS_SINCE), approvedBy and approvedReason
 * (admin tools). `source` can only make an approval lapse, never last: the public
 * feature vote used to overwrite it. An approval with none of the three is legacy
 * (keeps admitting, marker access_grant_legacy) only when it is older than
 * APPROVAL_REASONS_SINCE; a newer unlabelled one lapses.
 *
 * @module api/access-grant-standing
 */
import { flagOn } from '../config/env-flag.js';
import { hasLivePaidPlan, ms } from '../services/billing/paying-twice.js';
import { ADMITTED_STATUSES } from '../services/waitlist/queue.js';
import type { SubscriptionData } from '../types/subscription.js';
import { createLogger } from '../utils/safe-logger.js';
import { waitlistGateOn } from './open-access.js';

const log = createLogger({ module: 'AccessGrantStanding' });

export type GrantStanding = 'lasting' | 'legacy' | 'lapsing';

/** What a grant records about itself; every field is read as unknown (Firestore data). */
export interface StoredSubscription {
  status?: unknown;
  grantedVia?: unknown;
  stripeSubscriptionId?: unknown;
  [field: string]: unknown;
}
export interface StoredWaitlistEntry {
  status?: unknown;
  source?: unknown;
  approvedVia?: unknown;
  approvedBy?: unknown;
  approvedReason?: unknown;
  approvedAt?: unknown;
}

/** Why a waitlist entry was approved: server-only, written in the same write as status 'approved'. */
export type ApprovedVia = 'open_access' | 'admission' | 'admin' | 'wave';

/**
 * The deploy date of #2264, from which every approval writes approvedVia. Move it to the real
 * deploy day if this ships later. Unlabelled approvals older than this are legacy.
 */
export const APPROVAL_REASONS_SINCE = new Date('2026-11-24T00:00:00Z');

/** Reasons that end: the gate was off, or the live rules said yes at the time (open-access.ts). */
const LAPSING_GRANTS = new Set(['open-access', 'admission', 'waitlist-approval-auto']);
/** The same two reasons as written on the waitlist entry (waitlist-routes.ts). */
const LAPSING_SOURCES = new Set(['open_access', 'admission']);
const LASTING_VIA = new Set<unknown>(['admin', 'wave'] satisfies ApprovedVia[]);

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** The flag is on and so is the gate. With the gate off everyone is admitted, so nothing changes. */
export function durableGrantsActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return waitlistGateOn(env) && flagOn('DURABLE_ACCESS_GRANTS', env);
}

/** A stored plan record, read with the billing module's own rules (fields it lacks are absent). */
const isPlanRecord = (
  sub: StoredSubscription | undefined
): sub is StoredSubscription & SubscriptionData => typeof sub === 'object' && sub !== null;

/** A live paid plan on a stored subscription (Stripe or App Store), by the billing rule. */
export function livePaidPlan(sub: StoredSubscription | undefined, now = new Date()): boolean {
  return isPlanRecord(sub) && hasLivePaidPlan(sub, now);
}

function subscriptionStanding(sub: StoredSubscription): GrantStanding {
  if (!isText(sub.grantedVia)) return 'legacy';
  return LAPSING_GRANTS.has(sub.grantedVia) ? 'lapsing' : 'lasting';
}

function approvedBeforeReasons(approvedAt: unknown): boolean {
  const at = ms(approvedAt);
  return at === undefined || Number.isNaN(at) || at < APPROVAL_REASONS_SINCE.getTime();
}

export function waitlistStanding(entry: StoredWaitlistEntry): GrantStanding {
  if (entry.status === 'admitted' || entry.status === 'joined') return 'lasting'; // a wave seat
  if (isText(entry.approvedBy) || isText(entry.approvedReason)) return 'lasting'; // an admin said yes
  if (isText(entry.approvedVia)) return LASTING_VIA.has(entry.approvedVia) ? 'lasting' : 'lapsing';
  if (isText(entry.source) && LAPSING_SOURCES.has(entry.source)) return 'lapsing';
  return approvedBeforeReasons(entry.approvedAt) ? 'legacy' : 'lapsing';
}

/** One info-level access_grant_legacy line per kind and uid per process; the rest at debug. */
const legacyLogged = new Set<string>();
const LEGACY_LOG_CAP = 10_000;

function admitsByItself(standing: GrantStanding, kind: string, uid: string | undefined): boolean {
  if (standing !== 'legacy') return standing === 'lasting';
  const key = `${kind}|${uid ?? ''}`;
  const first = !!uid && !legacyLogged.has(key);
  if (first) {
    if (legacyLogged.size >= LEGACY_LOG_CAP) legacyLogged.clear();
    legacyLogged.add(key);
  }
  const line = { marker: 'access_grant_legacy', kind, ...(uid && { uid: uid.slice(0, 8) }) };
  log[first ? 'info' : 'debug'](line, 'Legacy grant with no recorded reason: still admitted');
  return true;
}

/** A subscription that admits by itself: a live paid plan, or an active one whose reason lasts. */
export function subscriptionAdmits(sub: StoredSubscription | undefined, uid?: string): boolean {
  if (livePaidPlan(sub)) return true;
  if (sub?.status !== 'active') return false;
  return admitsByItself(subscriptionStanding(sub), 'subscription', uid);
}

const admittedStatus = (entry: StoredWaitlistEntry | undefined): boolean =>
  typeof entry?.status === 'string' && ADMITTED_STATUSES.has(entry.status);

/** An approved / admitted / joined waitlist entry that admits by itself. */
export function waitlistEntryAdmits(entry: StoredWaitlistEntry | undefined, uid?: string): boolean {
  return !!entry && admittedStatus(entry) && admitsByItself(waitlistStanding(entry), 'waitlist', uid); // prettier-ignore
}

/**
 * For /api/waitlist/check: an approved / admitted / joined entry that still counts. Flag or
 * gate off: any such entry (main's behaviour). A lapsing one falls through to the live check.
 */
export function admittedEntryStands(
  entry: StoredWaitlistEntry | undefined,
  uid?: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return admittedStatus(entry) && (!durableGrantsActive(env) || waitlistEntryAdmits(entry, uid));
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
