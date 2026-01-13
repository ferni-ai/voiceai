/**
 * Memory Lane - Memory Collector
 *
 * Aggregates memorable moments from various existing data sources:
 * - Commitment Keeper (promises kept)
 * - Dream Keeper (dream progress)
 * - Inside Joke Memory (funny/shared moments)
 * - Relationship Milestones (growth markers)
 * - Celebration Momentum (wins and breakthroughs)
 *
 * This service transforms raw data from these sources into unified
 * MemoryHighlight objects suitable for Memory Lane.
 *
 * @module services/memory-lane/memory-collector
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../superhuman/firestore-utils.js';
// Lazy imports to avoid circular dependencies
const log = createLogger({ module: 'MemoryCollector' });
// ============================================================================
// CONSTANTS
// ============================================================================
const COLLECTION_PATH = 'memory_highlights';
// Mapping from source types to memory types and tones
const SOURCE_TO_MEMORY_TYPE = {
    commitment_kept: 'commitment',
    dream_progress: 'dream_progress',
    inside_joke: 'funny',
    milestone_reached: 'milestone',
    coaching_moment: 'growth',
    emotional_breakthrough: 'breakthrough',
    celebration: 'celebration',
    first_vulnerability: 'first_share',
    relationship_event: 'connection',
    conversation_extract: 'growth',
};
const SOURCE_TO_DEFAULT_TONE = {
    commitment_kept: 'proud',
    dream_progress: 'hopeful',
    inside_joke: 'funny',
    milestone_reached: 'meaningful',
    coaching_moment: 'meaningful',
    emotional_breakthrough: 'meaningful',
    celebration: 'joyful',
    first_vulnerability: 'tender',
    relationship_event: 'meaningful',
    conversation_extract: 'meaningful',
};
// ============================================================================
// COLLECTION FROM SOURCES
// ============================================================================
/**
 * Collect memories from completed commitments
 */
export async function collectFromCommitments(userId) {
    const memories = [];
    try {
        const { loadUserCommitments } = await import('../superhuman/commitment-keeper.js');
        const commitments = await loadUserCommitments(userId);
        // Filter to completed commitments only
        const completed = commitments.filter((c) => c.status === 'completed');
        for (const commitment of completed) {
            // Check if we already have this memory
            const existing = await findExistingMemory(userId, 'commitment_kept', commitment.id);
            if (existing)
                continue;
            const memory = createMemoryFromCommitment(userId, commitment);
            memories.push(memory);
        }
        log.debug({ userId, count: memories.length }, 'Collected memories from commitments');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to collect from commitments');
    }
    return memories;
}
/**
 * Collect memories from dreams (achieved or with significant progress)
 */
export async function collectFromDreams(userId) {
    const memories = [];
    try {
        const { loadUserDreams } = await import('../superhuman/dream-keeper.js');
        const dreams = await loadUserDreams(userId);
        // Filter to achieved dreams or those with progress notes
        const notable = dreams.filter((d) => d.status === 'achieved' || (d.progressNotes && d.progressNotes.length > 0));
        for (const dream of notable) {
            const existing = await findExistingMemory(userId, 'dream_progress', dream.id);
            if (existing)
                continue;
            const memory = createMemoryFromDream(userId, dream);
            memories.push(memory);
        }
        log.debug({ userId, count: memories.length }, 'Collected memories from dreams');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to collect from dreams');
    }
    return memories;
}
/**
 * Collect memories from inside jokes and shared moments
 */
export async function collectFromSharedMoments(userId) {
    const memories = [];
    try {
        const { loadSharedMoments } = await import('../superhuman/inside-joke-memory.js');
        const moments = await loadSharedMoments(userId);
        // Filter to high-resonance moments
        const memorable = moments.filter((m) => m.resonance >= 0.6);
        for (const moment of memorable) {
            const momentId = moment.id;
            if (!momentId)
                continue;
            const existing = await findExistingMemory(userId, 'inside_joke', momentId);
            if (existing)
                continue;
            const memory = createMemoryFromSharedMoment(userId, {
                id: momentId,
                essence: moment.essence,
                context: moment.context,
                type: moment.type,
                resonance: moment.resonance,
                createdAt: moment.createdAt,
                callbackPhrase: moment.callbackPhrase,
            });
            memories.push(memory);
        }
        log.debug({ userId, count: memories.length }, 'Collected memories from shared moments');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to collect from shared moments');
    }
    return memories;
}
/**
 * Collect memories from relationship milestones
 */
export async function collectFromMilestones(userId) {
    const memories = [];
    try {
        // Load milestones directly from Firestore
        const db = getFirestoreDb();
        if (!db)
            return memories;
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('relationship_milestones')
            .orderBy('achievedAt', 'desc')
            .limit(50)
            .get();
        const milestones = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
        for (const milestone of milestones) {
            const existing = await findExistingMemory(userId, 'milestone_reached', milestone.id);
            if (existing)
                continue;
            const memory = createMemoryFromMilestone(userId, milestone);
            memories.push(memory);
        }
        log.debug({ userId, count: memories.length }, 'Collected memories from milestones');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to collect from milestones');
    }
    return memories;
}
/**
 * Collect memories from celebration wins
 */
export async function collectFromCelebrations(userId) {
    const memories = [];
    try {
        const { getMomentumProfile } = await import('../trust-systems/celebration-momentum.js');
        const profile = getMomentumProfile(userId);
        if (!profile)
            return memories;
        // Filter to significant wins (hard difficulty or breakthrough type)
        const notable = profile.wins.filter((w) => w.difficulty === 'hard' || w.type === 'breakthrough' || w.type === 'courage_moment');
        for (const win of notable) {
            const existing = await findExistingMemory(userId, 'celebration', win.id);
            if (existing)
                continue;
            const memory = createMemoryFromWin(userId, win);
            memories.push(memory);
        }
        log.debug({ userId, count: memories.length }, 'Collected memories from celebrations');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to collect from celebrations');
    }
    return memories;
}
// ============================================================================
// MEMORY CREATION HELPERS
// ============================================================================
function createMemoryFromCommitment(userId, commitment) {
    const now = new Date();
    return {
        id: generateMemoryId(),
        userId,
        content: `You kept your promise: "${commitment.summary}"`,
        originalContext: commitment.statement,
        type: 'commitment',
        emotionalTone: 'proud',
        occurredAt: new Date(commitment.createdAt),
        personaId: undefined,
        topicTags: commitment.topic ? [commitment.topic] : [],
        peopleReferenced: commitment.personInvolved ? [commitment.personInvolved] : [],
        sourceType: 'commitment_kept',
        sourceId: commitment.id,
        emotionalWeight: commitment.emotionalWeight || 0.7,
        uniqueness: 0.6,
        growthIndicator: 0.8,
        timesSurfaced: 0,
        reactions: [],
        createdAt: now,
        updatedAt: now,
    };
}
function createMemoryFromDream(userId, dream) {
    const now = new Date();
    const isAchieved = dream.status === 'achieved';
    const content = isAchieved
        ? `You achieved your dream: ${dream.title}`
        : `Progress on your dream: ${dream.title} - ${dream.progressNotes[dream.progressNotes.length - 1] || ''}`;
    return {
        id: generateMemoryId(),
        userId,
        content,
        originalContext: dream.statement,
        title: dream.title,
        type: 'dream_progress',
        emotionalTone: isAchieved ? 'joyful' : 'hopeful',
        occurredAt: new Date(dream.firstMentioned),
        personaId: undefined,
        topicTags: [dream.type],
        peopleReferenced: [],
        sourceType: 'dream_progress',
        sourceId: dream.id,
        emotionalWeight: isAchieved ? 0.95 : 0.7,
        uniqueness: 0.9,
        growthIndicator: isAchieved ? 1.0 : 0.6,
        timesSurfaced: 0,
        reactions: [],
        createdAt: now,
        updatedAt: now,
    };
}
function createMemoryFromSharedMoment(userId, moment) {
    const now = new Date();
    return {
        id: generateMemoryId(),
        userId,
        content: moment.essence,
        originalContext: moment.context,
        type: 'funny',
        emotionalTone: moment.type === 'breakthrough' ? 'meaningful' : 'funny',
        occurredAt: new Date(moment.createdAt),
        personaId: undefined,
        topicTags: [],
        peopleReferenced: [],
        sourceType: 'inside_joke',
        sourceId: moment.id,
        emotionalWeight: moment.resonance,
        uniqueness: 0.85,
        growthIndicator: moment.type === 'breakthrough' ? 0.8 : 0.3,
        timesSurfaced: 0,
        reactions: [],
        createdAt: now,
        updatedAt: now,
    };
}
function createMemoryFromMilestone(userId, milestone) {
    const now = new Date();
    return {
        id: generateMemoryId(),
        userId,
        content: `${milestone.title}: ${milestone.description}`,
        originalContext: milestone.context,
        title: milestone.title,
        type: 'milestone',
        emotionalTone: 'meaningful',
        occurredAt: new Date(milestone.achievedAt),
        personaId: undefined,
        topicTags: [milestone.type],
        peopleReferenced: [],
        sourceType: 'milestone_reached',
        sourceId: milestone.id,
        emotionalWeight: 0.85,
        uniqueness: 0.7,
        growthIndicator: 0.9,
        timesSurfaced: 0,
        reactions: [],
        createdAt: now,
        updatedAt: now,
    };
}
function createMemoryFromWin(userId, win) {
    const now = new Date();
    const isBreakthrough = win.type === 'breakthrough';
    const isCourage = win.type === 'courage_moment';
    return {
        id: generateMemoryId(),
        userId,
        content: win.description,
        originalContext: win.context,
        type: isBreakthrough ? 'breakthrough' : 'celebration',
        emotionalTone: isBreakthrough ? 'meaningful' : isCourage ? 'proud' : 'joyful',
        occurredAt: win.detectedAt,
        personaId: undefined,
        topicTags: win.tags,
        peopleReferenced: [],
        sourceType: 'celebration',
        sourceId: win.id,
        emotionalWeight: win.difficulty === 'hard' ? 0.9 : 0.7,
        uniqueness: isBreakthrough ? 0.95 : 0.6,
        growthIndicator: isBreakthrough ? 0.95 : 0.7,
        timesSurfaced: 0,
        reactions: [],
        createdAt: now,
        updatedAt: now,
    };
}
// ============================================================================
// PERSISTENCE
// ============================================================================
/**
 * Save a memory highlight to Firestore
 */
export async function saveMemory(memory) {
    const db = getFirestoreDb();
    if (!db) {
        log.debug('Firestore not available, skipping memory save');
        return false;
    }
    try {
        await db
            .collection('bogle_users')
            .doc(memory.userId)
            .collection(COLLECTION_PATH)
            .doc(memory.id)
            .set(cleanForFirestore(memory));
        log.debug({ userId: memory.userId, memoryId: memory.id }, 'Saved memory highlight');
        return true;
    }
    catch (error) {
        log.warn({ error: String(error), memoryId: memory.id }, 'Failed to save memory');
        return false;
    }
}
/**
 * Find an existing memory by source
 */
async function findExistingMemory(userId, sourceType, sourceId) {
    const db = getFirestoreDb();
    if (!db)
        return null;
    try {
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION_PATH)
            .where('sourceType', '==', sourceType)
            .where('sourceId', '==', sourceId)
            .limit(1)
            .get();
        if (snapshot.empty)
            return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }
    catch (error) {
        log.warn({ error: String(error), userId, sourceType, sourceId }, 'Failed to find existing memory');
        return null;
    }
}
/**
 * Load all memory highlights for a user
 */
export async function loadMemories(userId, options = {}) {
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        let query = db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION_PATH)
            .orderBy('occurredAt', 'desc');
        if (options.limit) {
            query = query.limit(options.limit);
        }
        const snapshot = await query.get();
        let memories = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                occurredAt: data.occurredAt?.toDate?.() || new Date(data.occurredAt),
                createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
                updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
                surfaceableAfter: data.surfaceableAfter?.toDate?.(),
                lastSurfacedAt: data.lastSurfacedAt?.toDate?.(),
            };
        });
        // Filter by types if specified
        if (options.types && options.types.length > 0) {
            memories = memories.filter((m) => options.types.includes(m.type));
        }
        return memories;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load memories');
        return [];
    }
}
/**
 * Get memories for "On This Day" (same month/day from previous years)
 */
export async function loadOnThisDayMemories(userId) {
    const memories = await loadMemories(userId);
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    const currentYear = today.getFullYear();
    return memories.filter((m) => {
        const memDate = new Date(m.occurredAt);
        return (memDate.getMonth() === todayMonth &&
            memDate.getDate() === todayDate &&
            memDate.getFullYear() < currentYear);
    });
}
// ============================================================================
// COLLECTION ORCHESTRATION
// ============================================================================
/**
 * Collect and save all new memories for a user
 */
export async function collectAllMemories(userId) {
    const errors = [];
    const allMemories = [];
    // Collect from all sources in parallel
    const results = await Promise.allSettled([
        collectFromCommitments(userId),
        collectFromDreams(userId),
        collectFromSharedMoments(userId),
        collectFromMilestones(userId),
        collectFromCelebrations(userId),
    ]);
    for (const result of results) {
        if (result.status === 'fulfilled') {
            allMemories.push(...result.value);
        }
        else {
            errors.push(String(result.reason));
        }
    }
    // Save all collected memories
    let saved = 0;
    for (const memory of allMemories) {
        const success = await saveMemory(memory);
        if (success)
            saved++;
    }
    log.info({ userId, collected: allMemories.length, saved, errors: errors.length }, 'Memory collection complete');
    return {
        collected: allMemories.length,
        saved,
        errors,
    };
}
/**
 * Process a single memory collection input (for real-time capture)
 */
export async function processCollectionInput(input) {
    // Check for existing
    const existing = await findExistingMemory(input.userId, input.sourceType, input.sourceId);
    if (existing) {
        return { success: true, memoryId: existing.id, duplicate: true };
    }
    const now = new Date();
    const memory = {
        id: generateMemoryId(),
        userId: input.userId,
        content: input.rawContent,
        type: SOURCE_TO_MEMORY_TYPE[input.sourceType] || 'growth',
        emotionalTone: SOURCE_TO_DEFAULT_TONE[input.sourceType] || 'meaningful',
        occurredAt: input.occurredAt,
        personaId: input.personaId,
        topicTags: [],
        peopleReferenced: [],
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        emotionalWeight: 0.7,
        uniqueness: 0.6,
        growthIndicator: 0.6,
        timesSurfaced: 0,
        reactions: [],
        createdAt: now,
        updatedAt: now,
    };
    const success = await saveMemory(memory);
    return {
        success,
        memoryId: success ? memory.id : undefined,
        error: success ? undefined : 'Failed to save memory',
    };
}
// ============================================================================
// HELPERS
// ============================================================================
function generateMemoryId() {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
// ============================================================================
// EXPORTS
// ============================================================================
export const memoryCollector = {
    collectFromCommitments,
    collectFromDreams,
    collectFromSharedMoments,
    collectFromMilestones,
    collectFromCelebrations,
    collectAllMemories,
    processCollectionInput,
    saveMemory,
    loadMemories,
    loadOnThisDayMemories,
};
//# sourceMappingURL=memory-collector.js.map