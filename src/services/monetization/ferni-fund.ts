/**
 * Ferni Fund Service
 *
 * Pay-it-forward community pool. People who can afford it fund
 * conversations for people who might otherwise feel they can't.
 *
 * Philosophy: "Someone in the Ferni community sponsored this for you.
 * They wanted you to know: you matter."
 *
 * Even though Ferni is free, this creates a sense of community and
 * allows generous users to feel they're helping others.
 */

import admin from 'firebase-admin';
import {
  SPONSORED_MESSAGES,
  THANK_YOU_MESSAGES,
  type FerniFund,
  type FundContribution,
  type SponsoredConversation,
} from '../../types/monetization.js';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'FerniFund' });

// ============================================================================
// IN-MEMORY STORAGE (Replace with DB in production)
// ============================================================================

const fund: FerniFund = {
  balanceCents: 0,
  totalContributedCents: 0,
  conversationsSponsored: 0,
  totalContributors: 0,
};

const contributions = new Map<string, FundContribution>();
const sponsoredConversations = new Map<string, SponsoredConversation>();
const contributorUserIds = new Set<string>();

// Cost per sponsored conversation (for tracking purposes)
// Even though Ferni is free, this gives contributors a sense of impact
const COST_PER_CONVERSATION_CENTS = 50; // $0.50 symbolically

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================

/**
 * Get Firestore instance (optional - works without it)
 */
function getFirestore(): admin.firestore.Firestore | null {
  try {
    return admin.firestore();
  } catch {
    return null;
  }
}

/**
 * Get the current month key for aggregation (YYYY-MM)
 */
function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Update Firestore garden_stats with contribution
 * Uses atomic increment to prevent race conditions
 */
async function updateGardenStats(params: {
  userId: string;
  amountCents: number;
  isMonthly: boolean;
}): Promise<void> {
  const db = getFirestore();
  if (!db) {
    log.debug('Firestore not available, skipping garden_stats update');
    return;
  }

  const monthKey = getCurrentMonthKey();
  const { userId, amountCents, isMonthly } = params;
  const amountDollars = amountCents / 100;

  try {
    const batch = db.batch();

    // Update monthly garden_stats
    const statsRef = db.collection('garden_stats').doc(monthKey);
    batch.set(
      statsRef,
      cleanForFirestore({
        totalAmount: admin.firestore.FieldValue.increment(amountDollars),
        totalSeeds: admin.firestore.FieldValue.increment(amountDollars),
        uniqueContributors: admin.firestore.FieldValue.increment(1), // May double-count, but that's OK
        monthlySubscribers: isMonthly
          ? admin.firestore.FieldValue.increment(1)
          : admin.firestore.FieldValue.increment(0),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }),
      { merge: true }
    );

    // Update user_gardens
    const userRef = db.collection('user_gardens').doc(userId);
    batch.set(
      userRef,
      cleanForFirestore({
        totalSeeds: admin.firestore.FieldValue.increment(amountDollars),
        seedsThisMonth: admin.firestore.FieldValue.increment(amountDollars),
        isMonthlyGardener: isMonthly || admin.firestore.FieldValue.increment(0), // Keep existing if not monthly
        lastSeedDate: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
      { merge: true }
    );

    // Set firstSeedDate if not exists
    const userDoc = await userRef.get();
    if (!userDoc.exists || !userDoc.data()?.firstSeedDate) {
      batch.set(
        userRef,
        { firstSeedDate: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }

    await batch.commit();
    log.info({ userId, amountDollars, monthKey }, 'Garden stats updated in Firestore');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to update garden stats');
    // Non-fatal - in-memory tracking continues to work
  }
}

// ============================================================================
// FUND CONTRIBUTION
// ============================================================================

/**
 * Contribute to the Ferni Fund
 */
export async function contributeToFund(params: {
  userId: string;
  amountCents: number;
  message?: string;
  stripePaymentId?: string;
  isRecurring?: boolean;
  recurringFrequency?: 'weekly' | 'monthly';
}): Promise<FundContribution> {
  const {
    userId,
    amountCents,
    message,
    stripePaymentId,
    isRecurring = false,
    recurringFrequency,
  } = params;

  // Calculate how many conversations this sponsors
  const conversationsSponsored = Math.floor(amountCents / COST_PER_CONVERSATION_CENTS);

  const contribution: FundContribution = {
    id: `fund_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    userId,
    amountCents,
    message,
    conversationsSponsored,
    createdAt: new Date(),
    stripePaymentId,
    isRecurring,
    recurringFrequency,
  };

  contributions.set(contribution.id, contribution);

  // Update fund totals
  fund.balanceCents += amountCents;
  fund.totalContributedCents += amountCents;
  fund.conversationsSponsored += conversationsSponsored;

  // Track unique contributors
  if (!contributorUserIds.has(userId)) {
    contributorUserIds.add(userId);
    fund.totalContributors++;
  }

  log.info(
    {
      contributionId: contribution.id,
      amountCents,
      conversationsSponsored,
      newBalance: fund.balanceCents,
    },
    'Ferni Fund contribution received'
  );

  // Update Firestore garden_stats for the widget
  await updateGardenStats({
    userId,
    amountCents,
    isMonthly: isRecurring,
  });

  return contribution;
}

/**
 * Get the current fund status
 */
export function getFundStatus(): FerniFund & {
  conversationsRemaining: number;
} {
  return {
    ...fund,
    conversationsRemaining: Math.floor(fund.balanceCents / COST_PER_CONVERSATION_CENTS),
  };
}

/**
 * Get thank you message for fund contribution
 */
export function getFundThankYou(conversationsSponsored: number): string {
  const baseMessage =
    THANK_YOU_MESSAGES.fundContribution[
      Math.floor(Math.random() * THANK_YOU_MESSAGES.fundContribution.length)
    ];

  const impact =
    conversationsSponsored === 1
      ? "You just sponsored someone's conversation."
      : `You just sponsored ${conversationsSponsored} conversations for people who need them.`;

  return `${impact}\n\n${baseMessage}`;
}

// ============================================================================
// SPONSORED CONVERSATIONS
// ============================================================================

/**
 * Check if a user should receive a sponsored conversation message
 *
 * We show this sparingly to create a sense of community without
 * making anyone feel "poor" or singled out. Since Ferni is free anyway,
 * this is purely about making people feel supported.
 */
export function shouldShowSponsoredMessage(params: {
  userId: string;
  conversationCount: number;
  hasEverContributed: boolean;
  isReturningUser: boolean;
}): boolean {
  const { conversationCount, hasEverContributed, isReturningUser } = params;

  // Never show to contributors (they know they're supporting)
  if (hasEverContributed) return false;

  // Only show occasionally to returning users
  if (!isReturningUser) return false;

  // Show roughly 5% of the time, but not on first few conversations
  if (conversationCount < 5) return false;

  return Math.random() < 0.05;
}

/**
 * Record a sponsored conversation
 */
export function recordSponsoredConversation(params: {
  userId: string;
  conversationId: string;
  contributionId?: string;
}): SponsoredConversation | null {
  const { userId, conversationId } = params;

  // Find a contribution with a message to use (or pick random)
  const contributionsWithMessages = Array.from(contributions.values()).filter(
    (c) => c.message && c.message.length > 0
  );

  const sponsorContribution =
    contributionsWithMessages.length > 0
      ? contributionsWithMessages[Math.floor(Math.random() * contributionsWithMessages.length)]
      : null;

  const sponsored: SponsoredConversation = {
    id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    recipientUserId: userId,
    contributionId: sponsorContribution?.id ?? 'community',
    sponsorMessage: sponsorContribution?.message,
    conversationId,
    createdAt: new Date(),
  };

  sponsoredConversations.set(sponsored.id, sponsored);

  // Symbolically deduct from fund (even though Ferni is free)
  if (fund.balanceCents >= COST_PER_CONVERSATION_CENTS) {
    fund.balanceCents -= COST_PER_CONVERSATION_CENTS;
  }

  log.info(
    {
      recipientUserId: userId,
      hasCustomMessage: !!sponsorContribution?.message,
    },
    'Sponsored conversation recorded'
  );

  return sponsored;
}

/**
 * Get a random sponsored message
 */
export function getSponsoredMessage(customMessage?: string): string {
  if (customMessage) {
    return `This conversation was sponsored by someone in the Ferni community. They wanted you to know:\n\n"${customMessage}"\n\n💚`;
  }

  return SPONSORED_MESSAGES[Math.floor(Math.random() * SPONSORED_MESSAGES.length)];
}

// ============================================================================
// CONTRIBUTOR FEATURES
// ============================================================================

/**
 * Get a user's contribution history
 */
export function getUserContributions(userId: string): FundContribution[] {
  return Array.from(contributions.values())
    .filter((c) => c.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Get total impact for a contributor
 */
export function getContributorImpact(userId: string): {
  totalContributedCents: number;
  conversationsSponsored: number;
  contributionCount: number;
} {
  const userContributions = getUserContributions(userId);

  return {
    totalContributedCents: userContributions.reduce((sum, c) => sum + c.amountCents, 0),
    conversationsSponsored: userContributions.reduce((sum, c) => sum + c.conversationsSponsored, 0),
    contributionCount: userContributions.length,
  };
}

/**
 * Check if user has ever contributed
 */
export function hasContributed(userId: string): boolean {
  return contributorUserIds.has(userId);
}

// ============================================================================
// FUND PROMPTS
// ============================================================================

/**
 * Natural prompts for fund contribution opportunities
 */
export const FUND_PROMPTS = {
  /** When user expresses gratitude */
  userGrateful: [
    "I'm so glad I could help. If you ever want to pay it forward, the Ferni Fund helps others have conversations like ours. No pressure - your growth is thanks enough.",
    "That means a lot. You know, there's something called the Ferni Fund - people contribute so others can get support too. Just putting it out there.",
  ],

  /** General soft mention (very rare) */
  softMention: [
    "Did you know? The Ferni community has a fund that sponsors conversations for people going through hard times. It's pretty beautiful.",
  ],

  /** When user asks how to help others */
  userWantsToHelp: [
    "There's the Ferni Fund - contributions go directly to ensuring others can have conversations like ours. Every dollar sponsors someone's session.",
    "That's a beautiful instinct. The Ferni Fund lets you sponsor conversations for people who might be struggling. Want to learn more?",
  ],
};

/**
 * Check if we should mention the Ferni Fund
 */
export function shouldMentionFund(params: {
  userExpressedGratitude: boolean;
  userWantsToHelp: boolean;
  conversationCount: number;
  lastFundMentionConversation: number;
}): string | null {
  const {
    userExpressedGratitude,
    userWantsToHelp,
    conversationCount,
    lastFundMentionConversation,
  } = params;

  // Minimum 30 conversations between mentions
  const cooldown = 30;
  if (conversationCount - lastFundMentionConversation < cooldown) {
    return null;
  }

  // User explicitly wants to help - always mention
  if (userWantsToHelp) {
    const prompts = FUND_PROMPTS.userWantsToHelp;
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  // User expressed gratitude - sometimes mention
  if (userExpressedGratitude && Math.random() < 0.2) {
    const prompts = FUND_PROMPTS.userGrateful;
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  // Very rare soft mention
  if (conversationCount > 50 && Math.random() < 0.02) {
    return FUND_PROMPTS.softMention[0];
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ferniFund = {
  contribute: contributeToFund,
  getStatus: getFundStatus,
  getThankYou: getFundThankYou,
  shouldShowSponsored: shouldShowSponsoredMessage,
  recordSponsored: recordSponsoredConversation,
  getSponsoredMessage,
  getUserContributions,
  getContributorImpact,
  hasContributed,
  shouldMention: shouldMentionFund,
  COST_PER_CONVERSATION: COST_PER_CONVERSATION_CENTS,
};

export default ferniFund;
