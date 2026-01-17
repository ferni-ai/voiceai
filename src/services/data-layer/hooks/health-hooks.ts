/**
 * Health & Wellness Hooks
 *
 * Auto-indexing hooks for health and wellness data.
 * Tracks goals, patterns, and wellbeing signals.
 *
 * @module services/data-layer/hooks/health-hooks
 */

import { createDomainHook, formatField, joinNonEmpty, formatDate } from '../hook-generator.js';
import type { HealthGoalEntity, WellnessCheckinEntity, HealthSummaryEntity } from '../types.js';

// ============================================================================
// HEALTH GOALS
// ============================================================================

/**
 * Track health objectives
 */
export const onHealthGoalChange = createDomainHook<HealthGoalEntity>({
  storeType: 'health',
  entityType: 'health_goal',
  contentBuilder: (h) =>
    joinNonEmpty([
      `Health goal: ${h.goal}.`,
      `Category: ${h.category}.`,
      formatField('Target date', h.targetDate),
      h.progress !== undefined ? `Progress: ${h.progress}%.` : '',
    ]),
  metadataExtractor: (h) => ({
    category: h.category,
    status: h.status,
    progress: h.progress,
  }),
  shouldSkip: (h) => h.status === 'achieved' || h.status === 'paused',
});

// ============================================================================
// WELLNESS CHECKINS
// ============================================================================

/**
 * Track regular wellness checkins
 */
export const onWellnessCheckinChange = createDomainHook<WellnessCheckinEntity>({
  storeType: 'health',
  entityType: 'wellness_checkin',
  contentBuilder: (w) =>
    joinNonEmpty([
      `Wellness check: Mood ${w.mood}/10, Energy ${w.energy}/10.`,
      w.stressLevel !== undefined ? `Stress: ${w.stressLevel}/10.` : '',
      formatField('Notes', w.notes),
    ]),
  metadataExtractor: (w) => ({
    mood: w.mood,
    energy: w.energy,
    stressLevel: w.stressLevel,
    timestamp: w.timestamp,
  }),
});

// ============================================================================
// ADDITIONAL HEALTH HOOKS
// ============================================================================

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
export const onSleepPatternChange = createDomainHook<SleepPatternEntity>({
  storeType: 'health',
  entityType: 'sleep_pattern',
  contentBuilder: (s) =>
    joinNonEmpty([
      `Sleep pattern: ${s.pattern}.`,
      s.averageHours ? `Average: ${s.averageHours} hours.` : '',
      `Quality: ${s.quality}.`,
      s.factors?.length ? `Factors: ${s.factors.join(', ')}.` : '',
    ]),
  metadataExtractor: (s) => ({
    quality: s.quality,
    averageHours: s.averageHours,
  }),
});

interface EnergyLevelEntity {
  level: number; // 1-10
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  factors?: string[];
  pattern?: string;
}

/**
 * Track energy levels throughout day
 */
export const onEnergyLevelChange = createDomainHook<EnergyLevelEntity>({
  storeType: 'health',
  entityType: 'energy_level',
  contentBuilder: (e) =>
    joinNonEmpty([
      `Energy level: ${e.level}/10 (${e.timeOfDay}).`,
      e.factors?.length ? `Factors: ${e.factors.join(', ')}.` : '',
      formatField('Pattern', e.pattern),
    ]),
  metadataExtractor: (e) => ({
    level: e.level,
    timeOfDay: e.timeOfDay,
  }),
});

interface WorkoutEntity {
  activity: string;
  duration: number; // minutes
  intensity: 'low' | 'moderate' | 'high';
  date: string;
  mood_before?: number;
  mood_after?: number;
  notes?: string;
}

/**
 * Track exercise sessions
 */
export const onWorkoutChange = createDomainHook<WorkoutEntity>({
  storeType: 'health',
  entityType: 'workout',
  contentBuilder: (w) =>
    joinNonEmpty([
      `Workout: ${w.activity}.`,
      `Duration: ${w.duration} minutes.`,
      `Intensity: ${w.intensity}.`,
      `Date: ${formatDate(w.date)}.`,
      w.mood_after && w.mood_before ? `Mood: ${w.mood_before}/10 → ${w.mood_after}/10.` : '',
    ]),
  metadataExtractor: (w) => ({
    activity: w.activity,
    intensity: w.intensity,
    duration: w.duration,
    date: w.date,
  }),
});

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
export const onMentalHealthNoteChange = createDomainHook<MentalHealthNoteEntity>({
  storeType: 'health',
  entityType: 'mental_health_note',
  contentBuilder: (m) =>
    joinNonEmpty([
      `Mental health note: ${m.note}.`,
      `Category: ${m.category}.`,
      formatField('Severity', m.severity),
      formatField('Coping', m.coping),
    ]),
  metadataExtractor: (m) => ({
    category: m.category,
    severity: m.severity,
    date: m.date,
  }),
});

interface NutritionGoalEntity {
  goal: string;
  category: 'diet' | 'hydration' | 'supplements' | 'habits';
  currentStatus?: string;
  targetDate?: string;
}

/**
 * Track nutrition goals
 */
export const onNutritionGoalChange = createDomainHook<NutritionGoalEntity>({
  storeType: 'health',
  entityType: 'nutrition_goal',
  contentBuilder: (n) =>
    joinNonEmpty([
      `Nutrition goal: ${n.goal}.`,
      `Category: ${n.category}.`,
      formatField('Current status', n.currentStatus),
    ]),
  metadataExtractor: (n) => ({
    category: n.category,
  }),
});

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
export const onBodyAwarenessChange = createDomainHook<BodyAwarenessEntity>({
  storeType: 'health',
  entityType: 'body_awareness',
  contentBuilder: (b) =>
    joinNonEmpty([
      `Body signal: ${b.observation}.`,
      formatField('Body part', b.bodyPart),
      formatField('Context', b.context),
      b.recurring ? 'Recurring pattern.' : '',
    ]),
  metadataExtractor: (b) => ({
    bodyPart: b.bodyPart,
    recurring: b.recurring,
  }),
});

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
export const onStressTriggerChange = createDomainHook<StressTriggerEntity>({
  storeType: 'health',
  entityType: 'stress_trigger',
  contentBuilder: (s) =>
    joinNonEmpty([
      `Stress trigger: ${s.trigger}.`,
      `Context: ${s.context}.`,
      `Severity: ${s.severity}.`,
      s.copingStrategies?.length ? `Coping: ${s.copingStrategies.join(', ')}.` : '',
    ]),
  metadataExtractor: (s) => ({
    severity: s.severity,
    frequency: s.frequency,
  }),
});

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
export const onRecoveryPracticeChange = createDomainHook<RecoveryPracticeEntity>({
  storeType: 'health',
  entityType: 'recovery_practice',
  contentBuilder: (r) =>
    joinNonEmpty([
      `Recovery practice: ${r.practice}.`,
      `Category: ${r.category}.`,
      `Effectiveness: ${r.effectiveness}.`,
      formatField('Frequency', r.frequency),
    ]),
  metadataExtractor: (r) => ({
    category: r.category,
    effectiveness: r.effectiveness,
  }),
});

/**
 * Track daily health summaries
 */
export const onHealthSummaryChange = createDomainHook<HealthSummaryEntity>({
  storeType: 'health',
  entityType: 'health_summary',
  contentBuilder: (h) =>
    joinNonEmpty([
      `Health summary for ${formatDate(h.date)}.`,
      h.sleepHours
        ? `Sleep: ${h.sleepHours} hours${h.sleepQuality ? ` (${h.sleepQuality})` : ''}.`
        : '',
      h.activity ? `Activity: ${h.activity}.` : '',
      h.activityMinutes ? `Active minutes: ${h.activityMinutes}.` : '',
      h.stepsCount ? `Steps: ${h.stepsCount.toLocaleString()}.` : '',
      h.heartRateAvg ? `Avg heart rate: ${h.heartRateAvg} bpm.` : '',
      h.mood !== undefined ? `Mood: ${h.mood}/10.` : '',
      formatField('Notes', h.notes),
    ]),
  metadataExtractor: (h) => ({
    date: h.date,
    sleepHours: h.sleepHours,
    mood: h.mood,
    stepsCount: h.stepsCount,
  }),
});

// ============================================================================
// EXPORTS
// ============================================================================

export const healthHooks = {
  onHealthGoalChange,
  onWellnessCheckinChange,
  onSleepPatternChange,
  onEnergyLevelChange,
  onWorkoutChange,
  onMentalHealthNoteChange,
  onNutritionGoalChange,
  onBodyAwarenessChange,
  onStressTriggerChange,
  onRecoveryPracticeChange,
  onHealthSummaryChange,
};

export default healthHooks;
