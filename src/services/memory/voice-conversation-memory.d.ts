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
export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: {
        emotion?: string;
        confidence?: number;
        topics?: string[];
    };
}
export interface ConversationRecord {
    id: string;
    userId: string;
    sessionId: string;
    turns: ConversationTurn[];
    startedAt: Date;
    endedAt?: Date;
    summary?: string;
    topics: string[];
    emotionalJourney?: string[];
    voiceVerified: boolean;
    verificationConfidence?: number;
}
export interface ConversationMemory {
    userId: string;
    totalConversations: number;
    totalDuration: number;
    firstConversation: Date;
    lastConversation: Date;
    topics: Array<{
        topic: string;
        count: number;
        lastMentioned: Date;
    }>;
    importantMoments: Array<{
        summary: string;
        date: Date;
        emotion?: string;
    }>;
    relationshipMilestones: Array<{
        milestone: string;
        date: Date;
    }>;
}
export interface ConversationContext {
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
}
/**
 * Start recording a new conversation.
 */
export declare function startConversation(userId: string, sessionId: string, voiceVerified?: boolean, verificationConfidence?: number): ConversationRecord;
/**
 * Add a turn to the conversation.
 */
export declare function addConversationTurn(conversation: ConversationRecord, role: 'user' | 'assistant', content: string, metadata?: ConversationTurn['metadata']): ConversationRecord;
/**
 * End and save a conversation.
 */
export declare function endConversation(conversation: ConversationRecord): Promise<void>;
/**
 * Get user's conversation memory.
 */
export declare function getUserMemory(userId: string): Promise<ConversationMemory | null>;
/**
 * Get context for a new conversation with a user.
 */
export declare function getConversationContext(userId: string): Promise<ConversationContext>;
/**
 * Get recent conversations for a user.
 */
export declare function getRecentConversations(userId: string, limit?: number): Promise<ConversationRecord[]>;
/**
 * Search conversations by topic.
 */
export declare function searchConversationsByTopic(userId: string, topic: string, limit?: number): Promise<ConversationRecord[]>;
declare const _default: {
    startConversation: typeof startConversation;
    addConversationTurn: typeof addConversationTurn;
    endConversation: typeof endConversation;
    getUserMemory: typeof getUserMemory;
    getConversationContext: typeof getConversationContext;
    getRecentConversations: typeof getRecentConversations;
    searchConversationsByTopic: typeof searchConversationsByTopic;
};
export default _default;
//# sourceMappingURL=voice-conversation-memory.d.ts.map