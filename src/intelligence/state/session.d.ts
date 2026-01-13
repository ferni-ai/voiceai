/**
 * Centralized Session State Manager
 *
 * Consolidates all session-level state that was previously scattered
 * across multiple Map instances in various modules.
 *
 * Benefits:
 * - Single source of truth for session state
 * - Proper cleanup on session end
 * - Easier debugging and observability
 * - Prevents memory leaks from orphaned Map entries
 *
 * @module intelligence/session-state
 */
/**
 * Voice emotion state for a session
 */
export interface VoiceEmotionState {
    /** Recent emotion history */
    emotionHistory: string[];
    /** Current emotion */
    currentEmotion?: string;
    /** Emotional arc tracking */
    arc: {
        startEmotion: string;
        currentEmotion: string;
        trend: 'improving' | 'declining' | 'stable';
        significantShifts: Array<{
            from: string;
            to: string;
            turnNumber: number;
        }>;
    } | null;
    /** Total voice samples */
    totalSamples: number;
    /** Average stress level */
    avgStressLevel: number;
    /** Last voice analysis timestamp */
    lastAnalysis?: Date;
}
/**
 * Emotional trajectory tracking
 */
export interface EmotionalTrajectory {
    /** Emotion at session start */
    startEmotion: string;
    /** Current emotion */
    currentEmotion: string;
    /** Overall trend */
    trend: 'improving' | 'stable' | 'declining';
    /** Average distress level */
    avgDistressLevel: number;
    /** Peak distress level */
    peakDistressLevel: number;
    /** Distress history */
    distressHistory: number[];
}
/**
 * Pattern detection state
 */
export interface PatternState {
    /** Tracked patterns */
    patterns: Map<string, PatternData>;
    /** Last turn a pattern was surfaced */
    lastSurfacedTurn: number;
    /** Topic mention counts */
    topicMentions: Map<string, number>;
    /** Emotion by topic */
    emotionByTopic: Map<string, string[]>;
    /** Timing patterns */
    timingPatterns: Map<string, Date[]>;
    /** Topics user avoids */
    avoidedTopics: Map<string, number>;
    /** Stated intentions */
    statedIntentions: Map<string, IntentionData>;
    /** Reported actions */
    reportedActions: Map<string, ActionData>;
}
export interface PatternData {
    type: string;
    occurrences: number;
    lastSeen: Date;
    confidence: number;
}
export interface IntentionData {
    intention: string;
    statedAt: Date;
    turnNumber: number;
}
export interface ActionData {
    action: string;
    reportedAt: Date;
    turnNumber: number;
}
/**
 * Cognitive load state
 */
export interface CognitiveLoadState {
    /** Current load level */
    currentLevel: 'low' | 'moderate' | 'high' | 'overloaded';
    /** Load score (0-1) */
    loadScore: number;
    /** Recent observations */
    observations: Array<{
        indicator: string;
        timestamp: Date;
    }>;
    /** Simplification needed */
    needsSimplification: boolean;
}
/**
 * Conversation flow state
 */
export interface ConversationFlowState {
    /** Current phase */
    phase: string;
    /** Turn count */
    turnCount: number;
    /** Topics discussed */
    topicsDiscussed: string[];
    /** Current topic */
    currentTopic: string | null;
    /** Topics to circle back to */
    topicsToCircleBack: string[];
    /** Key moments */
    keyMoments: Array<{
        summary: string;
        timestamp: Date;
        turnNumber: number;
    }>;
    /** Stories shared */
    storiesShared: string[];
    /** Last user name usage */
    lastNameUsed: number;
    /** Referenced memories (to prevent repetition) */
    referencedMemories: Set<string>;
}
/**
 * Complete session state
 */
export interface SessionState {
    /** Session ID */
    sessionId: string;
    /** User ID */
    userId?: string;
    /** Session start time */
    startTime: Date;
    /** Voice emotion state */
    voiceEmotion: VoiceEmotionState;
    /** Emotional trajectory */
    emotionalTrajectory: EmotionalTrajectory;
    /** Pattern detection state */
    patterns: PatternState;
    /** Cognitive load state */
    cognitiveLoad: CognitiveLoadState;
    /** Conversation flow state */
    conversationFlow: ConversationFlowState;
    /** Custom state (for builders that need session-specific data) */
    custom: Map<string, unknown>;
    /** Last updated */
    lastUpdated: Date;
}
declare class SessionStateManagerImpl {
    private sessions;
    /**
     * Get or create session state
     */
    get(sessionId: string): SessionState;
    /**
     * Check if session exists
     */
    has(sessionId: string): boolean;
    /**
     * Update session state
     */
    update(sessionId: string, updates: Partial<SessionState>): SessionState;
    /**
     * Set user ID for session
     */
    setUserId(sessionId: string, userId: string): void;
    /**
     * Clear session state
     */
    clear(sessionId: string): void;
    /**
     * Clear all sessions (for testing)
     */
    clearAll(): void;
    /**
     * Get all active session IDs
     */
    getActiveSessionIds(): string[];
    /**
     * Get session count
     */
    getSessionCount(): number;
    /**
     * Cleanup stale sessions (older than maxAge)
     */
    cleanupStaleSessions(maxAgeMs?: number): number;
    /**
     * Create initial session state
     */
    private createInitialState;
}
export declare const SessionStateManager: SessionStateManagerImpl;
/**
 * Get session state (shorthand)
 */
export declare function getSessionState(sessionId: string): SessionState;
/**
 * Update voice emotion for session
 */
export declare function updateVoiceEmotion(sessionId: string, emotion: string, stressLevel: number): VoiceEmotionState;
/**
 * Update emotional trajectory
 */
export declare function updateEmotionalTrajectory(sessionId: string, emotion: string, distressLevel: number): EmotionalTrajectory;
/**
 * Update cognitive load
 */
export declare function updateCognitiveLoad(sessionId: string, indicator: string, loadScore: number): CognitiveLoadState;
/**
 * Record a key moment in the conversation
 */
export declare function recordKeyMoment(sessionId: string, summary: string): void;
/**
 * Increment turn count
 */
export declare function incrementTurnCount(sessionId: string): number;
/**
 * Set custom state for a builder
 */
export declare function setCustomState<T>(sessionId: string, key: string, value: T): void;
/**
 * Get custom state for a builder
 */
export declare function getCustomState<T>(sessionId: string, key: string): T | undefined;
/**
 * Mark a memory as referenced (to prevent repetition)
 */
export declare function markMemoryReferenced(sessionId: string, memoryId: string): void;
/**
 * Check if memory was already referenced
 */
export declare function wasMemoryReferenced(sessionId: string, memoryId: string): boolean;
/**
 * Cognitive reasoning state for session
 */
export interface CognitiveReasoningState {
    /** Previous reasoning approaches used */
    reasoningHistory: string[];
    /** User messages for style detection */
    userMessages: string[];
    /** Active reasoning chain */
    activeChain: unknown | null;
    /** Detected user cognitive style */
    userStyle: string;
    /** Style confidence */
    styleConfidence: number;
    /** Quirks used this session (to prevent repetition) */
    quirksUsed: Set<string>;
    /** Mental habits used this session */
    habitsUsed: Set<string>;
    /** Shared insights (to prevent repetition) */
    sharedInsights: Set<string>;
    /** Insight cooldowns */
    insightCooldowns: Map<string, number>;
}
/**
 * Get cognitive reasoning state for session
 */
export declare function getCognitiveState(sessionId: string): CognitiveReasoningState;
/**
 * Update cognitive reasoning history
 */
export declare function addReasoningApproach(sessionId: string, approach: string): void;
/**
 * Add user message for cognitive style detection
 */
export declare function addUserMessageForStyleDetection(sessionId: string, message: string): string[];
/**
 * Update detected user cognitive style
 */
export declare function updateUserCognitiveStyle(sessionId: string, style: string, confidence: number): void;
/**
 * Set active reasoning chain
 */
export declare function setActiveReasoningChain(sessionId: string, chain: unknown): void;
/**
 * Get active reasoning chain
 */
export declare function getActiveReasoningChain(sessionId: string): unknown | null;
/**
 * Mark a quirk as used
 */
export declare function markQuirkUsed(sessionId: string, quirkId: string): void;
/**
 * Check if quirk was used
 */
export declare function wasQuirkUsed(sessionId: string, quirkId: string): boolean;
/**
 * Mark a mental habit as used
 */
export declare function markHabitUsed(sessionId: string, habitId: string): void;
/**
 * Check if habit was used
 */
export declare function wasHabitUsed(sessionId: string, habitId: string): boolean;
/**
 * Mark an insight as shared
 */
export declare function markInsightShared(sessionId: string, insightKey: string, turnCount: number): void;
/**
 * Check if insight was shared
 */
export declare function wasInsightShared(sessionId: string, insightKey: string): boolean;
/**
 * Check if insight is on cooldown
 */
export declare function isInsightOnCooldown(sessionId: string, insightKey: string, currentTurn: number, cooldownTurns: number): boolean;
/**
 * Lovable presence state for session
 */
export interface LovablePresenceState {
    lastTangent?: number;
    lastSelfDeprecation?: number;
    lastSpecificDetail?: number;
    lastPlayfulMoment?: number;
    lastGenuineReaction?: number;
    tangentsThisSession: number;
    surprisesThisSession: number;
    userSmileSignals: number;
}
/**
 * Get lovable presence state for session
 */
export declare function getLovableState(sessionId: string): LovablePresenceState;
/**
 * Update lovable presence state
 */
export declare function updateLovableState(sessionId: string, updates: Partial<LovablePresenceState>): LovablePresenceState;
/**
 * Session flow tracking state
 */
export interface SessionFlowTrackingState {
    lastTrackedEmotion: string | null;
    emotionShiftCount: number;
    lastSignificantMoment: number;
    topicChanges: number;
    questionAsked: number;
    storiesShared: number;
}
/**
 * Get session flow tracking state
 */
export declare function getSessionFlowState(sessionId: string): SessionFlowTrackingState;
/**
 * Update session flow tracking state
 */
export declare function updateSessionFlowState(sessionId: string, updates: Partial<SessionFlowTrackingState>): SessionFlowTrackingState;
export default SessionStateManager;
//# sourceMappingURL=session.d.ts.map