/**
 * The Firestore side of holder verification (holder-verification.ts): the
 * identity read field by field, and the default deps, whose transact reads the
 * identity fresh and merges the decided patch in one Firestore transaction.
 *
 * @module services/messaging/holder-verification-store
 */
import { randomInt } from 'node:crypto';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { defaultConsentDeps } from './consent.js';
import { firestoreSendLedger } from './holder-send-ledger.js';
import type { HolderIdentity, HolderVerificationDeps, Pending } from './holder-verification.js';

const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function pendingOf(v: unknown): Pending | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as Record<string, unknown>;
  const [codeHash, numberHash, sentAt, expiresAt] = [
    text(p.codeHash),
    text(p.phoneHash),
    text(p.sentAt),
    text(p.expiresAt),
  ];
  // A code without the number it went to (written before the binding) is no code.
  if (!codeHash || !numberHash || !sentAt || !expiresAt || typeof p.tries !== 'number') {
    return undefined;
  }
  return { codeHash, phoneHash: numberHash, sentAt, expiresAt, tries: p.tries };
}

/** Read field by field: a doc missing its sponsor or phone matches no one (fails closed). */
function holderOf(id: string, data: Record<string, unknown>): HolderIdentity {
  return {
    id,
    sponsorUserId: text(data.sponsorUserId) ?? '',
    phoneNumber: text(data.phoneNumber) ?? '',
    phoneVerifiedAt: text(data.phoneVerifiedAt),
    holderVerification: pendingOf(data.holderVerification),
  };
}

export function defaultHolderDeps(): HolderVerificationDeps {
  const firestore = () => {
    const d = getFirestoreDb();
    if (!d) throw new Error('Firestore unavailable');
    return d;
  };
  const db = () => firestore().collection('sponsored_identities');
  return {
    env: process.env,
    now: () => new Date(),
    async byId(id) {
      const doc = await db().doc(id).get();
      return doc.exists ? holderOf(id, doc.data() as Record<string, unknown>) : undefined;
    },
    async byPhone(e164) {
      const { lookupByPhone } = await import('../identity/sponsored-identity.js');
      const found = await lookupByPhone(e164);
      return found.identity ? this.byId(found.identity.id) : undefined;
    },
    async transact(id, decide) {
      const ref = db().doc(id);
      return firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const step = decide(
          snap.exists ? holderOf(id, snap.data() as Record<string, unknown>) : undefined
        );
        if (step.patch) tx.set(ref, step.patch, { merge: true });
        return step.ok;
      });
    },
    async sponsorName(uid) {
      const doc = await getFirestoreDb()?.collection('bogle_users').doc(uid).get();
      const data: Record<string, unknown> | undefined = doc?.exists ? doc.data() : undefined;
      return data?.displayName ?? data?.name;
    },
    ledger: firestoreSendLedger,
    async send(to, body) {
      const { sendSms } = await import('../outreach/guarded-text-store.js');
      const out = await sendSms({
        to,
        body,
        personaId: 'ferni',
        userId: 'holder-verification',
        outreachId: 'holder-verification',
      });
      return out.success;
    },
    code: () => String(randomInt(0, 1_000_000)).padStart(6, '0'),
    consent: defaultConsentDeps(),
  };
}
