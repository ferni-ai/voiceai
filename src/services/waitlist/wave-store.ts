/**
 * The wave store contract, and its Firestore side: `waitlist_waves/{id}` (claimed under a lease in a
 * transaction, numbered once, with an `admitted` counter), the queue reads on
 * `waitlist`, and reads on `user_profiles` (an active subscription is a member, not a seat).
 * The founding perk itself is granted when the seat is claimed (api/waitlist-routes.ts), from
 * the `foundingWave` written here.
 *
 * Every write to a person is a transactional update(), so it re-reads them first
 * and never recreates a doc that was erased in the meantime.
 *
 * Indexes: waitlist (inQueue, laneRank, priorityKey) and (status, seatExpiresAt).
 *
 * @module services/waitlist/wave-store
 */
import { FieldValue, type Firestore, type QueryDocumentSnapshot } from '@google-cloud/firestore';
import { queueFields, readEntry, type QueueEntry } from './queue.js';
import { readSettings, SEAT_DAYS, SETTINGS_DOC, type WaitlistSettings } from './settings.js';

interface WaveRecord {
  id: string;
  number: number;
  status: 'running' | 'done' | 'busy';
  /** Admitted so far in this wave (a re-claimed wave carries its count). */
  admitted: number;
}

type AdmitResult = 'admitted' | 'full' | 'skipped' | 'member';
type LapseResult = 'lapsed' | 'member' | 'skipped';

export interface WaveStore {
  settings: () => Promise<WaitlistSettings>;
  /** Claims the wave under a lease until `leaseUntil`; 'busy' while another run holds it, 'done' once finished. */
  claimWave: (id: string, now: Date, leaseUntil: Date, number?: number) => Promise<WaveRecord>;
  finishWave: (id: string, summary: Record<string, unknown>) => Promise<void>;
  recordSkip: (id: string, summary: Record<string, unknown>) => Promise<void>;
  /** The first `limit` people in line: inQueue, by laneRank then priorityKey. */
  nextInLine: (limit: number) => Promise<QueueEntry[]>;
  /** Admitted, never signed in, seat past its expiry. */
  lapsedSeats: (now: Date) => Promise<QueueEntry[]>;
  /** One person, in a transaction: re-reads the wave's count (stops at `size`) and their inQueue. */
  admitOne: (e: QueueEntry, wave: WaveRecord, size: number, now: Date) => Promise<AdmitResult>;
  /** One seat, in a transaction: re-reads it; a member with an active profile is marked joined. */
  lapse: (e: QueueEntry, now: Date) => Promise<LapseResult>;
}

const DAY_MS = 86_400_000;

const activeProfile = (d: Record<string, unknown> | undefined): boolean =>
  (d?.subscription as { status?: string } | undefined)?.status === 'active';

const toMs = (v: unknown): number => {
  const t = v as { toMillis?: () => number } | null;
  return v instanceof Date ? v.getTime() : typeof t?.toMillis === 'function' ? t.toMillis() : 0;
};

/** A member signed in already: their entry is joined, never a seat that can lapse. */
const MEMBER = { status: 'joined', inQueue: false, joinedVia: 'active-profile' };

export function firestoreWaveStore(db: Firestore): WaveStore {
  const waitlist = db.collection('waitlist');
  const waves = db.collection('waitlist_waves');
  const profiles = db.collection('user_profiles');
  const entries = (docs: QueryDocumentSnapshot[]): QueueEntry[] =>
    docs.map((d) => readEntry(d.id, d.data()));

  return {
    async settings() {
      return readSettings((await db.collection(SETTINGS_DOC.collection).doc(SETTINGS_DOC.id).get()).data()); // prettier-ignore
    },
    async claimWave(id, now, leaseUntil, fixed) {
      return db.runTransaction(async (tx): Promise<WaveRecord> => {
        const ref = waves.doc(id);
        const data = (await tx.get(ref)).data();
        const admitted = typeof data?.admitted === 'number' ? data.admitted : 0;
        const held = data?.status === 'running' && toMs(data.leaseUntil) > now.getTime();
        if (data && (data.status === 'done' || held)) {
          return { id, number: data.number as number, status: held ? 'busy' : 'done', admitted };
        }
        let number = typeof data?.number === 'number' ? data.number : fixed;
        if (number === undefined) {
          const last = await tx.get(waves.where('number', '>=', 1).orderBy('number', 'desc').limit(1)); // prettier-ignore
          number = ((last.docs.at(0)?.data().number as number | undefined) ?? 0) + 1;
        }
        tx.set(ref, { number, status: 'running', leaseUntil, startedAt: now, admitted }, { merge: true }); // prettier-ignore
        return { id, number, status: 'running', admitted };
      });
    },
    async finishWave(id, summary) {
      await waves.doc(id).set({ ...summary, status: 'done', leaseUntil: FieldValue.delete(), finishedAt: new Date() }, { merge: true }); // prettier-ignore
    },
    async recordSkip(id, summary) {
      const status = (await waves.doc(id).get()).data()?.status as string | undefined;
      if (status === 'done' || status === 'running') return; // never overwrite a wave that ran or is running
      await waves.doc(id).set({ ...summary, status: 'skipped', skippedAt: new Date() }, { merge: true }); // prettier-ignore
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
    async admitOne(e, wave, size, now) {
      return db.runTransaction(async (tx) => {
        const [w, person, profile] = await tx.getAll(waves.doc(wave.id), waitlist.doc(e.id), profiles.doc(e.id)); // prettier-ignore
        if (((w.data()?.admitted as number | undefined) ?? 0) >= size) return 'full';
        if (!person.exists || person.data()?.inQueue !== true) return 'skipped';
        if (activeProfile(profile.data())) {
          tx.update(person.ref, MEMBER);
          return 'member';
        }
        const seatExpiresAt = new Date(now.getTime() + SEAT_DAYS * DAY_MS);
        tx.update(person.ref, { status: 'admitted', waveId: wave.id, admittedAt: now, seatExpiresAt, inQueue: false, foundingWave: wave.number }); // prettier-ignore
        tx.update(w.ref, { admitted: FieldValue.increment(1) });
        return 'admitted';
      });
    },
    async lapse(e, now) {
      return db.runTransaction(async (tx) => {
        const [person, profile] = await tx.getAll(waitlist.doc(e.id), profiles.doc(e.id));
        const fresh = person.exists ? readEntry(e.id, person.data() ?? {}) : null;
        const expired = fresh?.status === 'admitted' && (fresh.seatExpiresAt?.getTime() ?? Infinity) < now.getTime(); // prettier-ignore
        if (!fresh || !expired) return 'skipped';
        if (activeProfile(profile.data())) {
          tx.update(person.ref, MEMBER);
          return 'member';
        }
        // Back of the line (design, 2026-10-18); friends' boosts still count, the founding perk waits
        const back = { ...fresh, status: 'lapsed', requeuedAtMs: now.getTime() };
        tx.update(person.ref, {
          status: 'lapsed',
          lapsedAt: now,
          requeuedAt: now,
          lapses: FieldValue.increment(1),
          waveId: FieldValue.delete(),
          seatExpiresAt: FieldValue.delete(),
          foundingWave: FieldValue.delete(),
          ...queueFields(back),
        });
        return 'lapsed';
      });
    },
  };
}
