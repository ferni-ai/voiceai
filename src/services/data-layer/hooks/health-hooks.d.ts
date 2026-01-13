/**
 * Health & Wellness Hooks
 *
 * Auto-indexing hooks for health and wellness data.
 * Tracks goals, patterns, and wellbeing signals.
 *
 * @module services/data-layer/hooks/health-hooks
 */
import type { HealthGoalEntity, WellnessCheckinEntity, HealthSummaryEntity } from '../types.js';
/**
 * Track health objectives
 */
export declare const onHealthGoalChange: import("../hook-generator.js").DomainHook<HealthGoalEntity>;
/**
 * Track regular wellness checkins
 */
export declare const onWellnessCheckinChange: import("../hook-generator.js").DomainHook<WellnessCheckinEntity>;
interface SleepPatternEntity {
    pattern: string;
    averageHours?: number;
    quality: 'poor' | 'fair' | 'good' | 'excellent';
    factors?: string[];
    recommendations?: string[];
}
/**
 * Track sleep patterns
 */
export declare const onSleepPatternChange: import("../hook-generator.js").DomainHook<SleepPatternEntity>;
interface EnergyLevelEntity {
    level: number;
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    factors?: string[];
    pattern?: string;
}
/**
 * Track energy levels throughout day
 */
export declare const onEnergyLevelChange: import("../hook-generator.js").DomainHook<EnergyLevelEntity>;
interface WorkoutEntity {
    activity: string;
    duration: number;
    intensity: 'low' | 'moderate' | 'high';
    date: string;
    mood_before?: number;
    mood_after?: number;
    notes?: string;
}
/**
 * Track exercise sessions
 */
export declare const onWorkoutChange: import("../hook-generator.js").DomainHook<WorkoutEntity>;
interface MentalHealthNoteEntity {
    note: string;
    category: 'anxiety' | 'depression' | 'stress' | 'positive' | 'observation';
    severity?: 'mild' | 'moderate' | 'severe';
    coping?: string;
    date?: string;
}
/**
 * Track mental health observations
 */
export declare const onMentalHealthNoteChange: import("../hook-generator.js").DomainHook<MentalHealthNoteEntity>;
interface NutritionGoalEntity {
    goal: string;
    category: 'diet' | 'hydration' | 'supplements' | 'habits';
    currentStatus?: string;
    targetDate?: string;
}
/**
 * Track nutrition goals
 */
export declare const onNutritionGoalChange: import("../hook-generator.js").DomainHook<NutritionGoalEntity>;
interface BodyAwarenessEntity {
    observation: string;
    bodyPart?: string;
    context?: string;
    recurring?: boolean;
    actionTaken?: string;
}
/**
 * Track body awareness and signals
 */
export declare const onBodyAwarenessChange: import("../hook-generator.js").DomainHook<BodyAwarenessEntity>;
interface StressTriggerEntity {
    trigger: string;
    context: string;
    severity: 'low' | 'medium' | 'high';
    copingStrategies?: string[];
    frequency?: 'rare' | 'occasional' | 'frequent';
}
/**
 * Track stress triggers
 */
export declare const onStressTriggerChange: import("../hook-generator.js").DomainHook<StressTriggerEntity>;
interface RecoveryPracticeEntity {
    practice: string;
    category: 'physical' | 'mental' | 'emotional' | 'spiritual';
    effectiveness: 'low' | 'medium' | 'high';
    frequency?: string;
    notes?: string;
}
/**
 * Track self-care and recovery practices
 */
export declare const onRecoveryPracticeChange: import("../hook-generator.js").DomainHook<RecoveryPracticeEntity>;
/**
 * Track daily health summaries
 */
export declare const onHealthSummaryChange: import("../hook-generator.js").DomainHook<HealthSummaryEntity>;
export declare const healthHooks: {
    onHealthGoalChange: import("../hook-generator.js").DomainHook<HealthGoalEntity>;
    onWellnessCheckinChange: import("../hook-generator.js").DomainHook<WellnessCheckinEntity>;
    onSleepPatternChange: import("../hook-generator.js").DomainHook<SleepPatternEntity>;
    onEnergyLevelChange: import("../hook-generator.js").DomainHook<EnergyLevelEntity>;
    onWorkoutChange: import("../hook-generator.js").DomainHook<WorkoutEntity>;
    onMentalHealthNoteChange: import("../hook-generator.js").DomainHook<MentalHealthNoteEntity>;
    onNutritionGoalChange: import("../hook-generator.js").DomainHook<NutritionGoalEntity>;
    onBodyAwarenessChange: import("../hook-generator.js").DomainHook<BodyAwarenessEntity>;
    onStressTriggerChange: import("../hook-generator.js").DomainHook<StressTriggerEntity>;
    onRecoveryPracticeChange: import("../hook-generator.js").DomainHook<RecoveryPracticeEntity>;
    onHealthSummaryChange: import("../hook-generator.js").DomainHook<HealthSummaryEntity>;
};
export default healthHooks;
//# sourceMappingURL=health-hooks.d.ts.map