/**
 * Seeds Economy Service
 *
 * Manages the earning and spending of Seeds - Ferni's in-app currency.
 * Seeds are earned through natural engagement, not grinding.
 *
 * Philosophy: Seeds grow naturally from your relationship with Ferni.
 * Like seeds in a garden, they appear from consistent care and time together.
 *
 * Earning methods:
 * - Daily conversations (first of the day)
 * - Conversation streaks (7 days, 30 days)
 * - Growth journey milestones
 * - Referrals
 */

import { createLogger } from '../utils/logger.js';
import { addSeeds, getSeedBalance } from './cosmetics.service.js';

const log = createLogger('SeedsEconomy');

// ============================================================================
// TYPES
// ============================================================================

interface SeedReward {
  type: string;
  amount: number;
  description: string;
}

interface SeedsState {
  /** Last date a daily bonus was claimed (ISO string) */
  lastDailyClaimDate: string | null;
  /** Current conversation streak (consecutive days) */
  currentStreak: number;
  /** Last conversation date for streak tracking (ISO string) */
  lastConversationDate: string | null;
  /** Total seeds earned all time */
  totalEarned: number;
  /** Milestones that have awarded seeds */
  awardedMilestones: string[];
  /** Referral codes used */
  referralCodesUsed: string[];
}

// ============================================================================
// SEED REWARDS CONFIGURATION
// ============================================================================

const SEED_REWARDS: Record<string, SeedReward> = {
  // Daily rewards
  dailyConversation: {
    type: 'daily',
    amount: 5,
    description: 'First conversation of the day',
  },

  // Streak bonuses
  streak7: {
    type: 'streak',
    amount: 25,
    description: '7-day conversation streak',
  },
  streak14: {
    type: 'streak',
    amount: 50,
    description: '2-week conversation streak',
  },
  streak30: {
    type: 'streak',
    amount: 100,
    description: 'Month-long streak',
  },
  streak60: {
    type: 'streak',
    amount: 200,
    description: '2-month streak',
  },
  streak100: {
    type: 'streak',
    amount: 500,
    description: '100-day milestone',
  },

  // Milestone bonuses
  firstConversation: {
    type: 'milestone',
    amount: 10,
    description: 'Your first conversation',
  },
  conversations10: {
    type: 'milestone',
    amount: 25,
    description: '10 conversations milestone',
  },
  conversations50: {
    type: 'milestone',
    amount: 50,
    description: '50 conversations',
  },
  conversations100: {
    type: 'milestone',
    amount: 100,
    description: '100 conversations',
  },
  goalAchieved: {
    type: 'achievement',
    amount: 15,
    description: 'Achieved a personal goal',
  },

  // Referrals
  referral: {
    type: 'referral',
    amount: 100,
    description: 'Friend signed up with your code',
  },

  // Seed Fund Contributions (bonus seeds for supporters!)
  seedContribution5: {
    type: 'contribution',
    amount: 10, // $5 = 10 bonus seeds (2x!)
    description: 'Planted a seed 🌱',
  },
  seedContribution10: {
    type: 'contribution',
    amount: 25, // $10 = 25 bonus seeds (2.5x!)
    description: 'Sponsored a conversation 💚',
  },
  seedContribution25: {
    type: 'contribution',
    amount: 75, // $25 = 75 bonus seeds (3x!)
    description: 'Helped someone get started 🌿',
  },
  seedContribution50: {
    type: 'contribution',
    amount: 200, // $50 = 200 bonus seeds (4x!)
    description: 'Supported the mission 🌳',
  },

  // Monthly Supporter Bonuses
  foundingMemberBonus: {
    type: 'subscription',
    amount: 50, // Monthly seed bonus for $10/mo subscribers
    description: 'Monthly Founding Member bonus',
  },
  foundingPatronBonus: {
    type: 'subscription',
    amount: 150, // Monthly seed bonus for $20/mo subscribers
    description: 'Monthly Founding Patron bonus',
  },
};

// Streak milestones that award bonuses
const STREAK_MILESTONES = [7, 14, 30, 60, 100];

// Conversation milestones that award bonuses
const CONVERSATION_MILESTONES = [1, 10, 50, 100, 250, 500, 1000];

// ============================================================================
// STATE
// ============================================================================

const STORAGE_KEY = 'ferni_seeds_state';

let state: SeedsState = loadState();

function loadState(): SeedsState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved) as SeedsState;
    }
  } catch (e) {
    log.warn('Failed to load seeds state');
  }

  return {
    lastDailyClaimDate: null,
    currentStreak: 0,
    lastConversationDate: null,
    totalEarned: 0,
    awardedMilestones: [],
    referralCodesUsed: [],
  };
}

function saveState(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ============================================================================
// DATE HELPERS
// ============================================================================

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getToday(): string {
  return formatLocalDate(new Date());
}

function isYesterday(dateStr: string): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return dateStr === formatLocalDate(yesterday);
}

function isSameDay(date1: string | null, date2: string): boolean {
  return date1 === date2;
}

// ============================================================================
// SEED AWARDING
// ============================================================================

/**
 * Award seeds for an action and show notification
 */
function awardSeeds(reward: SeedReward, showToast = true): void {
  addSeeds(reward.amount);
  state.totalEarned += reward.amount;
  saveState();

  log.info({ reward }, 'Seeds awarded');

  // Dispatch event for UI to show notification
  if (showToast) {
    document.dispatchEvent(
      new CustomEvent('ferni:seeds-earned', {
        detail: {
          amount: reward.amount,
          reason: reward.description,
          type: reward.type,
        },
      })
    );
  }
}

// ============================================================================
// DAILY & STREAK TRACKING
// ============================================================================

/**
 * Record a conversation and check for daily/streak bonuses
 * Call this when a conversation ends or reaches a meaningful point
 */
export function recordConversation(): void {
  const today = getToday();

  // Check for daily bonus
  if (!isSameDay(state.lastDailyClaimDate, today)) {
    // Award daily seeds
    const dailyReward = SEED_REWARDS.dailyConversation;
    if (dailyReward) {
      awardSeeds(dailyReward);
    }
    state.lastDailyClaimDate = today;

    // Update streak
    if (state.lastConversationDate && isYesterday(state.lastConversationDate)) {
      // Continue streak
      state.currentStreak += 1;
      log.debug({ streak: state.currentStreak }, 'Streak continued');

      // Check for streak milestone bonuses
      checkStreakMilestones();
    } else if (!isSameDay(state.lastConversationDate, today)) {
      // Streak broken or first conversation
      if (state.currentStreak > 0) {
        log.info({ previousStreak: state.currentStreak }, 'Streak reset');
      }
      state.currentStreak = 1;
    }

    state.lastConversationDate = today;
    saveState();
  }
}

/**
 * Check and award streak milestone bonuses
 */
function checkStreakMilestones(): void {
  for (const days of STREAK_MILESTONES) {
    const milestoneId = `streak-${days}`;

    if (state.currentStreak === days && !state.awardedMilestones.includes(milestoneId)) {
      const rewardKey = `streak${days}`;
      const reward = SEED_REWARDS[rewardKey];

      if (reward) {
        awardSeeds(reward);
        state.awardedMilestones.push(milestoneId);
        saveState();

        // Dispatch streak celebration event
        document.dispatchEvent(
          new CustomEvent('ferni:streak-milestone', {
            detail: { days, reward: reward.amount },
          })
        );
      }
    }
  }
}

// ============================================================================
// MILESTONE REWARDS
// ============================================================================

/**
 * Award seeds for reaching a conversation count milestone
 */
export function checkConversationMilestone(totalConversations: number): void {
  for (const count of CONVERSATION_MILESTONES) {
    const milestoneId = `conversations-${count}`;

    if (totalConversations >= count && !state.awardedMilestones.includes(milestoneId)) {
      let reward: SeedReward | undefined;

      if (count === 1) {
        reward = SEED_REWARDS.firstConversation;
      } else if (count === 10) {
        reward = SEED_REWARDS.conversations10;
      } else if (count === 50) {
        reward = SEED_REWARDS.conversations50;
      } else if (count === 100) {
        reward = SEED_REWARDS.conversations100;
      } else {
        // Generic milestone for 250, 500, 1000
        reward = {
          type: 'milestone',
          amount: Math.floor(count / 5),
          description: `${count} conversations`,
        };
      }

      if (reward) {
        awardSeeds(reward);
        state.awardedMilestones.push(milestoneId);
        saveState();
      }
    }
  }
}

/**
 * Award seeds for achieving a goal
 */
export function recordGoalAchieved(goalId: string): void {
  const milestoneId = `goal-${goalId}`;
  const reward = SEED_REWARDS.goalAchieved;

  if (!state.awardedMilestones.includes(milestoneId) && reward) {
    awardSeeds(reward);
    state.awardedMilestones.push(milestoneId);
    saveState();
  }
}

// ============================================================================
// REFERRALS
// ============================================================================

/**
 * Award seeds for a successful referral
 */
export function recordReferral(referralCode: string): void {
  const reward = SEED_REWARDS.referral;

  if (!state.referralCodesUsed.includes(referralCode) && reward) {
    awardSeeds(reward);
    state.referralCodesUsed.push(referralCode);
    saveState();
  }
}

// ============================================================================
// SEED FUND CONTRIBUTIONS (Supporter Bonuses)
// ============================================================================

/**
 * Award bonus seeds for a one-time contribution
 * Called after successful Stripe payment
 */
export function recordContribution(amountCents: number): void {
  let reward: SeedReward | undefined;

  // Map contribution amount to seed bonus
  if (amountCents >= 5000) {
    reward = SEED_REWARDS.seedContribution50;
  } else if (amountCents >= 2500) {
    reward = SEED_REWARDS.seedContribution25;
  } else if (amountCents >= 1000) {
    reward = SEED_REWARDS.seedContribution10;
  } else if (amountCents >= 500) {
    reward = SEED_REWARDS.seedContribution5;
  }

  if (reward) {
    awardSeeds(reward);
    log.info({ amountCents, seedBonus: reward.amount }, 'Contribution seed bonus awarded');
  }
}

/**
 * Award monthly seed bonus for subscribers
 * Called when subscription payment succeeds
 */
export function recordMonthlySubscriptionBonus(tier: 'founding-member' | 'founding-patron'): void {
  const reward = tier === 'founding-patron' 
    ? SEED_REWARDS.foundingPatronBonus 
    : SEED_REWARDS.foundingMemberBonus;

  if (reward) {
    awardSeeds(reward);
    log.info({ tier, seedBonus: reward.amount }, 'Monthly subscription seed bonus awarded');
  }
}

// ============================================================================
// GETTERS
// ============================================================================

/**
 * Get current seed balance
 */
export function getBalance(): number {
  return getSeedBalance();
}

/**
 * Get current streak
 */
export function getCurrentStreak(): number {
  // Check if streak is still active
  const today = getToday();
  if (
    state.lastConversationDate &&
    (isSameDay(state.lastConversationDate, today) || isYesterday(state.lastConversationDate))
  ) {
    return state.currentStreak;
  }
  return 0; // Streak broken
}

/**
 * Get total seeds earned all time
 */
export function getTotalEarned(): number {
  return state.totalEarned;
}

/**
 * Check if daily bonus is available
 */
export function isDailyBonusAvailable(): boolean {
  return !isSameDay(state.lastDailyClaimDate, getToday());
}

/**
 * Claim daily bonus manually (click-to-claim)
 * Returns the result of the claim attempt
 */
export function claimDailyBonus(): { claimed: boolean; amount?: number; reason?: string } {
  const today = getToday();

  if (isSameDay(state.lastDailyClaimDate, today)) {
    return { claimed: false, reason: 'Already claimed today' };
  }

  // Award daily seeds
  const dailyReward = SEED_REWARDS.dailyConversation;
  if (!dailyReward) {
    return { claimed: false, reason: 'Daily reward not configured' };
  }

  awardSeeds(dailyReward);
  state.lastDailyClaimDate = today;

  // Update streak logic
  if (state.lastConversationDate && isYesterday(state.lastConversationDate)) {
    // Continue streak
    state.currentStreak += 1;
    log.debug({ streak: state.currentStreak }, 'Streak continued via daily claim');
    checkStreakMilestones();
  } else if (!isSameDay(state.lastConversationDate, today)) {
    // Streak broken or first claim
    if (state.currentStreak > 0) {
      log.info({ previousStreak: state.currentStreak }, 'Streak reset');
    }
    state.currentStreak = 1;
  }

  state.lastConversationDate = today;
  saveState();

  log.info({ amount: dailyReward.amount }, 'Daily bonus claimed manually');
  return { claimed: true, amount: dailyReward.amount };
}

/**
 * Get next streak milestone
 */
export function getNextStreakMilestone(): number | null {
  const current = getCurrentStreak();
  for (const days of STREAK_MILESTONES) {
    if (days > current) {
      return days;
    }
  }
  return null;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize seeds economy
 */
export function initSeedsEconomy(): void {
  // Load state
  state = loadState();

  // Listen for conversation end events
  document.addEventListener('ferni:conversation-end', () => {
    recordConversation();
  });

  // Listen for goal achieved events
  document.addEventListener('ferni:goal-achieved', ((e: CustomEvent) => {
    const { goalId } = e.detail as { goalId: string };
    recordGoalAchieved(goalId);
  }) as EventListener);

  // Listen for referral events
  document.addEventListener('ferni:referral-completed', ((e: CustomEvent) => {
    const { code } = e.detail as { code: string };
    recordReferral(code);
  }) as EventListener);

  // Listen for contribution events (Seed Fund payments)
  document.addEventListener('ferni:contribution-success', ((e: CustomEvent) => {
    const { amountCents } = e.detail as { amountCents: number };
    recordContribution(amountCents);
  }) as EventListener);

  // Listen for subscription payment events
  document.addEventListener('ferni:subscription-paid', ((e: CustomEvent) => {
    const { tier } = e.detail as { tier: 'founding-member' | 'founding-patron' };
    recordMonthlySubscriptionBonus(tier);
  }) as EventListener);

  log.info(
    {
      balance: getBalance(),
      streak: getCurrentStreak(),
      totalEarned: getTotalEarned(),
    },
    'Seeds economy initialized'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export const seedsEconomy = {
  init: initSeedsEconomy,
  recordConversation,
  claimDailyBonus,
  checkConversationMilestone,
  recordGoalAchieved,
  recordReferral,
  recordContribution,
  recordMonthlySubscriptionBonus,
  getBalance,
  getCurrentStreak,
  getTotalEarned,
  isDailyBonusAvailable,
  getNextStreakMilestone,
};

export default seedsEconomy;
