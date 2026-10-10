/**
 * POST /api/seeds/import-local { balance, owned }: the one-time move of a browser's seeds
 * and cosmetics onto the server ledger, and the `SEEDS_SERVER_LEDGER` switch that tells
 * the web to use the server at all.
 *
 * Until the switch, every web earn and purchase lived in localStorage. Those balances
 * can't be checked, so the import is capped (1000) and a balance of 10 000+ (the dev
 * "unlock all") imports nothing. It runs once per account: the ledger entry `import:local`
 * is written even for 0 seeds, so a second import, from any device, changes nothing.
 * Owned items are granted only when they're real items for sale (never default or unknown
 * ids), with no plan check: the person already has them in this browser.
 *
 * Plan: docs/plans/2026-10-10-one-seed-ledger.md (part 4)
 *
 * @module api/seeds-import
 */
import admin from 'firebase-admin';
import { cosmeticForSale } from '../services/seeds/cosmetics-catalog.js';
import { commitSeeds, prepareSeeds } from '../services/seeds/ledger.js';

/** Most seeds a browser balance can bring over. */
export const IMPORT_CAP = 1000;
/** A browser balance this large came from the dev "unlock all"; it imports nothing. */
export const DEV_BALANCE = 10_000;
export const IMPORT_KEY = 'import:local';
/** More owned ids than the catalog has items is not a real browser. */
const MAX_OWNED_IDS = 100;

/** Whether the web should read and spend seeds on the server. Off unless 'on'. */
export function serverLedgerEnabled(): boolean {
  return process.env.SEEDS_SERVER_LEDGER === 'on';
}

/** Seeds a browser balance is worth on import. */
export function importAmount(balance: number): number {
  if (!(balance > 0) || balance >= DEV_BALANCE) return 0;
  return Math.min(Math.floor(balance), IMPORT_CAP);
}

export interface ImportBody {
  imported: number;
  granted: string[];
  alreadyImported: boolean;
  balance: number;
}

export type ImportResult = { status: 200; body: ImportBody } | { status: 400 | 404; error: string };

export async function importLocalSeeds(
  db: admin.firestore.Firestore,
  uid: string,
  body: unknown
): Promise<ImportResult> {
  if (!serverLedgerEnabled()) return { status: 404, error: 'Seed import is not enabled' };
  const { balance, owned } = (body ?? {}) as { balance?: unknown; owned?: unknown };
  // A malformed request is refused rather than spending the account's one import
  if (typeof balance !== 'number' || !Number.isFinite(balance)) {
    return { status: 400, error: 'balance must be a number' };
  }
  if (!Array.isArray(owned) || owned.length > MAX_OWNED_IDS) {
    return { status: 400, error: 'owned must be a list of item ids' };
  }
  const forSale = [...new Set(owned.filter((id) => cosmeticForSale(id)) as string[])];

  return db.runTransaction(async (tx) => {
    const state = await prepareSeeds(tx, db, uid, IMPORT_KEY);
    const before = (state.account?.ownedCosmetics as string[] | undefined) ?? [];
    const imported = importAmount(balance);
    const result = commitSeeds(tx, state, {
      delta: imported,
      reason: 'import',
      key: IMPORT_KEY,
      meta: { localBalance: balance },
    });
    if (!result.applied) {
      return {
        status: 200 as const,
        body: { imported: 0, granted: [], alreadyImported: true, balance: result.balance },
      };
    }
    const granted = forSale.filter((id) => !before.includes(id));
    if (granted.length) {
      tx.set(
        state.accountRef,
        { ownedCosmetics: admin.firestore.FieldValue.arrayUnion(...granted) },
        { merge: true }
      );
    }
    return {
      status: 200 as const,
      body: { imported, granted, alreadyImported: false, balance: result.balance },
    };
  });
}
