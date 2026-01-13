/**
 * Thread Persistence - Firestore Storage
 *
 * Persists conversation threads to Firestore for cross-session continuity.
 * Threads survive server restarts and are shared across all instances.
 *
 * Storage structure:
 * - bogle_users/{userId}/conversation_threads/{threadId}
 * - bogle_users/{userId}/conversation_threads/{threadId}/messages/{messageId}
 *
 * @module services/conversation-thread/thread-persistence
 */
import type { ConversationThread, ThreadMessage } from './types.js';
/**
 * Save a thread to Firestore.
 */
export declare function saveThread(thread: ConversationThread): Promise<boolean>;
/**
 * Load a thread from Firestore.
 */
export declare function loadThread(userId: string, threadId: string): Promise<ConversationThread | null>;
/**
 * Load the most recent active thread for a user.
 */
export declare function loadActiveThread(userId: string): Promise<ConversationThread | null>;
/**
 * Load recent threads for a user.
 */
export declare function loadRecentThreads(userId: string, limit?: number): Promise<ConversationThread[]>;
/**
 * Save a message to Firestore.
 */
export declare function saveMessage(userId: string, message: ThreadMessage): Promise<boolean>;
/**
 * Load messages for a thread.
 */
export declare function loadMessages(userId: string, threadId: string, limit?: number): Promise<ThreadMessage[]>;
/**
 * Mark a thread as closed in Firestore.
 */
export declare function closeThread(userId: string, threadId: string, reason?: string): Promise<boolean>;
/**
 * Delete old threads (for cleanup jobs).
 */
export declare function deleteOldThreads(userId: string, olderThanDays: number): Promise<number>;
export declare const threadPersistence: {
    saveThread: typeof saveThread;
    loadThread: typeof loadThread;
    loadActiveThread: typeof loadActiveThread;
    loadRecentThreads: typeof loadRecentThreads;
    saveMessage: typeof saveMessage;
    loadMessages: typeof loadMessages;
    closeThread: typeof closeThread;
    deleteOldThreads: typeof deleteOldThreads;
};
//# sourceMappingURL=thread-persistence.d.ts.map