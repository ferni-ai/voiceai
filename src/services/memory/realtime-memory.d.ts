/**
 * Real-Time Memory Service
 *
 * Persists conversation turns to Firestore AS THEY HAPPEN.
 * No more data loss on disconnect.
 *
 * This solves the fundamental problem where:
 * - Turns were stored in RAM
 * - Only saved at session end
 * - If disconnect happened, ALL memory was lost
 *
 * Now:
 * - Each turn is persisted immediately
 * - Background summarization happens async
 * - Ferni ALWAYS remembers you
 *
 * @module services/realtime-memory
 */
export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: {
        emotion?: string;
        topics?: string[];
        durationMs?: number;
    };
}
export interface ConversationMetadata {
    id: string;
    userId: string;
    personaId: string;
    startedAt: Date;
    endedAt?: Date;
    turnCount: number;
    summarized: boolean;
    summary?: string;
}
/**
 * Start a new conversation - creates the conversation document
 */
export declare function startConversation(userId: string, personaId: string): Promise<string>;
/**
 * Add a turn to the conversation - IMMEDIATE persistence
 * This is the key function - every turn is saved as it happens
 */
export declare function persistTurn(userId: string, conversationId: string, turn: ConversationTurn): Promise<void>;
/**
 * End a conversation - marks it for summarization
 */
export declare function endConversation(userId: string, conversationId: string): Promise<void>;
/**
 * Get recent conversations for a user
 */
export declare function getRecentConversations(userId: string, limit?: number): Promise<ConversationMetadata[]>;
/**
 * Get turns from a specific conversation
 */
export declare function getConversationTurns(userId: string, conversationId: string, limit?: number): Promise<ConversationTurn[]>;
/**
 * Get the last conversation's context (for greeting)
 * This is the key function for returning users
 */
export declare function getLastConversationContext(userId: string): Promise<{
    turns: ConversationTurn[];
    personaId: string;
    date: Date;
    summary?: string;
} | null>;
/**
 * Build a summary from recent turns (fallback if no LLM summary)
 */
export declare function buildQuickSummary(turns: ConversationTurn[]): string;
/**
 * Get unsummarized conversations (for background job)
 */
export declare function getUnsummarizedConversations(limit?: number): Promise<Array<{
    userId: string;
    conversationId: string;
}>>;
/**
 * Mark conversation as summarized and update user profile
 */
export declare function markSummarized(userId: string, conversationId: string, summary: string): Promise<void>;
/**
 * Summarize a conversation asynchronously (fire and forget)
 * This can be called at session end without blocking
 */
export declare function summarizeConversationAsync(userId: string, conversationId: string): Promise<void>;
/**
 * Get user memory summary for API (/api/voice/memory)
 * Aggregates data from all conversations
 */
export declare function getUserMemoryForAPI(userId: string): Promise<{
    totalConversations: number;
    totalDuration: number;
    firstConversation: Date | null;
    lastConversation: Date | null;
    topics: Array<{
        topic: string;
        count: number;
        lastMentioned: Date;
    }>;
    relationshipMilestones: Array<{
        type: string;
        date: Date;
        description: string;
    }>;
} | null>;
/**
 * Get conversation context for API (/api/voice/memory/context)
 */
export declare function getConversationContextForAPI(userId: string): Promise<{
    recentTopics: string[];
    unfinishedThreads: Array<{
        topic: string;
        lastDiscussed: Date;
        summary: string;
    }>;
    rememberedDetails: Array<{
        detail: string;
        confidence: number;
        source: string;
    }>;
    suggestedFollowUps: string[];
}>;
/**
 * Get conversations with turns for API (/api/voice/memory/conversations)
 */
export declare function getConversationsWithTurnsForAPI(userId: string, limit?: number): Promise<Array<{
    id: string;
    startedAt: Date;
    endedAt: Date | undefined;
    summary: string | undefined;
    topics: string[];
    turns: ConversationTurn[];
    turnCount: number;
    voiceVerified: boolean;
}>>;
declare const _default: {
    startConversation: typeof startConversation;
    persistTurn: typeof persistTurn;
    endConversation: typeof endConversation;
    getRecentConversations: typeof getRecentConversations;
    getConversationTurns: typeof getConversationTurns;
    getLastConversationContext: typeof getLastConversationContext;
    buildQuickSummary: typeof buildQuickSummary;
    getUnsummarizedConversations: typeof getUnsummarizedConversations;
    markSummarized: typeof markSummarized;
    summarizeConversationAsync: typeof summarizeConversationAsync;
    getUserMemoryForAPI: typeof getUserMemoryForAPI;
    getConversationContextForAPI: typeof getConversationContextForAPI;
    getConversationsWithTurnsForAPI: typeof getConversationsWithTurnsForAPI;
};
export default _default;
//# sourceMappingURL=realtime-memory.d.ts.map