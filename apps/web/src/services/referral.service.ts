/**
 * Referral Service - Network Effect Seeds System
 *
 * Manages referral codes, tracking, and seed rewards for viral growth.
 *
 * Philosophy: "Seeds grow when shared"
 * - Both parties get seeds when a referral converts
 * - Creates a "garden" of referrals that generates passive income
 * - Rewards meaningful sharing, not spam
 */

import { createLogger } from '../utils/logger.js';
import { addSeeds, getSeedBalance } from './cosmetics.service.js';

const log = createLogger('ReferralService');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Seeds awarded to referrer when friend signs up */
export const REFERRAL_SIGNUP_REWARD = 25;

/** Seeds awarded to new user when they sign up via referral */
export const REFERRAL_NEW_USER_BONUS = 25;

/** Seeds awarded when referred friend hits 7-day streak */
export const REFERRAL_STREAK_7_REWARD = 15;

/** Seeds awarded when referred friend hits 30-day streak */
export const REFERRAL_STREAK_30_REWARD = 25;

/** Seeds awarded when referred friend becomes subscriber */
export const REFERRAL_SUBSCRIBER_REWARD = 100;

/** Memorable words for referral codes */
const REFERRAL_WORDS = [
  'sunrise', 'garden', 'bloom', 'river', 'forest', 'meadow', 'breeze', 'willow',
  'cedar', 'sage', 'ember', 'dawn', 'dusk', 'haven', 'grove', 'fern', 'moss',
  'stream', 'pebble', 'cloud', 'rain', 'leaf', 'root', 'branch', 'seed', 'grow',
  'earth', 'sky', 'moon', 'star', 'light', 'warmth', 'peace', 'calm', 'joy',
  'hope', 'dream', 'rest', 'trust', 'care', 'kind', 'gentle', 'soft', 'warm',
];

// ============================================================================
// TYPES
// ============================================================================

interface ReferralState {
  /** User's unique referral code */
  referralCode: string;
  /** Who referred this user (null if organic) */
  referredBy: string | null;
  /** List of user IDs this user has referred */
  referrals: string[];
  /** Milestones achieved by referrals (for tracking rewards) */
  referralMilestones: Record<string, string[]>;
  /** Total seeds earned from referrals */
  totalReferralSeeds: number;
}

export interface GardenStats {
  totalReferrals: number;
  activeReferrals: number;
  weeklyPassiveSeeds: number;
  gardenTitle: 'seedling' | 'gardener' | 'grove-keeper' | 'forest-guardian';
}

// ============================================================================
// STATE
// ============================================================================

const STORAGE_KEY = 'ferni_referral_state';
let state: ReferralState = loadState();

function loadState(): ReferralState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved) as ReferralState;
    }
  } catch {
    log.warn('Failed to load referral state');
  }

  // Generate new referral code for new users
  return {
    referralCode: generateReferralCode(),
    referredBy: null,
    referrals: [],
    referralMilestones: {},
    totalReferralSeeds: 0,
  };
}

function saveState(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ============================================================================
// REFERRAL CODE GENERATION
// ============================================================================

/**
 * Generate a unique, memorable referral code
 * Format: "abc123-sunrise" (6 chars + word)
 */
function generateReferralCode(): string {
  // Generate 6 random alphanumeric characters
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let prefix = '';
  for (let i = 0; i < 6; i++) {
    prefix += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Pick a random memorable word
  const word = REFERRAL_WORDS[Math.floor(Math.random() * REFERRAL_WORDS.length)];

  return `${prefix}-${word}`;
}

/**
 * Get the user's referral code
 */
export function getReferralCode(): string {
  return state.referralCode;
}

/**
 * Get the full shareable referral URL
 */
export function getReferralUrl(): string {
  return `https://ferni.ai/grow/${state.referralCode}`;
}

// ============================================================================
// REFERRAL TRACKING
// ============================================================================

/**
 * Check URL for referral code on app load
 * Should be called early in app initialization
 */
export function checkReferralFromUrl(): string | null {
  const url = new URL(window.location.href);
  
  // Check multiple possible param names
  const refCode = url.searchParams.get('ref') ||
                  url.searchParams.get('referral') ||
                  url.pathname.match(/\/grow\/([a-z0-9]+-[a-z]+)/)?.[1];

  if (refCode && !state.referredBy) {
    // Store the referral code but don't award yet
    // Wait for signup/first conversation
    localStorage.setItem('ferni_pending_referral', refCode);
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
 * Process pending referral after user signs up or has first conversation
 */
export function processPendingReferral(): { processed: boolean; bonusAwarded?: number } {
  const pendingRef = localStorage.getItem('ferni_pending_referral');
  
  if (!pendingRef || state.referredBy) {
    return { processed: false };
  }

  // Store who referred us
  state.referredBy = pendingRef;
  saveState();

  // Award the new user bonus
  addSeeds(REFERRAL_NEW_USER_BONUS);

  // Dispatch event for referrer to get their bonus
  // This will be handled by backend or when referrer logs in
  document.dispatchEvent(
    new CustomEvent('ferni:referral-completed', {
      detail: {
        referrerCode: pendingRef,
        newUserBonus: REFERRAL_NEW_USER_BONUS,
        referrerBonus: REFERRAL_SIGNUP_REWARD,
      },
    })
  );

  // Clean up
  localStorage.removeItem('ferni_pending_referral');

  log.info({ referredBy: pendingRef, bonus: REFERRAL_NEW_USER_BONUS }, 'Referral processed');
  return { processed: true, bonusAwarded: REFERRAL_NEW_USER_BONUS };
}

/**
 * Record when you successfully refer someone
 */
export function recordReferralSuccess(newUserId: string): void {
  if (!state.referrals.includes(newUserId)) {
    state.referrals.push(newUserId);
    state.referralMilestones[newUserId] = ['signup'];
    state.totalReferralSeeds += REFERRAL_SIGNUP_REWARD;
    addSeeds(REFERRAL_SIGNUP_REWARD);
    saveState();

    // Dispatch event for UI
    document.dispatchEvent(
      new CustomEvent('ferni:referral-success', {
        detail: {
          newUserId,
          reward: REFERRAL_SIGNUP_REWARD,
          totalReferrals: state.referrals.length,
        },
      })
    );

    log.info({ newUserId, reward: REFERRAL_SIGNUP_REWARD }, 'Referral success recorded');
  }
}

/**
 * Award bonus when a referral hits a milestone
 */
export function awardReferralMilestone(
  referralId: string,
  milestone: 'streak-7' | 'streak-30' | 'subscriber'
): boolean {
  if (!state.referrals.includes(referralId)) {
    return false;
  }

  const milestones = state.referralMilestones[referralId] || [];
  if (milestones.includes(milestone)) {
    return false; // Already awarded
  }

  let reward = 0;
  switch (milestone) {
    case 'streak-7':
      reward = REFERRAL_STREAK_7_REWARD;
      break;
    case 'streak-30':
      reward = REFERRAL_STREAK_30_REWARD;
      break;
    case 'subscriber':
      reward = REFERRAL_SUBSCRIBER_REWARD;
      break;
  }

  milestones.push(milestone);
  state.referralMilestones[referralId] = milestones;
  state.totalReferralSeeds += reward;
  addSeeds(reward);
  saveState();

  document.dispatchEvent(
    new CustomEvent('ferni:referral-milestone', {
      detail: { referralId, milestone, reward },
    })
  );

  log.info({ referralId, milestone, reward }, 'Referral milestone awarded');
  return true;
}

// ============================================================================
// GARDEN STATS
// ============================================================================

/**
 * Get garden statistics for display
 */
export function getGardenStats(): GardenStats {
  const totalReferrals = state.referrals.length;
  
  // For now, assume all referrals are active
  // In production, this would check actual activity
  const activeReferrals = totalReferrals;

  // Calculate weekly passive seeds based on garden size
  let weeklyRate = 0;
  if (totalReferrals >= 11) {
    weeklyRate = 7;
  } else if (totalReferrals >= 6) {
    weeklyRate = 5;
  } else if (totalReferrals >= 3) {
    weeklyRate = 3;
  } else if (totalReferrals >= 1) {
    weeklyRate = 2;
  }
  const weeklyPassiveSeeds = activeReferrals * weeklyRate;

  // Determine garden title
  let gardenTitle: GardenStats['gardenTitle'] = 'seedling';
  if (totalReferrals >= 11) {
    gardenTitle = 'forest-guardian';
  } else if (totalReferrals >= 6) {
    gardenTitle = 'grove-keeper';
  } else if (totalReferrals >= 3) {
    gardenTitle = 'gardener';
  }

  return {
    totalReferrals,
    activeReferrals,
    weeklyPassiveSeeds,
    gardenTitle,
  };
}

/**
 * Get who referred this user (if anyone)
 */
export function getReferredBy(): string | null {
  return state.referredBy;
}

/**
 * Get total seeds earned from referrals
 */
export function getTotalReferralSeeds(): number {
  return state.totalReferralSeeds;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize referral service
 */
export function initReferralService(): void {
  // Load state
  state = loadState();

  // Check for referral in URL
  checkReferralFromUrl();

  log.info(
    {
      referralCode: state.referralCode,
      referredBy: state.referredBy,
      totalReferrals: state.referrals.length,
    },
    'Referral service initialized'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export const referralService = {
  init: initReferralService,
  getCode: getReferralCode,
  getUrl: getReferralUrl,
  checkFromUrl: checkReferralFromUrl,
  processPending: processPendingReferral,
  recordSuccess: recordReferralSuccess,
  awardMilestone: awardReferralMilestone,
  getGardenStats,
  getReferredBy,
  getTotalSeeds: getTotalReferralSeeds,
  // Constants for UI
  REWARDS: {
    signup: REFERRAL_SIGNUP_REWARD,
    newUser: REFERRAL_NEW_USER_BONUS,
    streak7: REFERRAL_STREAK_7_REWARD,
    streak30: REFERRAL_STREAK_30_REWARD,
    subscriber: REFERRAL_SUBSCRIBER_REWARD,
  },
};

export default referralService;

