/**
 * Cross-Session Effect Memory
 *
 * Remembers which effects resonated with a user across sessions.
 * Allows personalization of humanization based on historical engagement.
 *
 * @module @ferni/conversation/effects/cross-session-memory
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'EffectMemory' });

// ============================================================================
// TYPES
// ============================================================================

export interface EffectEngagement {
  effectId: string;
  /** Times this effect was applied */
  appliedCount: number;
  /** Times user engaged positively after this effect */
  positiveEngagements: number;
  /** Times user engaged negatively after this effect */
  negativeEngagements: number;
  /** Last time this effect was used */
  lastUsed: Date;
  /** Sessions where this effect appeared */
  sessionsUsed: number;
}

export interface UserEffectProfile {
  userId: string;
  personaId: string;
  /** Effects and their engagement history */
  effects: Record<string, EffectEngagement>;
  /** Effects the user explicitly disliked */
  dislikedEffects: string[];
  /** Effects that work well for this user */
  preferredEffects: string[];
  /** Overall humanization preference (0=minimal, 1=maximum) */
  humanizationPreference: number;
  /** Last updated timestamp */
  lastUpdated: Date;
}

export interface EffectResponse {
  effectId: string;
  engagement: 'positive' | 'negative' | 'neutral';
  /** Optional: specific signal (e.g., "laughter", "topic_change") */
  signal?: string;
}

// ============================================================================
// MEMORY MANAGER
// ============================================================================

class CrossSessionEffectMemory {
  private profiles: Map<string, UserEffectProfile> = new Map();

  /**
   * Get or create user effect profile
   */
  getProfile(userId: string, personaId: string): UserEffectProfile {
    const key = `${userId}:${personaId}`;
    let profile = this.profiles.get(key);

    if (!profile) {
      profile = {
        userId,
        personaId,
        effects: {},
        dislikedEffects: [],
        preferredEffects: [],
        humanizationPreference: 0.7, // Default: 70% humanization
        lastUpdated: new Date(),
      };
      this.profiles.set(key, profile);
    }

    return profile;
  }

  /**
   * Record that an effect was applied
   */
  recordEffectApplied(userId: string, personaId: string, effectId: string): void {
    const profile = this.getProfile(userId, personaId);

    if (!profile.effects[effectId]) {
      profile.effects[effectId] = {
        effectId,
        appliedCount: 0,
        positiveEngagements: 0,
        negativeEngagements: 0,
        lastUsed: new Date(),
        sessionsUsed: 1,
      };
    }

    profile.effects[effectId].appliedCount++;
    profile.effects[effectId].lastUsed = new Date();
    profile.lastUpdated = new Date();

    log.debug({ userId, effectId }, 'Effect applied recorded');
  }

  /**
   * Record user's response to an effect
   */
  recordEffectResponse(
    userId: string,
    personaId: string,
    response: EffectResponse
  ): void {
    const profile = this.getProfile(userId, personaId);
    const { effectId, engagement, signal } = response;

    if (!profile.effects[effectId]) {
      // Effect wasn't tracked, create entry
      profile.effects[effectId] = {
        effectId,
        appliedCount: 1,
        positiveEngagements: 0,
        negativeEngagements: 0,
        lastUsed: new Date(),
        sessionsUsed: 1,
      };
    }

    const effect = profile.effects[effectId];

    if (engagement === 'positive') {
      effect.positiveEngagements++;

      // Add to preferred if consistently positive
      const ratio = effect.positiveEngagements / Math.max(effect.appliedCount, 1);
      if (ratio > 0.6 && effect.appliedCount >= 3) {
        if (!profile.preferredEffects.includes(effectId)) {
          profile.preferredEffects.push(effectId);
          log.info({ userId, effectId }, 'Effect added to preferred list');
        }
      }
    } else if (engagement === 'negative') {
      effect.negativeEngagements++;

      // Add to disliked if consistently negative
      const negRatio = effect.negativeEngagements / Math.max(effect.appliedCount, 1);
      if (negRatio > 0.4 && effect.negativeEngagements >= 2) {
        if (!profile.dislikedEffects.includes(effectId)) {
          profile.dislikedEffects.push(effectId);
          // Remove from preferred if it was there
          profile.preferredEffects = profile.preferredEffects.filter(
            (e) => e !== effectId
          );
          log.info({ userId, effectId }, 'Effect added to disliked list');
        }
      }
    }

    profile.lastUpdated = new Date();
  }

  /**
   * Check if an effect should be skipped for this user
   */
  shouldSkipEffect(userId: string, personaId: string, effectId: string): boolean {
    const profile = this.getProfile(userId, personaId);
    return profile.dislikedEffects.includes(effectId);
  }

  /**
   * Get probability modifier for an effect based on user history
   */
  getEffectProbabilityModifier(
    userId: string,
    personaId: string,
    effectId: string
  ): number {
    const profile = this.getProfile(userId, personaId);

    // Disliked effects get 0 modifier (skip)
    if (profile.dislikedEffects.includes(effectId)) {
      return 0;
    }

    // Preferred effects get boost
    if (profile.preferredEffects.includes(effectId)) {
      return 1.3; // 30% boost
    }

    // Check engagement history
    const history = profile.effects[effectId];
    if (history && history.appliedCount >= 3) {
      const positiveRatio = history.positiveEngagements / history.appliedCount;
      // Scale: 0.8 (low engagement) to 1.2 (high engagement)
      return 0.8 + positiveRatio * 0.4;
    }

    return 1.0; // No modification
  }

  /**
   * Get user's humanization preference
   */
  getHumanizationPreference(userId: string, personaId: string): number {
    return this.getProfile(userId, personaId).humanizationPreference;
  }

  /**
   * Update user's overall humanization preference
   */
  setHumanizationPreference(
    userId: string,
    personaId: string,
    preference: number
  ): void {
    const profile = this.getProfile(userId, personaId);
    profile.humanizationPreference = Math.max(0, Math.min(1, preference));
    profile.lastUpdated = new Date();
  }

  /**
   * Get recommended effects for a user (based on positive history)
   */
  getRecommendedEffects(userId: string, personaId: string): string[] {
    const profile = this.getProfile(userId, personaId);
    return [...profile.preferredEffects];
  }

  /**
   * Export profile for persistence (Firestore)
   */
  exportProfile(userId: string, personaId: string): UserEffectProfile {
    return { ...this.getProfile(userId, personaId) };
  }

  /**
   * Import profile from persistence
   */
  importProfile(profile: UserEffectProfile): void {
    const key = `${profile.userId}:${profile.personaId}`;
    this.profiles.set(key, profile);
  }

  /**
   * Clear all profiles (for testing)
   */
  clear(): void {
    this.profiles.clear();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let memory: CrossSessionEffectMemory | null = null;

export function getEffectMemory(): CrossSessionEffectMemory {
  if (!memory) {
    memory = new CrossSessionEffectMemory();
  }
  return memory;
}

export function resetEffectMemory(): void {
  if (memory) {
    memory.clear();
  }
  memory = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const effectMemory = {
  recordApplied: (userId: string, personaId: string, effectId: string) =>
    getEffectMemory().recordEffectApplied(userId, personaId, effectId),

  recordResponse: (userId: string, personaId: string, response: EffectResponse) =>
    getEffectMemory().recordEffectResponse(userId, personaId, response),

  shouldSkip: (userId: string, personaId: string, effectId: string) =>
    getEffectMemory().shouldSkipEffect(userId, personaId, effectId),

  getProbabilityModifier: (userId: string, personaId: string, effectId: string) =>
    getEffectMemory().getEffectProbabilityModifier(userId, personaId, effectId),

  getRecommended: (userId: string, personaId: string) =>
    getEffectMemory().getRecommendedEffects(userId, personaId),

  getPreference: (userId: string, personaId: string) =>
    getEffectMemory().getHumanizationPreference(userId, personaId),

  setPreference: (userId: string, personaId: string, preference: number) =>
    getEffectMemory().setHumanizationPreference(userId, personaId, preference),
};

