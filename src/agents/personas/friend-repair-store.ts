/**
 * Firestore side of FRIEND_REPAIR (friend-repair.ts): no new store. The
 * correction joins the caller's corrections (user-corrections.ts fields plus
 * provenance); a retired fact gets supersession's fields plus correctedAt.
 *
 * @module agents/personas/friend-repair-store
 */
import type { DocumentReference } from 'firebase-admin/firestore';

import { withoutDerivedCopies } from '../../memory/recall/forget.js';
import { firestoreSupersessionStore } from '../../memory/storage/supersession-store.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import type { RepairRecord, RepairStore } from './friend-repair.js';

/** Marks a correction kept by FRIEND_REPAIR among the caller's corrections. */
export const REPAIR_SOURCE = 'friend-repair';
/** Kept corrections are read from the newest this many of a caller's corrections. */
const RECENT_SCANNED = 30;

const user = (userId: string): DocumentReference | undefined =>
  getFirestoreDb()?.collection('bogle_users').doc(userId);

/** A stored correction as a record, or null when it isn't one FRIEND_REPAIR kept. */
export function toRecord(data: Record<string, unknown>): RepairRecord | null {
  const text = (k: string): string => (typeof data[k] === 'string' ? (data[k] as string) : '');
  const kept = ['wrong', 'correctInformation', 'timestamp'].every((k) => text(k));
  if (data.source !== REPAIR_SOURCE || !kept) return null;
  return {
    right: text('correctInformation'),
    wrong: text('wrong'),
    said: text('whatUserCorrected'),
    ferniSaid: text('whatFerniSaid'),
    ...(text('callId') && { callId: text('callId') }),
    ...(text('personaId') && { personaId: text('personaId') }),
    at: text('timestamp'),
    supersededFactIds: Array.isArray(data.supersededFactIds)
      ? data.supersededFactIds.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

export const firestoreRepairStore: RepairStore = {
  facts: async (userId) => firestoreSupersessionStore.facts(userId),
  async add(userId, r) {
    const doc = user(userId)?.collection('corrections').doc();
    if (!doc) throw new Error('Firestore unavailable: correction not kept');
    // user-corrections.ts's fields (its context builder reads them too), then the provenance.
    await doc.set({
      whatFerniSaid: r.ferniSaid,
      whatUserCorrected: r.said,
      correctInformation: r.right,
      category: 'fact',
      timestamp: r.at,
      appliedToMemory: true,
      ...(r.personaId && { personaId: r.personaId }),
      source: REPAIR_SOURCE,
      wrong: r.wrong,
      ...(r.callId && { callId: r.callId }),
      supersededFactIds: r.supersededFactIds,
    });
    return doc.id;
  },
  async retire(userId, factIds, by, at) {
    const facts = user(userId)?.collection('dynamic_facts');
    const db = getFirestoreDb();
    if (!facts || !db) throw new Error('Firestore unavailable: facts not retired');
    const batch = db.batch();
    for (const id of factIds) {
      const retired = { supersededAt: at, supersededBy: by, correctedAt: at };
      batch.update(facts.doc(id), { ...retired, ...withoutDerivedCopies() });
    }
    await batch.commit();
  },
  async recent(userId) {
    const snap = await user(userId)
      ?.collection('corrections')
      .orderBy('timestamp', 'desc')
      .limit(RECENT_SCANNED)
      .get();
    return (snap?.docs ?? []).flatMap((d) => toRecord(d.data()) ?? []);
  },
};
