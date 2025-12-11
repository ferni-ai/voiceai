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

  // 🧠 SUPERHUMAN INTELLIGENCE - Cross-session data
  superhumanMemories?: SuperhumanMemoryData[];
  superhumanPatterns?: SuperhumanPatternData[];
  superhumanLearning?: SuperhumanLearningData;
}

/**
 * Proactive memory data for persistence
 */
export interface SuperhumanMemoryData {
  id: string;
  type:
    | 'event'
    | 'goal'
    | 'person'
    | 'pattern'
    | 'struggle'
    | 'milestone'
    | 'preference'
    | 'achievement';
  content: string;
  context?: string;
  topics: string[];
  people: string[];
  mentionedAt: Date;
  expectedFollowUpAt?: Date;
  emotionalWeight: 'light' | 'medium' | 'heavy';
  wasVulnerable: boolean;
}

/**
 * Pattern data for persistence
 */
export interface SuperhumanPatternData {
  type: 'temporal' | 'topic_recurring' | 'emotional_cycle' | 'relationship';
  description: string;
  confidence: number;
  evidence: string[];
  detectedAt: Date;
}

/**
 * Learning data for predictive anticipation
 */
export interface SuperhumanLearningData {
  topicTransitions: Array<{
    from: string;
    to: string;
    count: number;
  }>;
  baseline: {
    avgValence: number;
    avgArousal: number;
    preferredNeed: string;
    speechRateBaseline: number;
    energyBaseline: number;
  };
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
    // 🧠 Superhuman intelligence data
    superhumanMemories: [],
    superhumanPatterns: [],
    superhumanLearning: undefined,
  };
}
