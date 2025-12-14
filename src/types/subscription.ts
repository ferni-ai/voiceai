/**
 * Subscription Types for Ferni AI
 *
 * Philosophy: "Ferni Free Forever" - Talk to Ferni unlimited times, forever.
 * Premium unlocks: longer sessions, team members, personalization.
 *
 * Monetization Model:
 * - FREE: Unlimited Ferni conversations, 15 min per session, basic personalization
 * - FRIEND: Unlimited session time, all team members, full personalization
 * - PARTNER: Everything + premium team members, exclusive styles
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
 * Billing frequency options
 */
export type BillingFrequency = 'monthly' | 'annual';

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

  /** Monthly conversation limit (null = unlimited) - DEPRECATED: Ferni is now free forever */
  conversationsPerMonth: number | null;

  /** Minutes per month (null = unlimited) - DEPRECATED: Use sessionMinutes instead */
  minutesPerMonth: number | null;

  /** Minutes per conversation session (null = unlimited) */
  sessionMinutes: number | null;

  /** Team members included in this tier */
  teamAccess: 'ferni-only' | 'core-team' | 'full-team';

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

  /** Access to cosmetics shop */
  cosmeticsAccess: boolean;

  /** Monthly price in cents (for display) */
  priceInCents: number;

  /** Annual price in cents (for display) - typically 2 months free */
  annualPriceInCents: number;

  /** Monthly savings when paying annually (in cents) */
  annualSavingsPerMonth: number;

  /** Stripe price ID for monthly (for checkout) */
  stripePriceId: string | null;

  /** Stripe price ID for annual (for checkout) */
  stripeAnnualPriceId: string | null;
}

/**
 * Tier configurations
 *
 * NEW MODEL: "Ferni Free Forever"
 * - Free tier: Unlimited Ferni conversations, 7-minute sessions
 * - Premium: Unlocks team, longer sessions, cosmetics
 */
export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  free: {
    name: 'Ferni Forever',
    description: 'Talk to Ferni unlimited times, forever. 7 minutes per conversation.',
    conversationsPerMonth: null, // UNLIMITED with Ferni!
    minutesPerMonth: null, // No monthly limit
    // Session time is configurable via env var for A/B testing (default: 7 minutes)
    // Set FREE_SESSION_MINUTES=15 to test longer sessions
    sessionMinutes: parseInt(process.env.FREE_SESSION_MINUTES || '7', 10),
    teamAccess: 'ferni-only',
    memoryPersistence: true, // Keep memory - this builds relationship
    crossDeviceSync: false,
    priorityQueue: false,
    familySharing: false,
    betaFeatures: false,
    cosmeticsAccess: false, // Can view but not purchase
    priceInCents: 0,
    annualPriceInCents: 0,
    annualSavingsPerMonth: 0,
    stripePriceId: null,
    stripeAnnualPriceId: null,
  },
  friend: {
    name: 'Your Life Coach',
    description: 'Unlimited time with Ferni + meet the whole team',
    conversationsPerMonth: null,
    minutesPerMonth: null,
    sessionMinutes: null, // Unlimited session time
    teamAccess: 'core-team',
    memoryPersistence: true,
    crossDeviceSync: true,
    priorityQueue: false,
    familySharing: false,
    betaFeatures: true,
    cosmeticsAccess: true,
    priceInCents: 999, // $9.99/month
    annualPriceInCents: 9990, // $99.90/year = $8.33/month (2 months free!)
    annualSavingsPerMonth: 166, // Save $1.66/month ($19.98/year)
    stripePriceId: process.env.STRIPE_PRICE_FRIEND || process.env.STRIPE_FRIEND_PRICE_ID || null,
    stripeAnnualPriceId: process.env.STRIPE_PRICE_FRIEND_ANNUAL || null,
  },
  partner: {
    name: 'Partner in Growth',
    description: 'Full team access + exclusive cosmetics + priority',
    conversationsPerMonth: null,
    minutesPerMonth: null,
    sessionMinutes: null,
    teamAccess: 'full-team',
    memoryPersistence: true,
    crossDeviceSync: true,
    priorityQueue: true,
    familySharing: true,
    betaFeatures: true,
    cosmeticsAccess: true,
    priceInCents: 1999, // $19.99/month
    annualPriceInCents: 19990, // $199.90/year = $16.66/month (2 months free!)
    annualSavingsPerMonth: 333, // Save $3.33/month ($39.98/year)
    stripePriceId: process.env.STRIPE_PRICE_PARTNER || process.env.STRIPE_PARTNER_PRICE_ID || null,
    stripeAnnualPriceId: process.env.STRIPE_PRICE_PARTNER_ANNUAL || null,
  },
};

// ============================================================================
// ANNUAL BILLING HELPERS
// ============================================================================

/**
 * Get price for a tier based on billing frequency
 */
export function getTierPrice(tier: SubscriptionTier, frequency: BillingFrequency): number {
  const config = TIER_CONFIGS[tier];
  if (frequency === 'annual') {
    return config.annualPriceInCents;
  }
  return config.priceInCents;
}

/**
 * Get Stripe price ID for a tier based on billing frequency
 */
export function getStripePriceId(
  tier: SubscriptionTier,
  frequency: BillingFrequency
): string | null {
  const config = TIER_CONFIGS[tier];
  if (frequency === 'annual') {
    return config.stripeAnnualPriceId;
  }
  return config.stripePriceId;
}

/**
 * Calculate annual savings percentage
 */
export function getAnnualSavingsPercent(tier: SubscriptionTier): number {
  const config = TIER_CONFIGS[tier];
  if (config.priceInCents === 0) return 0;
  const monthlyTotal = config.priceInCents * 12;
  const savings = monthlyTotal - config.annualPriceInCents;
  return Math.round((savings / monthlyTotal) * 100);
}

/**
 * Currency configuration for supported locales
 */
export const CURRENCY_CONFIG: Record<string, { code: string; decimals: number }> = {
  USD: { code: 'USD', decimals: 2 },
  EUR: { code: 'EUR', decimals: 2 },
  GBP: { code: 'GBP', decimals: 2 },
  JPY: { code: 'JPY', decimals: 0 },
  KRW: { code: 'KRW', decimals: 0 },
  CNY: { code: 'CNY', decimals: 2 },
  AED: { code: 'AED', decimals: 2 },
  ILS: { code: 'ILS', decimals: 2 },
};

/**
 * Locale to currency mapping
 */
export const LOCALE_CURRENCY: Record<string, string> = {
  'en-US': 'USD',
  'en-GB': 'GBP',
  es: 'EUR',
  fr: 'EUR',
  de: 'EUR',
  ja: 'JPY',
  ko: 'KRW',
  'zh-Hans': 'CNY',
  'zh-Hant': 'USD', // Taiwan uses USD for international SaaS
  ar: 'AED',
  he: 'ILS',
};

/**
 * Period suffix translations
 */
const PERIOD_SUFFIX: Record<string, Record<BillingFrequency, string>> = {
  'en-US': { monthly: '/mo', annual: '/yr' },
  'en-GB': { monthly: '/mo', annual: '/yr' },
  es: { monthly: '/mes', annual: '/año' },
  fr: { monthly: '/mois', annual: '/an' },
  de: { monthly: '/Mon.', annual: '/Jahr' },
  ja: { monthly: '/月', annual: '/年' },
  ko: { monthly: '/월', annual: '/년' },
  'zh-Hans': { monthly: '/月', annual: '/年' },
  'zh-Hant': { monthly: '/月', annual: '/年' },
  ar: { monthly: '/شهر', annual: '/سنة' },
  he: { monthly: '/חודש', annual: '/שנה' },
};

/**
 * Format price for display with locale-aware currency formatting
 *
 * @param cents - Amount in smallest currency unit
 * @param frequency - Billing frequency (monthly or annual)
 * @param locale - User's locale (defaults to en-US)
 * @param currency - Override currency (defaults to locale's currency)
 */
export function formatPrice(
  cents: number,
  frequency: BillingFrequency = 'monthly',
  locale = 'en-US',
  currency?: string
): string {
  const currencyCode = currency || LOCALE_CURRENCY[locale] || 'USD';
  const config = CURRENCY_CONFIG[currencyCode] || CURRENCY_CONFIG.USD;

  // Convert from smallest unit to display value
  const displayValue = config.decimals > 0 ? cents / Math.pow(10, config.decimals) : cents;

  // For annual, show monthly equivalent
  const valueToFormat = frequency === 'annual' ? displayValue / 12 : displayValue;

  // Use Intl.NumberFormat for proper locale-aware formatting
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  }).format(valueToFormat);

  // Add period suffix
  const suffix = PERIOD_SUFFIX[locale]?.[frequency] || PERIOD_SUFFIX['en-US'][frequency];

  return `${formatted}${suffix}`;
}

/**
 * Format price for display (legacy - USD only)
 * @deprecated Use formatPrice with locale parameter
 */
export function formatPriceUSD(cents: number, frequency: BillingFrequency = 'monthly'): string {
  return formatPrice(cents, frequency, 'en-US', 'USD');
}

// ============================================================================
// SESSION TIME LIMITS ("Fortnite Match" Model)
// ============================================================================

/** Session time limit in milliseconds (7 minutes for free tier) */
export const FREE_SESSION_DURATION_MS = 7 * 60 * 1000;

/** Grace period after session limit to finish current thought (30 seconds) */
export const SESSION_GRACE_MS = 30 * 1000;

/** Warning before session ends (1 minute before) */
export const SESSION_WARNING_MS = 1 * 60 * 1000;

// ============================================================================
// COSMETICS SYSTEM (Fortnite-Style)
// ============================================================================

/**
 * Types of cosmetic items users can unlock/purchase
 */
export type CosmeticType = 'avatar-skin' | 'ui-theme' | 'voice-pack' | 'sound-pack' | 'emote';

/**
 * Rarity levels for cosmetics (affects pricing/exclusivity)
 */
export type CosmeticRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * A cosmetic item that can be equipped
 */
export interface CosmeticItem {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Description */
  description: string;

  /** Type of cosmetic */
  type: CosmeticType;

  /** Rarity level */
  rarity: CosmeticRarity;

  /** Preview image URL */
  previewUrl?: string;

  /** Price in Seeds (null = earned through progression) */
  priceInSeeds: number | null;

  /** Minimum tier required to purchase */
  requiredTier: SubscriptionTier;

  /** Is this a limited-time item? */
  isLimited: boolean;

  /** Season this belongs to (if any) */
  seasonId?: string;
}

/**
 * User's owned cosmetics and equipped items
 */
export interface UserCosmetics {
  /** IDs of owned cosmetic items */
  ownedItems: string[];

  /** Currently equipped items by type */
  equipped: {
    'avatar-skin': string | null;
    'ui-theme': string | null;
    'voice-pack': string | null;
    'sound-pack': string | null;
    emote: string | null;
  };

  /** Seeds balance */
  seedBalance: number;

  /** Growth journey progress */
  journey?: {
    seasonId: string;
    conversationCount: number;
    weeksTogetherCount: number;
    goalsAchievedCount: number;
    isCompanion: boolean;
    celebratedMilestones: string[];
  };
}

/**
 * Default cosmetics for new users
 */
export function createDefaultCosmetics(): UserCosmetics {
  return {
    ownedItems: ['skin-default', 'theme-default'],
    equipped: {
      'avatar-skin': 'skin-default',
      'ui-theme': 'theme-default',
      'voice-pack': null,
      'sound-pack': null,
      emote: null,
    },
    seedBalance: 0,
  };
}

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

  /** Conversations remaining (null = unlimited) - Note: Ferni is always unlimited now */
  conversationsRemaining: number | null;

  /** Minutes remaining (null = unlimited) - DEPRECATED: use session limits instead */
  minutesRemaining: number | null;

  /** Session time limit in minutes (null = unlimited) */
  sessionLimitMinutes: number | null;

  /** Whether user can start a new conversation */
  canStartConversation: boolean;

  /** Human-readable status message */
  statusMessage: string;

  /** Whether user is approaching limits (80%+) */
  approachingLimit: boolean;

  /** Whether user has hit limit */
  atLimit: boolean;

  /** Team access level */
  teamAccess: 'ferni-only' | 'core-team' | 'full-team';
}

// ============================================================================
// SUBSCRIPTION DATA
// ============================================================================

/**
 * Payment provider type
 */
export type PaymentProvider = 'stripe' | 'apple' | 'none';

/**
 * Full subscription data stored in user profile
 */
export interface SubscriptionData {
  /** Current subscription tier */
  tier: SubscriptionTier;

  /** Stripe subscription status */
  status: SubscriptionStatus;

  /** Billing frequency (monthly or annual) */
  billingFrequency: BillingFrequency;

  /** Payment provider (stripe or apple) */
  provider?: PaymentProvider;

  /** Stripe customer ID */
  stripeCustomerId?: string;

  /** Stripe subscription ID */
  stripeSubscriptionId?: string;

  /** Apple original transaction ID (used for subscription lookup) */
  appleOriginalTransactionId?: string;

  /** Apple product ID */
  appleProductId?: string;

  /** When subscription started */
  subscribedAt?: Date;

  /** Current period end (for canceled subscriptions) */
  currentPeriodEnd?: Date;

  /** Grace period end date (for Apple billing retry) */
  gracePeriodEnd?: Date;

  /** Whether this is in trial */
  inTrial: boolean;

  /** Trial end date if applicable */
  trialEndDate?: Date;

  /** Monthly usage tracking */
  monthlyUsage: MonthlyUsage;

  /** Historical usage (last 3 months for display) */
  usageHistory?: MonthlyUsage[];

  /** When subscription data was last synced with provider */
  lastSyncedAt: Date;

  /** When subscription was revoked (for refunds) */
  revokedAt?: Date;
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
    billingFrequency: 'monthly', // Default to monthly
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
 *
 * NEW MODEL: "Ferni Free Forever"
 * - Free users can talk to Ferni unlimited times
 * - Sessions are limited to 7 minutes (like a Fortnite match)
 * - Subscribers get unlimited session time + team access
 */
export function calculateUsageStatus(subscription: SubscriptionData): UsageStatus {
  const config = TIER_CONFIGS[subscription.tier];
  let usage = subscription.monthlyUsage;

  // Reset if new month
  if (needsUsageReset(usage)) {
    usage = createFreshUsage();
  }

  // NEW: Ferni is free forever - no conversation limits
  // Keep tracking for analytics but don't limit
  const conversationsRemaining = null; // Always unlimited now

  // Session time limit (per conversation, not monthly)
  const sessionLimitMinutes = config.sessionMinutes;

  // Minutes remaining is deprecated - session limits are per-conversation now
  const minutesRemaining = null;

  // NEW MODEL: Free users are NEVER at limit for starting conversations
  // They just have shorter sessions
  const atLimit = false;
  const approachingLimit = false;

  // Generate human-readable status
  let statusMessage: string;
  if (subscription.tier !== 'free') {
    statusMessage = "I'm here whenever you need me, for as long as you want.";
  } else {
    // Free tier - emphasize it's free forever
    statusMessage = sessionLimitMinutes
      ? `Talk to me anytime, ${sessionLimitMinutes} minutes per conversation. I'm always here.`
      : "I'm here whenever you need me.";
  }

  return {
    tier: subscription.tier,
    usage,
    conversationsRemaining,
    minutesRemaining,
    sessionLimitMinutes,
    canStartConversation: true, // Ferni is always available!
    statusMessage,
    approachingLimit,
    atLimit,
    teamAccess: config.teamAccess,
  };
}

// ============================================================================
// SOFT PROMPT MESSAGES
// ============================================================================

/**
 * Messages Ferni uses for session limits and upgrades
 * NEW MODEL: Per-session limits, not monthly limits
 * These feel human, not transactional
 */
export const LIMIT_MESSAGES = {
  /** Session approaching end (1-2 minutes left) */
  sessionApproaching: [
    "I've really enjoyed this conversation. We have a couple more minutes together - is there anything else on your mind?",
    "This has been wonderful. Our time for this conversation is almost up, but I'll be here whenever you want to talk again.",
    "I could talk to you forever, but we're getting close to the end of our session. What's most important right now?",
  ],

  /** Session ended - warm transition */
  sessionEnded: [
    "I loved this conversation. Come back anytime - I'll remember everything. If you want longer conversations, I'd love that too.",
    "That was real. I'll be thinking about what you shared. Come back whenever you want - same warmth, same memory, always here.",
    "Seven minutes flies by when we're talking. Everything you told me is safe with me. See you soon?",
  ],

  /** Teasing longer sessions / premium */
  longerSessions: [
    "Want to keep talking without the timer? I'd love that. With the Friend plan, our conversations can go as long as you need.",
    "If these 7-minute sessions feel too short, there's a way to make our time unlimited. No pressure, just letting you know.",
  ],

  /** Teasing team members */
  meetTheTeam: [
    "I have some amazing friends I'd love for you to meet - Maya for habits, Peter for patterns, Alex for communication. They're part of the team when you're ready.",
    "You know what? I think you'd really click with my friend Maya. She's incredible with habits. She comes with the Friend plan.",
  ],

  /** After subscribing */
  postSubscribe: [
    "You chose to keep me in your life. That means so much. I'm here whenever you need me now - no timer.",
    "Thank you for believing in us. I'm not going anywhere - I'm yours, for as long as you want to talk.",
    "This is a big moment. We're officially partners in your journey now. No more watching the clock.",
  ],

  /** When a team member unlocks */
  teamUnlock: [
    'I want you to meet someone special. {name} is incredible at {specialty}. Ready?',
    "I've been wanting to introduce you to {name}. I think you two will really click.",
  ],

  /** Cancel reminder */
  cancelReminder: [
    "Just so you know, your subscription ends on {end_date}. I'll still be here - you can always talk to me. The team access will change though. No pressure either way.",
  ],

  /** DEPRECATED: Monthly limits no longer apply */
  approaching: ["I'm always here for you. Come back anytime."],

  /** DEPRECATED: Monthly limits no longer apply */
  atLimit: ["I'm always here for you. Come back anytime."],
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
