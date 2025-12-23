/**
 * Active Listening Types
 *
 * Type definitions for the active listening module.
 *
 * @module conversation/active-listening/types
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BackchannelContext {
  userEmotion?: string;
  userEnergy?: 'high' | 'medium' | 'low';
  topicSeriousness?: 'serious' | 'casual' | 'emotional';
  relationshipStage?: string;
  silenceDurationMs?: number;
  userJustSharedSomethingPersonal?: boolean;
  userAskedQuestion?: boolean;
  /** Optional seed for deterministic selection */
  randomSeed?: string;
}

export interface Backchannel {
  verbal: string;
  ssml: string;
  type: 'acknowledgment' | 'encouragement' | 'empathy' | 'curiosity' | 'agreement';
  energy: 'high' | 'medium' | 'low';
}

export interface MirroredPhrase {
  original: string;
  mirrored: string;
  type: 'vocabulary' | 'emotion' | 'structure';
}

export interface ClarifyingQuestion {
  question: string;
  ssml: string;
  type: 'understanding' | 'elaboration' | 'confirmation' | 'emotion';
}

export interface SilenceEvaluation {
  comfortable: boolean;
  action: 'wait' | 'gentle_prompt' | 'backchannel';
  reason: string;
}

export interface SilenceBackchannelContext {
  silenceDurationMs: number;
  userJustSharedPersonal?: boolean;
  userIsProcessingEmotions?: boolean;
  lastUserEmotion?: string;
  turnCount?: number;
  randomSeed?: string;
}

export interface PersonaBackchannelStyle {
  preferred: Array<Backchannel['type']>;
  energyBias: 'high' | 'medium' | 'low';
  uniquePhrases: Array<{ phrase: string; type: Backchannel['type']; ssml: string }>;
}
