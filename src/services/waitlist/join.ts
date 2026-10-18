/**
 * Joining the waitlist. Identity is bound to the verified address and uid: a
 * verified join writes only its own doc; a waiting Gmail alias lends only its
 * join time and is retired (phone, code, lane dropped). An unverified join
 * never touches an existing entry or stores a code. A friend's code counts once,
 * only with that address's own verified join. Throwaway domains are refused.
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

export const waitlistDocId = (email: string): string =>
  Buffer.from(email).toString('base64').replace(/[/+=]/g, '_');

/** Dots and +tags fold only where the provider really does that: Gmail. */
const foldsAliases = (email: string): boolean => /@(gmail|googlemail)\.com$/.test(email);

/** Your entry: by uid once a sign-in bound it, else your address's doc, else (Gmail) a verified alias. */
export async function findEntry(
  store: WaitlistStore,
  email: string,
  uid?: string
): Promise<QueueEntry | null> {
  // prettier-ignore
  const byUid = uid ? await store.findByUid(uid) : null;
  if (byUid) return byUid;
  const lower = email.trim().toLowerCase();
  const exact = await store.get(waitlistDocId(lower));
  if (exact || !foldsAliases(lower)) return exact;
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
  verified: boolean; // the email came from a sign-in that proved it (email_verified)
  ref?: string;
  uid?: string; // that sign-in's Firebase uid: the entry is bound to it
  source: string;
  now: Date;
}

export type JoinOutcome = { entry: QueueEntry } | { refused: 'invalid_email' | 'disposable_email' };

/** Idempotent per inbox: a second join only fills in what is missing (verification, a code). */
export async function joinWaitlist(store: WaitlistStore, input: JoinInput): Promise<JoinOutcome> {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { refused: 'invalid_email' };
  if (isDisposableEmail(email)) return { refused: 'disposable_email' };
  const exact = await store.get(waitlistDocId(email));
  const existing = exact ?? (foldsAliases(email) ? await store.findByCanonical(canonicalEmail(email)) : null); // prettier-ignore
  if (!input.verified) {
    if (existing) return { entry: existing }; // can't prove it's theirs: touch nothing
    const entry = { ...newEntry(email, input.now), inviteCode: newInviteCode() };
    await store.merge(entry.id, { ...freshFields(entry, input), ...queueFields(entry) });
    return { entry };
  }
  const byUid = !exact && input.uid ? await store.findByUid(input.uid) : null;
  if (byUid) return { entry: byUid }; // this sign-in already has an entry
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
  const inherit = alias && WAITING_STATUSES.has(alias.status) ? alias : null; // a Gmail alias (foldsAliases)
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
    uid: input.uid,
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
