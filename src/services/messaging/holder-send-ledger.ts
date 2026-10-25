/**
 * Every holder-verification text Ferni sends, counted where deleting the
 * identity, recreating it, or locking out its code can't reset the count.
 * Without it a sponsor could text any number on repeat (SMS pumping) by
 * deleting and re-adding the identity, or by burning the five tries.
 *
 * One collection, two kinds of doc:
 * - `phone_{phoneHash}`: the number's own record. A keyed hash of the number,
 *   a timestamp and a count; no phone and no uid. Like consent/{phoneHash}, it
 *   protects the contact, so it is not erased with any member's account (a
 *   delete-and-rejoin would reset the number's cap) and is not in ERASED_STORES.
 * - `{uid}`: the sponsor's own daily count. In ERASED_STORES (byId), so it goes
 *   with their account; a new account is a new uid with a fresh count anyway.
 *
 * Limits, checked and written in one transaction so parallel starts can't
 * all pass: one text per number per 10 minutes, 5 per number per UTC day,
 * 20 per sponsor per UTC day.
 *
 * @module services/messaging/holder-send-ledger
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';

export const HOLDER_SENDS = 'holder_verification_sends';
export const SEND_GAP_MS = 10 * 60 * 1000;
export const NUMBER_DAILY_CAP = 5;
export const SPONSOR_DAILY_CAP = 20;

type Doc = Record<string, unknown> | undefined;

export interface LedgerTx {
  get: (id: string) => Promise<Doc>;
  set: (id: string, data: Record<string, unknown>) => void;
}

/** Runs `fn` as one transaction: its reads and writes commit together or retry. */
export interface SendLedger {
  run: <T>(fn: (tx: LedgerTx) => Promise<T>) => Promise<T>;
}

export type Reservation = 'ok' | 'too-soon' | 'daily-cap';

export const phoneLedgerId = (phoneHash: string): string => `phone_${phoneHash}`;

function countToday(doc: Doc, day: string): number {
  return doc?.day === day && typeof doc.count === 'number' ? doc.count : 0;
}

/**
 * Reserve one text to the number (by hash) for this sponsor, or say why not.
 * A reservation is spent even if the send then fails: a failing number can't
 * be retried faster than the gap.
 */
export async function reserveHolderSend(
  ledger: SendLedger,
  phoneHash: string,
  sponsorUid: string,
  now: Date
): Promise<Reservation> {
  const day = now.toISOString().slice(0, 10);
  const phoneId = phoneLedgerId(phoneHash);
  return ledger.run(async (tx) => {
    const [phone, sponsor] = await Promise.all([tx.get(phoneId), tx.get(sponsorUid)]);
    const last = typeof phone?.lastSentAt === 'string' ? Date.parse(phone.lastSentAt) : undefined;
    // An unreadable timestamp counts as just sent (NaN fails the comparison).
    if (last !== undefined && !(now.getTime() - last >= SEND_GAP_MS)) return 'too-soon';
    const [phoneCount, sponsorCount] = [countToday(phone, day), countToday(sponsor, day)];
    if (phoneCount >= NUMBER_DAILY_CAP || sponsorCount >= SPONSOR_DAILY_CAP) return 'daily-cap';
    const lastSentAt = now.toISOString();
    tx.set(phoneId, { lastSentAt, day, count: phoneCount + 1 });
    tx.set(sponsorUid, { lastSentAt, day, count: sponsorCount + 1 });
    return 'ok';
  });
}

/** The ledger in Firestore, in a Firestore transaction. */
export const firestoreSendLedger: SendLedger = {
  async run(fn) {
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore unavailable');
    const col = db.collection(HOLDER_SENDS);
    return db.runTransaction(async (tx) =>
      fn({
        async get(id) {
          const snap = await tx.get(col.doc(id));
          return snap.exists ? snap.data() : undefined;
        },
        set(id, data) {
          tx.set(col.doc(id), data);
        },
      })
    );
  },
};
