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
    duration: 'short' | 'medium' | 'long';
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
export type NervousSystemState = 'ventral_vagal' | 'sympathetic' | 'dorsal_vagal';
/**
 * The classic 5-4-3-2-1 grounding technique.
 * Uses the five senses to anchor in the present moment.
 */
export declare const FIVE_SENSES_GROUNDING: Exercise;
/**
 * Quick physical grounding when 5-4-3-2-1 isn't enough.
 */
export declare const PHYSICAL_GROUNDING: Exercise;
/**
 * Box Breathing (4-4-4-4)
 * Used by Navy SEALs for stress management.
 */
export declare const BOX_BREATHING: Exercise;
/**
 * 4-7-8 Relaxing Breath
 * Dr. Andrew Weil's technique for calming the nervous system.
 */
export declare const RELAXING_BREATH: Exercise;
/**
 * Physiological Sigh
 * Fastest natural way to calm down (Stanford research).
 */
export declare const PHYSIOLOGICAL_SIGH: Exercise;
export declare const EXERCISE_LIBRARY: Record<string, Exercise>;
/**
 * Select the best exercise for the current context.
 */
export declare function selectExercise(context: {
    state?: NervousSystemState;
    emotion?: string;
    emotionIntensity?: number;
    triggers?: string[];
    preference?: 'breathing' | 'grounding' | 'any';
    timeAvailable?: 'short' | 'medium' | 'long';
}): Exercise;
/**
 * Get exercises by category.
 */
export declare function getExercisesByCategory(category: Exercise['category']): Exercise[];
/**
 * Get exercise by ID.
 */
export declare function getExercise(id: string): Exercise | null;
/**
 * Generate voice guidance for an exercise.
 */
export declare function generateVoiceGuidance(exercise: Exercise, options?: {
    rounds?: number;
    pace?: 'slow' | 'normal' | 'fast';
    includeIntro?: boolean;
    includeClosing?: boolean;
}): VoiceGuidance;
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
/**
 * Detect nervous system state from signals.
 */
export declare function detectNervousSystemState(signals: {
    emotion?: string;
    emotionIntensity?: number;
    voiceTension?: number;
    speechRate?: number;
    keywords?: string[];
}): NervousSystemState;
/**
 * Get interventions for a nervous system state.
 */
export declare function getStateInterventions(state: NervousSystemState): string[];
/**
 * Record an exercise attempt.
 */
export declare function recordExerciseStart(userId: string, exerciseId: string, stateBefore?: NervousSystemState): string;
/**
 * Record exercise completion.
 */
export declare function recordExerciseComplete(userId: string, exerciseId: string, helpfulnessRating?: number, stateAfter?: NervousSystemState): void;
/**
 * Get exercise history for a user.
 */
export declare function getExerciseHistory(userId: string): ExerciseResult[];
/**
 * Get most effective exercises for a user.
 */
export declare function getMostEffectiveExercises(userId: string): string[];
export { FIVE_SENSES_GROUNDING as fiveSensesGrounding, PHYSICAL_GROUNDING as physicalGrounding, BOX_BREATHING as boxBreathing, RELAXING_BREATH as relaxingBreath, PHYSIOLOGICAL_SIGH as physiologicalSigh, };
//# sourceMappingURL=index.d.ts.map