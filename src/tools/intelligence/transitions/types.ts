/**
 * Transition Matrix Types
 *
 * Type definitions for the tool transition tracking system that learns
 * sequential patterns from user sessions.
 *
 * @module tools/intelligence/transitions/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Time of day categories for context-conditioned transitions
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * A single tool transition record
 */
export interface ToolTransition {
  /** Source tool ID */
  fromTool: string;
  /** Target tool ID */
  toTool: string;
  /** Persona context */
  personaId: string;
  /** Time context */
  timeOfDay: TimeOfDay;
  /** Emotional context */
  emotion: string;
  /** Number of times this transition occurred */
  count: number;
  /** Calculated probability P(toTool | fromTool, context) */
  probability: number;
  /** Success rate when this transition was followed */
  successRate: number;
  /** Average time between tool calls in ms */
  avgGapMs: number;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * A recorded tool sequence from a user session
 */
export interface ToolSequence {
  /** Unique sequence ID */
  id: string;
  /** User who performed the sequence */
  userId: string;
  /** Session where sequence occurred */
  sessionId: string;
  /** Ordered list of tool IDs */
  sequence: string[];
  /** Timestamps for each tool call */
  timestamps: Date[];
  /** Success status for each tool call */
  success: boolean[];
  /** Context at time of sequence */
  context: SequenceContext;
  /** When sequence was recorded */
  createdAt: Date;
}

/**
 * Context for a tool sequence
 */
export interface SequenceContext {
  personaId: string;
  timeOfDay: TimeOfDay;
  emotion?: string;
  topic?: string;
  userIntent?: string;
}

/**
 * Result of a transition prediction
 */
export interface TransitionPrediction {
  /** Predicted next tool */
  toolId: string;
  /** Probability of this prediction */
  probability: number;
  /** How many times this transition was observed */
  observationCount: number;
  /** Historical success rate */
  successRate: number;
  /** Whether to skip LLM call (high confidence) */
  skipLLM: boolean;
}

/**
 * Configuration for the transition matrix
 */
export interface TransitionMatrixConfig {
  /** Minimum observations before using for predictions */
  minObservations: number;
  /** Probability threshold for high-confidence predictions */
  highConfidenceThreshold: number;
  /** Maximum transitions to store per source tool */
  maxTransitionsPerTool: number;
  /** Time decay factor for older observations */
  timeDecayFactor: number;
  /** Whether to use context conditioning */
  useContextConditioning: boolean;
}

/**
 * Statistics about the transition matrix
 */
export interface TransitionMatrixStats {
  /** Total unique transitions */
  totalTransitions: number;
  /** Total observations */
  totalObservations: number;
  /** Number of unique tool sequences */
  uniqueSequences: number;
  /** Average sequence length */
  avgSequenceLength: number;
  /** Most common transitions */
  topTransitions: Array<{
    from: string;
    to: string;
    count: number;
    probability: number;
  }>;
  /** Last update time */
  lastUpdate: Date;
}

// ============================================================================
// FIRESTORE TYPES
// ============================================================================

/**
 * Firestore document for a tool transition
 */
export interface FirestoreTransition {
  fromTool: string;
  toTool: string;
  personaId: string;
  timeOfDay: TimeOfDay;
  emotion: string;
  count: number;
  probability: number;
  successRate: number;
  avgGapMs: number;
  updatedAt: FirebaseFirestore.Timestamp;
}

/**
 * Firestore document for a tool sequence
 */
export interface FirestoreSequence {
  userId: string;
  sessionId: string;
  sequence: string[];
  timestamps: FirebaseFirestore.Timestamp[];
  success: boolean[];
  context: SequenceContext;
  createdAt: FirebaseFirestore.Timestamp;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_TRANSITION_CONFIG: TransitionMatrixConfig = {
  minObservations: 3,
  highConfidenceThreshold: 0.7,
  maxTransitionsPerTool: 50,
  timeDecayFactor: 0.95,
  useContextConditioning: true,
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get time of day category from a Date
 */
export function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Generate a unique key for a transition (for deduplication)
 */
export function getTransitionKey(
  fromTool: string,
  toTool: string,
  personaId?: string,
  timeOfDay?: TimeOfDay,
  emotion?: string
): string {
  const parts = [fromTool, toTool];
  if (personaId) parts.push(personaId);
  if (timeOfDay) parts.push(timeOfDay);
  if (emotion) parts.push(emotion);
  return parts.join('::');
}
