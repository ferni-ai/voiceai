/**
 * Conversation Memory Aggregate
 *
 * Memory of past conversations, summaries, and follow-ups.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Conversation summary for long-term memory
 */
export interface ConversationSummary {
  id: string;
  sessionId: string;
  timestamp: Date;
  duration: number;
  turnCount: number;
  mainTopics: string[];
  keyPoints: string[];
  emotionalArc: string;
  decisionsReached?: string[];
  questionsRemaining?: string[];
  followUpItems?: string[];
  embedding?: number[];
}

/**
 * Pending follow-up item
 */
export interface PendingFollowUp {
  topic: string;
  targetDate: Date;
  reason: string;
}

// ============================================================================
// CONVERSATION MEMORY
// ============================================================================

/**
 * Memory of past conversations
 */
export interface ConversationMemory {
  summaries: ConversationSummary[];
  lastSummary?: string;
  openQuestions: string[];
  pendingFollowUps: PendingFollowUp[];
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create empty conversation memory
 */
export function createConversationMemory(): ConversationMemory {
  return {
    summaries: [],
    openQuestions: [],
    pendingFollowUps: [],
  };
}

