/**
 * Music User Learning System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Learns what works for each individual user:
 * - Some users prefer silence after emotional moments
 * - Some users want acknowledgment to know Ferni is still there
 * - Some users respond better to topic callbacks
 *
 * This system tracks engagement patterns and adjusts transition preferences
 * on a per-user basis using Thompson Sampling (explore/exploit).
 *
 * Inspired by `src/services/trust-systems/outreach-timing-ml.ts`
 */
import { getLogger } from '../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// USER PROFILES STORAGE
// ============================================================================
/**
 * In-memory user profiles (would be backed by Firestore in production)
 */
const userProfiles = new Map();
// Default Thompson Sampling prior (slightly optimistic)
const DEFAULT_PRIOR = { alpha: 2, beta: 2 };
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Get or create a user's transition profile
 */
export function getUserProfile(userId) {
    let profile = userProfiles.get(userId);
    if (!profile) {
        profile = createDefaultProfile(userId);
        userProfiles.set(userId, profile);
    }
    return profile;
}
/**
 * Create a default profile for a new user
 */
function createDefaultProfile(userId) {
    const now = Date.now();
    return {
        userId,
        createdAt: now,
        updatedAt: now,
        totalTransitions: 0,
        transitionArms: {
            silence: { ...DEFAULT_PRIOR, pulls: 0 },
            presence: { ...DEFAULT_PRIOR, pulls: 0 },
            gentle_return: { ...DEFAULT_PRIOR, pulls: 0 },
            topic_callback: { ...DEFAULT_PRIOR, pulls: 0 },
            celebration_close: { ...DEFAULT_PRIOR, pulls: 0 },
            acknowledgment: { ...DEFAULT_PRIOR, pulls: 0 },
            check_in: { ...DEFAULT_PRIOR, pulls: 0 },
            invitation: { ...DEFAULT_PRIOR, pulls: 0 },
            persona_specific: { ...DEFAULT_PRIOR, pulls: 0 },
            dj_vibes: { ...DEFAULT_PRIOR, pulls: 0 }, // 🎧 DJ offers more music
        },
        contextPreferences: {
            byStartReason: {},
            byEmotionalState: {},
            byTimeOfDay: {},
        },
        musicMemory: [],
    };
}
/**
 * Sample from a Beta distribution (Thompson Sampling)
 */
function sampleBeta(alpha, beta) {
    // Using the Gamma distribution method to sample from Beta
    // This is an approximation that works well for our use case
    const gammaAlpha = jStat_gammaSample(alpha);
    const gammaBeta = jStat_gammaSample(beta);
    return gammaAlpha / (gammaAlpha + gammaBeta);
}
/**
 * Simple gamma distribution sampler (approximation)
 */
function jStat_gammaSample(shape) {
    // Marsaglia and Tsang's method for shape >= 1
    if (shape < 1) {
        return jStat_gammaSample(1 + shape) * Math.pow(Math.random(), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
        let x;
        let v;
        do {
            x = normalSample();
            v = 1 + c * x;
        } while (v <= 0);
        v = v * v * v;
        const u = Math.random();
        if (u < 1 - 0.0331 * (x * x) * (x * x)) {
            return d * v;
        }
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
            return d * v;
        }
    }
}
/**
 * Sample from standard normal distribution (Box-Muller)
 */
function normalSample() {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
/**
 * Select the best transition type using Thompson Sampling
 *
 * This balances exploration (trying new things) with exploitation
 * (using what we know works) in a mathematically principled way.
 */
export function selectTransitionWithLearning(userId, availableTypes, context) {
    const profile = getUserProfile(userId);
    // Check for context-specific preferences first
    if (context) {
        // Check start reason preference
        if (context.startReason && profile.contextPreferences.byStartReason[context.startReason]) {
            const preferred = profile.contextPreferences.byStartReason[context.startReason];
            if (availableTypes.includes(preferred)) {
                // 80% chance to use known preference, 20% explore
                if (Math.random() < 0.8) {
                    return { selectedType: preferred, explorationRate: 0.2 };
                }
            }
        }
        // Check emotional state preference
        if (context.emotionalTone && context.emotionalTone !== 'neutral') {
            const preferred = profile.contextPreferences.byEmotionalState[context.emotionalTone];
            if (preferred && availableTypes.includes(preferred)) {
                if (Math.random() < 0.75) {
                    return { selectedType: preferred, explorationRate: 0.25 };
                }
            }
        }
        // Check time-of-day preference
        if (context.isLateNight && profile.contextPreferences.byTimeOfDay.lateNight) {
            const preferred = profile.contextPreferences.byTimeOfDay.lateNight;
            if (availableTypes.includes(preferred)) {
                if (Math.random() < 0.7) {
                    return { selectedType: preferred, explorationRate: 0.3 };
                }
            }
        }
    }
    // Thompson Sampling: Sample from each arm's Beta distribution
    let bestType = availableTypes[0];
    let bestSample = -1;
    for (const type of availableTypes) {
        const arm = profile.transitionArms[type];
        if (arm) {
            const sample = sampleBeta(arm.alpha, arm.beta);
            if (sample > bestSample) {
                bestSample = sample;
                bestType = type;
            }
        }
    }
    // Calculate exploration rate (uncertainty)
    const arm = profile.transitionArms[bestType];
    const explorationRate = arm ? 1 / (1 + Math.sqrt(arm.pulls)) : 1;
    log.debug({
        userId,
        selectedType: bestType,
        explorationRate,
        totalPulls: profile.totalTransitions,
    }, '🎯 Thompson Sampling selected transition');
    return { selectedType: bestType, explorationRate };
}
/**
 * Update the user's profile based on engagement feedback
 */
export function updateUserLearning(userId, transitionType, feedback, context) {
    const profile = getUserProfile(userId);
    // Update Thompson Sampling parameters
    const arm = profile.transitionArms[transitionType];
    if (arm) {
        // Weight the update by confidence
        const weight = feedback.confidence;
        if (feedback.wasPositive) {
            arm.alpha += weight;
        }
        else {
            arm.beta += weight;
        }
        arm.pulls++;
        arm.lastPulled = Date.now();
    }
    // Update context-specific preferences if this was a strong signal
    if (feedback.wasPositive && feedback.confidence > 0.7) {
        if (context?.startReason) {
            profile.contextPreferences.byStartReason[context.startReason] = transitionType;
        }
        if (context?.emotionalTone && context.emotionalTone !== 'neutral') {
            profile.contextPreferences.byEmotionalState[context.emotionalTone] = transitionType;
        }
        if (context?.isLateNight) {
            profile.contextPreferences.byTimeOfDay.lateNight = transitionType;
        }
    }
    profile.totalTransitions++;
    profile.updatedAt = Date.now();
    log.debug({
        userId,
        transitionType,
        wasPositive: feedback.wasPositive,
        confidence: feedback.confidence,
        newAlpha: arm?.alpha,
        newBeta: arm?.beta,
    }, '📈 User learning updated');
}
/**
 * Add a music memory entry (music that helped this user)
 */
export function addMusicMemory(userId, entry) {
    const profile = getUserProfile(userId);
    profile.musicMemory.push({
        ...entry,
        timestamp: Date.now(),
    });
    // Keep only last 50 memories
    if (profile.musicMemory.length > 50) {
        profile.musicMemory = profile.musicMemory.slice(-50);
    }
    profile.updatedAt = Date.now();
    log.info({
        userId,
        emotionalContext: entry.emotionalContext,
        effectiveTransition: entry.effectiveTransition,
    }, '🎵 Music memory added');
}
/**
 * Find relevant music memories for a context
 */
export function findRelevantMusicMemories(userId, emotionalContext, topicContext) {
    const profile = getUserProfile(userId);
    if (profile.musicMemory.length === 0) {
        return [];
    }
    // Score memories by relevance
    const scored = profile.musicMemory.map((memory) => {
        let score = memory.outcomeScore;
        // Boost for matching emotional context
        if (emotionalContext && memory.emotionalContext === emotionalContext) {
            score += 0.5;
        }
        // Boost for matching topic context
        if (topicContext && memory.topicContext?.includes(topicContext)) {
            score += 0.3;
        }
        // Recency boost (memories from last 30 days)
        const daysSince = (Date.now() - memory.timestamp) / (1000 * 60 * 60 * 24);
        if (daysSince < 30) {
            score += (30 - daysSince) / 100;
        }
        return { memory, score };
    });
    // Sort by score and return top 3
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((s) => s.memory);
}
/**
 * Get a user's preferred transition for a context
 */
export function getUserPreferredTransition(userId, context) {
    const profile = getUserProfile(userId);
    // Not enough data yet
    if (profile.totalTransitions < 5) {
        return null;
    }
    // Check context preferences
    if (context.startReason && profile.contextPreferences.byStartReason[context.startReason]) {
        return profile.contextPreferences.byStartReason[context.startReason];
    }
    if (context.emotionalTone && context.emotionalTone !== 'neutral') {
        const pref = profile.contextPreferences.byEmotionalState[context.emotionalTone];
        if (pref)
            return pref;
    }
    if (context.isLateNight && profile.contextPreferences.byTimeOfDay.lateNight) {
        return profile.contextPreferences.byTimeOfDay.lateNight;
    }
    // Find the arm with highest expected value (alpha / (alpha + beta))
    let bestType = null;
    let bestExpected = 0;
    for (const [type, arm] of Object.entries(profile.transitionArms)) {
        if (arm.pulls >= 3) {
            const expected = arm.alpha / (arm.alpha + arm.beta);
            if (expected > bestExpected) {
                bestExpected = expected;
                bestType = type;
            }
        }
    }
    return bestType;
}
/**
 * Export a user's profile (for persistence)
 */
export function exportUserProfile(userId) {
    return userProfiles.get(userId) || null;
}
/**
 * Import a user's profile (from persistence)
 */
export function importUserProfile(profile) {
    userProfiles.set(profile.userId, profile);
}
/**
 * Clear all profiles (for testing)
 */
export function clearAllProfiles() {
    userProfiles.clear();
}
/**
 * Get learning stats for a user
 */
export function getUserLearningStats(userId) {
    const profile = getUserProfile(userId);
    const armStats = Object.entries(profile.transitionArms)
        .map(([type, arm]) => ({
        type: type,
        expectedValue: arm.alpha / (arm.alpha + arm.beta),
        pulls: arm.pulls,
    }))
        .filter((a) => a.pulls > 0)
        .sort((a, b) => b.expectedValue - a.expectedValue);
    return {
        totalTransitions: profile.totalTransitions,
        topTransitionTypes: armStats.slice(0, 5),
        hasContextPreferences: Object.keys(profile.contextPreferences.byStartReason).length > 0 ||
            Object.keys(profile.contextPreferences.byEmotionalState).length > 0,
        musicMemoryCount: profile.musicMemory.length,
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    getUserProfile,
    selectTransitionWithLearning,
    updateUserLearning,
    addMusicMemory,
    findRelevantMusicMemories,
    getUserPreferredTransition,
    exportUserProfile,
    importUserProfile,
    clearAllProfiles,
    getUserLearningStats,
};
//# sourceMappingURL=music-user-learning.js.map