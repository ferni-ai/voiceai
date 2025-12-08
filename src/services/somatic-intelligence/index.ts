/**
 * Somatic Intelligence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Body-based awareness and regulation tools. Stress lives in the body,
 * not just the mind. This module provides practical, voice-guidable
 * exercises for grounding, breathing, and body awareness.
 *
 * PHILOSOPHY:
 * Sometimes the best thing Ferni can do isn't talk more—it's guide
 * someone through a breathing exercise, help them ground in their body,
 * or just slow down. These tools work with the nervous system directly.
 *
 * CAPABILITIES:
 * - Grounding exercises (5-4-3-2-1, physical grounding)
 * - Breathing exercises (box breathing, 4-7-8, physiological sigh)
 * - Progressive muscle relaxation
 * - Body scan awareness
 * - Polyvagal state detection
 *
 * @module SomaticIntelligence
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SomaticIntelligence' });

// ============================================================================
// TYPES
// ============================================================================

export interface ExerciseStep {
  instruction: string;
  durationMs: number;
  voiceGuidance: string;
  ssml?: string;
}

export interface Exercise {
  id: string;
  name: string;
  description: string;
  category: 'grounding' | 'breathing' | 'relaxation' | 'awareness';
  duration: 'short' | 'medium' | 'long';  // < 2min, 2-5min, > 5min
  intensity: 'gentle' | 'moderate' | 'intense';

  /** When to suggest this exercise */
  triggers: string[];

  /** Contraindications */
  notFor?: string[];

  /** The steps */
  steps: ExerciseStep[];

  /** Closing message */
  closing: string;
}

export interface ExerciseResult {
  exerciseId: string;
  userId: string;
  startedAt: Date;
  completedAt?: Date;
  completed: boolean;

  /** Self-reported rating 1-10 */
  helpfulnessRating?: number;

  /** State before/after */
  stateBefore?: NervousSystemState;
  stateAfter?: NervousSystemState;
}

export type NervousSystemState =
  | 'ventral_vagal'   // Safe, social, connected (parasympathetic)
  | 'sympathetic'     // Fight/flight, anxious, angry
  | 'dorsal_vagal';   // Shutdown, frozen, dissociated

// ============================================================================
// GROUNDING EXERCISES
// ============================================================================

/**
 * The classic 5-4-3-2-1 grounding technique.
 * Uses the five senses to anchor in the present moment.
 */
export const FIVE_SENSES_GROUNDING: Exercise = {
  id: 'five_senses',
  name: '5-4-3-2-1 Grounding',
  description: 'Use your five senses to anchor yourself in the present moment',
  category: 'grounding',
  duration: 'short',
  intensity: 'gentle',

  triggers: ['anxious', 'panic', 'overwhelmed', 'dissociated', 'spiraling'],
  notFor: [],

  steps: [
    {
      instruction: 'Look around and name 5 things you can see',
      durationMs: 15000,
      voiceGuidance: "Let's ground together. Look around you and name five things you can see. Take your time.",
      ssml: `<speak>
        <prosody rate="slow" pitch="-5%">
          Let's ground together. 
          <break time="500ms"/>
          Look around you and name five things you can see.
          <break time="500ms"/>
          Take your time.
          <break time="10s"/>
          Good.
        </prosody>
      </speak>`,
    },
    {
      instruction: 'Notice 4 things you can physically feel',
      durationMs: 12000,
      voiceGuidance: "Now notice four things you can physically feel right now. The chair under you. Your feet on the floor. Anything touching your skin.",
      ssml: `<speak>
        <prosody rate="slow" pitch="-5%">
          Now notice four things you can physically feel right now.
          <break time="500ms"/>
          The chair under you. Your feet on the floor. Anything touching your skin.
          <break time="8s"/>
          Good. Keep breathing.
        </prosody>
      </speak>`,
    },
    {
      instruction: 'Listen for 3 sounds around you',
      durationMs: 10000,
      voiceGuidance: "Listen for three sounds around you. They can be close or far away. Just notice them.",
      ssml: `<speak>
        <prosody rate="slow" pitch="-5%">
          Listen for three sounds around you.
          <break time="500ms"/>
          They can be close or far away. Just notice them.
          <break time="7s"/>
          Nice.
        </prosody>
      </speak>`,
    },
    {
      instruction: 'Notice 2 things you can smell',
      durationMs: 8000,
      voiceGuidance: "Take a breath and notice two things you can smell. Even subtle things count.",
      ssml: `<speak>
        <prosody rate="slow" pitch="-5%">
          Take a breath and notice two things you can smell.
          <break time="500ms"/>
          Even subtle things count.
          <break time="5s"/>
        </prosody>
      </speak>`,
    },
    {
      instruction: 'Notice 1 thing you can taste',
      durationMs: 6000,
      voiceGuidance: "Finally, notice one thing you can taste. Whatever is in your mouth right now.",
      ssml: `<speak>
        <prosody rate="slow" pitch="-5%">
          Finally, notice one thing you can taste.
          <break time="500ms"/>
          Whatever is in your mouth right now.
          <break time="4s"/>
        </prosody>
      </speak>`,
    },
  ],

  closing: "Good. You're here, in this moment. How do you feel now?",
};

/**
 * Quick physical grounding when 5-4-3-2-1 isn't enough.
 */
export const PHYSICAL_GROUNDING: Exercise = {
  id: 'physical_grounding',
  name: 'Physical Grounding',
  description: 'Use physical sensations to anchor when anxiety is high',
  category: 'grounding',
  duration: 'short',
  intensity: 'moderate',

  triggers: ['panic', 'dissociated', 'flashback', 'very high anxiety'],
  notFor: [],

  steps: [
    {
      instruction: 'Press your feet firmly into the floor',
      durationMs: 8000,
      voiceGuidance: "Press your feet firmly into the floor. Feel the ground holding you. You're safe. You're here.",
    },
    {
      instruction: 'Squeeze your hands into fists, then release',
      durationMs: 10000,
      voiceGuidance: "Now make fists with your hands. Squeeze tight... and release. Notice the difference between tension and relaxation.",
    },
    {
      instruction: 'Hold something cold or textured',
      durationMs: 10000,
      voiceGuidance: "If you can, hold something cold or textured. Ice, a cold glass, anything with a strong sensation. Let it anchor you.",
    },
    {
      instruction: 'Name where you are out loud',
      durationMs: 8000,
      voiceGuidance: "Say out loud where you are right now. The date. The time. Your name. You're here. You're safe.",
    },
  ],

  closing: "You did that. You're in the present moment. Your body knows you're safe.",
};

// ============================================================================
// BREATHING EXERCISES
// ============================================================================

/**
 * Box Breathing (4-4-4-4)
 * Used by Navy SEALs for stress management.
 */
export const BOX_BREATHING: Exercise = {
  id: 'box_breathing',
  name: 'Box Breathing',
  description: 'Equal inhale, hold, exhale, hold - creates calm and focus',
  category: 'breathing',
  duration: 'short',
  intensity: 'gentle',

  triggers: ['anxious', 'stressed', 'need focus', 'overwhelmed'],
  notFor: [],

  steps: [
    {
      instruction: 'Inhale for 4 seconds',
      durationMs: 4000,
      voiceGuidance: "Breathe in... 2... 3... 4...",
      ssml: `<speak><prosody rate="x-slow">Breathe in <break time="1s"/> 2 <break time="1s"/> 3 <break time="1s"/> 4</prosody></speak>`,
    },
    {
      instruction: 'Hold for 4 seconds',
      durationMs: 4000,
      voiceGuidance: "Hold... 2... 3... 4...",
      ssml: `<speak><prosody rate="x-slow">Hold <break time="1s"/> 2 <break time="1s"/> 3 <break time="1s"/> 4</prosody></speak>`,
    },
    {
      instruction: 'Exhale for 4 seconds',
      durationMs: 4000,
      voiceGuidance: "Breathe out... 2... 3... 4...",
      ssml: `<speak><prosody rate="x-slow">Breathe out <break time="1s"/> 2 <break time="1s"/> 3 <break time="1s"/> 4</prosody></speak>`,
    },
    {
      instruction: 'Hold empty for 4 seconds',
      durationMs: 4000,
      voiceGuidance: "Hold... 2... 3... 4...",
      ssml: `<speak><prosody rate="x-slow">Hold <break time="1s"/> 2 <break time="1s"/> 3 <break time="1s"/> 4</prosody></speak>`,
    },
  ],

  closing: "Good. Notice how your body feels now. We can do another round if you'd like.",
};

/**
 * 4-7-8 Relaxing Breath
 * Dr. Andrew Weil's technique for calming the nervous system.
 */
export const RELAXING_BREATH: Exercise = {
  id: 'relaxing_breath',
  name: '4-7-8 Relaxing Breath',
  description: 'Long exhale activates the parasympathetic nervous system',
  category: 'breathing',
  duration: 'short',
  intensity: 'gentle',

  triggers: ['anxious', 'can\'t sleep', 'need to calm down', 'racing heart'],
  notFor: [],

  steps: [
    {
      instruction: 'Inhale through nose for 4 seconds',
      durationMs: 4000,
      voiceGuidance: "Breathe in through your nose... 2... 3... 4...",
      ssml: `<speak><prosody rate="slow">Breathe in through your nose <break time="1s"/> 2 <break time="1s"/> 3 <break time="1s"/> 4</prosody></speak>`,
    },
    {
      instruction: 'Hold for 7 seconds',
      durationMs: 7000,
      voiceGuidance: "Hold... 2... 3... 4... 5... 6... 7...",
      ssml: `<speak><prosody rate="slow">Hold <break time="1s"/> 2 <break time="1s"/> 3 <break time="1s"/> 4 <break time="1s"/> 5 <break time="1s"/> 6 <break time="1s"/> 7</prosody></speak>`,
    },
    {
      instruction: 'Exhale through mouth for 8 seconds',
      durationMs: 8000,
      voiceGuidance: "Now breathe out through your mouth... slow and steady... let it all go...",
      ssml: `<speak><prosody rate="x-slow">Now breathe out through your mouth <break time="2s"/> slow and steady <break time="2s"/> let it all go</prosody></speak>`,
    },
  ],

  closing: "The long exhale tells your nervous system you're safe. How do you feel?",
};

/**
 * Physiological Sigh
 * Fastest natural way to calm down (Stanford research).
 */
export const PHYSIOLOGICAL_SIGH: Exercise = {
  id: 'physiological_sigh',
  name: 'Physiological Sigh',
  description: 'The fastest natural way to reduce stress - double inhale, long exhale',
  category: 'breathing',
  duration: 'short',
  intensity: 'gentle',

  triggers: ['panic', 'acute stress', 'need quick relief', 'heart racing'],
  notFor: [],

  steps: [
    {
      instruction: 'Double inhale through nose',
      durationMs: 3000,
      voiceGuidance: "Take a deep breath in through your nose... and then one more quick breath in on top...",
      ssml: `<speak><prosody rate="medium">Take a deep breath in through your nose <break time="500ms"/> and then one more quick breath in on top</prosody></speak>`,
    },
    {
      instruction: 'Long exhale through mouth',
      durationMs: 6000,
      voiceGuidance: "Now let it all out through your mouth... slow and complete...",
      ssml: `<speak><prosody rate="slow">Now let it all out through your mouth <break time="1s"/> slow and complete</prosody></speak>`,
    },
  ],

  closing: "That's a physiological sigh. One or two of those can genuinely shift your nervous system. Better?",
};

// ============================================================================
// EXERCISE LIBRARY
// ============================================================================

export const EXERCISE_LIBRARY: Record<string, Exercise> = {
  five_senses: FIVE_SENSES_GROUNDING,
  physical_grounding: PHYSICAL_GROUNDING,
  box_breathing: BOX_BREATHING,
  relaxing_breath: RELAXING_BREATH,
  physiological_sigh: PHYSIOLOGICAL_SIGH,
};

// ============================================================================
// EXERCISE SELECTION
// ============================================================================

/**
 * Select the best exercise for the current context.
 */
export function selectExercise(context: {
  state?: NervousSystemState;
  emotion?: string;
  emotionIntensity?: number;
  triggers?: string[];
  preference?: 'breathing' | 'grounding' | 'any';
  timeAvailable?: 'short' | 'medium' | 'long';
}): Exercise {
  const { state, emotion, emotionIntensity = 0.5, preference, timeAvailable } = context;

  // For very high distress, use physiological sigh first (fastest)
  if (emotionIntensity > 0.85 || state === 'sympathetic') {
    return PHYSIOLOGICAL_SIGH;
  }

  // For panic or dissociation, use grounding
  if (emotion === 'panic' || state === 'dorsal_vagal') {
    return PHYSICAL_GROUNDING;
  }

  // For anxiety, use breathing
  if (emotion === 'anxious' || emotion === 'worried') {
    return preference === 'grounding' ? FIVE_SENSES_GROUNDING : BOX_BREATHING;
  }

  // For sleep or need to calm down
  if (emotion === 'can\'t sleep' || context.triggers?.includes('sleep')) {
    return RELAXING_BREATH;
  }

  // Default based on preference
  if (preference === 'grounding') return FIVE_SENSES_GROUNDING;
  if (preference === 'breathing') return BOX_BREATHING;

  // Default
  return FIVE_SENSES_GROUNDING;
}

/**
 * Get exercises by category.
 */
export function getExercisesByCategory(category: Exercise['category']): Exercise[] {
  return Object.values(EXERCISE_LIBRARY).filter((e) => e.category === category);
}

/**
 * Get exercise by ID.
 */
export function getExercise(id: string): Exercise | null {
  return EXERCISE_LIBRARY[id] || null;
}

// ============================================================================
// VOICE GUIDANCE GENERATION
// ============================================================================

/**
 * Generate voice guidance for an exercise.
 */
export function generateVoiceGuidance(
  exercise: Exercise,
  options?: {
    rounds?: number;
    pace?: 'slow' | 'normal' | 'fast';
    includeIntro?: boolean;
    includeClosing?: boolean;
  }
): VoiceGuidance {
  const {
    rounds = 1,
    pace = 'normal',
    includeIntro = true,
    includeClosing = true,
  } = options || {};

  const parts: VoiceGuidancePart[] = [];

  // Intro
  if (includeIntro) {
    parts.push({
      type: 'intro',
      text: `Let's do some ${exercise.name}. ${exercise.description}. Ready?`,
      durationMs: 3000,
    });
  }

  // Steps (repeated for rounds)
  for (let round = 0; round < rounds; round++) {
    for (const step of exercise.steps) {
      const paceMultiplier = pace === 'slow' ? 1.2 : pace === 'fast' ? 0.8 : 1;
      parts.push({
        type: 'step',
        text: step.voiceGuidance,
        ssml: step.ssml,
        durationMs: step.durationMs * paceMultiplier,
      });
    }

    // Between rounds
    if (round < rounds - 1) {
      parts.push({
        type: 'transition',
        text: "Good. Let's do another round.",
        durationMs: 2000,
      });
    }
  }

  // Closing
  if (includeClosing) {
    parts.push({
      type: 'closing',
      text: exercise.closing,
      durationMs: 3000,
    });
  }

  // Calculate total duration
  const totalDurationMs = parts.reduce((sum, p) => sum + p.durationMs, 0);

  return {
    exerciseId: exercise.id,
    parts,
    totalDurationMs,
    rounds,
  };
}

export interface VoiceGuidance {
  exerciseId: string;
  parts: VoiceGuidancePart[];
  totalDurationMs: number;
  rounds: number;
}

export interface VoiceGuidancePart {
  type: 'intro' | 'step' | 'transition' | 'closing';
  text: string;
  ssml?: string;
  durationMs: number;
}

// ============================================================================
// NERVOUS SYSTEM STATE DETECTION
// ============================================================================

/**
 * Detect nervous system state from signals.
 */
export function detectNervousSystemState(signals: {
  emotion?: string;
  emotionIntensity?: number;
  voiceTension?: number;
  speechRate?: number;
  keywords?: string[];
}): NervousSystemState {
  const { emotion, emotionIntensity = 0.5, voiceTension = 0.5, speechRate, keywords = [] } = signals;

  // Check for dorsal vagal (shutdown)
  const shutdownKeywords = ['numb', 'frozen', 'can\'t move', 'disconnected', 'empty', 'nothing'];
  if (keywords.some((k) => shutdownKeywords.includes(k.toLowerCase()))) {
    return 'dorsal_vagal';
  }

  // Check for sympathetic (fight/flight)
  const fightFlightEmotions = ['anxious', 'angry', 'panic', 'fear', 'rage', 'terrified'];
  if (emotion && fightFlightEmotions.includes(emotion.toLowerCase()) && emotionIntensity > 0.5) {
    return 'sympathetic';
  }

  if (voiceTension > 0.7 || (speechRate && speechRate > 1.3)) {
    return 'sympathetic';
  }

  // Default to ventral vagal (safe/social)
  return 'ventral_vagal';
}

/**
 * Get interventions for a nervous system state.
 */
export function getStateInterventions(state: NervousSystemState): string[] {
  switch (state) {
    case 'sympathetic':
      return [
        'physiological_sigh',
        'box_breathing',
        'relaxing_breath',
        'physical_grounding',
      ];
    case 'dorsal_vagal':
      return [
        'physical_grounding',
        'five_senses',
        'gentle movement',
        'social connection',
      ];
    case 'ventral_vagal':
      return []; // Already regulated
  }
}

// ============================================================================
// RECORDING & TRACKING
// ============================================================================

/** Exercise results per user */
const exerciseResults = new Map<string, ExerciseResult[]>();

/**
 * Record an exercise attempt.
 */
export function recordExerciseStart(
  userId: string,
  exerciseId: string,
  stateBefore?: NervousSystemState
): string {
  const result: ExerciseResult = {
    exerciseId,
    userId,
    startedAt: new Date(),
    completed: false,
    stateBefore,
  };

  const userResults = exerciseResults.get(userId) || [];
  userResults.push(result);
  exerciseResults.set(userId, userResults);

  log.debug({ userId, exerciseId }, '🧘 Exercise started');

  return `${exerciseId}_${result.startedAt.getTime()}`;
}

/**
 * Record exercise completion.
 */
export function recordExerciseComplete(
  userId: string,
  exerciseId: string,
  helpfulnessRating?: number,
  stateAfter?: NervousSystemState
): void {
  const userResults = exerciseResults.get(userId) || [];
  const result = userResults.find((r) => r.exerciseId === exerciseId && !r.completed);

  if (result) {
    result.completed = true;
    result.completedAt = new Date();
    result.helpfulnessRating = helpfulnessRating;
    result.stateAfter = stateAfter;

    log.debug(
      { userId, exerciseId, helpfulness: helpfulnessRating },
      '✅ Exercise completed'
    );
  }
}

/**
 * Get exercise history for a user.
 */
export function getExerciseHistory(userId: string): ExerciseResult[] {
  return exerciseResults.get(userId) || [];
}

/**
 * Get most effective exercises for a user.
 */
export function getMostEffectiveExercises(userId: string): string[] {
  const results = exerciseResults.get(userId) || [];

  // Calculate average helpfulness per exercise
  const ratings: Record<string, { sum: number; count: number }> = {};

  for (const result of results) {
    if (result.helpfulnessRating) {
      if (!ratings[result.exerciseId]) {
        ratings[result.exerciseId] = { sum: 0, count: 0 };
      }
      ratings[result.exerciseId].sum += result.helpfulnessRating;
      ratings[result.exerciseId].count++;
    }
  }

  // Sort by average rating
  return Object.entries(ratings)
    .map(([id, { sum, count }]) => ({ id, avg: sum / count }))
    .sort((a, b) => b.avg - a.avg)
    .map((e) => e.id);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  FIVE_SENSES_GROUNDING as fiveSensesGrounding,
  PHYSICAL_GROUNDING as physicalGrounding,
  BOX_BREATHING as boxBreathing,
  RELAXING_BREATH as relaxingBreath,
  PHYSIOLOGICAL_SIGH as physiologicalSigh,
};

