/**
 * Unified Trust Systems Data Recorder
 *
 * Central orchestrator for recording trust-building data across all systems.
 * This ensures all trust systems stay in sync and get the data they need.
 *
 * @module UnifiedRecorder
 */
/**
 * Record a high-value trust moment with immediate persistence
 */
export declare function recordTrustMoment(userId: string, moment: {
    type: 'small_win' | 'boundary' | 'intention' | 'breakthrough' | 'vulnerability' | 'callback';
    content: string;
    context?: string;
    emotion?: string;
    intensity?: number;
    personaId?: string;
}): Promise<void>;
export interface ConversationTurnData {
    userId: string;
    text: string;
    personaId?: string;
    timestamp?: Date;
    analysis?: {
        emotion?: {
            primary: string;
            intensity: number;
            secondaryEmotions?: string[];
        };
        topic?: string;
        sentiment?: 'positive' | 'negative' | 'neutral';
        intent?: string;
    };
    voiceData?: {
        pace?: number;
        energy?: number;
        pausePattern?: number[];
        pitchVariance?: number;
    };
}
export interface SessionEndData {
    userId: string;
    sessionDurationMinutes: number;
    turnCount: number;
    topicsDiscussed?: string[];
    emotionalArc?: Array<{
        emotion: string;
        timestamp: Date;
    }>;
    personaId?: string;
}
export interface WinData {
    userId: string;
    type: 'effort' | 'progress' | 'breakthrough' | 'consistency' | 'courage' | 'self_awareness';
    description: string;
    context?: string;
    magnitude?: 'tiny' | 'small' | 'medium' | 'large';
}
export interface BoundaryData {
    userId: string;
    topic: string;
    severity?: 'soft' | 'firm' | 'absolute';
    reason?: string;
    source?: 'explicit' | 'inferred';
}
export interface JournalResponseData {
    userId: string;
    promptId: string;
    response: string;
    emotionBeforeWriting?: string;
    emotionAfterWriting?: string;
}
export interface MediaInteraction {
    userId: string;
    mediaType: string;
    mediaId?: string;
    action: 'played' | 'skipped' | 'liked' | 'disliked';
    context?: string;
}
/**
 * Record a conversation turn across all trust systems
 *
 * This is the main entry point for recording user messages.
 * It distributes data to all relevant trust systems.
 */
export declare function recordConversationTurn(data: ConversationTurnData): Promise<void>;
/**
 * Record end of session data
 *
 * Called when a conversation session ends to summarize and persist.
 */
export declare function recordSessionEnd(data: SessionEndData): Promise<void>;
/**
 * Record a win or positive moment
 */
export declare function recordWinMoment(data: WinData): Promise<void>;
/**
 * Alias for recordWinMoment (unified API)
 */
export declare const recordUnifiedWin: typeof recordWinMoment;
/**
 * Record a boundary explicitly stated or inferred
 */
export declare function recordBoundary(data: BoundaryData): Promise<void>;
/**
 * Record journal response
 */
export declare function recordJournalResponse(data: JournalResponseData): Promise<void>;
/**
 * Alias for recordJournalResponse (unified API)
 */
export declare const recordJournalEntryUnified: typeof recordJournalResponse;
/**
 * Record media interaction (music, podcasts, etc.)
 */
export declare function recordMediaInteractionUnified(data: MediaInteraction): Promise<void>;
/**
 * Record how user responded to a celebration
 */
export declare function recordCelebrationReception(userId: string, winId: string, reception: 'appreciated' | 'dismissed' | 'emotional'): Promise<void>;
//# sourceMappingURL=unified-recorder.d.ts.map