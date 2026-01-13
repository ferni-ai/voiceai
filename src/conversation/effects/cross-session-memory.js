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
// MEMORY MANAGER
// ============================================================================
class CrossSessionEffectMemory {
    profiles = new Map();
    /**
     * Get or create user effect profile
     */
    getProfile(userId, personaId) {
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
    recordEffectApplied(userId, personaId, effectId) {
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
    recordEffectResponse(userId, personaId, response) {
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
        }
        else if (engagement === 'negative') {
            effect.negativeEngagements++;
            // Add to disliked if consistently negative
            const negRatio = effect.negativeEngagements / Math.max(effect.appliedCount, 1);
            if (negRatio > 0.4 && effect.negativeEngagements >= 2) {
                if (!profile.dislikedEffects.includes(effectId)) {
                    profile.dislikedEffects.push(effectId);
                    // Remove from preferred if it was there
                    profile.preferredEffects = profile.preferredEffects.filter((e) => e !== effectId);
                    log.info({ userId, effectId }, 'Effect added to disliked list');
                }
            }
        }
        profile.lastUpdated = new Date();
    }
    /**
     * Check if an effect should be skipped for this user
     */
    shouldSkipEffect(userId, personaId, effectId) {
        const profile = this.getProfile(userId, personaId);
        return profile.dislikedEffects.includes(effectId);
    }
    /**
     * Get probability modifier for an effect based on user history
     */
    getEffectProbabilityModifier(userId, personaId, effectId) {
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
    getHumanizationPreference(userId, personaId) {
        return this.getProfile(userId, personaId).humanizationPreference;
    }
    /**
     * Update user's overall humanization preference
     */
    setHumanizationPreference(userId, personaId, preference) {
        const profile = this.getProfile(userId, personaId);
        profile.humanizationPreference = Math.max(0, Math.min(1, preference));
        profile.lastUpdated = new Date();
    }
    /**
     * Get recommended effects for a user (based on positive history)
     */
    getRecommendedEffects(userId, personaId) {
        const profile = this.getProfile(userId, personaId);
        return [...profile.preferredEffects];
    }
    /**
     * Export profile for persistence (Firestore)
     */
    exportProfile(userId, personaId) {
        return { ...this.getProfile(userId, personaId) };
    }
    /**
     * Import profile from persistence
     */
    importProfile(profile) {
        const key = `${profile.userId}:${profile.personaId}`;
        this.profiles.set(key, profile);
    }
    /**
     * Clear all profiles (for testing)
     */
    clear() {
        this.profiles.clear();
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let memory = null;
export function getEffectMemory() {
    if (!memory) {
        memory = new CrossSessionEffectMemory();
    }
    return memory;
}
export function resetEffectMemory() {
    if (memory) {
        memory.clear();
    }
    memory = null;
}
// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================
export const effectMemory = {
    recordApplied: (userId, personaId, effectId) => getEffectMemory().recordEffectApplied(userId, personaId, effectId),
    recordResponse: (userId, personaId, response) => getEffectMemory().recordEffectResponse(userId, personaId, response),
    shouldSkip: (userId, personaId, effectId) => getEffectMemory().shouldSkipEffect(userId, personaId, effectId),
    getProbabilityModifier: (userId, personaId, effectId) => getEffectMemory().getEffectProbabilityModifier(userId, personaId, effectId),
    getRecommended: (userId, personaId) => getEffectMemory().getRecommendedEffects(userId, personaId),
    getPreference: (userId, personaId) => getEffectMemory().getHumanizationPreference(userId, personaId),
    setPreference: (userId, personaId, preference) => getEffectMemory().setHumanizationPreference(userId, personaId, preference),
};
//# sourceMappingURL=cross-session-memory.js.map