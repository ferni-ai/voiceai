/**
 * Firestore side of a wave: `waitlist_waves/{id}` (numbered once, in a
 * transaction, so two runs of the same id can't both number it), the queue
 * reads on `waitlist`, and the founding-member fields on `user_profiles`.
 *
 * Indexes: waitlist (inQueue, laneRank, priorityKey) and (status, seatExpiresAt).
 *
 * @module services/waitlist/wave-store
 */
import { FieldValue, type Firestore, type QueryDocumentSnapshot } from '@google-cloud/firestore';
import { queueFields, readEntry, type QueueEntry } from './queue.js';
import { readSettings, SEAT_DAYS, SETTINGS_DOC } from './settings.js';
import type { WaveRecord, WaveStore } from './wave.js';

const DAY_MS = 86_400_000;

export function firestoreWaveStore(db: Firestore): WaveStore {
  const waitlist = db.collection('waitlist');
  const waves = db.collection('waitlist_waves');
  const entries = (docs: QueryDocumentSnapshot[]): QueueEntry[] =>
    docs.map((d) => readEntry(d.id, d.data()));

  return {
    async settings() {
      return readSettings((await db.collection(SETTINGS_DOC.collection).doc(SETTINGS_DOC.id).get()).data()); // prettier-ignore
    },
    async claimWave(id, at, fixed) {
      return db.runTransaction(async (tx): Promise<WaveRecord> => {
        const ref = waves.doc(id);
        const snap = await tx.get(ref);
        const data = snap.data();
        if (data && (data.status === 'running' || data.status === 'done')) {
          return { id, number: data.number as number, status: data.status as WaveRecord['status'] };
        }
        let number = fixed;
        if (number === undefined) {
          const last = await tx.get(
            waves.where('number', '>=', 1).orderBy('number', 'desc').limit(1)
          );
          number = ((last.docs.at(0)?.data().number as number | undefined) ?? 0) + 1;
        }
        tx.set(ref, { number, status: 'running', startedAt: at });
        return { id, number, status: 'running' };
      });
    },
    async finishWave(id, summary) {
      await waves.doc(id).set({ ...summary, status: 'done', finishedAt: new Date() }, { merge: true }); // prettier-ignore
    },
    async recordSkip(id, summary) {
      const snap = await waves.doc(id).get();
      if (snap.data()?.status === 'done') return; // never overwrite a wave that ran
      await waves.doc(id).set({ ...summary, status: 'skipped', skippedAt: new Date() }, { merge: true }); // prettier-ignore
    },
    async admittedIn(waveId) {
      return (await waitlist.where('waveId', '==', waveId).count().get()).data().count;
    },
    async nextInLine(limit) {
      if (limit <= 0) return [];
      const q = waitlist.where('inQueue', '==', true).orderBy('laneRank').orderBy('priorityKey');
      return entries((await q.limit(limit).get()).docs);
    },
    async lapsedSeats(now) {
      const q = waitlist.where('status', '==', 'admitted').where('seatExpiresAt', '<', now);
      return entries((await q.get()).docs);
    },
    async admit(e, wave, now) {
      const founding = { foundingMember: true, foundingWave: wave.number };
      const seat = { status: 'admitted', waveId: wave.id, admittedAt: now, seatExpiresAt: new Date(now.getTime() + SEAT_DAYS * DAY_MS) }; // prettier-ignore
      await waitlist.doc(e.id).set({ ...seat, ...founding, inQueue: false }, { merge: true });
      const profile = db.collection('user_profiles').doc(e.id);
      if ((await profile.get()).exists) await profile.set(founding, { merge: true }); // tier untouched
    },
    async lapse(e, now) {
      // Back of the line (design, 2026-10-18): a lapsed seat would otherwise come straight back to
      // them every wave. Friends' boosts still count; the founding perk waits for a claimed seat.
      const back = { ...e, status: 'lapsed', requeuedAtMs: now.getTime() };
      await waitlist.doc(e.id).set(
        {
          status: 'lapsed',
          lapsedAt: now,
          requeuedAt: now,
          lapses: FieldValue.increment(1),
          waveId: FieldValue.delete(),
          seatExpiresAt: FieldValue.delete(),
          foundingMember: FieldValue.delete(),
          foundingWave: FieldValue.delete(),
          ...queueFields(back),
        },
        { merge: true }
      );
    },
  };
}
