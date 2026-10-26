/**
 * An in-memory holder send ledger for tests. Transactions run one at a time,
 * as Firestore's commit-or-retry makes them behave, and each read can wait
 * `latencyMs` so a check-then-write done OUTSIDE the ledger races like it
 * would against real Firestore.
 */
import type { LedgerTx, SendLedger } from '../holder-send-ledger.js';

export function memorySendLedger(latencyMs = 0) {
  const docs = new Map<string, Record<string, unknown>>();
  const wait = async (): Promise<void> =>
    latencyMs > 0
      ? new Promise((r) => {
          setTimeout(r, latencyMs);
        })
      : undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const tx: LedgerTx = {
    get: async (id) => (await wait(), docs.get(id)),
    set: (id, data) => void docs.set(id, { ...data }),
  };
  const ledger: SendLedger = {
    run: async <T>(fn: (t: LedgerTx) => Promise<T>): Promise<T> => {
      const turn = queue.then(async () => fn(tx));
      queue = turn.catch(() => undefined);
      return turn;
    },
  };
  return { ledger, docs };
}
