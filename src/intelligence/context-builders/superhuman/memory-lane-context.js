/**
 * Memory Lane Context Builder
 *
 * Proactively surfaces relevant memories during conversation:
 *
 * 1. ON THIS DAY - Anniversary memories from the same date
 *    - "A year ago today, you shared something important..."
 *
 * 2. TOPIC MATCH - When user discusses a topic with stored memory
 *    - "That reminds me of when you..."
 *
 * 3. GROWTH CELEBRATION - Progress on commitments/dreams
 *    - "Remember when you said you'd never...? Look at you now!"
 *
 * 4. EMOTIONAL ECHO - Current emotion matches past breakthrough
 *    - "You've been here before, and you got through it..."
 *
 * @module intelligence/context-builders/superhuman/memory-lane-context
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { createHighInjection, createHintInjection, registerContextBuilder, } from '../index.js';
import { BuilderCategory } from '../core/categories.js';
const log = createLogger({ module: 'MemoryLaneContext' });
const sessions = new Map();
function getSession(sessionId) {
    let session = sessions.get(sessionId);
    if (!session) {
        session = {
            surfacedMemoryIds: new Set(),
            lastSurfacedTurn: 0,
            sessionStart: new Date(),
        };
        sessions.set(sessionId, session);
    }
    return session;
}
function clearMemoryLaneSessionInternal(sessionId) {
    sessions.delete(sessionId);
}
function clearAllMemoryLaneSessionsInternal() {
    sessions.clear();
}
// ============================================================================
// CONSTANTS
// ============================================================================
// Minimum turns between surfacing memories (don't overwhelm)
const MIN_TURNS_BETWEEN_MEMORIES = 8;
// Only surface at session start or early turns
const MAX_TURN_FOR_ANNIVERSARY = 3;
// ============================================================================
// MEMORY SELECTION
// ============================================================================
/**
 * Find memories relevant to current conversation context
 */
async function findRelevantMemories(userId, context) {
    const session = getSession(context.sessionId);
    const candidates = [];
    try {
        const { loadMemories, loadOnThisDayMemories } = await import('../../../services/memory-lane/memory-collector.js');
        const { scoreMemory } = await import('../../../services/memory-lane/highlight-scorer.js');
        const scoringContext = {
            currentDate: new Date(),
            userTotalMemories: 0,
            queryContext: {
                currentTopic: context.currentTopic,
                currentEmotion: context.currentEmotion,
            },
        };
        // 1. Check for "On This Day" memories (only at session start)
        if (context.turnCount <= MAX_TURN_FOR_ANNIVERSARY) {
            const onThisDay = await loadOnThisDayMemories(userId);
            for (const memory of onThisDay) {
                if (session.surfacedMemoryIds.has(memory.id))
                    continue;
                candidates.push({
                    memory,
                    surfacingReason: 'on_this_day',
                    promptFragment: buildAnniversaryPrompt(memory),
                    confidence: 0.9,
                });
            }
        }
        // 2. Check for topic-related memories
        if (context.currentTopic) {
            const memories = await loadMemories(userId, { limit: 50 });
            const topicLower = context.currentTopic.toLowerCase();
            for (const memory of memories) {
                if (session.surfacedMemoryIds.has(memory.id))
                    continue;
                const hasTopicMatch = memory.topicTags.some((tag) => tag.toLowerCase().includes(topicLower) || topicLower.includes(tag.toLowerCase()));
                if (hasTopicMatch) {
                    const score = scoreMemory(memory, scoringContext);
                    candidates.push({
                        memory,
                        surfacingReason: 'topic_match',
                        promptFragment: buildTopicMatchPrompt(memory, context.currentTopic),
                        confidence: score,
                    });
                }
            }
        }
        // 3. Check for emotional echo (when current emotion matches past breakthrough)
        if (context.currentEmotion && ['sad', 'anxious', 'stressed', 'overwhelmed'].includes(context.currentEmotion)) {
            const memories = await loadMemories(userId, { types: ['breakthrough', 'growth'] });
            for (const memory of memories) {
                if (session.surfacedMemoryIds.has(memory.id))
                    continue;
                // Only surface positive breakthroughs during difficult emotions
                if (memory.emotionalTone === 'proud' || memory.emotionalTone === 'meaningful') {
                    candidates.push({
                        memory,
                        surfacingReason: 'emotional_echo',
                        promptFragment: buildEmotionalEchoPrompt(memory),
                        confidence: 0.7,
                    });
                }
            }
        }
        // 4. Check for mentioned people
        if (context.recentlyMentionedPeople && context.recentlyMentionedPeople.length > 0) {
            const memories = await loadMemories(userId, { limit: 50 });
            for (const memory of memories) {
                if (session.surfacedMemoryIds.has(memory.id))
                    continue;
                const mentionedPerson = context.recentlyMentionedPeople.find((person) => memory.peopleReferenced.some((p) => p.toLowerCase().includes(person.toLowerCase())));
                if (mentionedPerson) {
                    candidates.push({
                        memory,
                        surfacingReason: 'person_mentioned',
                        promptFragment: buildPersonMentionPrompt(memory, mentionedPerson),
                        confidence: 0.75,
                    });
                }
            }
        }
    }
    catch (err) {
        log.warn({ error: String(err), userId }, 'Failed to find relevant memories');
    }
    // Sort by confidence and return top candidates
    return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}
// ============================================================================
// PROMPT BUILDERS
// ============================================================================
function buildAnniversaryPrompt(memory) {
    const yearsAgo = calculateYearsAgo(memory.occurredAt);
    const yearsText = yearsAgo === 1 ? 'year' : 'years';
    return `[ON THIS DAY - ${yearsAgo} ${yearsText} ago]
You could naturally weave in: "${memory.content}"
Approach: Warm, nostalgic, celebrating shared history. Don't force it - only mention if conversation flows there.`;
}
function buildTopicMatchPrompt(memory, topic) {
    return `[RELATED MEMORY about "${topic}"]
You remember: "${memory.content}"
Approach: If naturally relevant, you might reference this. Shows you remember their journey.`;
}
function buildEmotionalEchoPrompt(memory) {
    return `[PAST STRENGTH to draw on]
They've been through hard things before: "${memory.content}"
Approach: Gently remind them of their resilience. "You've been here before..."`;
}
function buildPersonMentionPrompt(memory, personName) {
    return `[MEMORY about ${personName}]
You remember: "${memory.content}"
Approach: Shows you pay attention to the people in their life. Reference naturally.`;
}
function calculateYearsAgo(occurredAt) {
    const date = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
    return new Date().getFullYear() - date.getFullYear();
}
// ============================================================================
// MAIN BUILDER
// ============================================================================
async function buildMemoryLaneContext(input) {
    const { services, analysis, userData, userText } = input;
    const injections = [];
    const userId = services?.userId || services?.userProfile?.id;
    const sessionId = services?.sessionId || 'unknown';
    const turnCount = userData.turnCount || 1;
    if (!userId)
        return injections;
    const session = getSession(sessionId);
    // Respect cooldown between memory surfacing
    if (session.lastSurfacedTurn > 0 && turnCount - session.lastSurfacedTurn < MIN_TURNS_BETWEEN_MEMORIES) {
        return injections;
    }
    try {
        // Build context for memory selection
        const currentTopic = analysis?.topics?.primary || analysis?.topics?.detected?.[0];
        const currentEmotion = analysis?.emotion?.primary;
        // Extract mentioned people from user text
        const recentlyMentionedPeople = extractPeopleFromText(userText || '');
        const relevantMemories = await findRelevantMemories(userId, {
            currentTopic,
            currentEmotion,
            recentlyMentionedPeople,
            turnCount,
            sessionId,
        });
        if (relevantMemories.length === 0)
            return injections;
        // Pick the best memory to surface
        const bestMemory = relevantMemories[0];
        // Determine priority based on surfacing reason
        const isHighPriority = bestMemory.surfacingReason === 'on_this_day';
        const createFn = isHighPriority ? createHighInjection : createHintInjection;
        injections.push(createFn('memory_lane_surfacing', `[🏛️ MEMORY LANE - Shared History Active]

${bestMemory.promptFragment}

Remember: This shows superhuman memory - you never forget what matters to them.
Only surface if it feels natural. Don't force it.`, {
            category: BuilderCategory.MEMORY,
            confidence: bestMemory.confidence,
        }));
        // Mark as surfaced
        session.surfacedMemoryIds.add(bestMemory.memory.id);
        session.lastSurfacedTurn = turnCount;
        // Mark in database (async, don't block)
        void markMemoryAsSurfaced(userId, bestMemory.memory.id);
        log.debug({
            userId,
            memoryId: bestMemory.memory.id,
            reason: bestMemory.surfacingReason,
            turnCount,
        }, 'Memory ready for surfacing');
    }
    catch (err) {
        log.warn({ error: String(err), userId }, 'Failed to build memory lane context');
    }
    return injections;
}
/**
 * Mark a memory as surfaced in the database
 */
async function markMemoryAsSurfaced(userId, memoryId) {
    try {
        const { markMemorySurfaced } = await import('../../../services/memory-lane/highlight-scorer.js');
        await markMemorySurfaced(userId, memoryId, 'conversation');
    }
    catch {
        // Non-critical, don't log
    }
}
/**
 * Simple extraction of potential person names from text
 */
function extractPeopleFromText(text) {
    // Look for common patterns like "my friend Sarah", "my mom", etc.
    const patterns = [
        /\bmy\s+(mom|mother|dad|father|brother|sister|wife|husband|partner|friend|boss|colleague)\s+(\w+)/gi,
        /\b(Sarah|John|Mike|Emily|David|Lisa|Tom|Amy|Chris|Jessica|Matt|Rachel|James|Mary|Robert|Jennifer)\b/gi,
    ];
    const people = [];
    for (const pattern of patterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            // Get the name (last capture group or full match)
            const name = match[2] || match[1] || match[0];
            if (name && !people.includes(name)) {
                people.push(name);
            }
        }
    }
    return people;
}
// ============================================================================
// REGISTRATION
// ============================================================================
// Register with the context builder system
registerContextBuilder({
    name: 'memory-lane',
    description: 'Surfaces meaningful memories from past conversations when contextually relevant',
    category: BuilderCategory.MEMORY,
    priority: 60, // Lower priority than core superhuman features
    build: buildMemoryLaneContext,
});
// ============================================================================
// EXPORTS
// ============================================================================
export { buildMemoryLaneContext, clearMemoryLaneSessionInternal as clearMemoryLaneSession, clearAllMemoryLaneSessionsInternal as clearAllMemoryLaneSessions, };
//# sourceMappingURL=memory-lane-context.js.map