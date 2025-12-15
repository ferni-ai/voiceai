/**
 * Profile Migration Script
 *
 * Utilities for gradually migrating from legacy UserProfile to CompositeUserProfile.
 * This enables incremental adoption without breaking existing code.
 *
 * Migration Strategy:
 * 1. Create adapters that work with both formats
 * 2. Migrate read paths first (can read both, return canonical type)
 * 3. Migrate write paths second (write both formats during transition)
 * 4. Eventually deprecate legacy format
 *
 * @module types/migration/profile-migrator
 */

import type { CompositeUserProfile, LifeStage, PersonaMemoryItem } from '../profile/index.js';
import {
  createCommunicationProfile,
  createConversationMemory,
  createEntertainmentProfile,
  createFinancialProfile,
  createIntelligenceProfile,
  createRelationshipContext,
  createUserIdentity,
} from '../profile/index.js';
import type { UserProfile } from '../user-profile.js';

// ============================================================================
// MIGRATION DETECTION
// ============================================================================

/**
 * Profile format indicator
 */
export type ProfileFormat = 'legacy' | 'composite' | 'unknown';

/**
 * Detect the format of a profile
 */
export function detectProfileFormat(profile: unknown): ProfileFormat {
  if (!profile || typeof profile !== 'object') {
    return 'unknown';
  }

  const p = profile as Record<string, unknown>;

  // CompositeUserProfile has nested aggregates (all 5 required)
  if (
    'identity' in p &&
    'communication' in p &&
    'relationship' in p &&
    'financial' in p &&
    'memory' in p
  ) {
    return 'composite';
  }

  // Legacy UserProfile has flat structure with certain key fields
  if ('id' in p && 'relationshipStage' in p && !('identity' in p)) {
    return 'legacy';
  }

  return 'unknown';
}

/**
 * Check if migration is needed
 */
export function needsMigration(profile: unknown): boolean {
  return detectProfileFormat(profile) === 'legacy';
}

// ============================================================================
// FULL MIGRATION (Legacy -> Composite)
// ============================================================================

/**
 * Fully migrate a legacy UserProfile to CompositeUserProfile.
 * This is a complete migration that converts all fields.
 */
export function migrateToComposite(legacy: UserProfile): CompositeUserProfile {
  const now = new Date();

  // Migrate identity
  const identity = createUserIdentity(legacy.id, legacy.name);
  identity.preferredName = legacy.preferredName;
  identity.linkedIdentifiers = legacy.linkedIdentifiers || [];
  identity.voiceSketch = legacy.voiceSketch;
  identity.contactInfo = legacy.contactInfo;
  identity.firstContact = legacy.firstContact || now;
  identity.lastContact = legacy.lastContact || now;
  identity.totalConversations = legacy.totalConversations || 0;
  identity.totalMinutesTalked = legacy.totalMinutesTalked || 0;
  identity.createdAt = legacy.createdAt || now;
  identity.updatedAt = legacy.updatedAt || now;
  identity.version = legacy.version || 1;

  // Migrate communication
  const communication = createCommunicationProfile();
  communication.style = legacy.communicationStyle || 'mixed';
  communication.speakingPace = legacy.speakingPace || 'moderate';
  communication.averageWPM = legacy.averageWPM;
  communication.humorAppreciation = legacy.humorAppreciation || 'medium';
  communication.preferredTopics = legacy.preferredTopics || [];
  communication.avoidTopics = legacy.avoidTopics || [];
  communication.verbosity = legacy.preferences?.verbosity || 'balanced';
  communication.wantsProactiveAdvice = legacy.preferences?.wantsProactiveAdvice ?? true;
  communication.financialPrivacyLevel = legacy.preferences?.financialPrivacyLevel || 'moderate';
  communication.preferredGreeting = legacy.preferences?.preferredGreeting;

  // Migrate relationship
  const relationship = createRelationshipContext();
  relationship.stage = legacy.relationshipStage || 'new_acquaintance';
  relationship.familyMembers = legacy.familyMembers || [];
  relationship.keyMoments = legacy.keyMoments || [];
  relationship.sharedStories = legacy.sharedStories || [];
  relationship.emotionalPatterns = legacy.emotionalPatterns || [];

  // Migrate financial
  const financial = createFinancialProfile();
  if (legacy.riskProfile) {
    financial.riskProfile = legacy.riskProfile;
  }
  financial.goals = legacy.goals || [];
  financial.primaryConcerns = legacy.primaryConcerns || [];
  financial.investmentEvents = legacy.investmentEvents || [];
  financial.hasInvestments = legacy.hasInvestments ?? false;
  financial.investmentExperience = legacy.investmentExperience || 'unknown';
  financial.financialSituation = legacy.financialSituation;
  financial.financialAnxietyTriggers = legacy.financialAnxietyTriggers || [];

  // Migrate conversation memory
  const memory = createConversationMemory();
  memory.summaries = legacy.conversationSummaries || [];
  memory.lastSummary = legacy.lastConversationSummary;
  memory.openQuestions = legacy.openQuestions || [];
  memory.pendingFollowUps = legacy.pendingFollowUps || [];

  // Migrate entertainment (music + games)
  const entertainment = createEntertainmentProfile();
  if (legacy.musicMemory) {
    entertainment.music = legacy.musicMemory;
  }
  if (legacy.gameMemory) {
    entertainment.games = legacy.gameMemory;
  }

  // Migrate intelligence
  const intelligence = createIntelligenceProfile();
  if (legacy.humanizingState) {
    intelligence.humanizing = {
      usedShareTags: legacy.humanizingState.usedShareTags || [],
      totalSpontaneousShares: legacy.humanizingState.totalSpontaneousShares || 0,
      lastMood: legacy.humanizingState.lastMood,
      moodHistory: legacy.humanizingState.moodHistory,
      storiesTold: legacy.humanizingState.storiesTold,
      hotTakesShared: legacy.humanizingState.hotTakesShared,
      innerWorldRevealed: legacy.humanizingState.innerWorldRevealed,
      relationshipMilestones: legacy.humanizingState.relationshipMilestones,
      vulnerabilityMoments: legacy.humanizingState.vulnerabilityMoments,
      usedGreetings: legacy.humanizingState.usedGreetings,
      lastGreetingAt: legacy.humanizingState.lastGreetingAt,
      perPersonaMeetingCounts: legacy.humanizingState.perPersonaMeetingCounts,
      perPersonaLastTopic: legacy.humanizingState.perPersonaLastTopic,
      perPersonaRelationshipStage: legacy.humanizingState.perPersonaRelationshipStage,
      perPersonaRelationshipData: legacy.humanizingState.perPersonaRelationshipData,
      updatedAt: legacy.humanizingState.updatedAt || now,
    };
  }
  if (legacy.cognitiveIntelligence) {
    intelligence.cognitive = legacy.cognitiveIntelligence;
  }
  if (legacy.responseQuality) {
    intelligence.responseQuality = legacy.responseQuality;
  }
  if (legacy.conversationPatterns) {
    intelligence.conversationPatterns = legacy.conversationPatterns;
  }
  if (legacy.proactiveInsights) {
    intelligence.proactiveInsights = legacy.proactiveInsights;
  }

  // Migrate persona memories
  const personaMemories: CompositeUserProfile['personaMemories'] = {};
  if (legacy.personaMemories) {
    // Convert legacy persona memories to simplified format
    if (legacy.personaMemories.jackie) {
      personaMemories.ferni = legacy.personaMemories.jackie.map(convertPersonaMemory);
    }
    if (legacy.personaMemories.maya) {
      personaMemories.maya = legacy.personaMemories.maya.map(convertPersonaMemory);
    }
    if (legacy.personaMemories.peter) {
      personaMemories.peter = legacy.personaMemories.peter.map(convertPersonaMemory);
    }
    if (legacy.personaMemories.alex) {
      personaMemories.alex = legacy.personaMemories.alex.map(convertPersonaMemory);
    }
    if (legacy.personaMemories.jordan) {
      personaMemories.jordan = legacy.personaMemories.jordan.map(convertPersonaMemory);
    }
  }

  return {
    identity,
    communication,
    relationship,
    financial,
    memory,
    entertainment,
    intelligence,
    lifeStage: legacy.lifeStage as LifeStage | undefined,
    lifeEvents: legacy.lifeEvents,
    currentSessionId: legacy.currentSessionId,
    currentMood: legacy.currentMood,
    currentEnergyLevel: legacy.currentEnergyLevel,
    subscription: legacy.subscription,
    personalJourney: legacy.personalJourney,
    personaMemories: Object.keys(personaMemories).length > 0 ? personaMemories : undefined,
    customData: legacy.customData,
  };
}

/**
 * Convert any legacy persona memory to simplified format
 */
function convertPersonaMemory(item: unknown): PersonaMemoryItem {
  const m = item as Record<string, unknown>;
  return {
    id: (m.id as string) || '',
    type: (m.type as string) || 'preference',
    name: (m.name as string) || '',
    details: m.details as string | undefined,
    sentiment: m.sentiment as 'positive' | 'negative' | 'neutral' | undefined,
    tags: (m.tags as string[]) || [],
    createdAt: (m.createdAt as Date) || new Date(),
    timesReferenced: (m.timesReferenced as number) || 0,
  };
}

// ============================================================================
// REVERSE MIGRATION (Composite -> Legacy)
// ============================================================================

/**
 * Convert a CompositeUserProfile back to legacy UserProfile format.
 * Useful for backward compatibility during transition.
 */
export function migrateToLegacy(composite: CompositeUserProfile): UserProfile {
  const { identity, communication, relationship, financial, memory, entertainment, intelligence } =
    composite;

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
      preferredGreeting: communication.preferredGreeting,
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

    // Life context
    lifeStage: composite.lifeStage,
    lifeEvents: composite.lifeEvents,

    // Conversation memory
    conversationSummaries: memory.summaries,
    lastConversationSummary: memory.lastSummary,
    openQuestions: memory.openQuestions,
    pendingFollowUps: memory.pendingFollowUps,

    // Entertainment
    musicMemory: entertainment?.music,
    gameMemory: entertainment?.games,

    // Intelligence
    humanizingState: intelligence?.humanizing,
    cognitiveIntelligence: intelligence?.cognitive,
    responseQuality: intelligence?.responseQuality,
    conversationPatterns: intelligence?.conversationPatterns,
    proactiveInsights: intelligence?.proactiveInsights,

    // Session state
    currentSessionId: composite.currentSessionId,
    currentMood: composite.currentMood,
    currentEnergyLevel: composite.currentEnergyLevel,

    // Subscription and journey
    subscription: composite.subscription,
    personalJourney: composite.personalJourney,

    // Custom data
    customData: composite.customData,

    // Timestamps
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
    version: identity.version,
  };
}

// ============================================================================
// UNIFIED PROFILE ADAPTER
// ============================================================================

/**
 * A unified profile that can read from either format and provides
 * a consistent interface. Use this during the migration period.
 */
export class UnifiedProfileAdapter {
  private readonly _composite: CompositeUserProfile;
  private readonly _wasLegacy: boolean;

  constructor(profile: UserProfile | CompositeUserProfile) {
    const format = detectProfileFormat(profile);

    if (format === 'composite') {
      this._composite = profile as CompositeUserProfile;
      this._wasLegacy = false;
    } else {
      this._composite = migrateToComposite(profile as UserProfile);
      this._wasLegacy = true;
    }
  }

  /** Get as CompositeUserProfile (new format) */
  get composite(): CompositeUserProfile {
    return this._composite;
  }

  /** Get as legacy UserProfile (for backward compatibility) */
  get legacy(): UserProfile {
    return migrateToLegacy(this._composite);
  }

  /** Was this originally a legacy profile? */
  get wasLegacy(): boolean {
    return this._wasLegacy;
  }

  /** Get user ID */
  get id(): string {
    return this._composite.identity.id;
  }

  /** Get user name */
  get name(): string | undefined {
    return this._composite.identity.name;
  }

  /** Get preferred name */
  get preferredName(): string | undefined {
    return this._composite.identity.preferredName;
  }

  /** Get relationship stage */
  get relationshipStage(): string {
    return this._composite.relationship.stage;
  }

  /** Get total conversations */
  get totalConversations(): number {
    return this._composite.identity.totalConversations;
  }

  /** Quick access to common fields */
  get summary() {
    return {
      id: this.id,
      name: this.name || this.preferredName || 'Unknown',
      relationshipStage: this.relationshipStage,
      totalConversations: this.totalConversations,
      hasSubscription: !!this._composite.subscription,
      tier: this._composite.subscription?.tier || 'free',
    };
  }
}

/**
 * Create a unified adapter from any profile format
 */
export function createUnifiedProfile(
  profile: UserProfile | CompositeUserProfile
): UnifiedProfileAdapter {
  return new UnifiedProfileAdapter(profile);
}

// ============================================================================
// BATCH MIGRATION UTILITIES
// ============================================================================

/**
 * Result of a batch migration
 */
export interface BatchMigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  errors: Array<{ id: string; error: string }>;
  durationMs: number;
}

/**
 * Migrate a batch of profiles
 */
export function migrateProfileBatch(
  profiles: Array<UserProfile | CompositeUserProfile>,
  options: { skipAlreadyMigrated?: boolean } = {}
): {
  migrated: CompositeUserProfile[];
  result: BatchMigrationResult;
} {
  const startTime = Date.now();
  const migrated: CompositeUserProfile[] = [];
  const errors: Array<{ id: string; error: string }> = [];
  let skipped = 0;

  for (const profile of profiles) {
    try {
      const format = detectProfileFormat(profile);

      if (format === 'composite') {
        if (options.skipAlreadyMigrated) {
          skipped++;
          continue;
        }
        migrated.push(profile as CompositeUserProfile);
      } else if (format === 'legacy') {
        migrated.push(migrateToComposite(profile as UserProfile));
      } else {
        errors.push({
          id: ((profile as unknown as Record<string, unknown>).id as string) || 'unknown',
          error: 'Unknown profile format',
        });
      }
    } catch (error) {
      errors.push({
        id: ((profile as unknown as Record<string, unknown>).id as string) || 'unknown',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    migrated,
    result: {
      total: profiles.length,
      migrated: migrated.length,
      skipped,
      errors,
      durationMs: Date.now() - startTime,
    },
  };
}

// ============================================================================
// FIELD-LEVEL MIGRATION HELPERS
// ============================================================================

/**
 * Merge partial updates into a CompositeUserProfile
 */
export function mergeProfileUpdate(
  profile: CompositeUserProfile,
  update: Partial<CompositeUserProfile>
): CompositeUserProfile {
  return {
    ...profile,
    ...update,
    identity: update.identity ? { ...profile.identity, ...update.identity } : profile.identity,
    communication: update.communication
      ? { ...profile.communication, ...update.communication }
      : profile.communication,
    relationship: update.relationship
      ? { ...profile.relationship, ...update.relationship }
      : profile.relationship,
    financial: update.financial ? { ...profile.financial, ...update.financial } : profile.financial,
    memory: update.memory ? { ...profile.memory, ...update.memory } : profile.memory,
    entertainment: update.entertainment
      ? { ...profile.entertainment, ...update.entertainment }
      : profile.entertainment,
    intelligence: update.intelligence
      ? { ...profile.intelligence, ...update.intelligence }
      : profile.intelligence,
  };
}

/**
 * Get a snapshot of profile changes between two versions
 */
export function diffProfiles(
  before: CompositeUserProfile,
  after: CompositeUserProfile
): {
  changed: string[];
  added: string[];
  removed: string[];
} {
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  // Compare top-level aggregates
  const aggregates = ['identity', 'communication', 'relationship', 'financial', 'memory'] as const;

  for (const aggregate of aggregates) {
    const beforeJson = JSON.stringify(before[aggregate]);
    const afterJson = JSON.stringify(after[aggregate]);
    if (beforeJson !== afterJson) {
      changed.push(aggregate);
    }
  }

  // Check optional aggregates
  if (!before.entertainment && after.entertainment) added.push('entertainment');
  if (before.entertainment && !after.entertainment) removed.push('entertainment');
  if (before.entertainment && after.entertainment) {
    if (JSON.stringify(before.entertainment) !== JSON.stringify(after.entertainment)) {
      changed.push('entertainment');
    }
  }

  if (!before.intelligence && after.intelligence) added.push('intelligence');
  if (before.intelligence && !after.intelligence) removed.push('intelligence');
  if (before.intelligence && after.intelligence) {
    if (JSON.stringify(before.intelligence) !== JSON.stringify(after.intelligence)) {
      changed.push('intelligence');
    }
  }

  return { changed, added, removed };
}
