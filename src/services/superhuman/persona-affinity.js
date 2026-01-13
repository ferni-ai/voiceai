/**
 * Persona Affinity Tracking Service
 *
 * Tracks user-persona relationships to enable smart routing.
 * "Which persona does this user connect with best for this topic?"
 *
 * @module services/superhuman/persona-affinity
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getLogger } from '../../utils/safe-logger.js';
import { getRedisCache } from '../../memory/redis-cache.js';
import { onPersonaAffinityChange, onHandoffPreferenceChange, onPersonaInteractionHistoryChange, } from '../data-layer/hooks/persona-hooks.js';
const log = getLogger().child({ module: 'persona-affinity' });
// ============================================================================
// PERSONA CONSTANTS
// ============================================================================
const PERSONA_NAMES = {
    ferni: 'Ferni',
    peter: 'Peter',
    maya: 'Maya',
    alex: 'Alex',
    jordan: 'Jordan',
    nayan: 'Nayan',
};
const PERSONA_DOMAINS = {
    ferni: ['general', 'coaching', 'life', 'emotions', 'relationships', 'growth'],
    peter: ['research', 'facts', 'analysis', 'data', 'science', 'learning'],
    maya: ['habits', 'routines', 'productivity', 'health', 'wellness', 'organization'],
    alex: ['calendar', 'scheduling', 'contacts', 'communication', 'work', 'meetings'],
    jordan: ['events', 'planning', 'celebrations', 'milestones', 'social', 'parties'],
    nayan: ['wisdom', 'philosophy', 'meaning', 'purpose', 'spirituality', 'legacy'],
};
// ============================================================================
// AFFINITY TRACKING
// ============================================================================
/**
 * Update persona affinity after a session
 */
export async function updateAffinityAfterSession(userId, sessionData) {
    try {
        const db = getFirestore();
        const redis = getRedisCache();
        const { personaId, duration, topics, sentiment, userEngagement } = sessionData;
        // Get or create affinity record
        const affinityRef = db.doc(`bogle_users/${userId}/persona_affinities/${personaId}`);
        const affinityDoc = await affinityRef.get();
        let currentAffinity;
        if (affinityDoc.exists) {
            currentAffinity = affinityDoc.data();
        }
        else {
            currentAffinity = {
                personaId,
                personaName: PERSONA_NAMES[personaId] || personaId,
                affinityScore: 0.5, // Start neutral
                totalSessions: 0,
                averageSessionLength: 0,
                topTopics: [],
                emotionalResonance: 'medium',
                lastInteraction: new Date().toISOString(),
            };
        }
        // Update affinity based on session
        const sessionWeight = Math.min(duration / 10, 1); // Longer sessions have more weight
        let affinityDelta = 0;
        // Positive sentiment increases affinity
        if (sentiment === 'positive')
            affinityDelta += 0.05 * sessionWeight;
        else if (sentiment === 'negative')
            affinityDelta -= 0.08 * sessionWeight;
        // High engagement increases affinity
        if (userEngagement === 'high')
            affinityDelta += 0.03 * sessionWeight;
        else if (userEngagement === 'low')
            affinityDelta -= 0.02 * sessionWeight;
        // Update score with decay toward 0.5 for fairness
        const newScore = Math.max(0, Math.min(1, currentAffinity.affinityScore * 0.95 + affinityDelta));
        // Update top topics
        const topicCounts = {};
        for (const topic of currentAffinity.topTopics) {
            topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
        for (const topic of topics) {
            topicCounts[topic] = (topicCounts[topic] || 0) + 2; // Recent topics weighted more
        }
        const sortedTopics = Object.entries(topicCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([topic]) => topic)
            .slice(0, 10);
        // Calculate emotional resonance
        let resonance = 'medium';
        if (newScore >= 0.7)
            resonance = 'high';
        else if (newScore <= 0.3)
            resonance = 'low';
        // Calculate new average session length
        const totalSessions = currentAffinity.totalSessions + 1;
        const avgLength = (currentAffinity.averageSessionLength * currentAffinity.totalSessions + duration) /
            totalSessions;
        const updatedAffinity = {
            personaId,
            personaName: PERSONA_NAMES[personaId] || personaId,
            affinityScore: newScore,
            totalSessions,
            averageSessionLength: avgLength,
            topTopics: sortedTopics,
            emotionalResonance: resonance,
            lastInteraction: new Date().toISOString(),
        };
        // Save to Firestore
        await affinityRef.set({
            ...updatedAffinity,
            updatedAt: Timestamp.now(),
        });
        // Index to semantic memory
        await onPersonaAffinityChange(userId, personaId, updatedAffinity, 'update');
        // Update Redis cache for fast routing
        const allAffinities = await getAllAffinities(userId);
        await redis.setPersonaAffinityCache(userId, allAffinities.map((a) => ({
            personaId: a.personaId,
            score: a.affinityScore,
            topTopics: a.topTopics,
        })));
        log.info({ userId, personaId, newScore, totalSessions }, 'Persona affinity updated');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to update persona affinity');
    }
}
/**
 * Get all persona affinities for a user
 */
export async function getAllAffinities(userId) {
    try {
        const db = getFirestore();
        const snapshot = await db
            .collection(`bogle_users/${userId}/persona_affinities`)
            .orderBy('affinityScore', 'desc')
            .get();
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get persona affinities');
        return [];
    }
}
/**
 * Get affinity for a specific persona
 */
export async function getAffinity(userId, personaId) {
    try {
        const db = getFirestore();
        const doc = await db.doc(`bogle_users/${userId}/persona_affinities/${personaId}`).get();
        if (!doc.exists)
            return null;
        return { id: doc.id, ...doc.data() };
    }
    catch (error) {
        log.error({ error: String(error), userId, personaId }, 'Failed to get persona affinity');
        return null;
    }
}
// ============================================================================
// HANDOFF PREFERENCES
// ============================================================================
/**
 * Record a successful handoff
 */
export async function recordHandoff(userId, handoff) {
    try {
        const db = getFirestore();
        const key = `${handoff.fromPersona}_to_${handoff.toPersona}`;
        const prefRef = db.doc(`bogle_users/${userId}/handoff_preferences/${key}`);
        const prefDoc = await prefRef.get();
        let preference;
        if (prefDoc.exists) {
            const current = prefDoc.data();
            preference = {
                ...current,
                triggerTopics: [...new Set([...current.triggerTopics, ...handoff.topics])].slice(0, 20),
                userApproved: handoff.userApproved || current.userApproved,
                successfulHandoffs: current.successfulHandoffs + (handoff.successful ? 1 : 0),
                failedHandoffs: current.failedHandoffs + (handoff.successful ? 0 : 1),
            };
        }
        else {
            preference = {
                fromPersona: handoff.fromPersona,
                toPersona: handoff.toPersona,
                triggerTopics: handoff.topics,
                userApproved: handoff.userApproved,
                successfulHandoffs: handoff.successful ? 1 : 0,
                failedHandoffs: handoff.successful ? 0 : 1,
            };
        }
        await prefRef.set({
            ...preference,
            updatedAt: Timestamp.now(),
        });
        // Index to semantic memory
        await onHandoffPreferenceChange(userId, key, preference, 'update');
        log.debug({ userId, fromPersona: handoff.fromPersona, toPersona: handoff.toPersona }, 'Handoff recorded');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to record handoff');
    }
}
/**
 * Get handoff preferences
 */
export async function getHandoffPreferences(userId) {
    try {
        const db = getFirestore();
        const snapshot = await db.collection(`bogle_users/${userId}/handoff_preferences`).get();
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get handoff preferences');
        return [];
    }
}
// ============================================================================
// INTERACTION HISTORY
// ============================================================================
/**
 * Record a persona interaction
 */
export async function recordInteraction(userId, interaction) {
    try {
        const db = getFirestore();
        const interactionData = {
            ...interaction,
            date: new Date().toISOString(),
        };
        const ref = await db.collection(`bogle_users/${userId}/persona_interactions`).add({
            ...interactionData,
            createdAt: Timestamp.now(),
        });
        // Index meaningful interactions to semantic memory
        if (interaction.interactionType !== 'brief_mention') {
            await onPersonaInteractionHistoryChange(userId, ref.id, interactionData, 'create');
        }
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to record interaction');
    }
}
/**
 * Get recent interactions with a persona
 */
export async function getRecentInteractions(userId, personaId, limit = 10) {
    try {
        const db = getFirestore();
        const snapshot = await db
            .collection(`bogle_users/${userId}/persona_interactions`)
            .where('personaId', '==', personaId)
            .orderBy('date', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
    catch (error) {
        log.error({ error: String(error), userId, personaId }, 'Failed to get recent interactions');
        return [];
    }
}
// ============================================================================
// SMART ROUTING
// ============================================================================
/**
 * Recommend the best persona for a given topic/context
 */
export async function recommendPersona(userId, context) {
    try {
        const redis = getRedisCache();
        const topics = context.topics || (context.topic ? [context.topic] : []);
        // Check Redis cache first
        if (context.topic) {
            const cached = await redis.getBestPersonaForTopic(userId, context.topic);
            if (cached) {
                return [
                    {
                        personaId: cached.personaId,
                        personaName: PERSONA_NAMES[cached.personaId] || cached.personaId,
                        score: cached.score,
                        reason: 'User has strong affinity for this topic',
                        topics: [context.topic],
                    },
                ];
            }
        }
        // Get all affinities
        const affinities = await getAllAffinities(userId);
        const handoffPrefs = await getHandoffPreferences(userId);
        // Score each persona
        const recommendations = [];
        for (const [personaId, personaName] of Object.entries(PERSONA_NAMES)) {
            let score = 0.5; // Default neutral
            const reasons = [];
            const matchedTopics = [];
            // Check affinity
            const affinity = affinities.find((a) => a.personaId === personaId);
            if (affinity) {
                score = affinity.affinityScore;
                if (affinity.emotionalResonance === 'high') {
                    reasons.push('Strong emotional connection');
                }
                // Check topic match
                for (const topic of topics) {
                    const topicLower = topic.toLowerCase();
                    if (affinity.topTopics.some((t) => t.toLowerCase().includes(topicLower))) {
                        score += 0.1;
                        matchedTopics.push(topic);
                        reasons.push(`Has discussed ${topic} before`);
                    }
                }
            }
            // Check domain match
            const domains = PERSONA_DOMAINS[personaId] || [];
            for (const topic of topics) {
                const topicLower = topic.toLowerCase();
                if (domains.some((d) => topicLower.includes(d) || d.includes(topicLower))) {
                    score += 0.15;
                    matchedTopics.push(topic);
                    reasons.push(`${personaName} specializes in ${topic}`);
                }
            }
            // Check handoff preferences
            if (context.currentPersona) {
                const pref = handoffPrefs.find((p) => p.fromPersona === context.currentPersona && p.toPersona === personaId);
                if (pref && pref.successfulHandoffs > pref.failedHandoffs) {
                    score += 0.1;
                    reasons.push('Successful handoff history');
                }
                if (pref && pref.userApproved) {
                    score += 0.1;
                    reasons.push('User-approved handoff route');
                }
            }
            // Don't recommend current persona unless it's the best match
            if (personaId === context.currentPersona) {
                score -= 0.1;
            }
            recommendations.push({
                personaId,
                personaName,
                score: Math.min(1, Math.max(0, score)),
                reason: reasons.length > 0 ? reasons[0] : 'Available for conversation',
                topics: [...new Set(matchedTopics)],
            });
        }
        // Sort by score
        recommendations.sort((a, b) => b.score - a.score);
        return recommendations;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to recommend persona');
        // Return default recommendation
        return [
            {
                personaId: 'ferni',
                personaName: 'Ferni',
                score: 0.5,
                reason: 'Default recommendation',
                topics: [],
            },
        ];
    }
}
/**
 * Should we suggest a handoff?
 */
export async function shouldSuggestHandoff(userId, currentPersona, topics) {
    const recommendations = await recommendPersona(userId, {
        topics,
        currentPersona,
    });
    // Only suggest if another persona is significantly better
    const current = recommendations.find((r) => r.personaId === currentPersona);
    const best = recommendations[0];
    if (best && current && best.personaId !== currentPersona && best.score - current.score > 0.2) {
        return {
            suggest: true,
            toPersona: best.personaId,
            reason: best.reason,
        };
    }
    return { suggest: false };
}
// ============================================================================
// EXPORTS
// ============================================================================
export const personaAffinity = {
    updateAfterSession: updateAffinityAfterSession,
    getAll: getAllAffinities,
    get: getAffinity,
    recordHandoff,
    getHandoffPreferences,
    recordInteraction,
    getRecentInteractions,
    recommendPersona,
    shouldSuggestHandoff,
};
export default personaAffinity;
//# sourceMappingURL=persona-affinity.js.map