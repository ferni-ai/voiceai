/**
 * Joining the waitlist, and a person's place in it. Identity is bound to the
 * verified address: a verified sign-in writes only the doc keyed by its own
 * email; a Gmail alias someone typed in earlier lends only its join time and is
 * retired (its phone, friend's code and lane are dropped). A join without a
 * sign-in proves nothing: it never touches an existing entry or stores a code.
 * A friend's code counts once, only if it came with that address's own verified
 * join, for someone new to the line who isn't the inviter. Throwaway domains are refused.
 *
 * @module services/waitlist/join
 */
import {
  canonicalEmail,
  INVITE_CODE_PATTERN,
  isDisposableEmail,
  isValidEmail,
  LANE_RANK,
  newInviteCode,
  queueFields,
  WAITING_STATUSES,
  type QueueEntry,
} from './queue.js';
import type { WaitlistStore } from './store.js';

/** The doc id every waitlist and profile route already uses. */
export const waitlistDocId = (email: string): string =>
  Buffer.from(email).toString('base64').replace(/[/+=]/g, '_');

/**
 * A person's own entry: the doc keyed by their address, else a verified entry
 * for the same inbox (a verified Gmail spelling is the same Google account).
 * An unverified alias proves nothing about who typed it, so it isn't theirs.
 */
export async function findEntry(store: WaitlistStore, email: string): Promise<QueueEntry | null> {
  const lower = email.trim().toLowerCase();
  const exact = await store.get(waitlistDocId(lower));
  if (exact) return exact;
  const alias = await store.findByCanonical(canonicalEmail(lower));
  return alias?.verified ? alias : null;
}

/** 1-based place among verified people waiting; null when not in the line. */
export async function positionOf(store: WaitlistStore, e: QueueEntry): Promise<number | null> {
  const fields = queueFields(e);
  if (!fields.inQueue) return null;
  return 1 + (await store.countAhead(LANE_RANK[e.lane], fields.priorityKey));
}

export interface JoinInput {
  email: string;
  /** The email came from a sign-in that proved it (Firebase email_verified). */
  verified: boolean;
  ref?: string;
  source: string;
  now: Date;
}

export type JoinOutcome = { entry: QueueEntry } | { refused: 'invalid_email' | 'disposable_email' };

const isGmail = (e: QueueEntry): boolean => e.emailCanonical.endsWith('@gmail.com');

/** Idempotent per inbox: a second join only fills in what is missing (verification, a code). */
export async function joinWaitlist(store: WaitlistStore, input: JoinInput): Promise<JoinOutcome> {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { refused: 'invalid_email' };
  if (isDisposableEmail(email)) return { refused: 'disposable_email' };
  const exact = await store.get(waitlistDocId(email));
  const existing = exact ?? (await store.findByCanonical(canonicalEmail(email)));
  if (!input.verified) {
    if (existing) return { entry: existing }; // can't prove it's theirs: touch nothing
    const entry = { ...newEntry(email, input.now), inviteCode: newInviteCode() };
    await store.merge(entry.id, { ...freshFields(entry, input), ...queueFields(entry) });
    return { entry };
  }
  if (!exact && existing?.verified) return { entry: existing }; // the same Google account, spelled differently
  return { entry: await joinVerified(store, { ...input, email }, exact, exact ? null : existing) };
}

/** Writes only the doc keyed by the verified address; a waiting Gmail alias lends its place, nothing else. */
async function joinVerified(
  store: WaitlistStore,
  input: JoinInput,
  exact: QueueEntry | null,
  alias: QueueEntry | null
): Promise<QueueEntry> {
  // prettier-ignore
  const { email, now } = input;
  const inherit = alias && isGmail(alias) && WAITING_STATUSES.has(alias.status) ? alias : null;
  const ref = input.ref && INVITE_CODE_PATTERN.test(input.ref) ? input.ref : undefined;
  const base = exact ?? { ...newEntry(email, now), joinedAtMs: inherit?.joinedAtMs ?? now.getTime() }; // prettier-ignore
  const entry: QueueEntry = {
    ...base,
    email,
    verified: true,
    joinedAtMs: base.joinedAtMs || now.getTime(),
    inviteCode: base.inviteCode ?? newInviteCode(),
    // Set before or with this address's own verification, never after, never from an alias
    referredBy: base.verified ? base.referredBy : (base.referredBy ?? ref),
  };
  await store.merge(entry.id, {
    ...(exact ? {} : freshFields(entry, input)),
    email,
    emailCanonical: entry.emailCanonical,
    joinedAt: new Date(entry.joinedAtMs),
    inviteCode: entry.inviteCode,
    referredBy: entry.referredBy,
    verifiedAt: base.verified ? undefined : now,
    ...queueFields(entry),
  });
  if (inherit) await store.merge(inherit.id, { status: 'merged', mergedInto: entry.id, inQueue: false }); // prettier-ignore
  if (!entry.referralCredited && WAITING_STATUSES.has(entry.status)) await creditInviter(store, entry); // prettier-ignore
  return (await store.get(entry.id)) ?? entry;
}

function newEntry(email: string, now: Date): QueueEntry {
  const id = waitlistDocId(email);
  const emailCanonical = canonicalEmail(email);
  return { id, email, emailCanonical, status: 'pending', lane: 'standard', joinedAtMs: now.getTime(), verified: false, verifiedReferrals: 0, referralCredited: false }; // prettier-ignore
}

/** A new doc: standard lane, no phone, and a friend's code only when verified with it. */
function freshFields(e: QueueEntry, input: JoinInput): Record<string, unknown> {
  return { email: e.email, emailCanonical: e.emailCanonical, status: 'pending', source: input.source, lane: 'standard', createdAt: input.now, joinedAt: new Date(e.joinedAtMs), inviteCode: e.inviteCode, referralCode: e.referredBy }; // prettier-ignore
}

async function creditInviter(store: WaitlistStore, referred: QueueEntry): Promise<void> {
  const inviter = referred.referredBy ? await store.findByInviteCode(referred.referredBy) : null;
  if (!inviter || inviter.id === referred.id) return;
  if (inviter.emailCanonical === referred.emailCanonical) return; // the same inbox
  await store.creditReferral(inviter.id, referred.id);
}
