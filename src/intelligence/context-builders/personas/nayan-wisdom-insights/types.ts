/**
 * Nayan's Wisdom Insights - Type Definitions
 *
 * Types for Nayan's deep wisdom intelligence system.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export interface NayanInsightBriefing {
  /** Life synthesis - the big picture */
  lifeSynthesis: LifeSynthesis;
  /** Computed wisdom metrics */
  wisdomMetrics: WisdomMetrics;
  /** Values alignment analysis */
  valuesAlignment: ValuesAlignment;
  /** Wisdom opportunities */
  wisdomOpportunities: string[];
  /** Deep questions to explore */
  deepQuestions: string[];
  /** Cross-team synthesis */
  teamSynthesis: TeamSynthesis;
  /** Existential context */
  existentialContext: ExistentialContext;
  /** Proactive wisdom triggers */
  proactiveTriggers: WisdomTrigger[];
  /** Life narrative summary */
  lifeNarrative: LifeNarrative;
  /** Better Than Human: Calendar context for reflection timing */
  calendarContext: CalendarWisdomContext | null;
}

/** Calendar context for Nayan's wisdom conversations */
export interface CalendarWisdomContext {
  /** Current calendar intensity */
  loadLevel: 'light' | 'moderate' | 'heavy' | 'overloaded';
  /** Is this a good time for deep reflection? */
  isGoodTimeForReflection: boolean;
  /** Best day for deeper conversations */
  bestDayForDepth: string | null;
  /** Timing suggestion for wisdom delivery */
  wisdomTimingSuggestion: string | null;
  /** Busyness pattern insight */
  busynessInsight: string | null;
  /** User just came from a meeting? */
  justFromMeeting: boolean;
  /** Meeting-free time available */
  quietTimeAvailable: boolean;
}

export interface LifeSynthesis {
  lifeChapter: string;
  dominantTheme: string | null;
  growthPattern: 'striving' | 'integrating' | 'resting' | 'transitioning' | 'unknown';
  compoundingAreas: string[];
  valuesRevealed: string[];
  timeHorizon: 'short' | 'medium' | 'long' | 'unknown';
  seasonOfLife: string;
}

export interface WisdomMetrics {
  /** Harmony across life areas (0-100) */
  lifeIntegration: number;
  /** Actions aligned with values (0-100) */
  meaningCoherence: number;
  /** Long-term impact awareness (0-100) */
  legacyReadiness: number;
  /** Acceptance vs. striving (0-100) */
  innerPeaceIndex: number;
  /** Direction of evolution (0-100) */
  growthTrajectory: number;
  /** Key patterns detected */
  patterns: string[];
}

export interface ValuesAlignment {
  statedValues: string[];
  demonstratedValues: string[];
  alignmentGaps: string[];
  coherentAreas: string[];
  conflictAreas: string[];
}

export interface ExistentialContext {
  mortalityAwareness: 'absent' | 'emerging' | 'present' | 'integrated';
  legacyThinking: boolean;
  meaningSeekingIntensity: 'low' | 'moderate' | 'high';
  currentExistentialTheme: string | null;
  spiritualOpenness: 'closed' | 'curious' | 'exploring' | 'practiced';
}

export interface WisdomTrigger {
  type: 'reflection' | 'reframe' | 'paradox' | 'question' | 'silence' | 'story';
  message: string;
  priority: 'high' | 'medium' | 'low';
  timing: 'immediate' | 'when_ready' | 'later';
}

export interface LifeNarrative {
  pastChapter: string;
  currentChapter: string;
  emergingChapter: string;
  recurringThemes: string[];
  transformationMoments: string[];
  unfinishedBusiness: string[];
}

export interface TeamSynthesis {
  peterPattern: string | null;
  mayaPattern: string | null;
  jordanPattern: string | null;
  alexPattern: string | null;
  integratedWisdom: string | null;
  crossDomainInsights: string[];
}

export interface HandoffBriefing {
  topic: string;
  seekingWhat: 'meaning' | 'perspective' | 'peace' | 'clarity' | 'acceptance' | 'general';
  depth: 'surface' | 'medium' | 'existential';
  timeContext: string | null;
  emotionalUndercurrent: string | null;
  fromPersona: string | null;
}

// ============================================================================
// SESSION STATE
// ============================================================================

export interface NayanSession {
  briefingTurn: number;
  questionsExplored: Set<string>;
  wisdomShared: string[];
}

