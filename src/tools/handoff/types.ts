/**
 * Handoff Types
 * Type definitions for the handoff system
 */

import type { AgentId } from '../../services/agent-bus.js';

/**
 * Represents context passed during a handoff between agents
 */
export interface HandoffContext {
  /** The reason for the handoff */
  reason: string;
  /** Previous conversation summary */
  conversationSummary?: string;
  /** User's current goal */
  userGoal?: string;
  /** Any relevant user data */
  userData?: Record<string, unknown>;
  /** Timestamp of the handoff */
  timestamp: number;
}

/**
 * Record of a completed handoff
 */
export interface HandoffRecord {
  /** Timestamp of the handoff */
  timestamp: number;
  /** Source agent ID */
  from: AgentId;
  /** Target agent ID */
  to: AgentId;
  /** Reason for the handoff */
  reason: string;
  /** Duration of the handoff in ms */
  duration?: number;
}

/**
 * Analytics about handoff patterns
 */
export interface HandoffAnalytics {
  /** Total number of handoffs */
  totalHandoffs: number;
  /** Handoffs by source agent */
  bySource: Record<string, number>;
  /** Handoffs by target agent */
  byTarget: Record<string, number>;
  /** Average handoff duration */
  avgDuration: number;
  /** Most common handoff pair */
  mostCommonPair?: { from: string; to: string; count: number };
}
