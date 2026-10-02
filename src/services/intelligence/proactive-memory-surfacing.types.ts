/**
 * Proactive Memory Surfacing Types
 *
 * Public shapes for proactive-memory-surfacing.ts.
 */

import type { ExplainedMemory, ReferenceStyle } from '../../memory/interfaces/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SurfacingContext {
  userId: string;
  currentInput: string;
  currentEmotion?: string;
  currentTopic?: string;
  personaId: string;
  turnNumber: number;
  sessionId: string;
  recentTopics?: string[];
  personMentioned?: string;
}

export interface SurfacingDecision {
  shouldSurface: boolean;
  reason: string;
  confidence: number;

  // If shouldSurface is true:
  memory?: ExplainedMemory;
  phrasing?: string;
  style?: ReferenceStyle['style'];

  // Metadata for learning
  decisionFactors: {
    timingScore: number;
    relevanceScore: number;
    emotionalFit: number;
    learningModifier: number;
  };
}

export interface SurfacingResult {
  decision: SurfacingDecision;
  surfacingId?: string; // For feedback tracking
  relatedMemoryIds?: string[]; // From graph traversal
}

export interface SurfacingFeedback {
  surfacingId: string;
  reaction: 'engaged' | 'grateful' | 'neutral' | 'negative';
  userResponse?: string;
  followedUp?: boolean;
}
