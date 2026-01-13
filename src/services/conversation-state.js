/**
 * Conversation State Service
 *
 * Central service for managing conversation context that all tools can share.
 * Enables human-level conversation by providing:
 * - Shared context across tool calls
 * - Emotional state tracking
 * - Topic management
 * - Natural conversation flow signals
 *
 * USAGE:
 *   const state = getConversationState(userId);
 *   state.setEmotionalContext({ sentiment: 'positive', urgency: 2 });
 *   const emotion = state.getEmotionalContext();
 *
 * PERSISTENCE:
 *   // Enable Firestore persistence
 *   initializeConversationStatePersistence({ firestore: firestoreInstance });
 *
 *   // State is automatically persisted on changes
 *   // and can be recovered on server restart
 */
import { createSessionId, createUserId } from '../types/branded.js';
import { getLogger } from '../utils/safe-logger.js';
import { removeUndefined } from '../utils/firestore-utils.js';
import { getDb } from '../utils/safe-firestore.js';
// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================
const USERS_COLLECTION = 'bogle_users';
const CONVERSATION_STATE_DOC = 'conversation_state';
/**
 * Get Firestore instance using shared utility
 * Uses centralized getDb() which handles initialization safely
 */
async function getFirestoreDb() {
    const db = getDb();
    if (!db) {
        getLogger().debug({}, 'getFirestoreDb: Firestore not available from shared utility');
    }
    return db;
}
/**
 * Debounce helper to avoid too many Firestore writes
 */
const pendingPersists = new Map();
const PERSIST_DEBOUNCE_MS = 2000; // Debounce writes by 2 seconds
function debouncedPersist(userId, state) {
    const existing = pendingPersists.get(userId);
    if (existing) {
        clearTimeout(existing);
    }
    const timeout = setTimeout(() => {
        pendingPersists.delete(userId);
        void persistConversationStateToFirestore(state);
    }, PERSIST_DEBOUNCE_MS);
    pendingPersists.set(userId, timeout);
}
/**
 * Persist conversation state to Firestore
 */
async function persistConversationStateToFirestore(manager) {
    const log = getLogger();
    try {
        const db = await getFirestoreDb();
        if (!db) {
            log.warn({ userId: manager.userId, sessionId: manager.sessionId }, '💾 PERSIST FAIL: Firestore not available');
            return false;
        }
        const { userId } = manager;
        const path = `${USERS_COLLECTION}/${userId}/${CONVERSATION_STATE_DOC}/latest`;
        const { FieldValue } = await import('firebase-admin/firestore');
        const data = manager.toJSON();
        // Convert dates to ISO strings for Firestore
        const firestoreData = removeUndefined({
            ...data,
            startedAt: data.startedAt instanceof Date ? data.startedAt.toISOString() : data.startedAt,
            lastActivityAt: data.lastActivityAt instanceof Date
                ? data.lastActivityAt.toISOString()
                : data.lastActivityAt,
            emotional: {
                ...data.emotional,
                updatedAt: data.emotional.updatedAt instanceof Date
                    ? data.emotional.updatedAt.toISOString()
                    : data.emotional.updatedAt,
            },
            persistedAt: FieldValue.serverTimestamp(),
        });
        await db.doc(path).set(firestoreData);
        log.info({ userId, sessionId: manager.sessionId, path }, '💾 Conversation state persisted to Firestore');
        return true;
    }
    catch (error) {
        log.warn({ error: String(error), userId: manager.userId, sessionId: manager.sessionId }, 'Failed to persist conversation state');
        return false;
    }
}
/**
 * Load conversation state from Firestore
 */
export async function loadConversationStateFromFirestore(userId) {
    try {
        const db = await getFirestoreDb();
        if (!db)
            return null;
        const path = `${USERS_COLLECTION}/${userId}/${CONVERSATION_STATE_DOC}/latest`;
        const doc = await db.doc(path).get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        const log = getLogger();
        log.debug({ userId }, '📖 Conversation state loaded from Firestore');
        return data;
    }
    catch (error) {
        const log = getLogger();
        log.warn({ userId, error: String(error) }, 'Failed to load conversation state');
        return null;
    }
}
/**
 * Archive conversation state when session ends
 */
async function archiveConversationState(manager) {
    const log = getLogger();
    try {
        const db = await getFirestoreDb();
        if (!db) {
            log.warn({ userId: manager.userId, sessionId: manager.sessionId }, '📦 ARCHIVE FAIL: Firestore not available');
            return false;
        }
        const { userId } = manager;
        const { sessionId } = manager;
        const archivePath = `${USERS_COLLECTION}/${userId}/${CONVERSATION_STATE_DOC}/archive/${sessionId}`;
        const { FieldValue } = await import('firebase-admin/firestore');
        const data = manager.toJSON();
        // Convert dates to ISO strings for Firestore
        const firestoreData = removeUndefined({
            ...data,
            startedAt: data.startedAt instanceof Date ? data.startedAt.toISOString() : data.startedAt,
            lastActivityAt: data.lastActivityAt instanceof Date
                ? data.lastActivityAt.toISOString()
                : data.lastActivityAt,
            emotional: {
                ...data.emotional,
                updatedAt: data.emotional.updatedAt instanceof Date
                    ? data.emotional.updatedAt.toISOString()
                    : data.emotional.updatedAt,
            },
            archivedAt: FieldValue.serverTimestamp(),
        });
        await db.doc(archivePath).set(firestoreData);
        log.info({ userId, sessionId, archivePath }, '📦 Conversation state archived');
        return true;
    }
    catch (error) {
        log.warn({ error: String(error), userId: manager.userId }, 'Failed to archive conversation state');
        return false;
    }
}
// ============================================================================
// DEFAULT VALUES
// ============================================================================
function createDefaultEmotionalContext() {
    return {
        sentiment: 'neutral',
        emotions: [],
        urgency: 3,
        topicFatigue: false,
        confidence: 0.5,
        updatedAt: new Date(),
    };
}
function createDefaultTopicContext() {
    return {
        current: null,
        history: [],
        pendingCircleBack: [],
    };
}
function createDefaultFlowContext() {
    return {
        suggestWrapUp: false,
        wrapUpReasons: [],
        durationMinutes: 0,
        turnCount: 0,
        silenceDetected: false,
        userWantsToLeave: false,
    };
}
function createDefaultUserContext(userId) {
    return {
        userId,
        keyMoments: [],
        preferences: new Map(),
        factsToRemember: [],
    };
}
function createDefaultToolExecutionData() {
    return {
        suggestedNextTools: [],
        recentlyUsedTools: [],
    };
}
function createDefaultGameContext() {
    return {
        isActive: false,
    };
}
// ============================================================================
// CONVERSATION STATE MANAGER
// ============================================================================
/**
 * Manages conversation state for a single session
 */
export class ConversationStateManager {
    state;
    logger = getLogger();
    persistenceEnabled = false;
    constructor(sessionId, userId, agentId) {
        const now = new Date();
        this.state = {
            sessionId,
            userId,
            agentId,
            emotional: createDefaultEmotionalContext(),
            topic: createDefaultTopicContext(),
            flow: createDefaultFlowContext(),
            user: createDefaultUserContext(userId),
            toolExecution: createDefaultToolExecutionData(),
            game: createDefaultGameContext(),
            startedAt: now,
            lastActivityAt: now,
        };
    }
    /**
     * Enable Firestore persistence for this session
     * Call this after creating the manager to auto-persist changes
     */
    enablePersistence() {
        this.persistenceEnabled = true;
        this.logger.info({ userId: this.userId, sessionId: this.sessionId }, '💾 Conversation state persistence enabled');
    }
    /**
     * Check if persistence is enabled
     */
    isPersistenceEnabled() {
        return this.persistenceEnabled;
    }
    // ============================================================================
    // GETTERS
    // ============================================================================
    get sessionId() {
        return this.state.sessionId;
    }
    get userId() {
        return this.state.userId;
    }
    get agentId() {
        return this.state.agentId;
    }
    getState() {
        return this.state;
    }
    getEmotionalContext() {
        return this.state.emotional;
    }
    getTopicContext() {
        return this.state.topic;
    }
    getFlowContext() {
        return this.state.flow;
    }
    getUserContext() {
        return this.state.user;
    }
    getToolExecutionData() {
        return this.state.toolExecution;
    }
    getGameContext() {
        return this.state.game;
    }
    // ============================================================================
    // GAME CONTEXT
    // ============================================================================
    /**
     * Update game context
     */
    setGameContext(updates) {
        this.state.game = {
            ...this.state.game,
            ...updates,
        };
        this.touch();
        this.logger.debug({ updates }, '🎮 Game context updated');
    }
    /**
     * Start a game
     */
    startGame(gameType, initialData) {
        this.state.game = {
            isActive: true,
            gameType,
            currentRound: 1,
            score: 0,
            awaitingAnswer: false,
            gameData: initialData,
            startedAt: new Date(),
        };
        this.touch();
        this.logger.info({ gameType }, '🎮 Game started');
    }
    /**
     * End the current game
     */
    endGame() {
        this.state.game = {
            isActive: false,
        };
        this.touch();
        this.logger.info('🎮 Game ended');
    }
    /**
     * Check if a game is active
     */
    isGameActive() {
        return this.state.game.isActive;
    }
    // ============================================================================
    // EMOTIONAL CONTEXT
    // ============================================================================
    setEmotionalContext(updates) {
        this.state.emotional = {
            ...this.state.emotional,
            ...updates,
            updatedAt: new Date(),
        };
        this.touch();
        this.logger.debug({ updates }, '💭 Emotional context updated');
    }
    detectEmotion(emotion) {
        if (!this.state.emotional.emotions.includes(emotion)) {
            this.state.emotional.emotions.push(emotion);
            this.state.emotional.updatedAt = new Date();
            this.touch();
        }
    }
    setUrgency(level) {
        this.state.emotional.urgency = Math.max(1, Math.min(5, level));
        this.state.emotional.updatedAt = new Date();
        this.touch();
    }
    // ============================================================================
    // TOPIC CONTEXT
    // ============================================================================
    setCurrentTopic(topic) {
        // End previous topic if exists
        if (this.state.topic.current && this.state.topic.history.length > 0) {
            const lastTopic = this.state.topic.history[this.state.topic.history.length - 1];
            if (!lastTopic.endedAt) {
                lastTopic.endedAt = new Date();
            }
        }
        this.state.topic.current = topic;
        this.state.topic.history.push({
            topic,
            startedAt: new Date(),
            depth: 'shallow',
        });
        this.touch();
        this.logger.debug({ topic }, '📍 Topic changed');
    }
    deepenTopic() {
        if (this.state.topic.history.length > 0) {
            const current = this.state.topic.history[this.state.topic.history.length - 1];
            if (current.depth === 'shallow') {
                current.depth = 'moderate';
            }
            else if (current.depth === 'moderate') {
                current.depth = 'deep';
            }
        }
    }
    addCircleBackTopic(topic, reason) {
        this.state.topic.pendingCircleBack.push({
            topic,
            reason,
            mentionedAt: new Date(),
        });
        this.touch();
        this.logger.debug({ topic, reason }, '🔄 Circle-back topic added');
    }
    getNextCircleBack() {
        if (this.state.topic.pendingCircleBack.length === 0) {
            return null;
        }
        const next = this.state.topic.pendingCircleBack.shift();
        return { topic: next.topic, reason: next.reason };
    }
    // ============================================================================
    // FLOW CONTEXT
    // ============================================================================
    incrementTurn() {
        this.state.flow.turnCount++;
        this.updateDuration();
        this.checkWrapUpSignals();
        this.touch();
    }
    updateDuration() {
        const now = new Date();
        this.state.flow.durationMinutes = Math.round((now.getTime() - this.state.startedAt.getTime()) / (1000 * 60));
    }
    checkWrapUpSignals() {
        const reasons = [];
        // Long conversation
        if (this.state.flow.durationMinutes > 30) {
            reasons.push('Long conversation (30+ minutes)');
        }
        // Many turns
        if (this.state.flow.turnCount > 50) {
            reasons.push('Many turns (50+)');
        }
        // User wants to leave
        if (this.state.flow.userWantsToLeave) {
            reasons.push('User indicated they need to go');
        }
        // Topic fatigue
        if (this.state.emotional.topicFatigue) {
            reasons.push('Topic fatigue detected');
        }
        this.state.flow.suggestWrapUp = reasons.length > 0;
        this.state.flow.wrapUpReasons = reasons;
    }
    markSilence() {
        this.state.flow.silenceDetected = true;
        this.touch();
    }
    clearSilence() {
        this.state.flow.silenceDetected = false;
        this.touch();
    }
    markUserWantsToLeave() {
        this.state.flow.userWantsToLeave = true;
        this.checkWrapUpSignals();
        this.touch();
        this.logger.info('👋 User indicated they want to leave');
    }
    shouldWrapUp() {
        return {
            should: this.state.flow.suggestWrapUp,
            reasons: this.state.flow.wrapUpReasons,
        };
    }
    // ============================================================================
    // USER CONTEXT
    // ============================================================================
    setUserName(name) {
        this.state.user.name = name;
        this.touch();
        this.logger.info({ name }, '👤 User name set');
    }
    addKeyMoment(moment) {
        this.state.user.keyMoments.push(moment);
        this.touch();
    }
    setPreference(key, value) {
        this.state.user.preferences.set(key, value);
        this.touch();
    }
    getPreference(key) {
        return this.state.user.preferences.get(key);
    }
    addFactToRemember(fact, category, importance) {
        this.state.user.factsToRemember.push({ fact, category, importance });
        this.touch();
        this.logger.debug({ fact, category, importance }, '📝 Fact to remember added');
    }
    // ============================================================================
    // TOOL EXECUTION
    // ============================================================================
    recordToolCall(toolName, resultSummary) {
        this.state.toolExecution.lastToolCalled = toolName;
        this.state.toolExecution.lastToolResult = resultSummary;
        // Add to recently used (keep last 5)
        this.state.toolExecution.recentlyUsedTools.unshift(toolName);
        if (this.state.toolExecution.recentlyUsedTools.length > 5) {
            this.state.toolExecution.recentlyUsedTools.pop();
        }
        this.touch();
    }
    suggestNextTools(toolNames) {
        this.state.toolExecution.suggestedNextTools = toolNames;
        this.touch();
    }
    shouldAvoidTool(toolName) {
        return this.state.toolExecution.recentlyUsedTools.includes(toolName);
    }
    // ============================================================================
    // UTILITY
    // ============================================================================
    touch() {
        this.state.lastActivityAt = new Date();
        // Trigger debounced persistence if enabled
        if (this.persistenceEnabled) {
            debouncedPersist(this.state.userId, this);
        }
    }
    /**
     * Get a summary suitable for passing to LLM context
     */
    getSummaryForLLM() {
        const parts = [];
        // User info
        if (this.state.user.name) {
            parts.push(`User: ${this.state.user.name}`);
        }
        // Emotional state
        if (this.state.emotional.emotions.length > 0) {
            parts.push(`Emotions: ${this.state.emotional.emotions.join(', ')}`);
        }
        if (this.state.emotional.urgency !== 3) {
            parts.push(`Urgency: ${this.state.emotional.urgency}/5`);
        }
        // Topic
        if (this.state.topic.current) {
            parts.push(`Current topic: ${this.state.topic.current}`);
        }
        // Key moments
        if (this.state.user.keyMoments.length > 0) {
            parts.push(`Key moments: ${this.state.user.keyMoments.slice(-3).join('; ')}`);
        }
        // Flow
        parts.push(`Turn: ${this.state.flow.turnCount}, Duration: ${this.state.flow.durationMinutes}m`);
        if (this.state.flow.suggestWrapUp) {
            parts.push(`⚠️ Consider wrapping up: ${this.state.flow.wrapUpReasons.join(', ')}`);
        }
        return parts.join('\n');
    }
    /**
     * Export state for persistence
     */
    toJSON() {
        return {
            ...this.state,
            user: {
                ...this.state.user,
                preferences: Object.fromEntries(this.state.user.preferences),
            },
        };
    }
    /**
     * Import state from persistence
     */
    static fromJSON(data) {
        const manager = new ConversationStateManager(createSessionId(data.sessionId), createUserId(data.userId), data.agentId);
        // Restore state
        const state = data;
        manager.state = {
            ...state,
            startedAt: new Date(state.startedAt),
            lastActivityAt: new Date(state.lastActivityAt),
            emotional: {
                ...state.emotional,
                updatedAt: new Date(state.emotional.updatedAt),
            },
            topic: {
                ...state.topic,
                history: state.topic.history.map((h) => ({
                    ...h,
                    startedAt: new Date(h.startedAt),
                    endedAt: h.endedAt ? new Date(h.endedAt) : undefined,
                })),
                pendingCircleBack: state.topic.pendingCircleBack.map((p) => ({
                    ...p,
                    mentionedAt: new Date(p.mentionedAt),
                })),
            },
            user: {
                ...state.user,
                preferences: new Map(Object.entries(data.user.preferences || {})),
            },
        };
        return manager;
    }
}
// ============================================================================
// GLOBAL STATE STORE
// ============================================================================
const activeConversations = new Map();
/**
 * Get or create conversation state for a session
 *
 * @param sessionId - Session identifier (string or branded SessionId)
 * @param userId - User identifier (string or branded UserId)
 * @param agentId - Agent/persona identifier
 */
export function getConversationState(sessionId, userId = 'default', agentId = 'default') {
    // Convert to branded types if necessary
    const brandedSessionId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;
    const brandedUserId = typeof userId === 'string' ? createUserId(userId) : userId;
    let state = activeConversations.get(brandedSessionId);
    if (!state) {
        state = new ConversationStateManager(brandedSessionId, brandedUserId, agentId);
        activeConversations.set(brandedSessionId, state);
    }
    return state;
}
/**
 * Check if a conversation state exists
 */
export function hasConversationState(sessionId) {
    const id = typeof sessionId === 'string' ? sessionId : sessionId;
    return activeConversations.has(id);
}
/**
 * End a conversation and clean up state
 * Archives state to Firestore if persistence was enabled
 */
export async function endConversation(sessionId) {
    const log = getLogger();
    const id = typeof sessionId === 'string' ? sessionId : sessionId;
    const manager = activeConversations.get(id);
    log.debug({ sessionId: id, hasManager: !!manager }, 'endConversation called');
    if (manager) {
        const finalState = manager.getState();
        const persistenceEnabled = manager.isPersistenceEnabled();
        log.info({
            sessionId: id,
            userId: manager.userId,
            persistenceEnabled,
            turnCount: finalState.flow.turnCount,
        }, `📦 Ending conversation (persistence: ${persistenceEnabled ? 'enabled' : 'disabled'})`);
        // Archive to Firestore if persistence was enabled
        if (persistenceEnabled) {
            // Cancel any pending debounced persist
            const pending = pendingPersists.get(manager.userId);
            if (pending) {
                clearTimeout(pending);
                pendingPersists.delete(manager.userId);
                log.debug({ userId: manager.userId }, 'Cancelled pending debounced persist');
            }
            // Archive the final state
            const archived = await archiveConversationState(manager);
            log.info({ sessionId: id, userId: manager.userId, archived }, '📦 Archive result');
        }
        else {
            log.warn({ sessionId: id, userId: manager.userId }, '📦 SKIP: Persistence was NOT enabled for this session');
        }
        activeConversations.delete(id);
        return finalState;
    }
    log.warn({ sessionId: id }, '📦 endConversation: No manager found for session');
    return null;
}
/**
 * Initialize conversation state with Firestore persistence
 *
 * This creates or gets a conversation state manager and enables persistence.
 * Optionally restores the last emotional context from Firestore for continuity.
 *
 * @param sessionId - Session identifier
 * @param userId - User identifier
 * @param agentId - Agent/persona identifier
 * @param restoreEmotionalContext - If true, attempts to restore last emotional state
 */
export async function initConversationStateWithPersistence(sessionId, userId, agentId, restoreEmotionalContext = true) {
    const manager = getConversationState(sessionId, userId, agentId);
    manager.enablePersistence();
    // Optionally restore emotional context from last session
    if (restoreEmotionalContext) {
        const userIdStr = typeof userId === 'string' ? userId : userId;
        const lastState = await loadConversationStateFromFirestore(userIdStr);
        if (lastState?.emotional) {
            const emotional = lastState.emotional;
            manager.setEmotionalContext({
                sentiment: emotional.sentiment,
                emotions: emotional.emotions || [],
                urgency: emotional.urgency || 3,
                topicFatigue: emotional.topicFatigue || false,
                confidence: emotional.confidence || 0.5,
                updatedAt: new Date(),
            });
            const log = getLogger();
            log.info({ userId: userIdStr, sentiment: emotional.sentiment }, '📖 Restored emotional context from last session');
        }
    }
    return manager;
}
/**
 * Get all active session IDs
 */
export function getActiveSessionIds() {
    return Array.from(activeConversations.keys());
}
/**
 * Clean up stale conversations (older than maxAgeMinutes)
 */
export function cleanupStaleConversations(maxAgeMinutes = 60) {
    const now = new Date();
    let cleaned = 0;
    for (const [sessionId, manager] of activeConversations.entries()) {
        const state = manager.getState();
        const ageMinutes = (now.getTime() - state.lastActivityAt.getTime()) / (1000 * 60);
        if (ageMinutes > maxAgeMinutes) {
            activeConversations.delete(sessionId);
            cleaned++;
        }
    }
    return cleaned;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    getConversationState,
    hasConversationState,
    endConversation,
    getActiveSessionIds,
    cleanupStaleConversations,
    ConversationStateManager,
    // Persistence functions
    initConversationStateWithPersistence,
    loadConversationStateFromFirestore,
};
//# sourceMappingURL=conversation-state.js.map