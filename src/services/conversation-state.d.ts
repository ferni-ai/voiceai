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
import { type SessionId, type UserId } from '../types/branded.js';
/**
 * Load conversation state from Firestore
 */
export declare function loadConversationStateFromFirestore(userId: string): Promise<Record<string, unknown> | null>;
/**
 * Emotional context for conversation
 */
export interface EmotionalContext {
    /** Overall sentiment */
    sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
    /** Detected emotional states (can be multiple) */
    emotions: Array<'happy' | 'excited' | 'calm' | 'anxious' | 'frustrated' | 'sad' | 'confused' | 'grateful'>;
    /** Urgency level (1-5, where 5 is most urgent) */
    urgency: number;
    /** User appears fatigued with topic */
    topicFatigue: boolean;
    /** Confidence in this assessment (0-1) */
    confidence: number;
    /** When this was last updated */
    updatedAt: Date;
}
/**
 * Topic being discussed
 */
export interface TopicContext {
    /** Current main topic */
    current: string | null;
    /** Previous topics in this conversation */
    history: Array<{
        topic: string;
        startedAt: Date;
        endedAt?: Date;
        depth: 'shallow' | 'moderate' | 'deep';
    }>;
    /** Topics to circle back to */
    pendingCircleBack: Array<{
        topic: string;
        reason: string;
        mentionedAt: Date;
    }>;
}
/**
 * Conversation flow signals
 */
export interface FlowContext {
    /** Suggest wrapping up the conversation */
    suggestWrapUp: boolean;
    /** Reasons for wrap-up suggestion */
    wrapUpReasons: string[];
    /** Time in conversation (minutes) */
    durationMinutes: number;
    /** Turn count */
    turnCount: number;
    /** Long silence detected */
    silenceDetected: boolean;
    /** User indicated they need to go */
    userWantsToLeave: boolean;
}
/**
 * User facts known in this conversation
 */
export interface UserContext {
    /** User's name (if known) */
    name?: string;
    /** User ID (branded type for type safety) */
    userId: UserId;
    /** Key moments from this conversation */
    keyMoments: string[];
    /** Preferences expressed */
    preferences: Map<string, string>;
    /** Facts to remember */
    factsToRemember: Array<{
        fact: string;
        category: 'personal' | 'financial' | 'emotional' | 'goal' | 'preference';
        importance: 'low' | 'medium' | 'high';
    }>;
}
/**
 * Tool execution context (passed to tools)
 */
export interface ToolExecutionData {
    /** Last tool that was called */
    lastToolCalled?: string;
    /** Last tool's result summary */
    lastToolResult?: string;
    /** Suggested next tools */
    suggestedNextTools: string[];
    /** Tools to avoid (recently used) */
    recentlyUsedTools: string[];
}
/**
 * 🎮 Game context for active games
 */
export interface GameContext {
    /** Whether a game is currently active */
    isActive: boolean;
    /** Type of game being played */
    gameType?: string;
    /** Current round number */
    currentRound?: number;
    /** Current score */
    score?: number;
    /** Whether user is in the middle of answering */
    awaitingAnswer?: boolean;
    /** Game-specific data for context */
    gameData?: Record<string, unknown>;
    /** When the game started */
    startedAt?: Date;
}
/**
 * Complete conversation state
 */
export interface ConversationState {
    sessionId: SessionId;
    userId: UserId;
    agentId: string;
    emotional: EmotionalContext;
    topic: TopicContext;
    flow: FlowContext;
    user: UserContext;
    toolExecution: ToolExecutionData;
    game: GameContext;
    startedAt: Date;
    lastActivityAt: Date;
}
/**
 * Manages conversation state for a single session
 */
export declare class ConversationStateManager {
    private state;
    private logger;
    private persistenceEnabled;
    constructor(sessionId: SessionId, userId: UserId, agentId: string);
    /**
     * Enable Firestore persistence for this session
     * Call this after creating the manager to auto-persist changes
     */
    enablePersistence(): void;
    /**
     * Check if persistence is enabled
     */
    isPersistenceEnabled(): boolean;
    get sessionId(): SessionId;
    get userId(): string;
    get agentId(): string;
    getState(): Readonly<ConversationState>;
    getEmotionalContext(): Readonly<EmotionalContext>;
    getTopicContext(): Readonly<TopicContext>;
    getFlowContext(): Readonly<FlowContext>;
    getUserContext(): Readonly<UserContext>;
    getToolExecutionData(): Readonly<ToolExecutionData>;
    getGameContext(): Readonly<GameContext>;
    /**
     * Update game context
     */
    setGameContext(updates: Partial<GameContext>): void;
    /**
     * Start a game
     */
    startGame(gameType: string, initialData?: Record<string, unknown>): void;
    /**
     * End the current game
     */
    endGame(): void;
    /**
     * Check if a game is active
     */
    isGameActive(): boolean;
    setEmotionalContext(updates: Partial<EmotionalContext>): void;
    detectEmotion(emotion: EmotionalContext['emotions'][0]): void;
    setUrgency(level: number): void;
    setCurrentTopic(topic: string): void;
    deepenTopic(): void;
    addCircleBackTopic(topic: string, reason: string): void;
    getNextCircleBack(): {
        topic: string;
        reason: string;
    } | null;
    incrementTurn(): void;
    private updateDuration;
    private checkWrapUpSignals;
    markSilence(): void;
    clearSilence(): void;
    markUserWantsToLeave(): void;
    shouldWrapUp(): {
        should: boolean;
        reasons: string[];
    };
    setUserName(name: string): void;
    addKeyMoment(moment: string): void;
    setPreference(key: string, value: string): void;
    getPreference(key: string): string | undefined;
    addFactToRemember(fact: string, category: UserContext['factsToRemember'][0]['category'], importance: UserContext['factsToRemember'][0]['importance']): void;
    recordToolCall(toolName: string, resultSummary?: string): void;
    suggestNextTools(toolNames: string[]): void;
    shouldAvoidTool(toolName: string): boolean;
    private touch;
    /**
     * Get a summary suitable for passing to LLM context
     */
    getSummaryForLLM(): string;
    /**
     * Export state for persistence
     */
    toJSON(): Record<string, unknown>;
    /**
     * Import state from persistence
     */
    static fromJSON(data: Record<string, unknown>): ConversationStateManager;
}
/**
 * Get or create conversation state for a session
 *
 * @param sessionId - Session identifier (string or branded SessionId)
 * @param userId - User identifier (string or branded UserId)
 * @param agentId - Agent/persona identifier
 */
export declare function getConversationState(sessionId: string | SessionId, userId?: string | UserId, agentId?: string): ConversationStateManager;
/**
 * Check if a conversation state exists
 */
export declare function hasConversationState(sessionId: string | SessionId): boolean;
/**
 * End a conversation and clean up state
 * Archives state to Firestore if persistence was enabled
 */
export declare function endConversation(sessionId: string | SessionId): Promise<ConversationState | null>;
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
export declare function initConversationStateWithPersistence(sessionId: string | SessionId, userId: string | UserId, agentId: string, restoreEmotionalContext?: boolean): Promise<ConversationStateManager>;
/**
 * Get all active session IDs
 */
export declare function getActiveSessionIds(): string[];
/**
 * Clean up stale conversations (older than maxAgeMinutes)
 */
export declare function cleanupStaleConversations(maxAgeMinutes?: number): number;
declare const _default: {
    getConversationState: typeof getConversationState;
    hasConversationState: typeof hasConversationState;
    endConversation: typeof endConversation;
    getActiveSessionIds: typeof getActiveSessionIds;
    cleanupStaleConversations: typeof cleanupStaleConversations;
    ConversationStateManager: typeof ConversationStateManager;
    initConversationStateWithPersistence: typeof initConversationStateWithPersistence;
    loadConversationStateFromFirestore: typeof loadConversationStateFromFirestore;
};
export default _default;
//# sourceMappingURL=conversation-state.d.ts.map