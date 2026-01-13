/**
 * Memory Adapter for Human Personality System
 *
 * Integrates the personality system with the existing memory infrastructure:
 * - Firestore Vector Store for semantic search of personal moments
 * - SharedStory for tracking what personas have shared with users
 * - KeyMoment for callbacks (what users shared that we should follow up on)
 * - semantic-rag for fast relevance matching
 *
 * This is MUCH better than the keyword-based approach:
 * - Semantic similarity > keyword matching
 * - Persistent storage > in-memory
 * - Existing infrastructure > parallel systems
 *
 * @module personality/memory-adapter
 */
import { embedCached } from '../memory/embedding-cache.js';
// Rust-accelerated batch operations for semantic search (SIMD-accelerated for 5+ embeddings)
import { batchCosineSimilarityOptimized } from '../memory/rust-accelerator.js';
import { isOk } from '../memory/result.js';
import { createLogger } from '../utils/safe-logger.js';
import { getMomentsForPersona, getRegisteredPersonaIds } from './personal-moment-store.js';
// Re-export callback helpers for backwards compatibility
export { createCallbackKeyMoment, extractCallbackKeyMoments, formatCallbackForPrompt, getPendingCallbacksFromProfile, } from './callback-helpers.js';
const log = createLogger({ module: 'PersonalityMemoryAdapter' });
const embeddedMomentsCache = new Map();
const embeddingInProgress = new Map();
/**
 * Get or compute embedded moments for a persona
 * Uses the existing embedding cache for efficiency
 */
async function getEmbeddedMoments(personaId) {
    // Check cache
    const cached = embeddedMomentsCache.get(personaId);
    if (cached) {
        return cached;
    }
    // Check if embedding is already in progress
    const inProgress = embeddingInProgress.get(personaId);
    if (inProgress) {
        return inProgress;
    }
    // Start embedding
    const embeddingPromise = embedMomentsForPersona(personaId);
    embeddingInProgress.set(personaId, embeddingPromise);
    try {
        const result = await embeddingPromise;
        embeddedMomentsCache.set(personaId, result);
        return result;
    }
    finally {
        embeddingInProgress.delete(personaId);
    }
}
/**
 * Embed all moments for a persona
 */
async function embedMomentsForPersona(personaId) {
    const moments = getMomentsForPersona(personaId);
    if (moments.length === 0) {
        return [];
    }
    log.info({ personaId, count: moments.length }, '🔮 Embedding personal moments');
    const embeddedMoments = [];
    for (const moment of moments) {
        // Create searchable text from moment
        const searchableText = createSearchableText(moment);
        // Get cached embedding (or generate new one)
        const result = await embedCached(searchableText);
        if (isOk(result)) {
            embeddedMoments.push({
                moment,
                embedding: result.value,
            });
        }
        else {
            log.warn({ momentId: moment.id, error: result.error }, 'Failed to embed moment');
        }
    }
    log.info({ personaId, embedded: embeddedMoments.length }, '✅ Moments embedded');
    return embeddedMoments;
}
/**
 * Create searchable text from a moment for embedding
 */
function createSearchableText(moment) {
    const parts = [
        moment.content,
        moment.topic,
        ...moment.triggers.keywords,
        ...(moment.triggers.emotions || []),
        ...(moment.triggers.topics || []),
    ];
    return parts.join(' ');
}
// ============================================================================
// SEMANTIC RELEVANCE SEARCH
// ============================================================================
/**
 * Find semantically relevant personal moments using embeddings
 * This is MUCH better than keyword matching
 */
export async function findRelevantMomentSemantic(personaId, userMessage, options) {
    const minSimilarity = options.minSimilarity ?? 0.3;
    // Get embedded moments
    const embeddedMoments = await getEmbeddedMoments(personaId);
    if (embeddedMoments.length === 0) {
        return null;
    }
    // Embed user message
    const userEmbeddingResult = await embedCached(userMessage);
    if (!isOk(userEmbeddingResult)) {
        log.warn({ error: userEmbeddingResult.error }, 'Failed to embed user message');
        return null;
    }
    const userEmbedding = userEmbeddingResult.value;
    // Get accessible moments based on relationship stage
    const stageOrder = ['stranger', 'acquaintance', 'friend', 'trusted'];
    const stageIndex = stageOrder.indexOf(options.relationshipStage);
    // Filter eligible moments first (by relationship stage and cooldown)
    const eligibleMoments = [];
    for (const { moment, embedding } of embeddedMoments) {
        // Check relationship stage access
        const momentStageIndex = stageOrder.indexOf(moment.minRelationshipStage);
        if (momentStageIndex > stageIndex) {
            continue; // Not accessible at this relationship stage
        }
        // Check if already shared (using SharedStory from profile)
        if (options.sharedStories) {
            const alreadyShared = options.sharedStories.some((s) => s.storyId === moment.id);
            if (alreadyShared) {
                // Check cooldown
                const sharedStory = options.sharedStories.find((s) => s.storyId === moment.id);
                if (sharedStory) {
                    const daysSinceShared = Math.floor((Date.now() - new Date(sharedStory.sharedAt).getTime()) / (1000 * 60 * 60 * 24));
                    if (daysSinceShared < moment.cooldownDays) {
                        continue; // Within cooldown, skip
                    }
                }
            }
        }
        eligibleMoments.push({ moment, embedding });
    }
    if (eligibleMoments.length === 0) {
        return null;
    }
    // Batch compute all similarities at once (SIMD-accelerated for 5+ moments)
    const momentVectors = eligibleMoments.map((m) => Array.from(m.embedding));
    const queryArray = Array.from(userEmbedding);
    const similarities = batchCosineSimilarityOptimized(queryArray, momentVectors);
    // Build scored results with similarity threshold
    const scored = [];
    for (let i = 0; i < eligibleMoments.length; i++) {
        const similarity = similarities[i];
        if (similarity >= minSimilarity) {
            scored.push({ moment: eligibleMoments[i].moment, similarity });
        }
    }
    if (scored.length === 0) {
        return null;
    }
    // Sort by similarity descending
    scored.sort((a, b) => b.similarity - a.similarity);
    const best = scored[0];
    if (!best) {
        return null;
    }
    // Build result
    const result = {
        moment: best.moment,
        relevanceScore: best.similarity,
        reason: `Semantic similarity: ${(best.similarity * 100).toFixed(1)}%`,
        suggestedTransition: best.moment.transitions[Math.floor(Math.random() * best.moment.transitions.length)] ?? '',
        previouslyShared: options.sharedStories?.some((s) => s.storyId === best.moment.id) ?? false,
    };
    log.debug({
        personaId,
        momentId: best.moment.id,
        similarity: best.similarity,
    }, '✨ Found semantically relevant moment');
    return result;
}
// ============================================================================
// SHARED STORY TRACKING (Uses existing UserProfile.sharedStories)
// ============================================================================
/**
 * Create a SharedStory record when a persona shares a moment
 * This integrates with the existing UserProfile type
 */
export function createSharedStoryRecord(moment, context, userReaction) {
    return {
        storyId: moment.id,
        theme: moment.topic,
        sharedAt: new Date(),
        userReaction,
        context,
    };
}
/**
 * Check if a moment was already shared with this user
 */
export function wasMomentSharedWithUser(momentId, sharedStories) {
    if (!sharedStories)
        return false;
    return sharedStories.some((s) => s.storyId === momentId);
}
/**
 * Get topics the user has discovered about this persona
 */
export function getDiscoveredTopicsFromStories(sharedStories) {
    if (!sharedStories)
        return [];
    return [...new Set(sharedStories.map((s) => s.theme))];
}
// ============================================================================
// WARM-UP / PREFETCH
// ============================================================================
/**
 * Warm up embeddings for a persona (call on session start)
 */
export async function warmUpPersonaEmbeddings(personaId) {
    log.info({ personaId }, '🔥 Warming up persona embeddings');
    await getEmbeddedMoments(personaId);
}
/**
 * Warm up embeddings for all personas
 */
export async function warmUpAllPersonaEmbeddings() {
    const personaIds = getRegisteredPersonaIds();
    log.info({ count: personaIds.length }, '🔥 Warming up all persona embeddings');
    await Promise.all(personaIds.map(async (id) => warmUpPersonaEmbeddings(id)));
}
/**
 * Clear embedding cache (for testing)
 */
export function clearEmbeddingCache() {
    embeddedMomentsCache.clear();
    embeddingInProgress.clear();
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    findRelevantMomentSemantic,
    createSharedStoryRecord,
    wasMomentSharedWithUser,
    getDiscoveredTopicsFromStories,
    warmUpPersonaEmbeddings,
    warmUpAllPersonaEmbeddings,
    clearEmbeddingCache,
};
//# sourceMappingURL=memory-adapter.js.map