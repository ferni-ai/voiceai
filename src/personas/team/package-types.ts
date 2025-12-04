/**
 * Team Package Types
 *
 * Types for the team package system that enables persona teams
 * to be packaged, purchased, and deployed together.
 */

// ============================================================================
// TEAM PACKAGE MANIFEST
// ============================================================================

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
export type TeamRole =
  | 'coordinator' // Orchestrates team, handles handoffs
  | 'sage-mentor' // Wisdom, life advice, big picture
  | 'researcher' // Deep analysis, insights
  | 'communicator' // Scheduling, emails, contacts
  | 'habits-coach' // Financial habits, routines
  | 'event-planner' // Life events, milestones
  | 'specialist'; // Domain-specific expertise

// ============================================================================
// ROUTING
// ============================================================================

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

// ============================================================================
// PRICING
// ============================================================================

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

// ============================================================================
// METADATA
// ============================================================================

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
export type PackageCategory =
  | 'financial-wellness'
  | 'productivity'
  | 'health-wellness'
  | 'career'
  | 'education'
  | 'lifestyle'
  | 'custom';

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

// ============================================================================
// TEAM INSTANCE (RUNTIME)
// ============================================================================

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

// ============================================================================
// HANDOFF CONTEXT
// ============================================================================

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

// ============================================================================
// PACKAGE DEFINITIONS
// ============================================================================

/**
 * Financial Wellness Team Package
 */
export const FINANCIAL_WELLNESS_TEAM: TeamPackageManifest = {
  id: 'financial-wellness-team',
  version: '1.0.0',
  name: 'Financial Wellness Team',
  description: 'Complete team for personal finance management, investing guidance, and financial habit building.',
  
  members: [
    {
      personaId: 'ferni',
      characterId: 'ferni',
      roleId: 'coordinator',
      displayName: 'Ferni',
      required: true,
    },
    {
      personaId: 'nayan-patel',
      characterId: 'nayan-patel',
      roleId: 'sage-mentor',
      displayName: 'Jack Bogle',
      required: true,
    },
    {
      personaId: 'peter-john',
      characterId: 'peter-john',
      roleId: 'researcher',
      displayName: 'Peter John',
      required: true,
    },
    {
      personaId: 'maya-santos',
      characterId: 'maya-santos',
      roleId: 'habits-coach',
      displayName: 'Maya Santos',
      required: true,
    },
    {
      personaId: 'alex-chen',
      characterId: 'alex-chen',
      roleId: 'communicator',
      displayName: 'Alex Chen',
      required: false,
    },
    {
      personaId: 'jordan-taylor',
      characterId: 'jordan-taylor',
      roleId: 'event-planner',
      displayName: 'Jordan Taylor',
      required: false,
    },
  ],

  coordinator: 'ferni',

  routing: {
    topicRouting: [
      { topics: ['budget', 'spending', 'savings', 'debt', 'habits'], targetRole: 'habits-coach', priority: 10 },
      { topics: ['investing', 'portfolio', 'index funds', 'retirement'], targetRole: 'sage-mentor', priority: 10 },
      { topics: ['stocks', 'analysis', 'research', 'earnings'], targetRole: 'researcher', priority: 10 },
      { topics: ['schedule', 'meeting', 'email', 'calendar'], targetRole: 'communicator', priority: 10 },
      { topics: ['milestone', 'event', 'wedding', 'baby', 'goals'], targetRole: 'event-planner', priority: 10 },
    ],
    intentRouting: [
      { intents: ['analyze_spending', 'create_budget'], targetRole: 'habits-coach', priority: 5 },
      { intents: ['invest_advice', 'portfolio_review'], targetRole: 'sage-mentor', priority: 5 },
      { intents: ['stock_analysis', 'research_company'], targetRole: 'researcher', priority: 5 },
    ],
    emotionRouting: [
      { emotions: ['anxious', 'worried', 'stressed'], minIntensity: 0.6, targetRole: 'sage-mentor' },
      { emotions: ['excited', 'hopeful'], minIntensity: 0.7, targetRole: 'coordinator' },
    ],
    defaultMember: 'ferni',
    autoHandoff: true,
  },

  pricing: {
    model: 'subscription',
    basePrice: 2999, // $29.99
    currency: 'USD',
    billingPeriod: 'monthly',
    tiers: [
      {
        id: 'basic',
        name: 'Basic',
        price: 1999,
        features: ['Core team (Ferni, Jack, Maya)', 'Unlimited conversations', 'Basic analytics'],
        includedMembers: ['ferni', 'nayan-patel', 'maya-santos'],
      },
      {
        id: 'pro',
        name: 'Professional',
        price: 2999,
        features: ['Full team', 'Advanced insights', 'Priority support', 'API access'],
        includedMembers: ['ferni', 'nayan-patel', 'peter-john', 'maya-santos', 'alex-chen', 'jordan-taylor'],
      },
    ],
    trial: {
      durationDays: 14,
      features: ['Full team access', 'Limited to 10 conversations'],
      requiresPayment: false,
    },
  },

  metadata: {
    author: 'VoiceAI Team',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date(),
    category: 'financial-wellness',
    tags: ['finance', 'investing', 'budgeting', 'habits', 'coaching'],
    featured: true,
  },
};

