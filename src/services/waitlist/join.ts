/**
 * Joining the waitlist. Identity is bound to the verified address and uid: a
 * verified join writes only its own doc; waiting Gmail aliases lend only the
 * earliest join time and are all retired (phone, code, lane dropped). An
 * unverified join never touches an existing entry or stores a code; verifying
 * a doc made unverified keeps only its join time (phone, code, lane dropped). A friend's
 * code counts once, only at that address's first verification, and never for a
 * relay inbox. Throwaway domains are refused.
 *
 * @module services/waitlist/join
 */
import {
  canonicalEmail,
  INVITE_CODE_PATTERN,
  isDisposableEmail,
  isRelayEmail,
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

/** Oldest first, then by id: the same answer whatever order Firestore returns. */
const oldestFirst = (list: QueueEntry[]): QueueEntry[] =>
  [...list].sort((a, b) => a.joinedAtMs - b.joinedAtMs || a.id.localeCompare(b.id));

async function aliasesOf(store: WaitlistStore, email: string): Promise<QueueEntry[]> {
  if (!foldsAliases(email)) return [];
  const id = waitlistDocId(email);
  return oldestFirst((await store.byCanonical(canonicalEmail(email))).filter((e) => e.id !== id));
}

/** Your entry: by uid once a sign-in bound it, else your address's doc, else (Gmail) a verified alias. */
export async function findEntry(
  store: WaitlistStore,
  email: string,
  uid?: string
): Promise<QueueEntry | null> {
  // prettier-ignore
  const byUid = uid ? oldestFirst(await store.byUid(uid))[0] : undefined;
  if (byUid) return byUid;
  const lower = email.trim().toLowerCase();
  const exact = await store.get(waitlistDocId(lower));
  if (exact) return exact;
  return (await aliasesOf(store, lower)).find((e) => e.verified) ?? null;
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
  const aliases = exact ? [] : await aliasesOf(store, email);
  if (!input.verified) {
    const existing = exact ?? aliases[0];
    if (existing) return { entry: existing }; // can't prove it's theirs: touch nothing
    const entry = { ...newEntry(email, input.now), inviteCode: newInviteCode() };
    await store.merge(entry.id, { ...freshFields(entry, input), ...queueFields(entry) });
    return { entry };
  }
  const bound = input.uid ? oldestFirst(await store.byUid(input.uid)) : [];
  if (!exact && bound[0]) return { entry: bound[0] }; // this sign-in already has an entry
  const verifiedAlias = aliases.find((e) => e.verified);
  if (!exact && verifiedAlias) return { entry: verifiedAlias }; // the same Google account, spelled differently
  const entry = await joinVerified(store, { ...input, email }, exact, aliases.filter((a) => WAITING_STATUSES.has(a.status))); // prettier-ignore
  await unbindOthers(store, bound, entry.id);
  return { entry };
}

/** Writes only the doc keyed by the verified address; waiting Gmail aliases lend their earliest place, nothing else. */
async function joinVerified(
  store: WaitlistStore,
  input: JoinInput,
  exact: QueueEntry | null,
  waitingAliases: QueueEntry[]
): Promise<QueueEntry> {
  // prettier-ignore
  const { email, now } = input;
  const ref = input.ref && INVITE_CODE_PATTERN.test(input.ref) ? input.ref : undefined;
  const base = exact ?? { ...newEntry(email, now), joinedAtMs: waitingAliases[0]?.joinedAtMs ?? now.getTime() }; // prettier-ignore
  const firstVerification = !base.verified;
  // An unverified doc may have been planted by anyone: keep only its place in line, and take
  // the friend's code from this verified join alone (never one stored while unverified)
  const entry: QueueEntry = {
    ...base,
    email,
    verified: true,
    lane: firstVerification ? 'standard' : base.lane,
    joinedAtMs: base.joinedAtMs || now.getTime(),
    inviteCode: base.inviteCode ?? newInviteCode(),
    referredBy: firstVerification ? ref : base.referredBy,
  };
  const scrub = exact && firstVerification ? { phone: null, referralCode: entry.referredBy ?? null, referredBy: entry.referredBy ?? null, lane: 'standard' } : {}; // prettier-ignore
  await store.merge(entry.id, {
    ...(exact ? {} : freshFields(entry, input)),
    email,
    uid: input.uid,
    emailCanonical: entry.emailCanonical,
    joinedAt: new Date(entry.joinedAtMs),
    inviteCode: entry.inviteCode,
    referredBy: entry.referredBy,
    verifiedAt: firstVerification ? now : undefined,
    ...queueFields(entry),
    ...scrub, // last: undefined keys above are dropped, so they can't override it
  });
  for (const a of waitingAliases)
    await store.merge(a.id, { status: 'merged', mergedInto: entry.id, inQueue: false }); // eslint-disable-line no-await-in-loop
  if (firstVerification && !entry.referralCredited && WAITING_STATUSES.has(entry.status)) await creditInviter(store, entry); // prettier-ignore
  return (await store.get(entry.id)) ?? entry;
}

/** One uid, one entry: another waiting doc holding this uid is retired; a seat elsewhere just loses the uid. */
async function unbindOthers(
  store: WaitlistStore,
  bound: QueueEntry[],
  keepId: string
): Promise<void> {
  // prettier-ignore
  for (const other of bound.filter((e) => e.id !== keepId)) {
    const retire = WAITING_STATUSES.has(other.status) ? { status: 'merged', mergedInto: keepId, inQueue: false } : {}; // prettier-ignore
    await store.merge(other.id, { ...retire, uid: null }); // eslint-disable-line no-await-in-loop
  }
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
  if (isRelayEmail(referred.email)) return; // relay inboxes join, but are too cheap to mint to earn credit
  const inviter = referred.referredBy ? await store.findByInviteCode(referred.referredBy) : null;
  if (!inviter || inviter.id === referred.id) return;
  if (inviter.emailCanonical === referred.emailCanonical) return; // the same inbox
  await store.creditReferral(inviter.id, referred.id);
}
