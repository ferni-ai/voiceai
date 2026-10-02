/**
 * Live Superhuman Injections - types
 *
 * @module agents/processors/live-superhuman.types
 */

import type { ContextInjection, EmotionalState } from './types.js';
import type { SessionServices } from '../../services/types.js';
import type { ConversationAnalysis } from '../../services/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface LiveSuperhumanContext {
  userId: string;
  sessionId: string;
  userText: string;
  currentTopic?: string;
  emotionalState: EmotionalState;
  voiceEmotion?: {
    primary: string;
    confidence: number;
    stressLevel?: number;
    valence?: number;
    anxietyMarkers?: boolean;
    prosody?: {
      speechRate?: number;
      pitchVariance?: number;
      pauseDuration?: number;
    };
  };
  analysis: ConversationAnalysis;
  turnCount: number;
  totalConversations?: number;
  /** Mentioned entities from active listening capture (Phase 17) */
  mentionedEntities?: string[];
  /** Session services for persona context */
  services?: SessionServices;
}

export interface LiveSuperhumanResult {
  injections: ContextInjection[];
  signals: {
    commitmentDetected: boolean;
    valuesConflict: boolean;
    capacityWarning: boolean;
    insideJokeOpportunity: boolean;
    voiceDistressDetected: boolean;
    predictiveInsight: boolean;
  };
  processingTimeMs: number;
}
