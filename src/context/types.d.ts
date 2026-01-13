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
export type { ConversationState, PhaseGuidance } from '../intelligence/conversation-state.js';
export type { EmotionResult } from '../intelligence/emotion-detector.js';
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
    phase: string;
    turnCount: number;
    durationMinutes: number;
    relationshipContext: string;
    userName?: string;
    isReturning: boolean;
    emotionalContext: string;
    needsSupport: boolean;
    topicContext: string;
    topicsToCircleBack: string[];
    rollingSummary?: string;
    lastConversationSummary?: string;
    formattedForPrompt: string;
    speechInsights?: SpeechInsightsContext;
    trustContext?: TrustContextResult | null;
}
//# sourceMappingURL=types.d.ts.map