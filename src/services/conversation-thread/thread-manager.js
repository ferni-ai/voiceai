/**
 * Conversation Thread Manager
 *
 * Manages unified conversation threads that span channels and agents.
 * This is the core of bidirectional engagement - whether the agent
 * reaches out or the user initiates, it's all one continuous thread.
 *
 * @module services/conversation-thread/thread-manager
 */
import { createLogger } from '../../utils/safe-logger.js';
import { v4 as uuidv4 } from 'uuid';
import { saveThread as persistThread, loadActiveThread as loadPersistedActiveThread, saveMessage as persistMessage, loadMessages as loadPersistedMessages, } from './thread-persistence.js';
const log = createLogger({ module: 'ThreadManager' });
// ============================================================================
// IN-MEMORY STORE (would be Firestore in production)
// ============================================================================
/** Active threads by user ID (most recent thread per user) */
const activeThreads = new Map();
/** Thread lookup by ID */
const threadIndex = new Map();
/** Messages by thread ID */
const threadMessages = new Map();
// ============================================================================
// CONFIGURATION
// ============================================================================
/** Max hours between messages before thread is considered stale */
const THREAD_STALE_HOURS = 72;
/** Max messages to load by default */
const DEFAULT_MESSAGE_LIMIT = 50;
/** Max messages for LLM context */
const LLM_CONTEXT_MESSAGE_LIMIT = 20;
// ============================================================================
// THREAD LIFECYCLE
// ============================================================================
/**
 * Get or create a thread for a user.
 * If there's an active thread, return it. Otherwise create new.
 * Checks both in-memory cache and Firestore.
 */
export async function getOrCreateThread(userId, channel, agentId, options) {
    // Check in-memory cache first
    const cached = activeThreads.get(userId);
    if (cached && !isThreadStale(cached)) {
        log.debug({ userId, threadId: cached.id }, 'Continuing cached thread');
        return cached;
    }
    // Check Firestore for active thread
    try {
        const persisted = await loadPersistedActiveThread(userId);
        if (persisted && !isThreadStale(persisted)) {
            // Cache it
            activeThreads.set(userId, persisted);
            threadIndex.set(persisted.id, persisted);
            // Load messages into memory cache
            const messages = await loadPersistedMessages(userId, persisted.id);
            threadMessages.set(persisted.id, messages);
            persisted.messages = messages;
            log.debug({ userId, threadId: persisted.id }, 'Loaded active thread from Firestore');
            return persisted;
        }
    }
    catch (error) {
        log.warn({ error, userId }, 'Failed to load thread from Firestore, creating new');
    }
    // Create new thread
    const thread = {
        id: uuidv4(),
        userId,
        currentOwnerId: agentId,
        ownershipHistory: [],
        channelsUsed: [channel],
        originChannel: channel,
        lastChannel: channel,
        messages: [],
        messageCount: 0,
        startedAt: new Date(),
        lastActivityAt: new Date(),
        topicTags: [],
        status: 'active',
        triggerType: options?.triggerType,
        outreachId: options?.outreachId,
    };
    // Store in memory
    activeThreads.set(userId, thread);
    threadIndex.set(thread.id, thread);
    threadMessages.set(thread.id, []);
    // Persist to Firestore (fire-and-forget)
    void persistThread(thread);
    log.info({
        userId,
        threadId: thread.id,
        channel,
        agentId,
        triggerType: options?.triggerType,
    }, '🧵 New conversation thread created');
    return thread;
}
/**
 * Get a thread by ID.
 */
export async function getThread(threadId) {
    return threadIndex.get(threadId) || null;
}
/**
 * Get the active thread for a user.
 * Checks both in-memory cache and Firestore.
 */
export async function getActiveThread(userId) {
    // Check in-memory cache first
    const cached = activeThreads.get(userId);
    if (cached && !isThreadStale(cached)) {
        return cached;
    }
    // Check Firestore
    try {
        const persisted = await loadPersistedActiveThread(userId);
        if (persisted && !isThreadStale(persisted)) {
            // Cache it
            activeThreads.set(userId, persisted);
            threadIndex.set(persisted.id, persisted);
            return persisted;
        }
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to load active thread from Firestore');
    }
    return null;
}
/**
 * Check if a thread is stale.
 */
function isThreadStale(thread) {
    const hoursSinceActivity = (Date.now() - thread.lastActivityAt.getTime()) / (1000 * 60 * 60);
    return hoursSinceActivity > THREAD_STALE_HOURS;
}
// ============================================================================
// MESSAGE MANAGEMENT
// ============================================================================
/**
 * Add a message to a thread.
 * Persists to both in-memory cache and Firestore.
 */
export async function addMessage(threadId, message) {
    const thread = threadIndex.get(threadId);
    if (!thread) {
        throw new Error(`Thread not found: ${threadId}`);
    }
    const fullMessage = {
        ...message,
        id: uuidv4(),
        threadId,
    };
    // Store message in memory
    const messages = threadMessages.get(threadId) || [];
    messages.push(fullMessage);
    threadMessages.set(threadId, messages);
    // Update thread in memory
    thread.messageCount++;
    thread.lastActivityAt = fullMessage.timestamp;
    if (fullMessage.role === 'agent') {
        thread.lastAgentMessageAt = fullMessage.timestamp;
    }
    else if (fullMessage.role === 'user') {
        thread.lastUserMessageAt = fullMessage.timestamp;
    }
    // Track channel usage
    if (!thread.channelsUsed.includes(fullMessage.channel)) {
        thread.channelsUsed.push(fullMessage.channel);
    }
    thread.lastChannel = fullMessage.channel;
    // Persist to Firestore (fire-and-forget for performance)
    void persistMessage(thread.userId, fullMessage);
    void persistThread(thread); // Update thread metadata
    log.debug({
        threadId,
        messageId: fullMessage.id,
        role: fullMessage.role,
        channel: fullMessage.channel,
    }, 'Message added to thread');
    return fullMessage;
}
/**
 * Get messages for a thread.
 */
export async function getMessages(threadId, limit = DEFAULT_MESSAGE_LIMIT) {
    const messages = threadMessages.get(threadId) || [];
    return messages.slice(-limit);
}
// ============================================================================
// OWNERSHIP & HANDOFFS
// ============================================================================
/**
 * Transfer thread ownership to a different agent.
 * Persists to Firestore.
 */
export async function transferOwnership(threadId, toAgentId, reason) {
    const thread = threadIndex.get(threadId);
    if (!thread) {
        throw new Error(`Thread not found: ${threadId}`);
    }
    const transfer = {
        fromAgentId: thread.currentOwnerId,
        toAgentId,
        transferredAt: new Date(),
        reason,
    };
    thread.ownershipHistory.push(transfer);
    thread.currentOwnerId = toAgentId;
    thread.lastActivityAt = new Date();
    // Persist to Firestore
    void persistThread(thread);
    log.info({
        threadId,
        from: transfer.fromAgentId,
        to: toAgentId,
        reason,
    }, '🔄 Thread ownership transferred');
    // Add system message
    await addMessage(threadId, {
        role: 'system',
        channel: thread.lastChannel,
        direction: 'outbound',
        content: `Conversation handed off from ${transfer.fromAgentId} to ${toAgentId}: ${reason}`,
        timestamp: new Date(),
        metadata: { triggeredChannelSwitch: true },
    });
}
// ============================================================================
// THREAD STATUS
// ============================================================================
/**
 * Update thread status.
 * Persists to Firestore.
 */
export async function updateThreadStatus(threadId, status, reason) {
    const thread = threadIndex.get(threadId);
    if (!thread) {
        throw new Error(`Thread not found: ${threadId}`);
    }
    thread.status = status;
    thread.statusReason = reason;
    thread.lastActivityAt = new Date();
    // Persist to Firestore
    void persistThread(thread);
    log.info({ threadId, status, reason }, 'Thread status updated');
}
/**
 * Update thread topics.
 */
export async function updateThreadTopics(threadId, topics) {
    const thread = threadIndex.get(threadId);
    if (!thread)
        return;
    // Merge topics
    for (const topic of topics) {
        if (!thread.topicTags.includes(topic)) {
            thread.topicTags.push(topic);
        }
    }
}
/**
 * Update thread emotional context.
 */
export async function updateEmotionalContext(threadId, current, trajectory) {
    const thread = threadIndex.get(threadId);
    if (!thread)
        return;
    thread.emotionalContext = { current, trajectory };
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build context for an agent joining/continuing a thread.
 * This is what gets injected into the LLM.
 */
export async function buildAgentContext(threadId, agentId, options) {
    const thread = threadIndex.get(threadId);
    if (!thread) {
        throw new Error(`Thread not found: ${threadId}`);
    }
    const messages = await getMessages(threadId, LLM_CONTEXT_MESSAGE_LIMIT);
    const isNewToThread = !thread.ownershipHistory.some((h) => h.toAgentId === agentId) &&
        thread.currentOwnerId !== agentId;
    // Find previous owner if this is a handoff
    const lastTransfer = thread.ownershipHistory[thread.ownershipHistory.length - 1];
    const previousOwner = lastTransfer && thread.currentOwnerId === agentId ? lastTransfer.fromAgentId : undefined;
    // Build LLM context string
    const llmContext = formatLLMContext(thread, messages, {
        agentId,
        isNewToThread,
        previousOwner,
        userInitiated: options?.userInitiated ?? true,
    });
    return {
        thread,
        recentMessages: messages,
        isNewToThread,
        previousOwner,
        joinReason: options?.joinReason,
        userInitiated: options?.userInitiated ?? true,
        llmContext,
    };
}
/**
 * Format thread context for LLM injection.
 */
function formatLLMContext(thread, messages, options) {
    const lines = [];
    // ─────────────────────────────────────────────────────────────────────────
    // THREAD CONTEXT HEADER
    // ─────────────────────────────────────────────────────────────────────────
    lines.push('[CONVERSATION THREAD CONTEXT]');
    lines.push('');
    // Multi-channel awareness
    if (thread.channelsUsed.length > 1) {
        lines.push(`This conversation has spanned multiple channels: ${thread.channelsUsed.join(', ')}.`);
        lines.push(`It started on ${thread.originChannel} and is now on ${thread.lastChannel}.`);
        lines.push('');
    }
    // Ownership context (handoff awareness)
    if (thread.ownershipHistory.length > 0) {
        lines.push(`This conversation has involved: ${[...new Set([thread.ownershipHistory[0].fromAgentId, ...thread.ownershipHistory.map((h) => h.toAgentId)])].join(' → ')}`);
        if (options.previousOwner) {
            lines.push(`You're taking over from ${options.previousOwner}. Review their context carefully.`);
        }
        lines.push('');
    }
    // Outreach context
    if (thread.outreachId) {
        if (options.userInitiated) {
            lines.push('This conversation is a RESPONSE to our earlier outreach.');
            lines.push('Acknowledge naturally ("I\'m glad you called back") but let THEM lead.');
        }
        else {
            lines.push('This is a continuation of our proactive outreach.');
        }
        lines.push('');
    }
    // Emotional context
    if (thread.emotionalContext) {
        lines.push(`Current emotional state: ${thread.emotionalContext.current} (${thread.emotionalContext.trajectory})`);
        lines.push('');
    }
    // Topic context
    if (thread.topicTags.length > 0) {
        lines.push(`Topics discussed: ${thread.topicTags.join(', ')}`);
        lines.push('');
    }
    // ─────────────────────────────────────────────────────────────────────────
    // RECENT MESSAGE HISTORY
    // ─────────────────────────────────────────────────────────────────────────
    if (messages.length > 0) {
        lines.push('--- RECENT MESSAGES ---');
        lines.push('');
        for (const msg of messages.slice(-10)) {
            const roleLabel = msg.role === 'agent'
                ? `[${msg.agentId || 'Agent'}]`
                : msg.role === 'user'
                    ? '[User]'
                    : '[System]';
            const channelLabel = `(${msg.channel})`;
            lines.push(`${roleLabel} ${channelLabel}: ${msg.content.slice(0, 200)}${msg.content.length > 200 ? '...' : ''}`);
        }
        lines.push('');
    }
    // ─────────────────────────────────────────────────────────────────────────
    // BEHAVIORAL GUIDANCE
    // ─────────────────────────────────────────────────────────────────────────
    lines.push('--- GUIDANCE ---');
    lines.push('');
    if (options.isNewToThread) {
        lines.push('• You are NEW to this conversation. Introduce yourself naturally.');
        lines.push('• Acknowledge context from previous messages without repeating them.');
    }
    if (options.previousOwner) {
        lines.push(`• ${options.previousOwner} handed this to you. Honor their work - don't start over.`);
    }
    if (!options.userInitiated) {
        lines.push('• YOU initiated this. Be warm but not pushy. Let them guide.');
    }
    lines.push('• Maintain continuity - reference earlier parts of conversation.');
    lines.push('• Be aware of channel context (voice vs text have different rhythms).');
    return lines.join('\n');
}
// ============================================================================
// UTILITIES
// ============================================================================
/**
 * Get threads by user (for debugging/admin).
 */
export function getUserThreads(userId) {
    const results = [];
    for (const thread of threadIndex.values()) {
        if (thread.userId === userId) {
            results.push(thread);
        }
    }
    return results.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
}
/**
 * Clear stale threads (call periodically).
 */
export function clearStaleThreads() {
    let cleared = 0;
    for (const [userId, thread] of activeThreads) {
        if (isThreadStale(thread)) {
            activeThreads.delete(userId);
            cleared++;
        }
    }
    log.info({ cleared }, 'Cleared stale threads');
    return cleared;
}
// ============================================================================
// EXPORTS
// ============================================================================
export const threadManager = {
    getOrCreateThread,
    getThread,
    getActiveThread,
    addMessage,
    getMessages,
    transferOwnership,
    updateThreadStatus,
    updateThreadTopics,
    updateEmotionalContext,
    buildAgentContext,
    getUserThreads,
    clearStaleThreads,
};
//# sourceMappingURL=thread-manager.js.map