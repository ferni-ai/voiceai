/**
 * POST /api/seeds/import-local { balance, owned }: the one-time move of a browser's seeds
 * and cosmetics onto the server ledger, and the `SEEDS_SERVER_LEDGER` switch that tells
 * the web to use the server at all.
 *
 * Until the switch, every web earn and purchase lived in localStorage. Those numbers can't
 * be checked, so the import is guarded:
 * - Seeds: capped (1000), and a balance of 10 000+ (the dev "unlock all") imports nothing.
 * - Only accounts created before `SEEDS_IMPORT_BEFORE` (an ISO date) import anything, so
 *   making fresh accounts and gifting their imports to one can't mint seeds. Unset or
 *   unreadable cutoff, or an unknown creation time: nothing happens and nothing is recorded
 *   (503), so a misconfiguration or an auth blip never uses up someone's import.
 * - Items: only real items for sale (never default or unknown ids), and only those the
 *   caller's stored plan may buy, the same rule as a purchase. Others come back `skipped`.
 *   If the plan can't be read, no item is granted (the seeds still are, and the entry
 *   records it).
 * It runs once per account: the ledger entry `import:local` is written even for 0 seeds or
 * a too-new account, so a second import, from any device, changes nothing.
 *
 * Plan: docs/plans/2026-10-10-one-seed-ledger.md (part 4)
 *
 * @module api/seeds-import
 */
import admin from 'firebase-admin';
import { getSubscriptionInfo } from '../services/billing/stripe-subscription.js';
import { getFirebaseUser } from '../services/identity/firebase-auth.js';
import { cosmeticForSale, tierAllows } from '../services/seeds/cosmetics-catalog.js';
import { commitSeeds, prepareSeeds } from '../services/seeds/ledger.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'SeedsImport' });

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

/** The cutoff from SEEDS_IMPORT_BEFORE, or null when it's unset or not a date. */
function importCutoff(): number | null {
  const at = Date.parse(process.env.SEEDS_IMPORT_BEFORE ?? '');
  return Number.isNaN(at) ? null : at;
}

/** The caller's plan, or null when it can't be read (fail closed: no tiered item). */
async function planOf(uid: string): Promise<unknown> {
  try {
    return (await getSubscriptionInfo(uid)).tier;
  } catch (error) {
    log.warn({ error, uid }, 'Plan lookup failed; import grants no items');
    return null;
  }
}

export interface ImportBody {
  imported: number;
  granted: string[];
  /** Real items the caller's plan may not have (or every item, when it couldn't be read). */
  skipped: string[];
  alreadyImported: boolean;
  balance: number;
  reason?: 'account too new';
}

export type ImportResult =
  { status: 200; body: ImportBody } | { status: 400 | 404 | 503; error: string };

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

  const cutoff = importCutoff();
  const created = Date.parse((await getFirebaseUser(uid))?.metadata.creationTime ?? '');
  if (cutoff === null || Number.isNaN(created)) {
    log.warn({ uid, cutoff, created }, 'Seed import unavailable: no cutoff or creation time');
    return { status: 503, error: 'Seed import is not available right now' };
  }
  const tooNew = created >= cutoff;

  const forSale = [...new Set(owned.map(cosmeticForSale))].filter((item) => item !== undefined);
  const plan = forSale.length && !tooNew ? await planOf(uid) : null;
  const allowed = forSale.filter(
    (item) => !tooNew && plan !== null && tierAllows(plan, item.requiredTier)
  );
  const skipped = forSale.filter((item) => !allowed.includes(item)).map((item) => item.id);

  return db.runTransaction(async (tx) => {
    const state = await prepareSeeds(tx, db, uid, IMPORT_KEY);
    const before = (state.account?.ownedCosmetics as string[] | undefined) ?? [];
    const imported = tooNew ? 0 : importAmount(balance);
    const result = commitSeeds(tx, state, {
      delta: imported,
      reason: 'import',
      key: IMPORT_KEY,
      meta: {
        localBalance: balance,
        ...(tooNew ? { accountTooNew: true } : {}),
        ...(forSale.length && !tooNew && plan === null ? { planUnknown: true } : {}),
        ...(skipped.length ? { skipped } : {}),
      },
    });
    if (!result.applied) {
      return {
        status: 200 as const,
        body: {
          imported: 0,
          granted: [],
          skipped: [],
          alreadyImported: true,
          balance: result.balance,
        },
      };
    }
    const granted = allowed.map((item) => item.id).filter((id) => !before.includes(id));
    if (granted.length) {
      tx.set(
        state.accountRef,
        { ownedCosmetics: admin.firestore.FieldValue.arrayUnion(...granted) },
        { merge: true }
      );
    }
    return {
      status: 200 as const,
      body: {
        imported,
        granted,
        skipped,
        alreadyImported: false,
        balance: result.balance,
        ...(tooNew ? { reason: 'account too new' as const } : {}),
      },
    };
  });
}
