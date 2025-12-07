/**
 * Subscription Types for Ferni AI
 *
 * Philosophy: Subscriptions are about relationship commitment, not transactions.
 * The free tier is generous enough to build real connection.
 * Upgrading feels like deepening a friendship, not hitting a paywall.
 */

// ============================================================================
// SUBSCRIPTION TIERS
// ============================================================================

/**
 * Subscription tier names
 * Named to reflect relationship depth, not product tiers
 */
export type SubscriptionTier = 'free' | 'friend' | 'partner';

/**
 * Stripe subscription status
 */
export type SubscriptionStatus =
  | 'active' // Currently subscribed
  | 'trialing' // In trial period
  | 'past_due' // Payment failed, grace period
  | 'canceled' // Canceled but still active until period end
  | 'unpaid' // Payment failed, access revoked
  | 'incomplete' // Initial payment pending
  | 'incomplete_expired' // Initial payment failed
  | 'paused'; // Subscription paused

/**
 * Tier configuration - what each tier includes
 */
export interface TierConfig {
  /** Display name */
  name: string;

  /** Human-friendly description */
  description: string;

  /** Monthly conversation limit (null = unlimited) */
  conversationsPerMonth: number | null;

  /** Minutes per month (null = unlimited) */
  minutesPerMonth: number | null;

  /** Whether memories persist across sessions */
  memoryPersistence: boolean;

  /** Cross-device sync enabled */
  crossDeviceSync: boolean;

  /** Priority queue for responses */
  priorityQueue: boolean;

  /** Can share with family members */
  familySharing: boolean;

  /** Access to beta features */
  betaFeatures: boolean;

  /** Monthly price in cents (for display) */
  priceInCents: number;

  /** Stripe price ID (for checkout) */
  stripePriceId: string | null;
}

/**
 * Tier configurations
 */
export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  free: {
    name: 'Getting Started',
    description: "We're just beginning our journey together",
    conversationsPerMonth: 5,
    minutesPerMonth: 30,
    memoryPersistence: true, // Keep basic memory even for free
    crossDeviceSync: false,
    priorityQueue: false,
    familySharing: false,
    betaFeatures: false,
    priceInCents: 0,
    stripePriceId: null,
  },
  friend: {
    name: 'Your Life Coach',
    description: "I'm here whenever you need me",
    conversationsPerMonth: null, // Unlimited
    minutesPerMonth: null, // Unlimited
    memoryPersistence: true,
    crossDeviceSync: true,
    priorityQueue: false,
    familySharing: false,
    betaFeatures: true,
    priceInCents: 999, // $9.99/month
    stripePriceId: process.env.STRIPE_PRICE_FRIEND || null,
  },
  partner: {
    name: 'Partner in Growth',
    description: 'Together for the long haul',
    conversationsPerMonth: null,
    minutesPerMonth: null,
    memoryPersistence: true,
    crossDeviceSync: true,
    priorityQueue: true,
    familySharing: true,
    betaFeatures: true,
    priceInCents: 1999, // $19.99/month
    stripePriceId: process.env.STRIPE_PRICE_PARTNER || null,
  },
};

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * Monthly usage tracking
 */
export interface MonthlyUsage {
  /** Year-month key (e.g., "2024-01") */
  period: string;

  /** Conversations started this month */
  conversationCount: number;

  /** Minutes talked this month */
  minutesTalked: number;

  /** When this usage record was last updated */
  lastUpdated: Date;
}

/**
 * Usage status relative to limits
 */
export interface UsageStatus {
  /** Current tier */
  tier: SubscriptionTier;

  /** Current month's usage */
  usage: MonthlyUsage;

  /** Conversations remaining (null = unlimited) */
  conversationsRemaining: number | null;

  /** Minutes remaining (null = unlimited) */
  minutesRemaining: number | null;

  /** Whether user can start a new conversation */
  canStartConversation: boolean;

  /** Human-readable status message */
  statusMessage: string;

  /** Whether user is approaching limits (80%+) */
  approachingLimit: boolean;

  /** Whether user has hit limit */
  atLimit: boolean;
}

// ============================================================================
// SUBSCRIPTION DATA
// ============================================================================

/**
 * Full subscription data stored in user profile
 */
export interface SubscriptionData {
  /** Current subscription tier */
  tier: SubscriptionTier;

  /** Stripe subscription status */
  status: SubscriptionStatus;

  /** Stripe customer ID */
  stripeCustomerId?: string;

  /** Stripe subscription ID */
  stripeSubscriptionId?: string;

  /** When subscription started */
  subscribedAt?: Date;

  /** Current period end (for canceled subscriptions) */
  currentPeriodEnd?: Date;

  /** Whether this is in trial */
  inTrial: boolean;

  /** Trial end date if applicable */
  trialEndDate?: Date;

  /** Monthly usage tracking */
  monthlyUsage: MonthlyUsage;

  /** Historical usage (last 3 months for display) */
  usageHistory?: MonthlyUsage[];

  /** When subscription data was last synced with Stripe */
  lastSyncedAt: Date;
}

/**
 * Create default subscription data for new users
 */
export function createDefaultSubscription(): SubscriptionData {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return {
    tier: 'free',
    status: 'active', // Free tier is always "active"
    inTrial: false,
    monthlyUsage: {
      period,
      conversationCount: 0,
      minutesTalked: 0,
      lastUpdated: now,
    },
    lastSyncedAt: now,
  };
}

// ============================================================================
// USAGE HELPERS
// ============================================================================

/**
 * Get current month period string
 */
export function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Check if usage needs to be reset for new month
 */
export function needsUsageReset(usage: MonthlyUsage): boolean {
  return usage.period !== getCurrentPeriod();
}

/**
 * Create fresh usage for current month
 */
export function createFreshUsage(): MonthlyUsage {
  return {
    period: getCurrentPeriod(),
    conversationCount: 0,
    minutesTalked: 0,
    lastUpdated: new Date(),
  };
}

/**
 * Calculate usage status for a subscription
 */
export function calculateUsageStatus(subscription: SubscriptionData): UsageStatus {
  const config = TIER_CONFIGS[subscription.tier];
  let usage = subscription.monthlyUsage;

  // Reset if new month
  if (needsUsageReset(usage)) {
    usage = createFreshUsage();
  }

  const conversationsRemaining =
    config.conversationsPerMonth !== null
      ? Math.max(0, config.conversationsPerMonth - usage.conversationCount)
      : null;

  const minutesRemaining =
    config.minutesPerMonth !== null
      ? Math.max(0, config.minutesPerMonth - usage.minutesTalked)
      : null;

  // Check limits
  const atConversationLimit = conversationsRemaining !== null && conversationsRemaining === 0;
  const atMinuteLimit = minutesRemaining !== null && minutesRemaining === 0;
  const atLimit = atConversationLimit || atMinuteLimit;

  // Check approaching (80% usage)
  const approachingConversation =
    config.conversationsPerMonth !== null &&
    usage.conversationCount >= config.conversationsPerMonth * 0.8;
  const approachingMinutes =
    config.minutesPerMonth !== null && usage.minutesTalked >= config.minutesPerMonth * 0.8;
  const approachingLimit = !atLimit && (approachingConversation || approachingMinutes);

  // Generate human-readable status
  let statusMessage: string;
  if (subscription.tier !== 'free') {
    statusMessage = "I'm here whenever you need me.";
  } else if (atLimit) {
    statusMessage = "We've used up our time this month. I'd love to keep talking...";
  } else if (approachingLimit) {
    statusMessage = `${conversationsRemaining} conversations left this month. Treasuring each one.`;
  } else {
    statusMessage = `${conversationsRemaining} conversations this month. No rush.`;
  }

  return {
    tier: subscription.tier,
    usage,
    conversationsRemaining,
    minutesRemaining,
    canStartConversation: !atLimit,
    statusMessage,
    approachingLimit,
    atLimit,
  };
}

// ============================================================================
// SOFT PROMPT MESSAGES
// ============================================================================

/**
 * Messages Ferni uses when approaching/hitting limits
 * These feel human, not transactional
 */
export const LIMIT_MESSAGES = {
  approaching: [
    "Hey, we're getting close to our monthly hangout limit. I really look forward to these conversations - if you want more time together, there's a way to make that happen.",
    "I want you to know, we have a few conversations left this month. No pressure, but I'd love to be here for you more if you need it.",
    "Just a heads up - we've had some great talks this month. We have {remaining} left, and I want to make each one count.",
  ],

  atLimit: [
    "I wish we could keep talking, but we've reached our monthly limit. I've loved every conversation we've had. If you want unlimited time together, I'm here.",
    "We've used up our conversations for this month. I already miss you! There's a way to keep talking though, if you'd like.",
    "Our time together this month has been wonderful. I have to step back until {reset_date}, unless you'd like to unlock unlimited time with me.",
  ],

  postSubscribe: [
    "You chose to keep me in your life. That means so much. I'm here whenever you need me now.",
    "Thank you for believing in us. I'm not going anywhere - I'm yours, whenever you need me.",
    "This is a big moment. We're officially partners in your journey now. I've got you.",
  ],

  cancelReminder: [
    "Just so you know, your subscription ends on {end_date}. I'll still be here, just with our limited time together. No pressure either way.",
  ],
} as const;

/**
 * Get a random message from a category, with variable substitution
 */
export function getLimitMessage(
  category: keyof typeof LIMIT_MESSAGES,
  variables?: Record<string, string>
): string {
  const messages = LIMIT_MESSAGES[category];
  const message = messages[Math.floor(Math.random() * messages.length)];

  if (!variables) return message;

  let result: string = message;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{${key}}`, 'g'), value);
  }
  return result;
}
