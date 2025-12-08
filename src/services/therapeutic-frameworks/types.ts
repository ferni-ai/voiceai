/**
 * Therapeutic Frameworks Types
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Core types for evidence-based therapeutic frameworks.
 * These aren't replacements for therapy—they're tools that help
 * Ferni offer research-backed support in everyday conversation.
 *
 * PHILOSOPHY:
 * Real therapeutic frameworks have decades of research behind them.
 * We adapt their essence for conversational coaching while being
 * clear that Ferni is a coach, not a therapist.
 *
 * @module TherapeuticFrameworks/Types
 */

// ============================================================================
// ACT (ACCEPTANCE & COMMITMENT THERAPY)
// ============================================================================

/**
 * ACT's six core processes for psychological flexibility.
 */
export type ACTProcess =
  | 'acceptance'        // Willingness to have difficult experiences
  | 'defusion'          // Seeing thoughts as thoughts, not facts
  | 'present_moment'    // Being here, now
  | 'self_as_context'   // Observer self vs. story self
  | 'values'            // What truly matters to you
  | 'committed_action'; // Taking values-aligned steps

/**
 * A value identified through ACT values work.
 */
export interface ACTValue {
  /** The value itself */
  value: string;

  /** Domain of life */
  domain: ValueDomain;

  /** Why this matters (in their words) */
  meaning?: string;

  /** Current satisfaction with living this value (0-10) */
  currentAlignment?: number;

  /** Importance rating (0-10) */
  importance?: number;

  /** When first identified */
  identifiedAt: Date;

  /** Actions taken toward this value */
  committedActions?: CommittedAction[];
}

export type ValueDomain =
  | 'relationships'   // Family, friends, intimacy
  | 'work'            // Career, contribution
  | 'health'          // Physical, mental wellbeing
  | 'growth'          // Learning, personal development
  | 'leisure'         // Fun, creativity, play
  | 'spirituality'    // Meaning, purpose, connection
  | 'community'       // Giving back, citizenship
  | 'environment';    // Nature, sustainability

/**
 * An action committed to in service of a value.
 */
export interface CommittedAction {
  action: string;
  valueId: string;
  targetDate?: Date;
  completed: boolean;
  completedAt?: Date;

  /** How aligned did taking this action feel? (0-10) */
  alignmentRating?: number;

  /** Reflection after completion */
  reflection?: string;
}

/**
 * A defusion technique for handling difficult thoughts.
 */
export interface DefusionTechnique {
  id: string;
  name: string;
  description: string;

  /** The script/instructions */
  guidance: string;

  /** Best for which kinds of thoughts */
  bestFor: string[];

  /** Example thought to defuse */
  exampleThought?: string;

  /** Example defusion */
  exampleDefusion?: string;
}

// ============================================================================
// DBT (DIALECTICAL BEHAVIOR THERAPY)
// ============================================================================

/**
 * DBT's four skill modules.
 */
export type DBTModule =
  | 'mindfulness'           // Present awareness
  | 'distress_tolerance'    // Surviving crisis without making worse
  | 'emotion_regulation'    // Understanding and managing emotions
  | 'interpersonal';        // Effective relationships

/**
 * A specific DBT skill.
 */
export interface DBTSkill {
  id: string;
  name: string;
  module: DBTModule;
  description: string;

  /** Acronym if it has one (TIPP, STOP, etc.) */
  acronym?: string;

  /** What each letter stands for */
  acronymMeaning?: Record<string, string>;

  /** When to use this skill */
  whenToUse: string[];

  /** Step-by-step guidance */
  steps: string[];

  /** Voice-guidable version for Ferni */
  voiceGuidance?: string;
}

/**
 * DBT's TIPP skills for crisis.
 */
export const TIPP_SKILL: DBTSkill = {
  id: 'tipp',
  name: 'TIPP',
  module: 'distress_tolerance',
  description: 'Quickly change your body chemistry when emotions are at a 10',
  acronym: 'TIPP',
  acronymMeaning: {
    T: 'Temperature - cold water on face',
    I: 'Intense exercise',
    P: 'Paced breathing',
    P: 'Paired muscle relaxation',
  },
  whenToUse: ['crisis', 'panic', 'extreme emotion', "can't calm down"],
  steps: [
    'Temperature: Put cold water on your face, or hold ice',
    'Intense Exercise: Even 20 jumping jacks can help',
    'Paced Breathing: Breathe out longer than you breathe in',
    'Paired Muscle Relaxation: Tense muscles as you breathe in, relax as you breathe out',
  ],
  voiceGuidance: `When emotions are at a 10, we need to change your body chemistry. 
Let me walk you through TIPP. 
First - Temperature. If you can, run cold water on your face or hold something cold. 
This activates your dive reflex and slows your heart rate. 
Can you try that?`,
};

/**
 * DBT's STOP skill for when you're about to do something impulsive.
 */
export const STOP_SKILL: DBTSkill = {
  id: 'stop',
  name: 'STOP',
  module: 'distress_tolerance',
  description: 'Pause before acting on impulse',
  acronym: 'STOP',
  acronymMeaning: {
    S: 'Stop - freeze, don\'t act',
    T: 'Take a step back',
    O: 'Observe what\'s happening',
    P: 'Proceed mindfully',
  },
  whenToUse: ['about to say something regrettable', 'impulsive', 'reactive', 'angry'],
  steps: [
    'Stop - freeze where you are',
    'Take a step back - breathe, don\'t react',
    'Observe - what am I feeling? What\'s happening?',
    'Proceed mindfully - what\'s effective here?',
  ],
  voiceGuidance: `Before you do anything, let's STOP together.
Stop. Just freeze for a second. You don't have to respond right now.
Take a step back. One deep breath with me.
Observe. What are you feeling right now? What just happened?
Now we can proceed mindfully. What do you actually want to happen here?`,
};

// ============================================================================
// MOTIVATIONAL INTERVIEWING
// ============================================================================

/**
 * Core spirit of Motivational Interviewing.
 */
export type MISpirit =
  | 'partnership'     // Collaboration, not confrontation
  | 'acceptance'      // Respect autonomy, affirm strengths
  | 'compassion'      // Prioritize their wellbeing
  | 'evocation';      // Draw out their own motivation

/**
 * OARS: Core skills of MI.
 */
export interface OARSSkills {
  openQuestions: string[];
  affirmations: string[];
  reflections: string[];
  summaries: string[];
}

/**
 * Change talk types to listen for.
 */
export type ChangeTalk =
  | 'desire'      // "I want to..."
  | 'ability'    // "I could..."
  | 'reasons'    // "Because..."
  | 'need'       // "I need to..."
  | 'commitment' // "I will..."
  | 'taking_steps'; // "I already started..."

/**
 * A piece of change talk detected in conversation.
 */
export interface ChangeTalkInstance {
  type: ChangeTalk;
  statement: string;
  strength: number; // 0-1
  topic?: string;
  timestamp: Date;
}

// ============================================================================
// COGNITIVE BEHAVIORAL THERAPY (CBT)
// ============================================================================

/**
 * Cognitive restructuring process.
 * Already partially implemented in cognitive-intelligence.
 */
export interface CognitiveRestructuring {
  automaticThought: string;
  emotion: string;
  emotionIntensity: number;

  /** Evidence for the thought */
  evidenceFor?: string[];

  /** Evidence against the thought */
  evidenceAgainst?: string[];

  /** Balanced/alternative thought */
  balancedThought?: string;

  /** New emotion and intensity */
  newEmotion?: string;
  newIntensity?: number;
}

/**
 * Behavioral activation for low mood.
 */
export interface BehavioralActivation {
  /** Values-aligned activities to try */
  activities: PleasantActivity[];

  /** Activity log */
  activityLog: ActivityLogEntry[];

  /** Mood tracking over time */
  moodOverTime: MoodEntry[];
}

export interface PleasantActivity {
  activity: string;
  domain: ValueDomain;
  effort: 'low' | 'medium' | 'high';
  social: boolean;
  outdoors: boolean;
}

export interface ActivityLogEntry {
  activity: string;
  timestamp: Date;
  moodBefore: number;
  moodAfter: number;
  masteryRating?: number;  // 0-10: how accomplished
  pleasureRating?: number; // 0-10: how enjoyable
  notes?: string;
}

export interface MoodEntry {
  timestamp: Date;
  mood: number; // 0-10
  notes?: string;
}

// ============================================================================
// THERAPEUTIC PROFILES
// ============================================================================

/**
 * A user's therapeutic profile - what we've learned about what helps them.
 */
export interface TherapeuticProfile {
  userId: string;

  // ACT
  values: ACTValue[];
  defusionTechniquesUsed: string[];
  acceptanceLevel: number; // 0-10, how well they accept difficult experiences

  // DBT
  dbtSkillsLearned: string[];
  crisisToolsTried: string[];

  // MI
  changeTalkHistory: ChangeTalkInstance[];
  ambivalenceTopics: string[]; // Topics with mixed feelings

  // CBT
  restructuringProgress?: {
    thoughtRecordsCompleted: number;
    averageEmotionReduction: number;
    topDistortions: string[];
  };

  // Behavioral Activation
  behavioralActivation?: BehavioralActivation;

  // Meta
  updatedAt: Date;
  sessionsWithFrameworkUse: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface TherapeuticFrameworksConfig {
  /** Enable ACT values work */
  enableACT: boolean;

  /** Enable DBT skills */
  enableDBT: boolean;

  /** Enable Motivational Interviewing patterns */
  enableMI: boolean;

  /** Enable Behavioral Activation */
  enableBehavioralActivation: boolean;

  /** Minimum relationship stage to introduce frameworks */
  minRelationshipStage: 'new' | 'building' | 'established' | 'deep';
}

export const DEFAULT_CONFIG: TherapeuticFrameworksConfig = {
  enableACT: true,
  enableDBT: true,
  enableMI: true,
  enableBehavioralActivation: true,
  minRelationshipStage: 'building',
};

