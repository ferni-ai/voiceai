/**
 * Profile Builder
 *
 * Builds and maintains user memory profiles based on tracked responses.
 * These profiles inform timing and phrasing decisions.
 *
 * @module intelligence/memory-intelligence/learning/profile-builder
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { UserMemoryProfile, TrustLevel, PhrasingStyle, UserResponseType } from '../types.js';
import type { SurfacedMemoryRecord } from './response-tracker.js';

const log = createLogger({ module: 'ProfileBuilder' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Raw data used to build profiles
 */
export interface ProfileBuildData {
  /** User ID */
  userId: string;

  /** Session records to process */
  sessionRecords: SurfacedMemoryRecord[];

  /** Existing profile (for incremental updates) */
  existingProfile?: UserMemoryProfile;
}

/**
 * Profile build result
 */
export interface ProfileBuildResult {
  /** The built/updated profile */
  profile: UserMemoryProfile;

  /** Changes from previous profile */
  changes: ProfileChange[];

  /** Confidence in the profile */
  confidence: number;
}

/**
 * A change in the profile
 */
export interface ProfileChange {
  field: string;
  previousValue: unknown;
  newValue: unknown;
  reason: string;
}

// ============================================================================
// PROFILE BUILDER
// ============================================================================

/**
 * Profile Builder
 *
 * Builds user memory profiles from response data.
 */
export class ProfileBuilder {
  private profiles: Map<string, UserMemoryProfile> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    log.debug('ProfileBuilder initialized');
  }

  /**
   * Load profile from Firestore with in-memory cache
   */
  private async loadProfileFromStorage(userId: string): Promise<UserMemoryProfile | null> {
    // Check in-memory cache first
    const cached = this.profiles.get(userId);
    if (cached) return cached;

    // Load from Firestore
    try {
      const { loadProfile } = await import('./persistence.js');
      const profile = await loadProfile(userId);
      if (profile) {
        this.profiles.set(userId, profile);
        log.debug({ userId }, 'Loaded profile from Firestore');
      }
      return profile;
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to load profile from Firestore');
      return null;
    }
  }

  /**
   * Save profile to Firestore
   */
  private async saveProfileToStorage(profile: UserMemoryProfile): Promise<void> {
    try {
      const { saveProfile } = await import('./persistence.js');
      await saveProfile(profile);
      log.debug({ userId: profile.userId }, 'Saved profile to Firestore');
    } catch (error) {
      log.warn({ error: String(error), userId: profile.userId }, 'Failed to save profile to Firestore');
    }
  }

  /**
   * Build or update a user profile
   */
  async buildProfile(data: ProfileBuildData): Promise<ProfileBuildResult> {
    const { userId, sessionRecords, existingProfile } = data;
    const changes: ProfileChange[] = [];

    // Start with existing profile or create new
    const profile: UserMemoryProfile = existingProfile
      ? { ...existingProfile }
      : this.createEmptyProfile(userId);

    // Process each record
    for (const record of sessionRecords) {
      if (record.response) {
        this.updateFromResponse(profile, record, changes);
      }
    }

    // Update aggregate stats
    this.updateAggregateStats(profile, sessionRecords);

    // Update timestamp
    profile.lastUpdated = new Date();

    // Calculate trust level
    const newTrustLevel = this.calculateTrustLevel(profile);
    if (newTrustLevel !== profile.trustLevel) {
      changes.push({
        field: 'trustLevel',
        previousValue: profile.trustLevel,
        newValue: newTrustLevel,
        reason: 'Updated based on engagement patterns',
      });
      profile.trustLevel = newTrustLevel;
    }

    // Store profile in memory
    this.profiles.set(userId, profile);

    // Calculate confidence
    const confidence = this.calculateConfidence(profile);

    // Persist to Firestore (non-blocking)
    this.saveProfileToStorage(profile).catch((error) => {
      log.warn({ error: String(error), userId }, 'Background profile save failed');
    });

    log.debug({
      userId,
      recordsProcessed: sessionRecords.length,
      changes: changes.length,
      confidence,
    }, 'Profile built');

    return { profile, changes, confidence };
  }

  /**
   * Get a user's profile (loads from Firestore if not in memory)
   */
  async getProfile(userId: string): Promise<UserMemoryProfile | null> {
    // Check in-memory first
    const cached = this.profiles.get(userId);
    if (cached) return cached;

    // Load from Firestore
    return this.loadProfileFromStorage(userId);
  }

  /**
   * Create an empty profile
   */
  private createEmptyProfile(userId: string): UserMemoryProfile {
    return {
      userId,
      lastUpdated: new Date(),
      receptivityPatterns: {
        byTimeOfDay: new Map(),
        byConversationDepth: new Map(),
        byEmotionalState: new Map(),
      },
      responsePatterns: {
        topicsWelcomed: [],
        topicsDeflected: [],
        preferredPhrasingStyle: 'warm_recall',
        averageEngagement: 0.5,
      },
      sensitiveTopics: new Set(),
      idealRecallFrequency: 2,
      trustLevel: 'new',
      totalMemoriesSurfaced: 0,
      engagementRate: 0.5,
    };
  }

  /**
   * Update profile from a single response
   */
  private updateFromResponse(
    profile: UserMemoryProfile,
    record: SurfacedMemoryRecord,
    changes: ProfileChange[]
  ): void {
    const response = record.response!;

    // Update time of day pattern
    const hour = record.surfacedAt.getHours();
    const currentTimeReceptivity = profile.receptivityPatterns.byTimeOfDay.get(hour) || 0.5;
    const newTimeReceptivity = this.updateReceptivity(currentTimeReceptivity, response.type);
    profile.receptivityPatterns.byTimeOfDay.set(hour, newTimeReceptivity);

    // Update conversation depth pattern
    const depthBucket = this.getDepthBucket(record.contextSnapshot.turnCount);
    const currentDepthReceptivity = profile.receptivityPatterns.byConversationDepth.get(depthBucket) || 0.5;
    const newDepthReceptivity = this.updateReceptivity(currentDepthReceptivity, response.type);
    profile.receptivityPatterns.byConversationDepth.set(depthBucket, newDepthReceptivity);

    // Track topics based on response
    for (const topic of record.contextSnapshot.topics) {
      if (response.type === 'deflected' || response.type === 'emotional_negative') {
        if (!profile.responsePatterns.topicsDeflected.includes(topic)) {
          profile.responsePatterns.topicsDeflected.push(topic);
          changes.push({
            field: 'topicsDeflected',
            previousValue: null,
            newValue: topic,
            reason: `User deflected from topic: ${response.type}`,
          });
        }
        // Check if it's sensitive
        if (response.type === 'emotional_negative' && !profile.sensitiveTopics.has(topic)) {
          profile.sensitiveTopics.add(topic);
        }
      } else if (response.type === 'engaged' || response.type === 'requested_more') {
        if (!profile.responsePatterns.topicsWelcomed.includes(topic)) {
          profile.responsePatterns.topicsWelcomed.push(topic);
        }
        // Remove from deflected if previously added
        profile.responsePatterns.topicsDeflected = profile.responsePatterns.topicsDeflected.filter(
          (t) => t !== topic
        );
      }
    }

    // Track phrasing style preference
    if (response.type === 'engaged' || response.type === 'emotional_positive') {
      // Could track which style worked best
    }

    // Increment total
    profile.totalMemoriesSurfaced++;
  }

  /**
   * Update receptivity score based on response
   */
  private updateReceptivity(current: number, responseType: UserResponseType): number {
    const adjustments: Record<UserResponseType, number> = {
      engaged: 0.1,
      acknowledged: 0.02,
      deflected: -0.1,
      emotional_positive: 0.15,
      emotional_negative: -0.15,
      corrected: -0.05,
      ignored: -0.08,
      requested_more: 0.2,
    };

    const adjustment = adjustments[responseType] || 0;
    return Math.max(0, Math.min(1, current + adjustment));
  }

  /**
   * Get depth bucket for turn count
   */
  private getDepthBucket(turnCount: number): string {
    if (turnCount <= 3) return 'shallow';
    if (turnCount <= 7) return 'early';
    if (turnCount <= 15) return 'middle';
    if (turnCount <= 30) return 'deep';
    return 'extended';
  }

  /**
   * Update aggregate statistics
   */
  private updateAggregateStats(profile: UserMemoryProfile, records: SurfacedMemoryRecord[]): void {
    const withResponses = records.filter((r) => r.response);
    if (withResponses.length === 0) return;

    // Calculate engagement rate
    const engaged = withResponses.filter((r) =>
      ['engaged', 'emotional_positive', 'requested_more'].includes(r.response!.type)
    ).length;

    // Weighted average with existing rate
    const sessionEngagement = engaged / withResponses.length;
    const weight = Math.min(withResponses.length / 10, 0.5); // Cap at 50% weight for new data
    profile.engagementRate = profile.engagementRate * (1 - weight) + sessionEngagement * weight;

    // Update average engagement
    profile.responsePatterns.averageEngagement = profile.engagementRate;
  }

  /**
   * Calculate trust level from profile data
   */
  private calculateTrustLevel(profile: UserMemoryProfile): TrustLevel {
    const { totalMemoriesSurfaced, engagementRate } = profile;

    // Need some interaction history
    if (totalMemoriesSurfaced < 3) return 'new';

    // Check engagement
    if (totalMemoriesSurfaced >= 20 && engagementRate >= 0.7) return 'deep';
    if (totalMemoriesSurfaced >= 10 && engagementRate >= 0.5) return 'established';
    if (totalMemoriesSurfaced >= 5 && engagementRate >= 0.3) return 'developing';

    return 'new';
  }

  /**
   * Calculate confidence in the profile
   */
  private calculateConfidence(profile: UserMemoryProfile): number {
    let confidence = 0.3; // Base

    // More data = more confidence
    if (profile.totalMemoriesSurfaced >= 5) confidence += 0.2;
    if (profile.totalMemoriesSurfaced >= 10) confidence += 0.1;
    if (profile.totalMemoriesSurfaced >= 20) confidence += 0.1;

    // Patterns established = more confidence
    if (profile.receptivityPatterns.byTimeOfDay.size >= 5) confidence += 0.1;
    if (profile.responsePatterns.topicsWelcomed.length >= 3) confidence += 0.1;

    return Math.min(1.0, confidence);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let builderInstance: ProfileBuilder | null = null;

export function getProfileBuilder(): ProfileBuilder {
  if (!builderInstance) {
    builderInstance = new ProfileBuilder();
  }
  return builderInstance;
}

export function resetProfileBuilder(): void {
  builderInstance = null;
}
