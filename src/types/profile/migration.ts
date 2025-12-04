/**
 * Profile Migration Utilities
 *
 * Functions for migrating from the legacy UserProfile to the new
 * CompositeUserProfile aggregate structure.
 */

import type { UserProfile } from '../user-profile.js';
import type { CompositeUserProfile } from './index.js';
import type { UserIdentity, ContactInfo, VoiceSketch } from './identity.js';
import type { CommunicationProfile, CommunicationStyle, SpeakingPace } from './communication.js';
import type {
  RelationshipContext,
  RelationshipStage,
  FamilyMember,
  EmotionalPattern,
  KeyMoment,
  SharedStory,
} from './relationship.js';
import type {
  FinancialProfile,
  RiskProfile,
  FinancialGoal,
  InvestmentEvent,
  PrimaryConcern,
  FinancialSituation,
} from './financial.js';
import type { ConversationMemory, ConversationSummary, PendingFollowUp } from './conversation-memory.js';

/**
 * Migrate a legacy UserProfile to the new CompositeUserProfile structure.
 *
 * This function converts the flat UserProfile into a domain-separated
 * composite profile with proper aggregates.
 *
 * @param legacy - The legacy UserProfile to migrate
 * @returns A CompositeUserProfile with data from the legacy profile
 */
export function migrateUserProfile(legacy: UserProfile): CompositeUserProfile {
  return {
    identity: migrateIdentity(legacy),
    communication: migrateCommunication(legacy),
    relationship: migrateRelationship(legacy),
    financial: migrateFinancial(legacy),
    memory: migrateConversationMemory(legacy),
    currentSessionId: undefined,
    currentMood: undefined,
    currentEnergyLevel: undefined,
    lifeStage: legacy.lifeStage,
  };
}

/**
 * Extract identity aggregate from legacy profile
 */
function migrateIdentity(legacy: UserProfile): UserIdentity {
  const now = new Date();

  const contactInfo: ContactInfo | undefined = legacy.contactInfo
    ? {
        phone: legacy.contactInfo.phone,
        email: legacy.contactInfo.email,
        preferredContactMethod: legacy.contactInfo.preferredContactMethod || 'voice_message',
        timezone: legacy.contactInfo.timezone,
        quietHoursStart: legacy.contactInfo.quietHoursStart,
        quietHoursEnd: legacy.contactInfo.quietHoursEnd,
      }
    : undefined;

  return {
    id: legacy.id,
    name: legacy.name,
    preferredName: legacy.preferredName,
    linkedIdentifiers: legacy.linkedIdentifiers || [],
    voiceSketch: legacy.voiceSketch,
    contactInfo,
    firstContact: legacy.firstContact || now,
    lastContact: legacy.lastContact || now,
    totalConversations: legacy.totalConversations || 0,
    totalMinutesTalked: legacy.totalMinutesTalked || 0,
    createdAt: legacy.createdAt || now,
    updatedAt: legacy.updatedAt || now,
    version: legacy.version || 1,
  };
}

/**
 * Extract communication aggregate from legacy profile
 */
function migrateCommunication(legacy: UserProfile): CommunicationProfile {
  return {
    style: (legacy.communicationStyle || 'mixed') as CommunicationStyle,
    speakingPace: (legacy.speakingPace || 'moderate') as SpeakingPace,
    averageWPM: legacy.averageWPM,
    preferredTopics: legacy.preferredTopics || [],
    avoidTopics: legacy.avoidTopics || [],
    humorAppreciation: legacy.humorAppreciation || 'medium',
    verbosity: legacy.preferences?.verbosity || 'balanced',
    wantsProactiveAdvice: legacy.preferences?.wantsProactiveAdvice ?? true,
    financialPrivacyLevel: legacy.preferences?.financialPrivacyLevel || 'moderate',
  };
}

/**
 * Extract relationship aggregate from legacy profile
 */
function migrateRelationship(legacy: UserProfile): RelationshipContext {
  return {
    stage: (legacy.relationshipStage || 'new_acquaintance') as RelationshipStage,
    familyMembers: (legacy.familyMembers || []) as FamilyMember[],
    keyMoments: (legacy.keyMoments || []) as KeyMoment[],
    sharedStories: (legacy.sharedStories || []) as SharedStory[],
    emotionalPatterns: (legacy.emotionalPatterns || []) as EmotionalPattern[],
  };
}

/**
 * Extract financial aggregate from legacy profile
 */
function migrateFinancial(legacy: UserProfile): FinancialProfile {
  const now = new Date();

  const riskProfile: RiskProfile = legacy.riskProfile || {
    tolerance: 'unknown',
    confidence: 0,
    assessedAt: now,
    factors: [],
  };

  return {
    riskProfile,
    goals: (legacy.goals || []) as FinancialGoal[],
    primaryConcerns: (legacy.primaryConcerns || []) as PrimaryConcern[],
    investmentEvents: (legacy.investmentEvents || []) as InvestmentEvent[],
    hasInvestments: legacy.hasInvestments ?? false,
    investmentExperience: legacy.investmentExperience || 'unknown',
    financialSituation: legacy.financialSituation as FinancialSituation | undefined,
    financialAnxietyTriggers: legacy.financialAnxietyTriggers || [],
  };
}

/**
 * Extract conversation memory aggregate from legacy profile
 */
function migrateConversationMemory(legacy: UserProfile): ConversationMemory {
  return {
    summaries: (legacy.conversationSummaries || []) as ConversationSummary[],
    openQuestions: legacy.openQuestions || [],
    pendingFollowUps: (legacy.pendingFollowUps || []) as PendingFollowUp[],
  };
}

/**
 * Check if a profile needs migration (is legacy structure)
 */
export function isLegacyProfile(profile: unknown): profile is UserProfile {
  if (!profile || typeof profile !== 'object') return false;
  const p = profile as Record<string, unknown>;

  // Legacy profiles have flat structure with these fields at the root
  return (
    typeof p.id === 'string' &&
    typeof p.relationshipStage === 'string' &&
    !('identity' in p) &&
    !('communication' in p)
  );
}

/**
 * Check if a profile is already a composite profile
 */
export function isCompositeProfile(profile: unknown): profile is CompositeUserProfile {
  if (!profile || typeof profile !== 'object') return false;
  const p = profile as Record<string, unknown>;

  return (
    'identity' in p &&
    'communication' in p &&
    'relationship' in p &&
    'financial' in p &&
    'memory' in p
  );
}

/**
 * Safely migrate a profile, handling both legacy and composite formats
 */
export function ensureCompositeProfile(
  profile: UserProfile | CompositeUserProfile
): CompositeUserProfile {
  if (isCompositeProfile(profile)) {
    return profile;
  }
  if (isLegacyProfile(profile)) {
    return migrateUserProfile(profile);
  }
  throw new Error('Unknown profile format');
}

/**
 * Convert a CompositeUserProfile back to legacy UserProfile format.
 * Useful for gradual migration - new code can use composite,
 * but persist in legacy format for backward compatibility.
 */
export function toLegacyProfile(composite: CompositeUserProfile): UserProfile {
  const { identity, communication, relationship, financial, memory } = composite;

  return {
    // Identity
    id: identity.id,
    name: identity.name,
    preferredName: identity.preferredName,
    linkedIdentifiers: identity.linkedIdentifiers,
    voiceSketch: identity.voiceSketch,
    contactInfo: identity.contactInfo,
    firstContact: identity.firstContact,
    lastContact: identity.lastContact,
    totalConversations: identity.totalConversations,
    totalMinutesTalked: identity.totalMinutesTalked,

    // Communication
    communicationStyle: communication.style,
    speakingPace: communication.speakingPace,
    averageWPM: communication.averageWPM,
    preferredTopics: communication.preferredTopics,
    avoidTopics: communication.avoidTopics,
    humorAppreciation: communication.humorAppreciation,
    preferences: {
      verbosity: communication.verbosity,
      topicsToAvoid: communication.avoidTopics,
      wantsProactiveAdvice: communication.wantsProactiveAdvice,
      financialPrivacyLevel: communication.financialPrivacyLevel,
    },

    // Relationship
    relationshipStage: relationship.stage,
    familyMembers: relationship.familyMembers,
    keyMoments: relationship.keyMoments,
    sharedStories: relationship.sharedStories,
    emotionalPatterns: relationship.emotionalPatterns,

    // Financial
    riskProfile: financial.riskProfile,
    goals: financial.goals,
    primaryConcerns: financial.primaryConcerns,
    investmentEvents: financial.investmentEvents,
    hasInvestments: financial.hasInvestments,
    investmentExperience: financial.investmentExperience,
    financialSituation: financial.financialSituation,
    financialAnxietyTriggers: financial.financialAnxietyTriggers,

    // Life stage
    lifeStage: composite.lifeStage,

    // Conversation memory
    conversationSummaries: memory.summaries,
    openQuestions: memory.openQuestions,
    pendingFollowUps: memory.pendingFollowUps,

    // Timestamps
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
    version: 1,
  };
}

