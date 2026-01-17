/**
 * Superhuman Memory Types
 *
 * Type definitions for proactive memory intelligence.
 *
 * @module superhuman-memory/types
 */

import type { ComfortPattern, SeasonalPattern } from '../../types/human-memory.js';

/**
 * A proactive memory insight ready to be surfaced
 */
export interface ProactiveInsight {
  id: string;
  type:
    | 'date_reminder'
    | 'growth_celebration'
    | 'comfort_application'
    | 'topic_absence'
    | 'inside_joke'
    | 'seasonal_awareness'
    | 'voice_pattern';

  /** Priority for surfacing */
  priority: 'high' | 'medium' | 'low';

  /** The insight content */
  content: string;

  /** Natural way to reference this in conversation */
  naturalPhrase: string;

  /** Context about when to use this */
  context: {
    /** Best moment to surface this */
    timing: 'greeting' | 'when_relevant' | 'closing' | 'anytime';
    /** Emotional tone to use */
    tone: 'celebratory' | 'gentle' | 'curious' | 'warm' | 'supportive';
    /** Whether this should only be used once */
    oneTime: boolean;
  };

  /** When this insight was generated */
  generatedAt: Date;

  /** When this was last delivered (if ever) */
  deliveredAt?: Date;

  /** Source data reference */
  sourceId?: string;
}

/**
 * Comfort guidance for the current conversation
 */
export interface ComfortGuidance {
  /** Detected stress level */
  stressLevel: 'none' | 'mild' | 'moderate' | 'high';

  /** What kind of support to provide */
  supportType: ComfortPattern['type'] | null;

  /** Specific guidance for the LLM */
  promptInjection: string | null;

  /** What to avoid */
  avoid: string[];
}

/**
 * Topic absence detection result
 */
export interface TopicAbsenceInsight {
  topic: string;
  lastMentioned: Date;
  sessionsSinceLastMention: number;
  possibleReasons: Array<'resolved' | 'avoiding' | 'forgotten' | 'deprioritized'>;
  suggestedApproach: 'gentle_check_in' | 'wait_for_them' | 'celebrate_resolution';
  naturalPrompt: string;
}

/**
 * Voice/energy pattern observation
 */
export interface VoicePatternObservation {
  sessionId: string;
  timestamp: Date;
  patterns: {
    pace: 'slower_than_usual' | 'normal' | 'faster_than_usual';
    energy: 'lower_than_usual' | 'normal' | 'higher_than_usual';
    pauseFrequency: 'more_pauses' | 'normal' | 'fewer_pauses';
  };
  interpretation?: string;
}

/**
 * Complete superhuman memory context for a session
 */
export interface SuperhumanContext {
  /** Proactive insights ready to surface */
  insights: ProactiveInsight[];

  /** Comfort guidance based on detected state */
  comfortGuidance: ComfortGuidance;

  /** Topics that have gone quiet */
  topicAbsences: TopicAbsenceInsight[];

  /** Formatted prompt injection for the LLM */
  promptInjection: string;

  /** Seasonal/temporal context */
  temporalContext: {
    isSpecialDate: boolean;
    specialDateInfo?: string;
    seasonalPattern?: string;
  };
}

/**
 * Temporal context result
 */
export interface TemporalContextResult {
  isSpecialDate: boolean;
  specialDateInfo?: string;
  seasonalPattern?: string;
  promptInjection?: string;
}
