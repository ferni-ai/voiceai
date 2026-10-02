/**
 * Advanced Humanization Integration Types
 *
 * Session config, per-turn guidance and response modification shapes used
 * by the advanced humanization voice agent integration.
 *
 * @module @ferni/advanced-humanization-integration
 */

export interface AdvancedHumanizationSessionConfig {
  sessionId: string;
  userId: string;
  relationshipDepth?: 'new' | 'developing' | 'established' | 'deep';
  prosodyHints?: {
    speechRate?: number;
    volume?: number;
    pitchVariance?: number;
  };
}

export interface TurnGuidance {
  /** Priority actions to address (most important first) */
  priorityActions: string[];

  /** Should we stop giving direct advice? */
  stopDirectAdvice: boolean;

  /** Tone guidance for response */
  toneGuidance: string;

  /** Length guidance */
  lengthGuidance: 'shorter' | 'normal' | 'longer';

  /** Subtext to address (if any) */
  subtext?: {
    type: string;
    probe: string | null;
  };

  /** Repair needed (if any) */
  repair?: {
    phrase: string;
    followUp?: string;
  };

  /** Affirmation to include (if any) */
  affirmation?: {
    phrase: string;
    placement: 'prefix' | 'inline' | 'suffix';
  };

  /** Hope injection (if appropriate) */
  hope?: {
    phrase: string;
    type: string;
  };

  /** Curiosity prompt (if appropriate) */
  curiosityPrompt?: string;

  /** Milestone to acknowledge (if any) */
  milestone?: string;

  /** Aftercare guidance (if needed) */
  aftercare?: {
    phase: string;
    checkIn?: string;
    grounding?: string;
    pacing: string;
  };

  /** Energy regulation guidance */
  energyGuidance?: {
    strategy: string;
    pace: string;
    intensity: string;
  };

  /** Paradoxical intervention (if appropriate) */
  paradoxicalPhrase?: string;
}

export interface ResponseModification {
  /** Prefix to add to response */
  prefix?: string;

  /** Suffix to add to response */
  suffix?: string;

  /** System prompt additions */
  systemPromptAdditions: string[];

  /** SSML modifications */
  ssmlHints?: {
    pace?: 'slow' | 'normal' | 'fast';
    emphasis?: string[];
    pauses?: Array<{ after: string; duration: number }>;
  };
}
