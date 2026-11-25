/**
 * DURABLE_ACCESS_GRANTS (#2264): a waitlist approval whose reason has ended goes back to
 * pending, so the sign-in that found it puts the person in line (an approved entry is never
 * queued).
 *
 * Only on a definite "not admitted": a failed lookup writes nothing (the live rules, or the
 * profile grants that entryStanding cross-checks an unlabelled old approval against). The reset runs in a
 * transaction that re-reads the entry and writes only if it is still approved and still
 * lapses, so an admin approval landing between the read and the write is never wiped.
 *
 * @module api/lapsed-approval
 */
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { createLogger } from '../utils/safe-logger.js';
import { durableGrantsActive, entryStanding, waitlistStanding, type StoredSubscription, type StoredWaitlistEntry } from './access-grant-standing.js'; // prettier-ignore
import { firestoreAdmissionStore, isAdmitted, type AdmissionOptions, type Who } from './admission.js'; // prettier-ignore

const log = createLogger({ module: 'LapsedApproval' });

const lapses = (
  entry: StoredWaitlistEntry | undefined,
  subs: readonly unknown[]
): entry is StoredWaitlistEntry => entry?.status === 'approved' && entryStanding(entry, subs) === 'lapsing'; // prettier-ignore

/** The person's stored subscriptions; undefined when the read fails (then nothing is written). */
async function profileGrants(
  who: Who,
  opts: AdmissionOptions
): Promise<StoredSubscription[] | undefined> {
  const email = who.email?.toLowerCase().trim();
  if (!email) return [];
  try {
    return await (opts.store ?? firestoreAdmissionStore).subscriptions(email);
  } catch (err) {
    log.warn({ uid: who.uid.slice(0, 8), error: String(err) }, 'Profile grant read failed: approval left as is'); // prettier-ignore
    return undefined;
  }
}

/** True when the entry was reset to pending; false when nothing was written. */
export async function reopenLapsedApproval(
  db: Firestore,
  ref: DocumentReference,
  entry: StoredWaitlistEntry | undefined,
  who: Who,
  opts: AdmissionOptions = {}
): Promise<boolean> {
  if (!durableGrantsActive(opts.env ?? process.env) || entry?.status !== 'approved') return false;
  if (waitlistStanding(entry) === 'lasting') return false;
  const subs = await profileGrants(who, opts);
  if (subs === undefined || !lapses(entry, subs)) return false;
  if ((await isAdmitted(who, opts)).reason !== 'not-admitted') return false;
  const source = await db.runTransaction(async (tx) => {
    const now = (await tx.get(ref)).data() as StoredWaitlistEntry | undefined;
    if (!lapses(now, subs)) return undefined; // approved by an admin, or changed, since the first read
    const was = String(now.approvedVia ?? now.source);
    tx.update(ref, { status: 'pending', lapsedApproval: { source: was, at: new Date() } });
    return was;
  });
  if (source === undefined) return false;
  log.info({ marker: 'access_grant_lapsed', source, uid: who.uid.slice(0, 8) }, 'Lapsed approval: back in line'); // prettier-ignore
  return true;
}
