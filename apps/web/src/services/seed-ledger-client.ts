/**
 * Seed ledger client: the server's seed balance and owned cosmetics, for the web.
 *
 * The browser kept its own seeds (cosmetics.service's localStorage balance), earned and
 * spent without the server. When GET /api/seeds says `serverLedger: true`, the server is
 * the only ledger: this module caches what it says, buys and claims through it, and sends
 * the browser's old balance and items once (POST /api/seeds/import-local). Until then (or
 * signed out, or before the first answer) `isServerLedgerOn()` is false and every caller
 * keeps its local behaviour.
 *
 * Plan: docs/plans/2026-10-10-one-seed-ledger.md (part 4)
 */
import { apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { onAuthStateChange } from './firebase-auth.service.js';

const log = createLogger('SeedLedger');

/** Set once this browser's local seeds went to the server; never sent again. */
export const IMPORT_DONE_KEY = 'ferni_seeds_imported';

export interface SeedLedgerSnapshot {
  balance: number;
  currentStreak: number;
  dailyBonusAvailable: boolean;
  ownedCosmetics: string[];
}

export interface LocalSeeds {
  balance: number;
  owned: string[];
}

/** What a purchase came to: bought, or why not (each has its own message). */
export type PurchaseOutcome = 'ok' | 'plan' | 'seeds' | 'error';

let snapshot: SeedLedgerSnapshot | null = null;
const listeners = new Set<() => void>();

function publish(next: SeedLedgerSnapshot | null): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
  // seeds-display redraws balances on this
  document.dispatchEvent(new CustomEvent('ferni:cosmetics-change'));
}

/** Whether seeds are read and spent on the server (GET /api/seeds said so). */
export function isServerLedgerOn(): boolean {
  return snapshot !== null;
}

export function getServerBalance(): number {
  return snapshot?.balance ?? 0;
}

export function getServerOwned(): string[] {
  return snapshot?.ownedCosmetics ?? [];
}

export function getServerStreak(): number {
  return snapshot?.currentStreak ?? 0;
}

export function isServerDailyBonusAvailable(): boolean {
  return snapshot?.dailyBonusAvailable ?? false;
}

export function subscribeSeedLedger(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-read GET /api/seeds. Returns whether the server ledger is on; a failed read keeps what we had. */
export async function refreshSeedLedger(): Promise<boolean> {
  const res = await apiGet<Partial<SeedLedgerSnapshot> & { serverLedger?: boolean }>('/api/seeds');
  if (!res.ok || !res.data) return isServerLedgerOn();
  const data = res.data;
  if (data.serverLedger !== true) {
    if (snapshot) publish(null);
    return false;
  }
  publish({
    balance: Number(data.balance ?? 0),
    currentStreak: Number(data.currentStreak ?? 0),
    dailyBonusAvailable: data.dailyBonusAvailable === true,
    ownedCosmetics: Array.isArray(data.ownedCosmetics) ? data.ownedCosmetics : [],
  });
  return true;
}

/** Buy a cosmetic on the server; the balance and ownership come back from it. */
export async function purchaseOnServer(itemId: string): Promise<PurchaseOutcome> {
  const res = await apiPost<{ owned?: boolean; balance?: number }>('/api/seeds/purchase', {
    itemId,
  });
  if (res.ok && res.data?.owned && snapshot) {
    const owned = snapshot.ownedCosmetics.includes(itemId)
      ? snapshot.ownedCosmetics
      : [...snapshot.ownedCosmetics, itemId];
    publish({ ...snapshot, balance: res.data.balance ?? snapshot.balance, ownedCosmetics: owned });
    return 'ok';
  }
  if (res.status === 403) return 'plan';
  if (res.status === 400 && /insufficient/i.test(res.error ?? '')) return 'seeds';
  log.warn({ itemId, status: res.status, error: res.error }, 'Server purchase failed');
  return 'error';
}

/** Claim the day's seeds on the server (the same once-a-day credit as a conversation). */
export async function claimDailyOnServer(): Promise<{ claimed: boolean; amount?: number }> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await apiPost<{ claimed?: boolean; amount?: number }>(
    `/api/seeds/claim-daily?tz=${encodeURIComponent(tz)}`
  );
  await refreshSeedLedger();
  return res.ok && res.data?.claimed ? { claimed: true, amount: res.data.amount } : { claimed: false };
}

function importDone(): boolean {
  try {
    return localStorage.getItem(IMPORT_DONE_KEY) !== null;
  } catch {
    return true; // no storage: don't risk sending it twice
  }
}

/**
 * Send this browser's local seeds and items to the server, once per browser (whichever
 * account is signed in first gets them; the server takes one import per account too).
 * Remembered only on success, so a server that can't take it yet (503) gets it next time.
 */
export async function runOneTimeImport(local: LocalSeeds): Promise<boolean> {
  if (!isServerLedgerOn() || importDone()) return false;
  const res = await apiPost<{ imported?: number }>('/api/seeds/import-local', local);
  if (!res.ok) {
    log.warn({ status: res.status, error: res.error }, 'Seed import not taken; will retry');
    return false;
  }
  try {
    localStorage.setItem(IMPORT_DONE_KEY, new Date().toISOString());
  } catch {
    // the server takes one import per account, so a repeat changes nothing
  }
  log.info({ imported: res.data?.imported }, 'Local seeds imported');
  await refreshSeedLedger();
  return true;
}

let currentUid: string | null = null;

/**
 * Follow sign-in: read the server ledger for each signed-in account, and send the local
 * seeds once it's on. Signed out, the web is back on its local ledger.
 */
export function initSeedLedger(readLocal: () => LocalSeeds): void {
  onAuthStateChange(({ uid }) => {
    if (uid === currentUid) return;
    currentUid = uid;
    if (!uid) {
      if (snapshot) publish(null);
      return;
    }
    void refreshSeedLedger().then((on) => (on ? runOneTimeImport(readLocal()) : false));
  });
}
