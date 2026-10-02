/**
 * Humanizer Type Definitions
 *
 * Types for the conversation humanization system.
 *
 * @module @ferni/conversation/humanizer/types
 */

import type { SessionMemory } from '../deep-humanization/index.js';

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/**
 * Context for humanization operations
 */
export interface HumanizationContext {
  personaId: string;
  turnNumber: number;
  userMessage: string;
  userEmotion?: string;
  topic?: string;
  isSeriousContext?: boolean;
  wasPersonalSharing?: boolean;
  silenceDurationMs?: number;
  /** Session data for anticipation/running jokes */
  sessionData?: SessionMemory;
  /** Relationship stage for deeper humanization */
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Actions to take before generating a response
 */
export interface PreResponseActions {
  backchannel?: { text: string; ssml: string };
  silenceAction?: 'wait' | 'gentle_prompt' | 'continue' | 'backchannel';
  acknowledgment?: string;
  topicChange?: { detected: boolean; transitionPhrase?: string };
}

/**
 * Guidance to inject into LLM context
 */
export interface ContextGuidance {
  source: string;
  content: string;
  priority: 'high' | 'standard' | 'hint';
}
