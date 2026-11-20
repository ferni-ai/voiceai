/**
 * The server seed ledger, as the web sees it.
 *
 * The server alone decides whether it owns seeds: GET /api/seeds answers
 * `serverLedger: true` only when SEEDS_SERVER_LEDGER=on (src/api/seeds-import.ts). That
 * field is the web's only signal; there is no client flag. Until it says true (and while
 * signed out, offline, or talking to a server without it), nothing here is active and the
 * browser ledger in cosmetics.service runs exactly as before.
 *
 * Once active, one snapshot from GET /api/seeds is the balance everywhere (main screen,
 * shop, roadmap, gifting), along with owned cosmetics, the streak and today's bonus.
 * Buying goes through POST /api/seeds/purchase and the daily bonus through claim-daily.
 * The browser's old balance and items move over once through POST /api/seeds/import-local:
 * the server takes one import per account (ledger key `import:local`), and this browser
 * remembers it sent one, so its local ledger is never offered to a second account here.
 * The local ledger is never overwritten with server numbers, so an import that has to be
 * retried can only ever send what the browser really had.
 *
 * Nothing a browser has goes out of sight: until the server has accepted this browser's
 * import (or it has no ledger to bring), the browser ledger stays the one in use, exactly
 * as with the switch off. A 503 (no SEEDS_IMPORT_BEFORE cutoff yet) or a network failure
 * keeps it that way and the import is offered again on the next refresh.
 *
 * Plan: docs/plans/2026-10-10-one-seed-ledger.md (part 4)
 */

import { apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { onAuthStateChange } from './firebase-auth.service.js';

const log = createLogger('SeedsLedger');

export interface ServerSeeds {
  balance: number;
  ownedCosmetics: string[];
  currentStreak: number;
  dailyBonusAvailable: boolean;
}

interface SeedsResponse extends Partial<ServerSeeds> {
  serverLedger?: boolean;
}

/** Set (to the account's uid) once this browser's ledger has been offered to the server. */
export const LOCAL_IMPORTED_KEY = 'ferni_seeds_local_imported';
const LOCAL_LEDGER_KEY = 'ferni_cosmetics';
/** Server earns land at session end; give them a moment before reading the balance again. */
const EARN_SETTLE_MS = 4000;

let snapshot: ServerSeeds | null = null;
let currentUid: string | null = null;
let inFlight: Promise<void> | null = null;

/** The server's seeds, or null while the browser ledger is the one in use. */
export function serverSeeds(): ServerSeeds | null {
  return snapshot;
}

function publish(next: ServerSeeds | null): void {
  if (next === null && snapshot === null) return;
  snapshot = next;
  // seeds-display and cosmetics both refresh on this
  document.dispatchEvent(new CustomEvent('ferni:cosmetics-change'));
}

/** A balance the server just reported (a vote, a suggestion, a reward). */
export function noteServerBalance(balance: number | undefined): void {
  if (snapshot && typeof balance === 'number' && Number.isFinite(balance)) {
    publish({ ...snapshot, balance });
  }
}

function toSnapshot(data: SeedsResponse): ServerSeeds | null {
  if (data.serverLedger !== true || typeof data.balance !== 'number') return null;
  return {
    balance: data.balance,
    ownedCosmetics: Array.isArray(data.ownedCosmetics) ? data.ownedCosmetics : [],
    currentStreak: typeof data.currentStreak === 'number' ? data.currentStreak : 0,
    dailyBonusAvailable: data.dailyBonusAvailable === true,
  };
}

async function fetchSeeds(): Promise<SeedsResponse | null> {
  const res = await apiGet<SeedsResponse>('/api/seeds');
  return res.ok && res.data ? res.data : null;
}

/** The browser ledger's balance and items, or null when this browser never saved one. */
function localLedger(): { balance: number; owned: string[] } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_LEDGER_KEY) ?? 'null') as {
      seedBalance?: unknown;
      ownedItems?: unknown;
    } | null;
    if (!saved || typeof saved.seedBalance !== 'number') return null;
    const owned = Array.isArray(saved.ownedItems) ? saved.ownedItems : [];
    return {
      balance: saved.seedBalance,
      owned: owned.filter((id): id is string => typeof id === 'string'),
    };
  } catch {
    return null;
  }
}

/**
 * Offer this browser's ledger to the server, once. 'changed': the server's numbers moved;
 * 'settled': nothing (more) to bring; 'pending': not accepted yet, so keep the browser ledger.
 */
async function importLocalOnce(uid: string): Promise<'changed' | 'settled' | 'pending'> {
  if (localStorage.getItem(LOCAL_IMPORTED_KEY)) return 'settled';
  const local = localLedger();
  if (!local) return 'settled';
  const res = await apiPost<{ imported?: number; alreadyImported?: boolean }>(
    '/api/seeds/import-local',
    local
  );
  if (!res.ok || !res.data) {
    // 503 (no cutoff configured) and network failures record nothing on the server: try again later
    log.warn({ status: res.status, error: res.error }, 'Seed import not accepted; will retry');
    return 'pending';
  }
  localStorage.setItem(LOCAL_IMPORTED_KEY, uid);
  log.info({ imported: res.data.imported, already: res.data.alreadyImported }, 'Seeds imported');
  return res.data.alreadyImported === true ? 'settled' : 'changed';
}

/** Read the server's seeds again (and send the one-time import first, if it's due). */
export function refreshServerSeeds(): Promise<void> {
  inFlight ??= (async () => {
    const uid = currentUid;
    try {
      let data = await fetchSeeds();
      if (!data) return; // offline, signed out, or no such route: keep what's shown
      const imported = data.serverLedger === true && uid ? await importLocalOnce(uid) : 'settled';
      if (imported === 'changed') data = (await fetchSeeds()) ?? data;
      // Another account signed in meanwhile: these numbers aren't theirs. And until this
      // browser's ledger is on the server, showing the server's would hide what it has.
      if (uid === currentUid) publish(imported === 'pending' ? null : toSnapshot(data));
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Buy a cosmetic on the server. True when the account owns it afterwards. */
export async function purchaseOnServer(itemId: string): Promise<boolean> {
  const res = await apiPost<{ owned?: boolean; balance?: number }>('/api/seeds/purchase', {
    itemId,
  });
  if (!res.ok || res.data?.owned !== true) {
    log.warn({ itemId, status: res.status, error: res.error }, 'Purchase refused');
    return false;
  }
  if (snapshot) {
    publish({
      ...snapshot,
      balance: res.data.balance ?? snapshot.balance,
      ownedCosmetics: [...new Set([...snapshot.ownedCosmetics, itemId])],
    });
  }
  return true;
}

/** Claim today's bonus on the server, on this person's local date. */
export async function claimDailyOnServer(): Promise<{ claimed: boolean; amount?: number }> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await apiPost<{ claimed?: boolean; amount?: number; newBalance?: number }>(
    `/api/seeds/claim-daily?tz=${encodeURIComponent(tz)}`,
    {}
  );
  if (!res.ok || res.data?.claimed !== true) return { claimed: false };
  if (snapshot) {
    publish({
      ...snapshot,
      balance: res.data.newBalance ?? snapshot.balance,
      dailyBonusAvailable: false,
    });
  }
  void refreshServerSeeds(); // the streak moves with the claim
  return { claimed: true, amount: res.data.amount };
}

/** Follow the signed-in account, and re-read after anything the server pays or charges. */
export function watchServerSeeds(): void {
  onAuthStateChange((state) => {
    const uid = state.isAuthenticated ? state.uid : null;
    if (uid === currentUid) return;
    currentUid = uid;
    publish(null);
    if (uid) void refreshServerSeeds();
  });

  const settleThenRefresh = (): void => {
    if (snapshot) setTimeout(() => void refreshServerSeeds(), EARN_SETTLE_MS);
  };
  window.addEventListener('ferni:conversation-end', settleThenRefresh);
  document.addEventListener('ferni:contribution-success', settleThenRefresh);
  document.addEventListener('ferni:subscription-paid', settleThenRefresh);
  document.addEventListener('ferni:referral-completed', settleThenRefresh);
  // Gifting spends on the server (gift-seeds.ui)
  document.addEventListener('ferni:seeds-spent', () => {
    if (snapshot) void refreshServerSeeds();
  });
}

export function _resetForTesting(): void {
  snapshot = null;
  currentUid = null;
  inFlight = null;
}
