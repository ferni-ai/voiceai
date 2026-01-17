/**
 * Proactive Memory Types
 *
 * Type definitions for proactive memory surfacing system.
 *
 * @module conversation/proactive-memory/types
 */

// ============================================================================
// MEMORY TYPES
// ============================================================================

export type MemoryType =
  | 'event' // Scheduled event (interview, meeting, trip)
  | 'goal' // Ongoing goal (fitness, career, relationship)
  | 'person' // Person mentioned (family, friend, colleague)
  | 'pattern' // Recurring pattern (Monday stress, late-night anxiety)
  | 'struggle' // Ongoing struggle (health issue, work problem)
  | 'milestone' // Important date (anniversary, birthday, deadline)
  | 'preference' // User preference (communication style, topics)
  | 'achievement'; // Something they accomplished

export interface StoredMemory {
  /** Unique ID */
  id: string;

  /** Type of memory */
  type: MemoryType;

  /** What was mentioned */
  content: string;

  /** More detailed context */
  context?: string;

  /** Related topic keywords */
  topics: string[];

  /** Related person names */
  people: string[];

  /** When this was mentioned */
  mentionedAt: Date;

  /** Expected follow-up time (if applicable) */
  expectedFollowUpAt?: Date;

  /** Has this been proactively surfaced? */
  surfaced: boolean;

  /** How many times surfaced */
  surfaceCount: number;

  /** Emotional weight when mentioned */
  emotionalWeight: 'light' | 'medium' | 'heavy';

  /** Was this a vulnerable share? */
  wasVulnerable: boolean;

  /** Session ID where this was captured */
  sessionId: string;

  /** Last surfaced at */
  lastSurfacedAt?: Date;
}

export interface ProactiveMemorySuggestion {
  /** The memory being surfaced */
  memory: StoredMemory;

  /** Type of surfacing */
  triggerType: 'time_based' | 'topic_based' | 'pattern_based' | 'opening' | 'contextual';

  /** Suggested phrase to use */
  phrase: string;

  /** SSML version */
  ssml: string;

  /** Priority (higher = more important to surface) */
  priority: number;

  /** Why we're suggesting this */
  reason: string;
}

export interface PatternDetection {
  /** Pattern type */
  type: 'temporal' | 'topic_recurring' | 'emotional_cycle' | 'relationship';

  /** Description */
  description: string;

  /** Confidence (0-1) */
  confidence: number;

  /** Evidence (what triggered detection) */
  evidence: string[];

  /** When first detected */
  detectedAt: Date;

  /** Has this been acknowledged? */
  acknowledged: boolean;
}

// ============================================================================
// EXTRACTION TYPES
// ============================================================================

export interface ExtractedTimeReference {
  type: 'specific_date' | 'relative' | 'recurring' | 'none';
  date?: Date;
  description: string;
}

export interface ExtractedContent {
  events: Array<{ event: string; timeRef?: ExtractedTimeReference }>;
  goals: string[];
  people: Array<{ name: string; relationship?: string }>;
  struggles: string[];
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

export interface CaptureContext {
  topic?: string;
  emotion?: string;
  wasVulnerable?: boolean;
  turnCount: number;
}

export interface SuggestionContext {
  turnCount: number;
  currentTopic?: string;
  isSessionStart?: boolean;
  currentHour?: number;
  currentDayOfWeek?: number;
}
