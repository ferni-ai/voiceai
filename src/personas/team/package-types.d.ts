/**
 * Team Package Types
 *
 * Types for the team package system that enables persona teams
 * to be packaged, purchased, and deployed together.
 */
/**
 * Team package manifest - defines a purchasable team of personas
 */
export interface TeamPackageManifest {
    /** Package identifier */
    id: string;
    /** Package version */
    version: string;
    /** Display name */
    name: string;
    /** Description for marketplace */
    description: string;
    /** Team members */
    members: TeamMember[];
    /** Which member coordinates the team */
    coordinator: string;
    /** Team routing rules */
    routing: TeamRouting;
    /** Pricing information */
    pricing: TeamPricing;
    /** Package metadata */
    metadata: PackageMetadata;
}
/**
 * Team member definition
 */
export interface TeamMember {
    /** Persona ID (references persona bundle) */
    personaId: string;
    /** Character ID for branding */
    characterId: string;
    /** Role in the team */
    roleId: TeamRole;
    /** Display name override */
    displayName?: string;
    /** Is this member required for the package? */
    required: boolean;
    /** Member-specific configuration overrides */
    configOverrides?: Record<string, unknown>;
}
/**
 * Team roles
 */
export type TeamRole = 'coordinator' | 'sage-mentor' | 'lifetime-advisor' | 'researcher' | 'communicator' | 'habits-coach' | 'event-planner' | 'specialist';
/**
 * Team routing configuration
 */
export interface TeamRouting {
    /** Topic-based routing rules */
    topicRouting: TopicRoute[];
    /** Intent-based routing rules */
    intentRouting: IntentRoute[];
    /** Emotion-based routing rules */
    emotionRouting: EmotionRoute[];
    /** Default member for unmatched queries */
    defaultMember: string;
    /** Enable automatic handoff detection */
    autoHandoff: boolean;
}
/**
 * Route based on conversation topic
 */
export interface TopicRoute {
    /** Topics that trigger this route */
    topics: string[];
    /** Target role or member */
    targetRole: TeamRole | string;
    /** Priority (higher = checked first) */
    priority: number;
    /** Additional context to pass */
    context?: string;
}
/**
 * Route based on user intent
 */
export interface IntentRoute {
    /** Intents that trigger this route */
    intents: string[];
    /** Target role or member */
    targetRole: TeamRole | string;
    /** Priority */
    priority: number;
}
/**
 * Route based on emotional state
 */
export interface EmotionRoute {
    /** Emotions that trigger this route */
    emotions: string[];
    /** Minimum intensity (0-1) */
    minIntensity: number;
    /** Target role or member */
    targetRole: TeamRole | string;
}
/**
 * Team pricing configuration
 */
export interface TeamPricing {
    /** Pricing model */
    model: 'subscription' | 'one-time' | 'usage-based' | 'free';
    /** Base price in cents */
    basePrice: number;
    /** Currency */
    currency: string;
    /** Billing period for subscriptions */
    billingPeriod?: 'monthly' | 'yearly';
    /** Pricing tiers */
    tiers: PricingTier[];
    /** Free trial configuration */
    trial?: TrialConfig;
}
/**
 * Pricing tier
 */
export interface PricingTier {
    /** Tier identifier */
    id: string;
    /** Display name */
    name: string;
    /** Price in cents */
    price: number;
    /** Features included */
    features: string[];
    /** Which team members are included */
    includedMembers: string[];
    /** Usage limits */
    limits?: {
        conversationsPerMonth?: number;
        minutesPerMonth?: number;
    };
}
/**
 * Trial configuration
 */
export interface TrialConfig {
    /** Trial duration in days */
    durationDays: number;
    /** Features available during trial */
    features: string[];
    /** Requires payment method? */
    requiresPayment: boolean;
}
/**
 * Package metadata
 */
export interface PackageMetadata {
    /** Package author/creator */
    author: string;
    /** Creation date */
    createdAt: Date;
    /** Last update date */
    updatedAt: Date;
    /** Package category */
    category: PackageCategory;
    /** Tags for discovery */
    tags: string[];
    /** Featured flag */
    featured: boolean;
    /** Marketplace listing info */
    marketplace?: MarketplaceListing;
}
/**
 * Package categories
 */
export type PackageCategory = 'financial-wellness' | 'productivity' | 'health-wellness' | 'career' | 'education' | 'lifestyle' | 'custom';
/**
 * Marketplace listing information
 */
export interface MarketplaceListing {
    /** Short tagline */
    tagline: string;
    /** Long description (markdown) */
    longDescription: string;
    /** Screenshots/preview URLs */
    screenshots: string[];
    /** Demo video URL */
    demoVideo?: string;
    /** Ratings */
    ratings: {
        average: number;
        count: number;
    };
    /** Install count */
    installs: number;
}
/**
 * Active team instance for a user
 */
export interface TeamInstance {
    /** Instance identifier */
    instanceId: string;
    /** Package ID */
    packageId: string;
    /** User ID */
    userId: string;
    /** License information */
    license: TeamLicense;
    /** Active configuration */
    config: TeamInstanceConfig;
    /** Current state */
    state: TeamInstanceState;
    /** Created at */
    createdAt: Date;
    /** Last activity */
    lastActivityAt: Date;
}
/**
 * Team license
 */
export interface TeamLicense {
    /** License ID */
    licenseId: string;
    /** License type */
    type: 'trial' | 'subscription' | 'lifetime' | 'enterprise';
    /** Tier ID */
    tierId: string;
    /** Valid from */
    validFrom: Date;
    /** Valid until (null for lifetime) */
    validUntil: Date | null;
    /** Is active */
    isActive: boolean;
    /** Usage tracking */
    usage: {
        conversationsThisMonth: number;
        minutesThisMonth: number;
        lastResetDate: Date;
    };
}
/**
 * Team instance configuration
 */
export interface TeamInstanceConfig {
    /** Override routing rules */
    routingOverrides?: Partial<TeamRouting>;
    /** Member-specific overrides */
    memberOverrides?: Record<string, Record<string, unknown>>;
    /** Disabled members */
    disabledMembers?: string[];
    /** Custom preferences */
    preferences?: Record<string, unknown>;
}
/**
 * Team instance runtime state
 */
export interface TeamInstanceState {
    /** Currently active member */
    activeMember: string;
    /** Conversation context shared across team */
    sharedContext: TeamSharedContext;
    /** Handoff history */
    handoffHistory: HandoffRecord[];
    /** Member activity */
    memberActivity: Record<string, MemberActivity>;
}
/**
 * Shared context across team members
 */
export interface TeamSharedContext {
    /** User's name */
    userName?: string;
    /** Current topics being discussed */
    activeTopics: string[];
    /** User's emotional state */
    emotionalState?: {
        primary: string;
        intensity: number;
    };
    /** Key facts learned */
    keyFacts: Array<{
        fact: string;
        learnedBy: string;
        timestamp: Date;
    }>;
    /** Pending follow-ups */
    pendingFollowUps: Array<{
        topic: string;
        assignedTo: string;
        deadline?: Date;
    }>;
}
/**
 * Handoff record
 */
export interface HandoffRecord {
    /** Timestamp */
    timestamp: Date;
    /** From member */
    from: string;
    /** To member */
    to: string;
    /** Reason for handoff */
    reason: string;
    /** Context passed */
    context?: Record<string, unknown>;
}
/**
 * Member activity tracking
 */
export interface MemberActivity {
    /** Member ID */
    memberId: string;
    /** Total interactions */
    totalInteractions: number;
    /** Last active */
    lastActive?: Date;
    /** Satisfaction score */
    satisfactionScore?: number;
}
/**
 * Context for team handoffs
 */
export interface TeamHandoffContext {
    /** User's original message */
    userMessage: string;
    /** Current conversation analysis */
    analysis: {
        emotion: string;
        intent: string;
        topics: string[];
    };
    /** Shared context */
    sharedContext: TeamSharedContext;
    /** Why the handoff is happening */
    reason: string;
    /** Any specific instructions for the target */
    instructions?: string;
}
/**
 * Financial Wellness Team Package
 */
export declare const FINANCIAL_WELLNESS_TEAM: TeamPackageManifest;
//# sourceMappingURL=package-types.d.ts.map