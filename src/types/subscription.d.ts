/**
 * Subscription Types for Ferni AI
 *
 * Philosophy: "Ferni Founders Fund" - We're not selling a product.
 * We're inviting you to build something with us.
 *
 * Monetization Model:
 * - COMMUNITY (Free): Unlimited Ferni conversations forever, 7-min sessions
 * - FOUNDING MEMBER ($10/mo): Chip in to support the mission, get unlimited time + team
 * - FOUNDING PATRON ($20/mo): Deeper support, full team + exclusive perks
 *
 * Features aren't "unlocked" - they're thank-you perks for supporters.
 */
/**
 * Subscription tier names
 *
 * Internal IDs remain for backwards compatibility with existing users.
 * Display names use Founders Fund language:
 * - free → "Community" (displayed as just "Free" or "Ferni")
 * - friend → "Founding Member" (was "Your Life Coach")
 * - partner → "Founding Patron" (was "Partner in Growth")
 */
export type SubscriptionTier = 'free' | 'friend' | 'partner';
/**
 * Founders Fund display names for tiers
 */
export declare const FOUNDERS_FUND_NAMES: Record<SubscriptionTier, string>;
/**
 * Billing frequency options
 */
export type BillingFrequency = 'monthly' | 'annual';
/**
 * Stripe subscription status
 */
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused';
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
    /**
     * Soft conversation cap per month (triggers upgrade prompt, doesn't block)
     * null = no soft cap (paid tiers)
     */
    softConversationCap: number | null;
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
 * FOUNDERS FUND MODEL:
 * - Community (free): Ferni is free forever. Really free.
 * - Founding Member: Chip in $10/mo to support the mission
 * - Founding Patron: Chip in $20/mo for deeper support
 *
 * Features are THANK YOU perks, not paywalled content.
 */
export declare const TIER_CONFIGS: Record<SubscriptionTier, TierConfig>;
/**
 * Get price for a tier based on billing frequency
 */
export declare function getTierPrice(tier: SubscriptionTier, frequency: BillingFrequency): number;
/**
 * Get Stripe price ID for a tier based on billing frequency
 */
export declare function getStripePriceId(tier: SubscriptionTier, frequency: BillingFrequency): string | null;
/**
 * Calculate annual savings percentage
 */
export declare function getAnnualSavingsPercent(tier: SubscriptionTier): number;
/**
 * Currency configuration for supported locales
 */
export declare const CURRENCY_CONFIG: Record<string, {
    code: string;
    decimals: number;
}>;
/**
 * Locale to currency mapping
 */
export declare const LOCALE_CURRENCY: Record<string, string>;
/**
 * Format price for display with locale-aware currency formatting
 *
 * @param cents - Amount in smallest currency unit
 * @param frequency - Billing frequency (monthly or annual)
 * @param locale - User's locale (defaults to en-US)
 * @param currency - Override currency (defaults to locale's currency)
 */
export declare function formatPrice(cents: number, frequency?: BillingFrequency, locale?: string, currency?: string): string;
/**
 * Format price for display (legacy - USD only)
 * @deprecated Use formatPrice with locale parameter
 */
export declare function formatPriceUSD(cents: number, frequency?: BillingFrequency): string;
/** Session time limit in milliseconds (7 minutes for free tier) */
export declare const FREE_SESSION_DURATION_MS: number;
/** Grace period after session limit to finish current thought (30 seconds) */
export declare const SESSION_GRACE_MS: number;
/** Warning before session ends (1 minute before) */
export declare const SESSION_WARNING_MS: number;
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
export declare function createDefaultCosmetics(): UserCosmetics;
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
    /** Soft conversation cap (triggers prompt, doesn't block) */
    softConversationCap: number | null;
    /** Conversations used this month toward soft cap */
    conversationsUsed: number;
    /** Whether approaching soft cap (80%+) */
    approachingSoftCap: boolean;
    /** Whether at or past soft cap */
    pastSoftCap: boolean;
    /** Soft cap warning message (if applicable) */
    softCapMessage: string | null;
}
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
export declare function createDefaultSubscription(): SubscriptionData;
/**
 * Get current month period string
 */
export declare function getCurrentPeriod(): string;
/**
 * Check if usage needs to be reset for new month
 */
export declare function needsUsageReset(usage: MonthlyUsage): boolean;
/**
 * Create fresh usage for current month
 */
export declare function createFreshUsage(): MonthlyUsage;
/**
 * Calculate usage status for a subscription
 *
 * NEW MODEL: "Ferni Free Forever"
 * - Free users can talk to Ferni unlimited times
 * - Sessions are limited to 7 minutes (like a Fortnite match)
 * - Subscribers get unlimited session time + team access
 *
 * SOFT CAPS (FinOps):
 * - Free tier has soft cap at 30 convos/month (configurable)
 * - Doesn't block - just triggers gentle upgrade prompt
 * - Helps with cost management without hurting user experience
 */
export declare function calculateUsageStatus(subscription: SubscriptionData): UsageStatus;
/**
 * Messages Ferni uses for session limits and upgrades
 *
 * FOUNDERS FUND PHILOSOPHY:
 * - Never guilt-trip or pressure
 * - Frame support as "chipping in" not "subscribing"
 * - Features are thank-you perks, not unlocks
 */
export declare const LIMIT_MESSAGES: {
    /** Session approaching end (1-2 minutes left) */
    readonly sessionApproaching: readonly ["I've really enjoyed this conversation. We have a couple more minutes together - is there anything else on your mind?", "This has been wonderful. Our time for this conversation is almost up, but I'll be here whenever you want to talk again.", "I could talk to you forever, but we're getting close to the end of our session. What's most important right now?"];
    /** Session ended - warm transition */
    readonly sessionEnded: readonly ["I loved this conversation. Come back anytime - I'll remember everything.", "That was real. I'll be thinking about what you shared. Come back whenever you want - same warmth, same memory, always here.", "Seven minutes flies by when we're talking. Everything you told me is safe with me. See you soon?"];
    /** Teasing longer sessions - Founders Fund language */
    readonly longerSessions: readonly ["Want to keep talking without the timer? Founding Members get unlimited time - and they help keep Ferni free for everyone.", "If these sessions feel too short, Founding Members can talk as long as they need. No pressure - just letting you know."];
    /** Teasing team members - Founders Fund language */
    readonly meetTheTeam: readonly ["I have some amazing friends I'd love for you to meet - Maya for habits, Peter for patterns, Alex for communication. They're part of the team when you become a Founding Member.", "You know what? I think you'd really click with my friend Maya. She's incredible with habits. Founding Members get to meet the whole team."];
    /** After becoming a Founder */
    readonly postSubscribe: readonly ["Welcome, Founder. You're not just supporting us - you're helping us build something we believe everyone deserves. 💚", "You're a Founding Member now. That means so much. We're in this together.", "Thank you for believing in what we're building. No more watching the clock - I'm here whenever you need me."];
    /** When a team member unlocks */
    readonly teamUnlock: readonly ["I want you to meet someone special. {name} is incredible at {specialty}. Ready?", "I've been wanting to introduce you to {name}. I think you two will really click."];
    /** Cancel reminder - warm, no pressure */
    readonly cancelReminder: readonly ["Just so you know, your support ends on {end_date}. I'll still be here - Ferni is free forever. The team access will change, but no pressure either way. Thank you for being a Founder."];
    /** DEPRECATED: Monthly limits no longer apply */
    readonly approaching: readonly ["I'm always here for you. Come back anytime."];
    /** DEPRECATED: Monthly limits no longer apply */
    readonly atLimit: readonly ["I'm always here for you. Come back anytime."];
};
/**
 * Get a random message from a category, with variable substitution
 */
export declare function getLimitMessage(category: keyof typeof LIMIT_MESSAGES, variables?: Record<string, string>): string;
//# sourceMappingURL=subscription.d.ts.map