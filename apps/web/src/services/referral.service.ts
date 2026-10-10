/**
 * Referral Service - Network Effect Seeds System
 *
 * The server owns referrals (`/api/seeds/*`): it issues each user's referral code,
 * registers a friend's signup against it, and keeps the counts. This service only
 * reads that state and reports a friend's signup - it never invents a code, a
 * count, or a reward of its own.
 *
 * Philosophy: "Seeds grow when shared"
 */

import { apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { addSeeds } from './cosmetics.service.js';
import { isServerLedgerOn, refreshSeedLedger } from './seed-ledger-client.js';

const log = createLogger('ReferralService');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Seeds the server awards the referrer when a friend joins (seeds-routes.ts) */
export const REFERRAL_SIGNUP_REWARD = 25;

/** Seeds the server awards a new user who joins through a referral (seeds-routes.ts) */
export const REFERRAL_NEW_USER_BONUS = 25;

const STATE_KEY = 'ferni_referral_state'; // { referredBy }
const PENDING_KEY = 'ferni_pending_referral';

// ============================================================================
// TYPES
// ============================================================================

export type GardenTitle = 'seedling' | 'gardener' | 'grove-keeper' | 'forest-guardian';

/** What the server knows about this user's garden (GET /api/seeds/garden) */
export interface GardenData {
  referralCode: string;
  referralUrl: string;
  gardenTitle: GardenTitle;
  totalReferrals: number;
  /** Seeds actually credited to this user for referrals */
  totalEarnedFromReferrals: number;
}

interface ServerGarden {
  title?: GardenTitle;
  totalReferrals?: number;
  totalEarnedFromReferrals?: number;
  referralCode?: string;
  referralUrl?: string;
}

// ============================================================================
// SERVER-ISSUED GARDEN + LINK
// ============================================================================

let garden: GardenData | null = null;

/**
 * Fetch the garden from the server. Null when it can't be loaded: callers must
 * say so rather than show a made-up link or zeroed counts.
 */
export async function loadGarden(): Promise<GardenData | null> {
  garden = null;
  const res = await apiGet<ServerGarden>('/api/seeds/garden');
  const d = res.data;
  if (!res.ok || !d?.referralCode || !d.referralUrl) {
    log.warn({ status: res.status, error: res.error }, 'Could not load garden');
    return null;
  }
  garden = {
    referralCode: d.referralCode,
    referralUrl: d.referralUrl,
    gardenTitle: d.title ?? 'seedling',
    totalReferrals: d.totalReferrals ?? 0,
    totalEarnedFromReferrals: d.totalEarnedFromReferrals ?? 0,
  };
  return garden;
}

/** The garden from the last successful `loadGarden()` */
export function getGarden(): GardenData | null {
  return garden;
}

/** The server-issued shareable link, once the garden has loaded */
export function getReferralUrl(): string | null {
  return garden?.referralUrl ?? null;
}

// ============================================================================
// REFERRAL TRACKING (the friend's side)
// ============================================================================

/**
 * Who referred this user (their code), if the server already accepted it
 */
export function getReferredBy(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as { referredBy?: string };
    return saved.referredBy ?? null;
  } catch {
    return null;
  }
}

/**
 * Check URL for referral code on app load
 * Should be called early in app initialization
 */
export function checkReferralFromUrl(): string | null {
  const url = new URL(window.location.href);

  // Check multiple possible param names
  const refCode =
    url.searchParams.get('ref') ||
    url.searchParams.get('referral') ||
    url.pathname.match(/\/grow\/([a-z0-9]+-[a-z]+)/)?.[1];

  if (refCode && !getReferredBy()) {
    // Store the referral code but don't register it yet
    // Wait for signup/first conversation
    localStorage.setItem(PENDING_KEY, refCode);
    log.info({ refCode }, 'Referral code detected from URL');

    // Clean URL (remove ref param)
    url.searchParams.delete('ref');
    url.searchParams.delete('referral');
    if (url.pathname.includes('/grow/')) {
      url.pathname = '/';
    }
    window.history.replaceState({}, '', url.toString());

    return refCode;
  }

  return null;
}

/**
 * Register a pending referral with the server after the user's first conversation.
 * Only what the server confirms is awarded; the referrer's reward is the server's.
 */
export async function processPendingReferral(): Promise<{
  processed: boolean;
  bonusAwarded?: number;
}> {
  const pendingRef = localStorage.getItem(PENDING_KEY);
  if (!pendingRef || getReferredBy()) {
    return { processed: false };
  }

  const res = await apiPost<{ success?: boolean; newUserBonus?: number; error?: string }>(
    '/api/seeds/referral',
    { referralCode: pendingRef }
  );

  if (!res.ok) {
    // A 4xx means this code can never work (unknown, or your own): drop it.
    // Offline / 5xx / rate-limited: keep it and try again next conversation.
    const permanent = res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status);
    if (permanent) localStorage.removeItem(PENDING_KEY);
    log.warn({ status: res.status, error: res.error, permanent }, 'Referral not registered');
    return { processed: false };
  }

  localStorage.removeItem(PENDING_KEY);
  if (!res.data?.success) {
    log.info({ error: res.data?.error }, 'Referral declined by server');
    return { processed: false };
  }

  const bonus = res.data.newUserBonus ?? 0;
  localStorage.setItem(STATE_KEY, JSON.stringify({ referredBy: pendingRef }));
  // The server already paid the bonus; the local ledger only mirrors it while it's in charge
  if (isServerLedgerOn()) await refreshSeedLedger();
  else addSeeds(bonus);

  document.dispatchEvent(
    new CustomEvent('ferni:referral-completed', {
      detail: { referrerCode: pendingRef, newUserBonus: bonus },
    })
  );

  log.info({ referredBy: pendingRef, bonus }, 'Referral registered');
  return { processed: true, bonusAwarded: bonus };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize referral service
 */
export function initReferralService(): void {
  checkReferralFromUrl();
  log.info({ referredBy: getReferredBy() }, 'Referral service initialized');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const referralService = {
  init: initReferralService,
  loadGarden,
  getGarden,
  getUrl: getReferralUrl,
  checkFromUrl: checkReferralFromUrl,
  processPending: processPendingReferral,
  getReferredBy,
  // Constants for UI
  REWARDS: {
    signup: REFERRAL_SIGNUP_REWARD,
    newUser: REFERRAL_NEW_USER_BONUS,
  },
};

export default referralService;
