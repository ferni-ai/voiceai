/**
 * Conversation Feedback Types
 *
 * Shared types for the contextual feedback system.
 * Used across backend trigger engine, storage, and frontend UI.
 *
 * ARCHITECTURE NOTE:
 * This file is at level 10 (types/) so it can be imported by all layers
 * including memory (level 30). The full feedback service remains in
 * services/feedback/.
 *
 * @module types/feedback
 */

// ============================================================================
// FEEDBACK TRIGGERS
// ============================================================================

/**
 * What triggered the feedback prompt
 */
export type FeedbackTrigger =
  | 'natural_pause' // Natural pause > 800ms after Ferni finishes
  | 'topic_transition' // Topic changed during conversation
  | 'insight_moment' // Ferni shared an observation or insight
  | 'explicit_ask'; // User explicitly asked for feedback

/**
 * User's reaction to the conversation moment
 */
export type FeedbackReaction =
  | 'resonated' // This really landed
  | 'helpful' // Good advice/information
  | 'too_much' // Overwhelming or too intense
  | 'off_track' // Not what I was looking for
  | 'skipped' // Dismissed without responding
  | null; // No response captured

// ============================================================================
// CONTEXT
// ============================================================================

/**
 * Context captured at feedback prompt time
 */
export interface FeedbackContext {
  /** Last message from the agent */
  lastAgentMessage: string;
  /** Last message from the user */
  lastUserMessage: string;
  /** Current topic if detected */
  topic?: string;
  /** Emotional tone of the conversation */
  emotionalTone?: 'positive' | 'neutral' | 'heavy' | 'light';
  /** Number of turns in the conversation */
  turnCount: number;
  /** Session duration at feedback time (ms) */
  sessionDuration: number;
}

// ============================================================================
// FEEDBACK ENTRY
// ============================================================================

/**
 * A stored feedback entry
 */
export interface FeedbackEntry {
  id: string;
  userId: string;
  sessionId: string;

  // What happened
  trigger: FeedbackTrigger;
  reaction: FeedbackReaction;

  // Context
  context: FeedbackContext;

  // Timing
  promptedAt: Date;
  respondedAt?: Date;

  // Optional user-provided details
  userComment?: string;
}

/**
 * Feedback statistics
 */
export interface FeedbackStats {
  totalPrompted: number;
  totalResponded: number;
  byReaction: Record<string, number>;
  byTrigger: Record<string, number>;
  averageResponseTime: number | null;
}
