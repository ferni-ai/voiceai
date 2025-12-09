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
 */

// ============================================================================
// IDENTITY AGGREGATE
// ============================================================================

export {
  type VoiceSketch,
  type ContactInfo,
  type UserIdentity,
  createUserIdentity,
} from './identity.js';

// ============================================================================
// COMMUNICATION AGGREGATE
// ============================================================================

export {
  type CommunicationStyle,
  type SpeakingPace,
  type VerbosityPreference,
  type CommunicationProfile,
  createCommunicationProfile,
} from './communication.js';

// ============================================================================
// RELATIONSHIP AGGREGATE
// ============================================================================

export {
  type RelationshipStage,
  type FamilyMember,
  type EmotionalPattern,
  type KeyMoment,
  type SharedStory,
  type RelationshipContext,
  createRelationshipContext,
  calculateRelationshipStage,
} from './relationship.js';

// ============================================================================
// FINANCIAL AGGREGATE
// ============================================================================

export {
  type RiskProfile,
  type FinancialGoal,
  type InvestmentEvent,
  type PrimaryConcern,
  type InvestmentAccount,
  type FinancialSituation,
  type FinancialProfile,
  createFinancialProfile,
} from './financial.js';

// ============================================================================
// CONVERSATION MEMORY AGGREGATE
// ============================================================================

export {
  type ConversationSummary,
  type PendingFollowUp,
  type ConversationMemory,
  createConversationMemory,
} from './conversation-memory.js';

// ============================================================================
// COMPOSITE PROFILE (for backward compatibility)
// ============================================================================

import type { UserIdentity } from './identity.js';
import type { CommunicationProfile } from './communication.js';
import type { RelationshipContext } from './relationship.js';
import type { FinancialProfile } from './financial.js';
import type { ConversationMemory } from './conversation-memory.js';

/**
 * Composite user profile using aggregates.
 * This is the new structure that composes all aggregates.
 *
 * Note: The original UserProfile type in user-profile.ts is kept
 * for backward compatibility and will be migrated over time.
 */
export interface CompositeUserProfile {
  identity: UserIdentity;
  communication: CommunicationProfile;
  relationship: RelationshipContext;
  financial: FinancialProfile;
  memory: ConversationMemory;

  // Current session state
  currentSessionId?: string;
  currentMood?: string;
  currentEnergyLevel?: 'low' | 'medium' | 'high';

  // Life stage (shared across aggregates)
  lifeStage?: 'young_adult' | 'early_career' | 'mid_career' | 'pre_retirement' | 'retirement';
}

// Import factory functions for composite profile creation
import { createUserIdentity as createIdentity } from './identity.js';
import { createCommunicationProfile as createComm } from './communication.js';
import { createRelationshipContext as createRel } from './relationship.js';
import { createFinancialProfile as createFin } from './financial.js';
import { createConversationMemory as createMem } from './conversation-memory.js';

/**
 * Create a composite user profile
 */
export function createCompositeUserProfile(id: string, name?: string): CompositeUserProfile {
  return {
    identity: createIdentity(id, name),
    communication: createComm(),
    relationship: createRel(),
    financial: createFin(),
    memory: createMem(),
  };
}

// ============================================================================
// MIGRATION UTILITIES
// ============================================================================

export {
  migrateUserProfile,
  isLegacyProfile,
  isCompositeProfile,
  ensureCompositeProfile,
  toLegacyProfile,
} from './migration.js';
