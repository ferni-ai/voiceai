/**
 * User Trigger Profile Service
 *
 * Phase 2: Personal Memory Integration
 *
 * Stores and retrieves user trigger profiles that contain personal context
 * like significant dates, relationships, and communication patterns.
 * This is what makes triggers "Better than Human" - remembering
 * everything about the user with perfect recall.
 *
 * @module UserTriggerProfileService
 */

import { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import {
  UserTriggerProfile,
  SignificantDate,
  Relationship,
  CommunicationPatterns,
  TriggerEffectiveness,
  ProfileExtractionResult,
  ProfileContextBoost,
  PhrasePattern,
  TemporalPattern,
  DEFAULT_USER_TRIGGER_PROFILE,
} from './user-trigger-profile.types.js';

const log = createLogger({ module: 'user-trigger-profile-service' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface ProfileServiceConfig {
  /** TTL for cached profiles in milliseconds (default: 5 minutes) */
  cacheTtlMs: number;
  /** Maximum profiles to keep in cache (default: 100) */
  maxCacheSize: number;
  /** Firestore collection path (default: 'bogle_users') */
  userCollection: string;
  /** Sub-collection name (default: 'trigger_profile') */
  profileSubcollection: string;
  /** Enable Firestore persistence (default: true) */
  enablePersistence: boolean;
}

const DEFAULT_CONFIG: ProfileServiceConfig = {
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  maxCacheSize: 100,
  userCollection: 'bogle_users',
  profileSubcollection: 'trigger_profile',
  enablePersistence: true,
};

// ============================================================================
// CACHE TYPES
// ============================================================================

interface CacheEntry {
  profile: UserTriggerProfile;
  loadedAt: number;
  dirty: boolean;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class UserTriggerProfileService {
  private config: ProfileServiceConfig;
  private cache = new Map<string, CacheEntry>();
  private db: Firestore | null = null;
  private initialized = false;

  constructor(config: Partial<ProfileServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  private ensureDb(): Firestore | null {
    if (this.initialized) {
      return this.db;
    }

    try {
      if (this.config.enablePersistence) {
        this.db = new Firestore();
        log.debug('Trigger profile Firestore initialized');
      }
    } catch (error) {
      log.warn({ error: String(error) }, 'Firestore not available for trigger profiles');
    }

    this.initialized = true;
    return this.db;
  }

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  /**
   * Load a user's trigger profile
   */
  async loadProfile(userId: string): Promise<UserTriggerProfile> {
    // Check cache first
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.loadedAt < this.config.cacheTtlMs) {
      log.debug({ userId }, 'Profile loaded from cache');
      return cached.profile;
    }

    // Load from Firestore
    const db = this.ensureDb();
    if (!db) {
      return this.getOrCreateDefault(userId);
    }

    try {
      const doc = await db
        .collection(this.config.userCollection)
        .doc(userId)
        .collection(this.config.profileSubcollection)
        .doc('profile')
        .get();

      if (!doc.exists) {
        log.debug({ userId }, 'No profile found, creating default');
        return this.getOrCreateDefault(userId);
      }

      const data = doc.data() as UserTriggerProfile;
      const profile = this.hydrateProfile(data);

      this.cacheProfile(userId, profile);
      log.info({ userId, conversationsAnalyzed: profile.conversationsAnalyzed }, 'Profile loaded');

      return profile;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to load profile');
      return this.getOrCreateDefault(userId);
    }
  }

  /**
   * Save a user's trigger profile
   */
  async saveProfile(userId: string, profile: UserTriggerProfile): Promise<boolean> {
    const db = this.ensureDb();

    // Update timestamps
    const updatedProfile: UserTriggerProfile = {
      ...profile,
      updatedAt: new Date(),
    };

    // Update cache
    this.cacheProfile(userId, updatedProfile);

    if (!db) {
      log.debug({ userId }, 'Profile cached locally (no Firestore)');
      return true;
    }

    try {
      const serialized = this.serializeProfile(updatedProfile);

      await db
        .collection(this.config.userCollection)
        .doc(userId)
        .collection(this.config.profileSubcollection)
        .doc('profile')
        .set(serialized, { merge: true });

      log.info(
        {
          userId,
          dates: profile.significantDates.length,
          relationships: profile.relationships.length,
        },
        'Profile saved'
      );

      return true;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to save profile');
      return false;
    }
  }

  /**
   * Delete a user's trigger profile
   */
  async deleteProfile(userId: string): Promise<boolean> {
    this.cache.delete(userId);

    const db = this.ensureDb();
    if (!db) {
      return true;
    }

    try {
      await db
        .collection(this.config.userCollection)
        .doc(userId)
        .collection(this.config.profileSubcollection)
        .doc('profile')
        .delete();

      log.info({ userId }, 'Profile deleted');
      return true;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to delete profile');
      return false;
    }
  }

  // ==========================================================================
  // PARTIAL UPDATES
  // ==========================================================================

  /**
   * Add a significant date to the profile
   */
  async addSignificantDate(userId: string, date: SignificantDate): Promise<boolean> {
    const profile = await this.loadProfile(userId);

    // Check for duplicates (same date, type, and person)
    const existing = profile.significantDates.find(
      (d) =>
        d.date === date.date && d.type === date.type && d.relatedPerson === date.relatedPerson
    );

    if (existing) {
      // Update existing if new has higher confidence
      if (date.confidence > existing.confidence) {
        const idx = profile.significantDates.indexOf(existing);
        profile.significantDates[idx] = { ...existing, ...date };
      }
    } else {
      profile.significantDates.push(date);
    }

    return this.saveProfile(userId, profile);
  }

  /**
   * Add or update a relationship
   */
  async addRelationship(userId: string, relationship: Relationship): Promise<boolean> {
    const profile = await this.loadProfile(userId);

    // Check for existing by name or aliases
    const existing = profile.relationships.find(
      (r) =>
        r.name.toLowerCase() === relationship.name.toLowerCase() ||
        r.aliases.some((a) => a.toLowerCase() === relationship.name.toLowerCase()) ||
        relationship.aliases.some((a) => a.toLowerCase() === r.name.toLowerCase())
    );

    if (existing) {
      // Merge relationships
      const idx = profile.relationships.indexOf(existing);
      profile.relationships[idx] = this.mergeRelationship(existing, relationship);
    } else {
      profile.relationships.push(relationship);
    }

    return this.saveProfile(userId, profile);
  }

  /**
   * Update communication patterns
   */
  async updateCommunicationPatterns(
    userId: string,
    patterns: Partial<CommunicationPatterns>
  ): Promise<boolean> {
    const profile = await this.loadProfile(userId);

    // Merge patterns
    profile.communicationPatterns = this.mergePatterns(profile.communicationPatterns, patterns);

    return this.saveProfile(userId, profile);
  }

  /**
   * Record trigger effectiveness
   */
  async recordTriggerEffectiveness(
    userId: string,
    triggerName: string,
    outcome: 'positive' | 'negative' | 'neutral' | 'appreciated'
  ): Promise<boolean> {
    const profile = await this.loadProfile(userId);

    let record = profile.triggerEffectiveness.find((t) => t.triggerName === triggerName);

    if (!record) {
      record = {
        triggerName,
        timesFired: 0,
        positiveEngagements: 0,
        negativeEngagements: 0,
        explicitAppreciation: 0,
        effectivenessScore: 0.5,
        effectiveContexts: [],
        ineffectiveContexts: [],
      };
      profile.triggerEffectiveness.push(record);
    }

    // Update counts
    record.timesFired += 1;
    record.lastUsed = new Date();

    switch (outcome) {
      case 'positive':
        record.positiveEngagements += 1;
        break;
      case 'negative':
        record.negativeEngagements += 1;
        break;
      case 'appreciated':
        record.explicitAppreciation += 1;
        record.positiveEngagements += 1;
        break;
    }

    // Recalculate effectiveness score
    const total = record.positiveEngagements + record.negativeEngagements;
    if (total > 0) {
      // Weight appreciations higher
      const weighted = record.positiveEngagements + record.explicitAppreciation * 0.5;
      record.effectivenessScore = Math.min(1, weighted / total);
    }

    return this.saveProfile(userId, profile);
  }

  // ==========================================================================
  // PROFILE MERGING
  // ==========================================================================

  /**
   * Merge extraction results into an existing profile
   */
  async mergeExtractionResult(
    userId: string,
    extraction: ProfileExtractionResult
  ): Promise<boolean> {
    const profile = await this.loadProfile(userId);

    // Merge significant dates
    for (const date of extraction.significantDates) {
      const existing = profile.significantDates.find(
        (d) =>
          d.date === date.date && d.type === date.type && d.relatedPerson === date.relatedPerson
      );

      if (existing) {
        if (date.confidence > existing.confidence) {
          const idx = profile.significantDates.indexOf(existing);
          profile.significantDates[idx] = { ...existing, ...date };
        }
      } else {
        profile.significantDates.push(date);
      }
    }

    // Merge relationships
    for (const relationship of extraction.relationships) {
      const existing = profile.relationships.find(
        (r) =>
          r.name.toLowerCase() === relationship.name.toLowerCase() ||
          r.aliases.some((a) => relationship.aliases.includes(a))
      );

      if (existing) {
        const idx = profile.relationships.indexOf(existing);
        profile.relationships[idx] = this.mergeRelationship(existing, relationship);
      } else {
        profile.relationships.push(relationship);
      }
    }

    // Merge pattern updates
    if (extraction.patternUpdates.deflectionPhrases.length > 0) {
      profile.communicationPatterns.deflectionPhrases = this.mergePhraseLists(
        profile.communicationPatterns.deflectionPhrases,
        extraction.patternUpdates.deflectionPhrases
      );
    }

    if (extraction.patternUpdates.vulnerabilitySignals.length > 0) {
      profile.communicationPatterns.vulnerabilitySignals = this.mergePhraseLists(
        profile.communicationPatterns.vulnerabilitySignals,
        extraction.patternUpdates.vulnerabilitySignals
      );
    }

    if (extraction.patternUpdates.sensitiveTopics.length > 0) {
      profile.communicationPatterns.sensitiveTopics = this.mergeSensitiveTopics(
        profile.communicationPatterns.sensitiveTopics,
        extraction.patternUpdates.sensitiveTopics
      );
    }

    // Increment conversation count
    profile.conversationsAnalyzed += 1;

    // Update profile confidence based on data richness
    profile.profileConfidence = this.calculateProfileConfidence(profile);

    return this.saveProfile(userId, profile);
  }

  // ==========================================================================
  // CONTEXT BOOST GENERATION
  // ==========================================================================

  /**
   * Generate trigger context boosts based on profile
   */
  async generateContextBoost(userId: string, context?: { date?: Date }): Promise<ProfileContextBoost> {
    const profile = await this.loadProfile(userId);
    const now = context?.date || new Date();

    const boost: ProfileContextBoost = {
      triggersToBoost: [],
      triggersToSuppress: [],
      contextInjections: [],
    };

    // Check for significant dates approaching
    for (const date of profile.significantDates) {
      const daysUntil = this.getDaysUntilDate(date, now);

      if (daysUntil >= 0 && daysUntil <= 7) {
        // Date is within the next week
        boost.contextInjections.push({
          type: 'date',
          content: this.formatDateContext(date, daysUntil),
        });

        // Boost related trigger categories
        for (const category of date.triggerCategories) {
          boost.triggersToBoost.push({
            triggerName: category,
            boostAmount: Math.min(0.3, date.emotionalWeight * 0.5),
            reason: `${date.type} ${date.description} ${daysUntil === 0 ? 'is today' : `in ${daysUntil} days`}`,
          });
        }
      }
    }

    // Add relationship context for high-valence relationships recently mentioned
    const recentlyMentioned = profile.relationships.filter(
      (r) => r.lastMentioned && Date.now() - r.lastMentioned.getTime() < 24 * 60 * 60 * 1000
    );

    for (const rel of recentlyMentioned) {
      boost.contextInjections.push({
        type: 'relationship',
        content: this.formatRelationshipContext(rel),
      });

      // Boost related triggers
      for (const category of rel.triggerCategories) {
        boost.triggersToBoost.push({
          triggerName: category,
          boostAmount: 0.2,
          reason: `Recently discussed ${rel.name}`,
        });
      }
    }

    // Suppress triggers the user has reacted poorly to
    const ineffective = profile.triggerEffectiveness.filter((t) => t.effectivenessScore < 0.3);
    for (const record of ineffective) {
      boost.triggersToSuppress.push({
        triggerName: record.triggerName,
        suppressAmount: 1 - record.effectivenessScore,
        reason: `Low effectiveness (${(record.effectivenessScore * 100).toFixed(0)}%)`,
      });
    }

    // Add sensitive topic warnings
    for (const topic of profile.communicationPatterns.sensitiveTopics) {
      if (topic.explicitlyAvoided || topic.sensitivity > 0.8) {
        boost.contextInjections.push({
          type: 'pattern',
          content: `⚠️ Sensitive topic: ${topic.topic} (approach: ${topic.recommendedApproach})`,
        });
      }
    }

    return boost;
  }

  // ==========================================================================
  // CACHE MANAGEMENT
  // ==========================================================================

  private cacheProfile(userId: string, profile: UserTriggerProfile): void {
    // Evict if cache is full
    if (this.cache.size >= this.config.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(userId, {
      profile,
      loadedAt: Date.now(),
      dirty: false,
    });
  }

  /**
   * Clear cache for a user
   */
  clearCache(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Clear entire cache
   */
  clearAllCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private getOrCreateDefault(userId: string): UserTriggerProfile {
    const cached = this.cache.get(userId);
    if (cached) {
      return cached.profile;
    }

    const profile: UserTriggerProfile = {
      ...DEFAULT_USER_TRIGGER_PROFILE,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.cacheProfile(userId, profile);
    return profile;
  }

  private hydrateProfile(data: UserTriggerProfile): UserTriggerProfile {
    // Convert Firestore timestamps to Dates
    return {
      ...data,
      createdAt: this.toDate(data.createdAt),
      updatedAt: this.toDate(data.updatedAt),
      significantDates: data.significantDates.map((d) => ({
        ...d,
        extractedAt: this.toDate(d.extractedAt),
      })),
      relationships: data.relationships.map((r) => ({
        ...r,
        extractedAt: this.toDate(r.extractedAt),
        lastMentioned: r.lastMentioned ? this.toDate(r.lastMentioned) : undefined,
      })),
      triggerEffectiveness: data.triggerEffectiveness.map((t) => ({
        ...t,
        lastUsed: t.lastUsed ? this.toDate(t.lastUsed) : undefined,
      })),
    };
  }

  private serializeProfile(profile: UserTriggerProfile): Record<string, unknown> {
    // Convert Dates to ISO strings for Firestore
    return {
      ...profile,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      significantDates: profile.significantDates.map((d) => ({
        ...d,
        extractedAt: d.extractedAt.toISOString(),
      })),
      relationships: profile.relationships.map((r) => ({
        ...r,
        extractedAt: r.extractedAt.toISOString(),
        lastMentioned: r.lastMentioned?.toISOString(),
      })),
      triggerEffectiveness: profile.triggerEffectiveness.map((t) => ({
        ...t,
        lastUsed: t.lastUsed?.toISOString(),
      })),
    };
  }

  private toDate(value: Date | string | { toDate?: () => Date }): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'string') return new Date(value);
    if (value && typeof value.toDate === 'function') return value.toDate();
    return new Date();
  }

  private mergeRelationship(existing: Relationship, updated: Relationship): Relationship {
    return {
      ...existing,
      // Merge aliases
      aliases: [...new Set([...existing.aliases, ...updated.aliases])],
      // Take higher confidence updates
      emotionalValence:
        updated.confidence > existing.confidence ? updated.emotionalValence : existing.emotionalValence,
      isDeceased: updated.isDeceased || existing.isDeceased,
      // Merge trigger categories
      triggerCategories: [...new Set([...existing.triggerCategories, ...updated.triggerCategories])],
      // Update mention tracking
      mentionFrequency:
        (existing.mentionFrequency * existing.confidence + updated.mentionFrequency * updated.confidence) /
        (existing.confidence + updated.confidence),
      lastMentioned: updated.lastMentioned || existing.lastMentioned,
      // Merge associated topics
      associatedTopics: [...new Set([...existing.associatedTopics, ...updated.associatedTopics])],
      // Update confidence
      confidence: Math.max(existing.confidence, updated.confidence),
    };
  }

  private mergePatterns(
    existing: CommunicationPatterns,
    updates: Partial<CommunicationPatterns>
  ): CommunicationPatterns {
    return {
      phrasePatterns: updates.phrasePatterns
        ? this.mergePhraseLists(existing.phrasePatterns, updates.phrasePatterns)
        : existing.phrasePatterns,
      deflectionPhrases: updates.deflectionPhrases
        ? this.mergePhraseLists(existing.deflectionPhrases, updates.deflectionPhrases)
        : existing.deflectionPhrases,
      vulnerabilitySignals: updates.vulnerabilitySignals
        ? this.mergePhraseLists(existing.vulnerabilitySignals, updates.vulnerabilitySignals)
        : existing.vulnerabilitySignals,
      sensitiveTopics: updates.sensitiveTopics
        ? this.mergeSensitiveTopics(existing.sensitiveTopics, updates.sensitiveTopics)
        : existing.sensitiveTopics,
      temporalPatterns: updates.temporalPatterns
        ? this.mergeTemporalPatterns(existing.temporalPatterns, updates.temporalPatterns)
        : existing.temporalPatterns,
      communicationStyle: updates.communicationStyle || existing.communicationStyle,
    };
  }

  private mergePhraseLists(
    existing: PhrasePattern[] | undefined,
    updates: PhrasePattern[]
  ): PhrasePattern[] {
    const merged = [...(existing || [])];

    for (const update of updates) {
      // Support both old format (pattern) and new format (phrase)
      const matchKey = update.phrase || update.pattern || '';
      const idx = merged.findIndex((p) => (p.phrase || p.pattern) === matchKey);
      if (idx >= 0) {
        merged[idx] = {
          ...merged[idx],
          ...update,
          frequency: (merged[idx].frequency || 0) + (update.frequency || 1),
          observationCount: (merged[idx].observationCount || 0) + (update.observationCount || 1),
        };
      } else {
        merged.push(update);
      }
    }

    return merged;
  }

  private mergeSensitiveTopics<T extends { topic: string; sensitivity: number }>(
    existing: T[],
    updates: T[]
  ): T[] {
    const merged = [...existing];

    for (const update of updates) {
      const idx = merged.findIndex((t) => t.topic === update.topic);
      if (idx >= 0) {
        merged[idx] = {
          ...merged[idx],
          ...update,
          // Take higher sensitivity
          sensitivity: Math.max(merged[idx].sensitivity, update.sensitivity),
        };
      } else {
        merged.push(update);
      }
    }

    return merged;
  }

  private mergeTemporalPatterns(
    existing: TemporalPattern[],
    updates: TemporalPattern[]
  ): TemporalPattern[] {
    const merged = [...existing];

    for (const update of updates) {
      // Match on timeOfDay (new format) or type+value (legacy format)
      const idx = merged.findIndex(
        (p) =>
          p.timeOfDay === update.timeOfDay ||
          (p.type && p.value && p.type === update.type && p.value === update.value)
      );
      if (idx >= 0) {
        merged[idx] = {
          ...merged[idx],
          ...update,
          frequency: (merged[idx].frequency || 0) + (update.frequency || 1),
        };
      } else {
        merged.push(update);
      }
    }

    return merged;
  }

  private calculateProfileConfidence(profile: UserTriggerProfile): number {
    // Base confidence from conversations analyzed
    let confidence = Math.min(0.3, profile.conversationsAnalyzed * 0.05);

    // Add for significant dates (high value data)
    confidence += Math.min(0.2, profile.significantDates.length * 0.05);

    // Add for relationships
    confidence += Math.min(0.2, profile.relationships.length * 0.03);

    // Add for communication patterns
    const patternCount =
      (profile.communicationPatterns.deflectionPhrases?.length || 0) +
      (profile.communicationPatterns.vulnerabilitySignals?.length || 0) +
      (profile.communicationPatterns.phrasePatterns?.length || 0);
    confidence += Math.min(0.2, patternCount * 0.02);

    // Add for trigger effectiveness data
    confidence += Math.min(0.1, profile.triggerEffectiveness.length * 0.01);

    return Math.min(1, confidence);
  }

  private getDaysUntilDate(date: SignificantDate, now: Date): number {
    if (!date.isRecurring) {
      const target = new Date(date.date);
      return Math.floor((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    }

    // For recurring dates, find the next occurrence
    const [, month, day] = date.date.split('-').map(Number);
    const thisYear = new Date(now.getFullYear(), month - 1, day);
    const nextYear = new Date(now.getFullYear() + 1, month - 1, day);

    const target = thisYear >= now ? thisYear : nextYear;
    return Math.floor((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  }

  private formatDateContext(date: SignificantDate, daysUntil: number): string {
    const timing =
      daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;

    let context = `📅 ${date.type}: ${date.description} is ${timing}`;

    if (date.relatedPerson) {
      context += ` (related to ${date.relatedPerson})`;
    }

    if (date.emotionalWeight > 0.7) {
      context += ' ⚠️ high emotional significance';
    }

    return context;
  }

  private formatRelationshipContext(rel: Relationship): string {
    let context = `👤 ${rel.name} (${rel.role || rel.type})`;

    if (rel.isDeceased) {
      context += ' [deceased]';
    }

    if (rel.emotionalValence === 'very_positive' || rel.emotionalValence === 'very_negative') {
      context += ` - ${rel.emotionalValence.replace('_', ' ')} relationship`;
    }

    if (rel.associatedTopics.length > 0) {
      context += ` - often discusses: ${rel.associatedTopics.slice(0, 3).join(', ')}`;
    }

    return context;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: UserTriggerProfileService | null = null;

/**
 * Get the singleton instance
 */
export function getUserTriggerProfileService(
  config?: Partial<ProfileServiceConfig>
): UserTriggerProfileService {
  if (!instance) {
    instance = new UserTriggerProfileService(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetUserTriggerProfileService(): void {
  if (instance) {
    instance.clearAllCache();
  }
  instance = null;
}
