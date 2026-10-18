/**
 * Joining the waitlist, and a person's place in it.
 *
 * - One place per inbox: an alias (dots, +tag) finds the existing entry.
 * - Throwaway domains are refused.
 * - A friend's invite code counts once, and only when the person it brought
 *   in has verified their email (signed in with Google/Apple), is new to the
 *   line, and isn't the inviter under another alias.
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
  priorityKey,
  queueFields,
  WAITING_STATUSES,
  type QueueEntry,
} from './queue.js';
import type { WaitlistStore } from './store.js';

/** The doc id every waitlist and profile route already uses. */
export const waitlistDocId = (email: string): string =>
  Buffer.from(email).toString('base64').replace(/[/+=]/g, '_');

export async function findEntry(store: WaitlistStore, email: string): Promise<QueueEntry | null> {
  const lower = email.trim().toLowerCase();
  return (await store.get(waitlistDocId(lower))) ?? store.findByCanonical(canonicalEmail(lower));
}

/** 1-based place among verified people waiting; null when not in the line. */
export async function positionOf(store: WaitlistStore, e: QueueEntry): Promise<number | null> {
  if (!queueFields(e).inQueue) return null;
  return 1 + (await store.countAhead(LANE_RANK[e.lane], priorityKey(e.joinedAtMs, e.verifiedReferrals))); // prettier-ignore
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

/** Idempotent per inbox: a second join only fills in what is missing (verification, a code). */
export async function joinWaitlist(store: WaitlistStore, input: JoinInput): Promise<JoinOutcome> {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { refused: 'invalid_email' };
  if (isDisposableEmail(email)) return { refused: 'disposable_email' };
  const ref = input.ref && INVITE_CODE_PATTERN.test(input.ref) ? input.ref : undefined;

  const found = await findEntry(store, email);
  const base = found ?? newEntry(email, input.now);
  const entry = withJoin(base, input, ref);
  const fresh = found ? {} : { email, status: 'pending', source: input.source, lane: 'standard', createdAt: input.now, referralCode: ref }; // prettier-ignore
  await store.merge(entry.id, {
    ...fresh,
    emailCanonical: entry.emailCanonical,
    joinedAt: new Date(entry.joinedAtMs),
    inviteCode: entry.inviteCode,
    referredBy: entry.referredBy,
    verifiedAt: input.verified && !base.verified ? input.now : undefined,
    ...queueFields(entry),
  });
  if (entry.verified && !entry.referralCredited && WAITING_STATUSES.has(entry.status)) {
    await creditInviter(store, entry);
  }
  return { entry: (await store.get(entry.id)) ?? entry };
}

/** What a join adds: a join time and invite code if missing, verification, a friend's code. */
function withJoin(base: QueueEntry, input: JoinInput, ref: string | undefined): QueueEntry {
  return {
    ...base,
    joinedAtMs: base.joinedAtMs || input.now.getTime(),
    verified: base.verified || input.verified,
    inviteCode: base.inviteCode ?? newInviteCode(),
    // A code can be attached until the person verifies, never after
    referredBy: base.referredBy ?? (base.verified ? undefined : ref),
  };
}

function newEntry(email: string, now: Date): QueueEntry {
  const id = waitlistDocId(email);
  const emailCanonical = canonicalEmail(email);
  return { id, email, emailCanonical, status: 'pending', lane: 'standard', joinedAtMs: now.getTime(), verified: false, verifiedReferrals: 0, referralCredited: false }; // prettier-ignore
}

async function creditInviter(store: WaitlistStore, referred: QueueEntry): Promise<void> {
  const inviter = referred.referredBy ? await store.findByInviteCode(referred.referredBy) : null;
  if (!inviter || inviter.id === referred.id) return;
  if (inviter.emailCanonical === referred.emailCanonical) return; // the same inbox
  await store.creditReferral(inviter.id, referred.id);
}
