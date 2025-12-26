/**
 * Handoff Type Definitions
 *
 * Types for handoff state management.
 * These types are shared between services and tools layers.
 *
 * ARCHITECTURE: Level 10 (types/) - can be imported by any layer
 */

import type { AgentId } from './agent-ids.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Record of a single handoff for analytics/debugging
 */
export interface HandoffRecord {
  timestamp: number;
  from: AgentId;
  to: AgentId;
  reason: string;
  duration?: number;
}

/**
 * Context preserved across handoffs for conversation continuity
 */
export interface HandoffContext {
  topics: string[];
  emotionalState: string;
  summary: string;
  pendingItems: string[];
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Per-session handoff state
 */
export interface HandoffState {
  /** Current active agent (canonical ID) */
  currentAgent: AgentId;

  /** Timestamp of last handoff (for rate limiting) */
  lastHandoffTimestamp: number;

  /** History of handoffs in this session (for analytics) */
  handoffHistory: HandoffRecord[];

  /** Set of personas user has met this session (for first-meeting detection) */
  metPersonas: Set<string>;

  /** Per-persona meeting count (for relationship-aware greetings) */
  perPersonaMeetingCount: Map<string, number>;

  /** Per-persona last topic discussed */
  perPersonaLastTopic: Map<string, string>;

  /** Conversation context for handoff continuity */
  conversationContext: HandoffContext | null;

  /** Last user message for mood detection */
  lastUserMessageForMood?: string;

  /** Last emotion analysis for mood detection */
  lastEmotionAnalysisForMood?: {
    primary: string;
    intensity: number;
    distressLevel?: number;
  };
}
