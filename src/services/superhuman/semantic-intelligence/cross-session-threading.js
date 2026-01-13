/**
 * Cross-Session Semantic Threading - Better Than Human Service
 *
 * "Connect conversations the user doesn't realize are connected"
 *
 * Finds semantically related topics across sessions that user
 * didn't explicitly connect:
 *   - Session 12: "I feel like I'm not good enough at work"
 *   - Session 47: "My dad always pushed perfection"
 *   - Ferni notices: These have 0.87 semantic similarity but
 *     user never connected them
 *
 * @module services/superhuman/semantic-intelligence/cross-session-threading
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { embed, cosineSimilarity } from '../../../memory/embeddings.js';
import { getFirestoreDb, cleanForFirestore } from '../firestore-utils.js';
import { onCrossSessionThreadChange } from '../../data-layer/hooks/better-than-human-hooks.js';
const log = createLogger({ module: 'cross-session-threading' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    MIN_SIMILARITY_FOR_THREAD: 0.7, // Semantic similarity threshold
    MIN_MOMENTS_FOR_THREAD: 2, // At least 2 moments to form a thread
    MAX_THREADS_PER_USER: 50,
    MAX_MOMENTS_PER_THREAD: 30,
    SESSION_GAP_THRESHOLD_HOURS: 2, // Different session if >2 hours apart
    THREAD_DISCOVERY_DEPTH: 100, // How many past moments to search
};
// ============================================================================
// IN-MEMORY CACHE
// ============================================================================
const threadCache = new Map();
const momentBuffer = new Map();
const lastSessionId = null;
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Record a significant moment that could be part of a thread.
 *
 * Call this when a meaningful statement is made:
 * - Deep personal revelations
 * - Emotional expressions
 * - Core beliefs expressed
 * - Recurring themes
 */
export async function recordMoment(userId, moment) {
    const { content, emotion, topic, significance = 'medium' } = moment;
    const timestamp = Date.now();
    // Skip low significance moments
    if (significance === 'low')
        return null;
    // Determine session ID (simplistic - could be enhanced)
    const sessionId = getCurrentSessionId(userId);
    // Generate embedding
    let embedding;
    try {
        embedding = await embed(content);
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to embed moment');
        return null;
    }
    const threadMoment = {
        sessionId,
        timestamp,
        content,
        embedding,
        similarity: 1.0, // Will be updated when added to thread
        emotionalContext: emotion,
    };
    // Add to buffer
    const buffer = momentBuffer.get(userId) || [];
    buffer.push(threadMoment);
    momentBuffer.set(userId, buffer);
    // Search for thread connections
    const discoveredThread = await discoverThreadConnections(userId, threadMoment, embedding);
    if (discoveredThread) {
        log.debug({
            userId,
            threadId: discoveredThread.id,
            theme: discoveredThread.theme,
            momentCount: discoveredThread.moments.length,
        }, '🧵 Thread connection discovered');
    }
    return discoveredThread;
}
/**
 * Get a simple session ID based on time gaps.
 */
function getCurrentSessionId(userId) {
    const buffer = momentBuffer.get(userId) || [];
    const lastMoment = buffer[buffer.length - 1];
    const now = Date.now();
    // If last moment was recent, same session
    if (lastMoment &&
        now - lastMoment.timestamp < CONFIG.SESSION_GAP_THRESHOLD_HOURS * 60 * 60 * 1000) {
        return lastMoment.sessionId;
    }
    // New session
    return `session_${now}`;
}
/**
 * Discover thread connections for a new moment.
 */
async function discoverThreadConnections(userId, newMoment, embedding) {
    // Load existing threads and past moments
    const threads = threadCache.get(userId) || (await loadThreads(userId));
    const buffer = momentBuffer.get(userId) || [];
    // 1. Check if this moment connects to an existing thread
    for (const thread of threads) {
        if (thread.themeEmbedding) {
            const similarity = cosineSimilarity(embedding, thread.themeEmbedding);
            if (similarity >= CONFIG.MIN_SIMILARITY_FOR_THREAD) {
                // Add to existing thread
                newMoment.similarity = similarity;
                addMomentToThread(thread, newMoment);
                await saveThread(userId, thread);
                return thread;
            }
        }
    }
    // 2. Search for connections in past moments (different sessions)
    const pastMoments = buffer.filter((m) => m.sessionId !== newMoment.sessionId && // Different session
        m.embedding // Has embedding
    );
    // Find similar past moments
    const similarMoments = [];
    for (const past of pastMoments.slice(-CONFIG.THREAD_DISCOVERY_DEPTH)) {
        if (!past.embedding)
            continue;
        const similarity = cosineSimilarity(embedding, past.embedding);
        if (similarity >= CONFIG.MIN_SIMILARITY_FOR_THREAD) {
            similarMoments.push({ moment: past, similarity });
        }
    }
    // 3. If we found similar moments from different sessions, create a thread
    if (similarMoments.length > 0) {
        // Sort by similarity and take the best
        similarMoments.sort((a, b) => b.similarity - a.similarity);
        const bestMatch = similarMoments[0];
        // Check if these moments are from truly different sessions
        const uniqueSessions = new Set([
            newMoment.sessionId,
            ...similarMoments.map((m) => m.moment.sessionId),
        ]);
        if (uniqueSessions.size >= CONFIG.MIN_MOMENTS_FOR_THREAD) {
            // Create new thread
            if (threads.length < CONFIG.MAX_THREADS_PER_USER) {
                const thread = await createThread(userId, newMoment, similarMoments, embedding);
                threads.push(thread);
                threadCache.set(userId, threads);
                await saveThread(userId, thread);
                return thread;
            }
        }
    }
    return null;
}
/**
 * Add a moment to an existing thread.
 */
function addMomentToThread(thread, moment) {
    thread.moments.push(moment);
    // Trim if too many
    if (thread.moments.length > CONFIG.MAX_MOMENTS_PER_THREAD) {
        thread.moments = thread.moments.slice(-CONFIG.MAX_MOMENTS_PER_THREAD);
    }
    // Update thread properties
    thread.lastMoment = moment.timestamp;
    thread.depth = new Set(thread.moments.map((m) => m.sessionId)).size;
    // Recalculate coherence (average similarity)
    const similarities = thread.moments.map((m) => m.similarity);
    thread.coherence = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    // Update connection insight
    updateConnectionInsight(thread);
}
/**
 * Create a new semantic thread.
 */
async function createThread(userId, currentMoment, connections, embedding) {
    const now = Date.now();
    // Gather all moments
    const allMoments = [{ moment: currentMoment, similarity: 1.0 }, ...connections];
    // Generate theme from most representative content
    const theme = await generateTheme(allMoments.map((m) => m.moment.content));
    // Determine if user is likely conscious of this connection
    const userAwareness = inferUserAwareness(allMoments.map((m) => m.moment));
    const thread = {
        id: `thread_${now}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        theme,
        themeEmbedding: embedding,
        moments: allMoments.map((m) => ({
            ...m.moment,
            similarity: m.similarity,
        })),
        depth: new Set(allMoments.map((m) => m.moment.sessionId)).size,
        coherence: allMoments.reduce((a, b) => a + b.similarity, 0) / allMoments.length,
        userAwareness,
        connectionInsight: '',
        surfacedToUser: false,
        firstMoment: Math.min(...allMoments.map((m) => m.moment.timestamp)),
        lastMoment: Math.max(...allMoments.map((m) => m.moment.timestamp)),
        discoveredAt: now,
    };
    // Generate insight
    updateConnectionInsight(thread);
    return thread;
}
/**
 * Generate a theme from moment contents.
 */
async function generateTheme(contents) {
    // Simple approach: extract common significant words
    const words = contents.join(' ').toLowerCase().split(/\s+/);
    const wordFreq = new Map();
    const stopWords = new Set([
        'i',
        'me',
        'my',
        'the',
        'a',
        'an',
        'is',
        'are',
        'was',
        'were',
        'be',
        'been',
        'being',
        'have',
        'has',
        'had',
        'do',
        'does',
        'did',
        'will',
        'would',
        'could',
        'should',
        'may',
        'might',
        'must',
        'to',
        'of',
        'in',
        'for',
        'on',
        'with',
        'at',
        'by',
        'from',
        'it',
        'that',
        'this',
        'but',
        'and',
        'or',
        'so',
        'if',
        'just',
        'like',
        'about',
        'really',
        'always',
        'never',
        'feel',
        'think',
    ]);
    for (const word of words) {
        const cleaned = word.replace(/[^a-z]/g, '');
        if (cleaned.length > 3 && !stopWords.has(cleaned)) {
            wordFreq.set(cleaned, (wordFreq.get(cleaned) || 0) + 1);
        }
    }
    // Get top words
    const topWords = [...wordFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([word]) => word);
    if (topWords.length > 0) {
        return topWords.join(' & ');
    }
    return 'Connected thoughts';
}
/**
 * Infer whether user is likely aware of this connection.
 */
function inferUserAwareness(moments) {
    // If moments are close in time, probably conscious
    const timestamps = moments.map((m) => m.timestamp).sort((a, b) => a - b);
    const maxGap = Math.max(...timestamps.slice(1).map((t, i) => t - timestamps[i]));
    // If spread over long time, probably unconscious connection
    if (maxGap > 30 * 24 * 60 * 60 * 1000) {
        // 30 days
        return 'unconscious';
    }
    else if (maxGap > 7 * 24 * 60 * 60 * 1000) {
        // 7 days
        return 'mixed';
    }
    return 'conscious';
}
/**
 * Update the connection insight for a thread.
 */
function updateConnectionInsight(thread) {
    const { moments, userAwareness, depth, coherence } = thread;
    if (moments.length < 2) {
        thread.connectionInsight = 'Connection forming...';
        return;
    }
    // Get time span
    const timeSpan = thread.lastMoment - thread.firstMoment;
    const daySpan = Math.floor(timeSpan / (24 * 60 * 60 * 1000));
    // Base insight on awareness level
    if (userAwareness === 'unconscious') {
        if (daySpan > 30) {
            thread.connectionInsight = `Over ${daySpan} days and ${depth} conversations, these thoughts have been connected in ways you might not have noticed.`;
        }
        else {
            thread.connectionInsight = `There's a thread running through these ${depth} conversations that you might not see yet.`;
        }
    }
    else if (userAwareness === 'mixed') {
        thread.connectionInsight = `You've touched on this in ${depth} different conversations. There might be a deeper connection here.`;
    }
    else {
        thread.connectionInsight = `This theme has been present in ${depth} of your conversations.`;
    }
    // Add strength indicator
    if (coherence > 0.85) {
        thread.connectionInsight += ' The connection is strong.';
    }
}
// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================
/**
 * Get all threads for a user.
 */
export async function getThreads(userId) {
    return threadCache.get(userId) || (await loadThreads(userId));
}
/**
 * Get threads relevant to current conversation.
 */
export async function getRelevantThreads(userId, context) {
    const threads = await getThreads(userId);
    if (!context.currentContent && !context.currentTopic) {
        // Return unsurfaced threads with high coherence
        return threads.filter((t) => !t.surfacedToUser && t.coherence >= 0.7).slice(0, 3);
    }
    // Score relevance
    let contextEmbedding = null;
    if (context.currentContent) {
        try {
            contextEmbedding = await embed(context.currentContent);
        }
        catch {
            // Fall back to text matching
        }
    }
    const scored = threads.map((thread) => {
        let relevance = 0;
        // Semantic similarity
        if (contextEmbedding && thread.themeEmbedding) {
            relevance = cosineSimilarity(contextEmbedding, thread.themeEmbedding);
        }
        // Text matching fallback
        if (context.currentTopic) {
            if (thread.theme.toLowerCase().includes(context.currentTopic.toLowerCase())) {
                relevance += 0.3;
            }
        }
        // Boost for unconscious connections (more valuable to surface)
        if (thread.userAwareness === 'unconscious') {
            relevance *= 1.2;
        }
        // Penalize already surfaced
        if (thread.surfacedToUser) {
            relevance *= 0.5;
        }
        return { thread, relevance };
    });
    return scored
        .filter((s) => s.relevance >= 0.5)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 3)
        .map((s) => s.thread);
}
/**
 * Get threads by awareness level.
 */
export async function getUnconsciousConnections(userId) {
    const threads = await getThreads(userId);
    return threads
        .filter((t) => t.userAwareness === 'unconscious' && !t.surfacedToUser)
        .sort((a, b) => b.coherence - a.coherence);
}
/**
 * Mark a thread as surfaced to user.
 */
export async function markThreadSurfaced(userId, threadId, reaction) {
    const threads = await getThreads(userId);
    const thread = threads.find((t) => t.id === threadId);
    if (thread) {
        thread.surfacedToUser = true;
        if (reaction) {
            thread.userReaction = reaction;
        }
        await saveThread(userId, thread);
    }
}
/**
 * Build context string for LLM injection.
 */
export async function buildThreadingContext(userId, currentContext) {
    const relevant = await getRelevantThreads(userId, {
        currentContent: currentContext?.content,
        currentTopic: currentContext?.topic,
    });
    if (relevant.length === 0) {
        return '';
    }
    const sections = [
        '[CROSS-SESSION SEMANTIC THREADING - Hidden Connections]',
        "You see connections across conversations they don't realize are linked.",
        '',
    ];
    for (const thread of relevant) {
        const awarenessEmoji = {
            conscious: '👁️',
            mixed: '🔍',
            unconscious: '💡',
        }[thread.userAwareness];
        sections.push(`**${awarenessEmoji} ${thread.theme}**`);
        sections.push(`  ${thread.connectionInsight}`);
        // Show sample moments
        if (thread.moments.length > 0) {
            const sample = thread.moments[0];
            sections.push(`  Example: "${sample.content.slice(0, 80)}..."`);
        }
        sections.push('');
    }
    sections.push('Surface unconscious connections gently: "I notice something..." or "There\'s a thread here..."');
    return sections.join('\n');
}
// ============================================================================
// PERSISTENCE
// ============================================================================
async function loadThreads(userId) {
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('semantic_threads')
            .orderBy('coherence', 'desc')
            .limit(CONFIG.MAX_THREADS_PER_USER)
            .get();
        const threads = snapshot.docs.map((doc) => doc.data());
        threadCache.set(userId, threads);
        return threads;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load threads');
        return [];
    }
}
async function saveThread(userId, thread) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('semantic_threads')
            .doc(thread.id)
            .set(cleanForFirestore(thread));
        // Index to semantic memory for "Better Than Human" recall
        // "We connect the dots across time"
        void onCrossSessionThreadChange(userId, thread.id, {
            topic: thread.theme || thread.moments[0]?.content.slice(0, 50) || 'Unknown topic',
            sessionIds: [...new Set(thread.moments.map((m) => m.sessionId))],
            evolution: `Discovered across ${thread.moments.length} moments with ${(thread.coherence * 100).toFixed(0)}% coherence. Insight: ${thread.connectionInsight}`,
            relatedTopics: thread.moments.slice(0, 3).map((m) => m.emotionalContext || 'general'),
            emotionalSignificance: thread.coherence >= 0.8 ? 'high' : thread.coherence >= 0.6 ? 'medium' : 'low',
            lastMentioned: new Date().toISOString(),
            mentionCount: thread.moments.length,
        }, 'update');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to save thread');
    }
}
/**
 * Clear thread cache for a user.
 */
export function clearThreadCache(userId) {
    if (userId) {
        threadCache.delete(userId);
        momentBuffer.delete(userId);
    }
    else {
        threadCache.clear();
        momentBuffer.clear();
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const crossSessionThreading = {
    recordMoment,
    getThreads,
    getRelevantThreads,
    getUnconsciousConnections,
    markSurfaced: markThreadSurfaced,
    buildContext: buildThreadingContext,
    clearCache: clearThreadCache,
};
//# sourceMappingURL=cross-session-threading.js.map