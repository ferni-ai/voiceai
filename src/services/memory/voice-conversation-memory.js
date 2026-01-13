/**
 * Voice-Based Conversation Memory
 *
 * Links verified voice profiles to conversation history.
 * Enables cross-session context retrieval based on speaker identity.
 *
 * FEATURES:
 * - Tag conversations with verified user ID
 * - Retrieve past conversations for identified speaker
 * - Cross-session context ("remember when we talked about...")
 * - Topic extraction and memory
 * - Relationship tracking over time
 *
 * @module VoiceConversationMemory
 */
import admin from 'firebase-admin';
import pino from 'pino';
import { getGCPProjectId } from '../../config/environment.js';
import { removeUndefined } from '../../utils/firestore-utils.js';
const log = pino({ name: 'voice-memory' });
// ============================================================================
// FIRESTORE
// ============================================================================
const CONVERSATIONS_COLLECTION = 'voice_conversations';
const MEMORIES_COLLECTION = 'voice_memories';
let firestoreInstance = null;
let initAttempted = false;
function getFirestore() {
    if (firestoreInstance)
        return firestoreInstance;
    if (initAttempted)
        return null;
    initAttempted = true;
    try {
        if (admin.apps.length === 0) {
            const projectId = getGCPProjectId();
            if (projectId) {
                admin.initializeApp({ projectId });
            }
            else {
                admin.initializeApp();
            }
        }
        firestoreInstance = admin.firestore();
        return firestoreInstance;
    }
    catch (error) {
        log.warn({ error }, 'Firebase not available for conversation memory');
        return null;
    }
}
// In-memory cache
const conversationsCache = new Map();
const memoriesCache = new Map();
// ============================================================================
// CONVERSATION RECORDING
// ============================================================================
/**
 * Start recording a new conversation.
 */
export function startConversation(userId, sessionId, voiceVerified = false, verificationConfidence) {
    const conversation = {
        id: `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        userId,
        sessionId,
        turns: [],
        startedAt: new Date(),
        topics: [],
        voiceVerified,
        verificationConfidence,
    };
    log.info({
        conversationId: conversation.id,
        userId,
        voiceVerified,
    }, 'Conversation started');
    return conversation;
}
/**
 * Add a turn to the conversation.
 */
export function addConversationTurn(conversation, role, content, metadata) {
    const turn = {
        role,
        content,
        timestamp: new Date(),
        metadata,
    };
    conversation.turns.push(turn);
    // Extract topics from content
    const newTopics = extractTopics(content);
    for (const topic of newTopics) {
        if (!conversation.topics.includes(topic)) {
            conversation.topics.push(topic);
        }
    }
    return conversation;
}
/**
 * End and save a conversation.
 */
export async function endConversation(conversation) {
    conversation.endedAt = new Date();
    // Generate summary
    conversation.summary = generateConversationSummary(conversation);
    // Save to Firestore
    await saveConversation(conversation);
    // Update user memory
    await updateUserMemory(conversation.userId, conversation);
    log.info({
        conversationId: conversation.id,
        turns: conversation.turns.length,
        topics: conversation.topics,
    }, 'Conversation ended');
}
/**
 * Save conversation to Firestore.
 */
async function saveConversation(conversation) {
    // Update cache
    const userConversations = conversationsCache.get(conversation.userId) || [];
    userConversations.push(conversation);
    conversationsCache.set(conversation.userId, userConversations);
    const db = getFirestore();
    if (!db)
        return;
    try {
        await db
            .collection(CONVERSATIONS_COLLECTION)
            .doc(conversation.id)
            .set(removeUndefined({
            ...conversation,
            startedAt: admin.firestore.Timestamp.fromDate(conversation.startedAt),
            endedAt: conversation.endedAt
                ? admin.firestore.Timestamp.fromDate(conversation.endedAt)
                : null,
            turns: conversation.turns.map((t) => removeUndefined({
                ...t,
                timestamp: admin.firestore.Timestamp.fromDate(t.timestamp),
            })),
        }));
    }
    catch (error) {
        log.error({ error, conversationId: conversation.id }, 'Failed to save conversation');
    }
}
// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================
/**
 * Update user's conversation memory after a conversation.
 */
async function updateUserMemory(userId, conversation) {
    let memory = await getUserMemory(userId);
    if (!memory) {
        memory = {
            userId,
            totalConversations: 0,
            totalDuration: 0,
            firstConversation: conversation.startedAt,
            lastConversation: conversation.startedAt,
            topics: [],
            importantMoments: [],
            relationshipMilestones: [],
        };
    }
    // Update stats
    memory.totalConversations++;
    memory.lastConversation = conversation.endedAt || new Date();
    if (conversation.endedAt) {
        const durationMs = conversation.endedAt.getTime() - conversation.startedAt.getTime();
        memory.totalDuration += durationMs / 60000; // Convert to minutes
    }
    // Update topics
    for (const topic of conversation.topics) {
        const existing = memory.topics.find((t) => t.topic === topic);
        if (existing) {
            existing.count++;
            existing.lastMentioned = conversation.endedAt || new Date();
        }
        else {
            memory.topics.push({
                topic,
                count: 1,
                lastMentioned: conversation.endedAt || new Date(),
            });
        }
    }
    // Sort topics by count
    memory.topics.sort((a, b) => b.count - a.count);
    // Keep only top 50 topics
    memory.topics = memory.topics.slice(0, 50);
    // Check for important moments
    const importantMoment = detectImportantMoment(conversation);
    if (importantMoment) {
        memory.importantMoments.push(importantMoment);
        // Keep only last 20 important moments
        if (memory.importantMoments.length > 20) {
            memory.importantMoments = memory.importantMoments.slice(-20);
        }
    }
    // Check for relationship milestones
    const milestone = detectRelationshipMilestone(memory, conversation);
    if (milestone) {
        memory.relationshipMilestones.push(milestone);
    }
    await saveUserMemory(memory);
}
/**
 * Get user's conversation memory.
 */
export async function getUserMemory(userId) {
    // Check cache
    if (memoriesCache.has(userId)) {
        return memoriesCache.get(userId);
    }
    const db = getFirestore();
    if (!db)
        return null;
    try {
        const doc = await db.collection(MEMORIES_COLLECTION).doc(userId).get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        const memory = {
            userId: data.userId,
            totalConversations: data.totalConversations,
            totalDuration: data.totalDuration,
            firstConversation: data.firstConversation?.toDate() ?? new Date(),
            lastConversation: data.lastConversation?.toDate() ?? new Date(),
            topics: data.topics?.map((t) => ({
                topic: t.topic,
                count: t.count,
                lastMentioned: t.lastMentioned?.toDate() ?? new Date(),
            })) || [],
            importantMoments: data.importantMoments?.map((m) => ({
                summary: m.summary,
                date: m.date?.toDate() ?? new Date(),
                emotion: m.emotion,
            })) || [],
            relationshipMilestones: data.relationshipMilestones?.map((m) => ({
                milestone: m.milestone,
                date: m.date?.toDate() ?? new Date(),
            })) || [],
        };
        memoriesCache.set(userId, memory);
        return memory;
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to load user memory');
        return null;
    }
}
/**
 * Save user memory to Firestore.
 */
async function saveUserMemory(memory) {
    memoriesCache.set(memory.userId, memory);
    const db = getFirestore();
    if (!db)
        return;
    try {
        await db
            .collection(MEMORIES_COLLECTION)
            .doc(memory.userId)
            .set(removeUndefined({
            ...memory,
            firstConversation: admin.firestore.Timestamp.fromDate(memory.firstConversation),
            lastConversation: admin.firestore.Timestamp.fromDate(memory.lastConversation),
            topics: memory.topics.map((t) => removeUndefined({
                ...t,
                lastMentioned: admin.firestore.Timestamp.fromDate(t.lastMentioned),
            })),
            importantMoments: memory.importantMoments.map((m) => removeUndefined({
                ...m,
                date: admin.firestore.Timestamp.fromDate(m.date),
            })),
            relationshipMilestones: memory.relationshipMilestones.map((m) => removeUndefined({
                ...m,
                date: admin.firestore.Timestamp.fromDate(m.date),
            })),
        }));
    }
    catch (error) {
        log.error({ error, userId: memory.userId }, 'Failed to save user memory');
    }
}
// ============================================================================
// CONTEXT RETRIEVAL
// ============================================================================
/**
 * Get context for a new conversation with a user.
 */
export async function getConversationContext(userId) {
    const memory = await getUserMemory(userId);
    const recentConversations = await getRecentConversations(userId, 5);
    const context = {
        recentTopics: [],
        unfinishedThreads: [],
        rememberedDetails: [],
        suggestedFollowUps: [],
    };
    if (!memory)
        return context;
    // Get recent topics (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    context.recentTopics = memory.topics
        .filter((t) => t.lastMentioned > thirtyDaysAgo)
        .slice(0, 10)
        .map((t) => t.topic);
    // Find unfinished threads (topics mentioned but not resolved)
    for (const conv of recentConversations) {
        // Look for open questions or unfinished discussions
        const lastTurn = conv.turns[conv.turns.length - 1];
        if (lastTurn?.role === 'user' && lastTurn.content.includes('?')) {
            context.unfinishedThreads.push({
                topic: conv.topics[0] || 'general',
                lastDiscussed: conv.endedAt || conv.startedAt,
                summary: truncate(lastTurn.content, 100),
            });
        }
    }
    // Extract remembered details
    for (const moment of memory.importantMoments.slice(-5)) {
        context.rememberedDetails.push({
            detail: moment.summary,
            confidence: 0.8,
            source: 'important_moment',
        });
    }
    // Generate follow-up suggestions
    context.suggestedFollowUps = generateFollowUpSuggestions(memory, recentConversations);
    return context;
}
/**
 * Get recent conversations for a user.
 */
export async function getRecentConversations(userId, limit = 10) {
    // Check cache first
    const cached = conversationsCache.get(userId);
    if (cached && cached.length >= limit) {
        return cached.slice(-limit).reverse();
    }
    const db = getFirestore();
    if (!db)
        return cached?.slice(-limit).reverse() || [];
    try {
        const snapshot = await db
            .collection(CONVERSATIONS_COLLECTION)
            .where('userId', '==', userId)
            .orderBy('startedAt', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                userId: data.userId,
                sessionId: data.sessionId,
                turns: data.turns?.map((t) => ({
                    role: t.role,
                    content: t.content,
                    timestamp: t.timestamp?.toDate() ?? new Date(),
                    metadata: t.metadata,
                })) || [],
                startedAt: data.startedAt?.toDate() ?? new Date(),
                endedAt: data.endedAt?.toDate(),
                summary: data.summary,
                topics: data.topics || [],
                voiceVerified: data.voiceVerified,
                verificationConfidence: data.verificationConfidence,
            };
        });
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to load recent conversations');
        return [];
    }
}
/**
 * Search conversations by topic.
 */
export async function searchConversationsByTopic(userId, topic, limit = 5) {
    const db = getFirestore();
    if (!db)
        return [];
    try {
        const snapshot = await db
            .collection(CONVERSATIONS_COLLECTION)
            .where('userId', '==', userId)
            .where('topics', 'array-contains', topic.toLowerCase())
            .orderBy('startedAt', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                userId: data.userId,
                sessionId: data.sessionId,
                turns: data.turns || [],
                startedAt: data.startedAt?.toDate(),
                endedAt: data.endedAt?.toDate(),
                summary: data.summary,
                topics: data.topics || [],
                voiceVerified: data.voiceVerified,
                verificationConfidence: data.verificationConfidence,
            };
        });
    }
    catch (error) {
        log.error({ error, userId, topic }, 'Failed to search conversations');
        return [];
    }
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Extract topics from text content.
 */
function extractTopics(content) {
    // Simple keyword extraction (in production, use NLP)
    const topics = [];
    // Common topic indicators
    const topicPatterns = [
        /(?:about|regarding|concerning|discussing)\s+(\w+(?:\s+\w+)?)/gi,
        /(?:my|the)\s+(job|work|family|health|relationship|career|hobby|goal|dream)/gi,
        /(?:feeling|felt|feel)\s+(\w+)/gi,
    ];
    for (const pattern of topicPatterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
            const topic = match[1].toLowerCase().trim();
            if (topic.length > 2 && !topics.includes(topic)) {
                topics.push(topic);
            }
        }
    }
    return topics;
}
/**
 * Generate a summary of the conversation.
 */
function generateConversationSummary(conversation) {
    const turnCount = conversation.turns.length;
    const topicsStr = conversation.topics.slice(0, 3).join(', ');
    if (turnCount === 0)
        return 'Empty conversation';
    if (turnCount <= 2)
        return 'Brief exchange';
    return `Discussed ${topicsStr || 'various topics'} over ${turnCount} turns.`;
}
/**
 * Detect if a conversation had an important moment.
 */
function detectImportantMoment(conversation) {
    // Look for emotional moments or significant disclosures
    for (const turn of conversation.turns) {
        const content = turn.content.toLowerCase();
        // Check for significant emotional content
        if (content.includes('breakthrough') ||
            content.includes('realized') ||
            content.includes('finally understand') ||
            content.includes('thank you so much') ||
            content.includes('this really helped')) {
            return {
                summary: truncate(turn.content, 200),
                date: turn.timestamp,
                emotion: turn.metadata?.emotion,
            };
        }
    }
    return null;
}
/**
 * Detect relationship milestones.
 */
function detectRelationshipMilestone(memory, _conversation) {
    // First conversation
    if (memory.totalConversations === 1) {
        return {
            milestone: 'First conversation',
            date: new Date(),
        };
    }
    // Conversation count milestones
    const milestoneConversations = [10, 25, 50, 100, 250, 500];
    if (milestoneConversations.includes(memory.totalConversations)) {
        return {
            milestone: `${memory.totalConversations} conversations together`,
            date: new Date(),
        };
    }
    // Weekly streak (simplified)
    const daysSinceFirst = (Date.now() - memory.firstConversation.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceFirst >= 7 && memory.totalConversations >= 7) {
        return {
            milestone: 'One week together',
            date: new Date(),
        };
    }
    return null;
}
/**
 * Generate follow-up suggestions based on memory.
 */
function generateFollowUpSuggestions(memory, recentConversations) {
    const suggestions = [];
    // Recent topic to revisit
    if (memory.topics.length > 0) {
        const recentTopic = memory.topics[0];
        suggestions.push(`How are things going with ${recentTopic.topic}?`);
    }
    // Follow up on important moment
    if (memory.importantMoments.length > 0) {
        const recentMoment = memory.importantMoments[memory.importantMoments.length - 1];
        const daysSince = (Date.now() - recentMoment.date.getTime()) / (24 * 60 * 60 * 1000);
        if (daysSince > 1 && daysSince < 14) {
            suggestions.push(`Remember when you mentioned "${truncate(recentMoment.summary, 50)}"?`);
        }
    }
    // Check for open threads
    if (recentConversations.length > 0) {
        const lastConv = recentConversations[0];
        if (lastConv.topics.length > 0) {
            suggestions.push(`Last time we talked about ${lastConv.topics[0]}...`);
        }
    }
    return suggestions.slice(0, 3);
}
/**
 * Truncate text to max length.
 */
function truncate(text, maxLength) {
    if (text.length <= maxLength)
        return text;
    return `${text.slice(0, maxLength - 3)}...`;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    startConversation,
    addConversationTurn,
    endConversation,
    getUserMemory,
    getConversationContext,
    getRecentConversations,
    searchConversationsByTopic,
};
//# sourceMappingURL=voice-conversation-memory.js.map