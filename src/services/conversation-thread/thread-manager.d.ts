/**
 * Conversation Thread Manager
 *
 * Manages unified conversation threads that span channels and agents.
 * This is the core of bidirectional engagement - whether the agent
 * reaches out or the user initiates, it's all one continuous thread.
 *
 * @module services/conversation-thread/thread-manager
 */
import type { ConversationThread, ThreadMessage, EngagementChannel, AgentThreadContext, ThreadStatus } from './types.js';
import type { PersonaId } from '../../personas/types.js';
/**
 * Get or create a thread for a user.
 * If there's an active thread, return it. Otherwise create new.
 * Checks both in-memory cache and Firestore.
 */
export declare function getOrCreateThread(userId: string, channel: EngagementChannel, agentId: PersonaId, options?: {
    triggerType?: string;
    outreachId?: string;
}): Promise<ConversationThread>;
/**
 * Get a thread by ID.
 */
export declare function getThread(threadId: string): Promise<ConversationThread | null>;
/**
 * Get the active thread for a user.
 * Checks both in-memory cache and Firestore.
 */
export declare function getActiveThread(userId: string): Promise<ConversationThread | null>;
/**
 * Add a message to a thread.
 * Persists to both in-memory cache and Firestore.
 */
export declare function addMessage(threadId: string, message: Omit<ThreadMessage, 'id' | 'threadId'>): Promise<ThreadMessage>;
/**
 * Get messages for a thread.
 */
export declare function getMessages(threadId: string, limit?: number): Promise<ThreadMessage[]>;
/**
 * Transfer thread ownership to a different agent.
 * Persists to Firestore.
 */
export declare function transferOwnership(threadId: string, toAgentId: PersonaId, reason: string): Promise<void>;
/**
 * Update thread status.
 * Persists to Firestore.
 */
export declare function updateThreadStatus(threadId: string, status: ThreadStatus, reason?: string): Promise<void>;
/**
 * Update thread topics.
 */
export declare function updateThreadTopics(threadId: string, topics: string[]): Promise<void>;
/**
 * Update thread emotional context.
 */
export declare function updateEmotionalContext(threadId: string, current: string, trajectory: 'improving' | 'stable' | 'declining'): Promise<void>;
/**
 * Build context for an agent joining/continuing a thread.
 * This is what gets injected into the LLM.
 */
export declare function buildAgentContext(threadId: string, agentId: PersonaId, options?: {
    userInitiated?: boolean;
    joinReason?: string;
}): Promise<AgentThreadContext>;
/**
 * Get threads by user (for debugging/admin).
 */
export declare function getUserThreads(userId: string): ConversationThread[];
/**
 * Clear stale threads (call periodically).
 */
export declare function clearStaleThreads(): number;
export declare const threadManager: {
    getOrCreateThread: typeof getOrCreateThread;
    getThread: typeof getThread;
    getActiveThread: typeof getActiveThread;
    addMessage: typeof addMessage;
    getMessages: typeof getMessages;
    transferOwnership: typeof transferOwnership;
    updateThreadStatus: typeof updateThreadStatus;
    updateThreadTopics: typeof updateThreadTopics;
    updateEmotionalContext: typeof updateEmotionalContext;
    buildAgentContext: typeof buildAgentContext;
    getUserThreads: typeof getUserThreads;
    clearStaleThreads: typeof clearStaleThreads;
};
//# sourceMappingURL=thread-manager.d.ts.map