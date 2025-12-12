/**
 * Context types
 *
 * These are shared across ContextManager, registry helpers, and session services.
 */

import type { ConversationState, PhaseGuidance } from '../intelligence/conversation-state.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import type { SpeedControlResult } from '../speech/adaptive-ssml/dynamic-speed-control.js';
import type { EmotionalMomentum, ProsodyContinuityHints } from '../speech/emotional-contagion.js';
import type { HumanListeningResult } from '../speech/human-listening-pipeline/types.js';
import type { PersonaId, SessionId } from '../types/branded.js';

/**
 * Speech-derived insights for context enhancement
 */
export interface SpeechInsightsContext {
  /** Current emotional momentum (valence, arousal, warmth trend) */
  emotionalMomentum?: EmotionalMomentum;

  /** Prosody continuity hints for TTS */
  prosodyContinuityHints?: ProsodyContinuityHints;

  /** Human listening analysis results */
  humanListeningResult?: HumanListeningResult;

  /** Recommended speech speed adjustments */
  speedControl?: SpeedControlResult;

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
  maxLength?: number;
}

/**
 * Context for prompt injection
 */
export interface PromptContext {
  /** Session identifier */
  sessionId: SessionId;

  /** Current persona handling the conversation */
  currentPersona: PersonaId;

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
}

export type { ConversationState, EmotionResult, PhaseGuidance };
