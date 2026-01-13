/**
 * Unified Conversation Integration
 *
 * Single entry point for all conversation humanization in the voice agent.
 * This replaces the multiple scattered calls to various orchestrators.
 *
 * Usage:
 * ```typescript
 * // At session start
 * const session = createConversationSession(sessionId, userId, personaId);
 *
 * // For each turn
 * const result = await session.processTurn({
 *   userMessage,
 *   rawResponse,
 *   emotion,
 *   topic,
 * });
 *
 * // Use result.text and result.ssml for TTS
 * ```
 *
 * @module @ferni/conversation/unified-integration
 */
export interface ConversationSessionConfig {
    personaId: string;
    sessionId: string;
    userId: string;
    sessionCount?: number;
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
}
export interface TurnInput {
    userMessage: string;
    rawResponse: string;
    userEmotion?: string;
    topic?: string;
    wasPersonalSharing?: boolean;
    isSeriousContext?: boolean;
    sessionData?: Record<string, unknown>;
}
export interface TurnResult {
    text: string;
    ssml: string;
    appliedFeatures: string[];
    pacing: 'faster' | 'normal' | 'slower';
    emotionalTone?: string;
    memoryCallback?: {
        text: string;
        ssml: string;
    };
    followUpQuestion?: {
        text: string;
        ssml: string;
    };
    confidence: number;
    timing: {
        total: number;
        analysis: number;
        intelligence: number;
        humanization: number;
    };
}
export interface ConversationSession {
    sessionId: string;
    userId: string;
    personaId: string;
    getState: () => SessionState;
    getTurnCount: () => number;
    getComfortLevel: () => number;
    processTurn: (input: TurnInput) => Promise<TurnResult>;
    recordVulnerability: () => void;
    recordLaughter: () => void;
    recordBreakthrough: () => void;
    end: () => void;
}
interface SessionState {
    turnCount: number;
    sessionMinutes: number;
    comfortLevel: number;
    relationshipStage: string;
    recentTopics: string[];
    mood: {
        energy: number;
        engagement: number;
        emotionalLoad: number;
    };
}
/**
 * Create a new conversation session
 * This is the SINGLE entry point for all conversation humanization
 */
export declare function createConversationSession(config: ConversationSessionConfig): ConversationSession;
/**
 * Get an existing session
 */
export declare function getConversationSession(sessionId: string): ConversationSession | null;
/**
 * End and cleanup a session
 */
export declare function endConversationSession(sessionId: string): void;
/**
 * Get all active sessions (for debugging)
 */
export declare function getActiveSessions(): string[];
/**
 * Quick one-shot humanization (for testing or simple use cases)
 * Prefer createConversationSession for production use
 */
export declare function quickHumanize(rawResponse: string, context: {
    personaId: string;
    userMessage: string;
    userEmotion?: string;
    topic?: string;
    turnNumber?: number;
}): Promise<{
    text: string;
    ssml: string;
}>;
export {};
//# sourceMappingURL=unified-integration.d.ts.map