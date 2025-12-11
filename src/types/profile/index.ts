/**
 * Profile Types Module
 *
 * Bounded context aggregates for user profiles.
 * Each aggregate focuses on a specific domain concern.
 *
 * Aggregates:
 *   - identity: Core user identification
 *   - communication: How they communicate
 *   - relationship: The AI-user relationship
 *   - financial: Financial context and goals
 *   - conversation-memory: Past conversation data
 *   - entertainment: Music and game preferences
 *   - intelligence: Humanizing state, cognitive patterns, response quality
 *
 * Philosophy: Separate concerns into cohesive aggregates that can evolve independently.
 */

// ============================================================================
// IDENTITY AGGREGATE
// ============================================================================

export {
  createUserIdentity,
  type ContactInfo,
  type UserIdentity,
  type VoiceSketch,
} from './identity.js';

// ============================================================================
// COMMUNICATION AGGREGATE
// ============================================================================

export {
  createCommunicationProfile,
  type CommunicationProfile,
  type CommunicationStyle,
  type SpeakingPace,
  type VerbosityPreference,
} from './communication.js';

// ============================================================================
// RELATIONSHIP AGGREGATE
// ============================================================================

export {
  calculateRelationshipStage,
  createRelationshipContext,
  type EmotionalPattern,
  type FamilyMember,
  type KeyMoment,
  type RelationshipContext,
  type RelationshipStage,
  type SharedStory,
} from './relationship.js';

// ============================================================================
// FINANCIAL AGGREGATE
// ============================================================================

export {
  createFinancialProfile,
  type FinancialGoal,
  type FinancialProfile,
  type FinancialSituation,
  type InvestmentAccount,
  type InvestmentEvent,
  type PrimaryConcern,
  type RiskProfile,
} from './financial.js';

// ============================================================================
// CONVERSATION MEMORY AGGREGATE
// ============================================================================

export {
  createConversationMemory,
  type ConversationMemory,
  type ConversationSummary,
  type PendingFollowUp,
  type SuperhumanLearningData,
  type SuperhumanMemoryData,
  type SuperhumanPatternData,
} from './conversation-memory.js';

// ============================================================================
// ENTERTAINMENT AGGREGATE
// ============================================================================

export {
  createEntertainmentProfile,
  type AffinityScore,
  type EntertainmentProfile,
  type GameMemory,
  type GameMilestone,
  type GameSessionRecord,
  type GameTypeStats,
  type MusicalPersonalityTrait,
  type MusicMemory,
} from './entertainment.js';

// ============================================================================
// INTELLIGENCE AGGREGATE
// ============================================================================

export {
  createIntelligenceProfile,
  type ApproachEffectiveness,
  type CognitiveIntelligence,
  type CognitiveStyle,
  type ConversationPatterns,
  type ConversationPreferences,
  type HumanizingState,
  type IntelligenceProfile,
  type PerPersonaRelationshipData,
  type PersonaRelationshipStage,
  type ProactiveInsight,
  type ResponsePreferences,
  type ResponseQuality,
  type ResponseSignal,
  type SessionPattern,
  type TopicExplanation,
} from './intelligence.js';

// ============================================================================
// COMPOSITE PROFILE (Complete user profile using aggregates)
// ============================================================================

import type { PersonalJourneyData } from '../personal-journey.js';
import type { SubscriptionData } from '../subscription.js';
import type { LifeEvent } from '../user-profile.js';
import type { CommunicationProfile } from './communication.js';
import type { ConversationMemory } from './conversation-memory.js';
import type { EntertainmentProfile } from './entertainment.js';
import type { FinancialProfile } from './financial.js';
import type { UserIdentity } from './identity.js';
import type { IntelligenceProfile } from './intelligence.js';
import type { RelationshipContext } from './relationship.js';

/**
 * Life stage of the user
 */
export type LifeStage =
  | 'young_adult'
  | 'early_career'
  | 'mid_career'
  | 'pre_retirement'
  | 'retirement';

/**
 * Composite user profile using aggregates.
 * This is the new structure that composes all aggregates.
 *
 * Benefits over legacy UserProfile:
 * - Clear domain boundaries
 * - Easier to test and maintain
 * - Can evolve aggregates independently
 * - Better type inference
 *
 * Note: The original UserProfile type in user-profile.ts is kept
 * for backward compatibility and will be migrated over time.
 */
export interface CompositeUserProfile {
  // Core aggregates
  identity: UserIdentity;
  communication: CommunicationProfile;
  relationship: RelationshipContext;
  financial: FinancialProfile;
  memory: ConversationMemory;

  // Optional aggregates (loaded on demand)
  entertainment?: EntertainmentProfile;
  intelligence?: IntelligenceProfile;

  // Life context
  lifeStage?: LifeStage;
  lifeEvents?: LifeEvent[];

  // Current session state
  currentSessionId?: string;
  currentMood?: string;
  currentEnergyLevel?: 'low' | 'medium' | 'high';

  // Subscription and journey (cross-cutting concerns)
  subscription?: SubscriptionData;
  personalJourney?: Partial<PersonalJourneyData>;

  // Persona-specific memories
  personaMemories?: {
    ferni?: PersonaMemoryItem[];
    maya?: PersonaMemoryItem[];
    peter?: PersonaMemoryItem[];
    alex?: PersonaMemoryItem[];
    jordan?: PersonaMemoryItem[];
    nayan?: PersonaMemoryItem[];
  };

  // Extensibility
  customData?: Record<string, unknown>;
}

/**
 * Generic persona memory item (simplified from legacy)
 */
export interface PersonaMemoryItem {
  id: string;
  type: string;
  name: string;
  details?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  tags: string[];
  createdAt: Date;
  timesReferenced: number;
}

// Re-import factory functions for use in createCompositeUserProfile
// (These are re-exported above, but we need local references for the composite function)
// eslint-disable-next-line no-duplicate-imports -- Intentional: need local refs after re-export
import { createUserIdentity } from './identity.js';
// eslint-disable-next-line no-duplicate-imports -- Intentional: need local refs after re-export
import { createCommunicationProfile } from './communication.js';
// eslint-disable-next-line no-duplicate-imports -- Intentional: need local refs after re-export
import { createRelationshipContext } from './relationship.js';
// eslint-disable-next-line no-duplicate-imports -- Intentional: need local refs after re-export
import { createFinancialProfile } from './financial.js';
// eslint-disable-next-line no-duplicate-imports -- Intentional: need local refs after re-export
import { createConversationMemory } from './conversation-memory.js';
// eslint-disable-next-line no-duplicate-imports -- Intentional: need local refs after re-export
import { createEntertainmentProfile } from './entertainment.js';
// eslint-disable-next-line no-duplicate-imports -- Intentional: need local refs after re-export
import { createIntelligenceProfile } from './intelligence.js';

/**
 * Create a composite user profile with all defaults
 */
export function createCompositeUserProfile(id: string, name?: string): CompositeUserProfile {
  return {
    identity: createUserIdentity(id, name),
    communication: createCommunicationProfile(),
    relationship: createRelationshipContext(),
    financial: createFinancialProfile(),
    memory: createConversationMemory(),
    entertainment: createEntertainmentProfile(),
    intelligence: createIntelligenceProfile(),
  };
}

/**
 * Create a minimal composite profile (without optional aggregates)
 * Useful for new users where we don't need all the data yet
 */
export function createMinimalCompositeProfile(id: string, name?: string): CompositeUserProfile {
  return {
    identity: createUserIdentity(id, name),
    communication: createCommunicationProfile(),
    relationship: createRelationshipContext(),
    financial: createFinancialProfile(),
    memory: createConversationMemory(),
  };
}

// ============================================================================
// MIGRATION UTILITIES
// ============================================================================

export {
  ensureCompositeProfile,
  isCompositeProfile,
  isLegacyProfile,
  migrateUserProfile,
  toLegacyProfile,
} from './migration.js';
