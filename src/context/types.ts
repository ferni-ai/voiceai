/**
 * Context Module Types
 *
 * These types define the contracts for the context module.
 * Self-contained interfaces are used where possible to:
 * - Avoid circular dependencies
 * - Provide stable contracts
 * - Enable easier testing
 *
 * @module context/types
 */

import type { PersonaId, SessionId } from '../types/branded.js';

// ============================================================================
// RE-EXPORTS (for backward compatibility)
// ============================================================================

// These are re-exported from their source modules for convenience
export type { ConversationState, PhaseGuidance } from '../intelligence/state/conversation.js';
export type { EmotionResult } from '../intelligence/detectors/emotion.js';

// ============================================================================
// SPEECH INSIGHTS
// ============================================================================

/**
 * Speech-derived insights for context enhancement.
 *
 * Note: Speech-related sub-types use `unknown` to avoid coupling with
 * the speech module's internal types. The speech-insights.ts module
 * handles the actual type transformations.
 */
export interface SpeechInsightsContext {
  /** Current emotional momentum (valence, arousal, warmth trend) */
  emotionalMomentum?: unknown;

  /** Prosody continuity hints for TTS */
  prosodyContinuityHints?: unknown;

  /** Human listening analysis results */
  humanListeningResult?: unknown;

  /** Recommended speech speed adjustments */
  speedControl?: unknown;

  /** Whether user appears to be in distress (voice + text signals) */
  voiceDistressSignals: boolean;

  /** User's cognitive load estimate from speech */
  estimatedCognitiveLoad: number;

  /** Speech-derived guidance for response */
  speechGuidance: string;
}

// ============================================================================
// CONTEXT OPTIONS
// ============================================================================

/**
 * Options for context building
 */
export interface ContextOptions {
  includeRelationship?: boolean;
  includeEmotional?: boolean;
  includeTopics?: boolean;
  includeHistory?: boolean;
  includeTrust?: boolean;
  maxLength?: number;
}

// ============================================================================
// HANDOFF TRACKING
// ============================================================================

/**
 * Record of a persona handoff during a session.
 * Tracks the full handoff chain for conversation continuity.
 */
export interface HandoffRecord {
  fromPersona: PersonaId;
  toPersona: PersonaId;
  timestamp: Date;
  turnCount: number;
  /** Optional reason for the handoff */
  reason?: string;
}

// ============================================================================
// TRUST CONTEXT
// ============================================================================

/**
 * Trust context result from the trust systems.
 * Surfaces "better than human" insights about what's not being said.
 */
export interface TrustContextResult {
  /** Signals about what the user is NOT saying */
  unsaidSignals?: string[];

  /** Topics that should be avoided */
  topicsToAvoid?: string[];

  /** Growth reflection opportunity */
  growthReflection?: string;

  /** Callback opportunity (inside jokes, shared history) */
  callbackOpportunity?: string;

  /** Celebration opportunity */
  celebrationOpportunity?: string;

  /** Whether user needs emotional support */
  needsSupport?: boolean;

  /** Raw trust data for advanced processing */
  raw?: unknown;
}

// ============================================================================
// MEMORY RETRIEVAL
// ============================================================================

/**
 * Result from memory/RAG retrieval
 */
export interface MemoryRetrievalResult {
  /** Retrieved memory entries */
  memories: MemoryEntry[];

  /** Total number of potential matches */
  totalMatches: number;

  /** Time taken to retrieve (ms) */
  retrievalTimeMs: number;
}

/**
 * A single memory entry from RAG/semantic search
 */
export interface MemoryEntry {
  /** Unique identifier */
  id: string;

  /** The memory content */
  content: string;

  /** Relevance score (0-1) */
  relevance: number;

  /** When this memory was created */
  timestamp: Date;

  /** Associated topics */
  topics?: string[];

  /** Source of the memory (conversation, note, etc) */
  source?: string;
}

// ============================================================================
// PROMPT CONTEXT
// ============================================================================

/**
 * Full context for prompt injection.
 * This is the main output of ContextManager.buildPromptContext().
 */
export interface PromptContext {
  /** Session identifier */
  sessionId: SessionId;

  /** Current persona handling the conversation */
  currentPersona: PersonaId;

  /** Previous persona (if handoff occurred) */
  previousPersona?: PersonaId;

  /** Full handoff history for the session */
  handoffHistory?: HandoffRecord[];

  // Conversation state
  phase: string;
  turnCount: number;
  durationMinutes: number;

  // Relationship
  relationshipContext: string;
  userName?: string;
  isReturning: boolean;

  // Current emotional state
  emotionalContext: string;
  needsSupport: boolean;

  // Topic context
  topicContext: string;
  topicsToCircleBack: string[];

  // History
  rollingSummary?: string;
  lastConversationSummary?: string;

  // Combined formatted context
  formattedForPrompt: string;

  // Speech insights (optional - available when speech pipeline is active)
  speechInsights?: SpeechInsightsContext;

  // Trust context (optional - available when trust systems are integrated)
  trustContext?: TrustContextResult | null;
}
